# Access-router basic/advanced operation-access variants

Created: 2026-10-05 13:18:19 PDT (`20261005-131819`, generated with `date`).

Status: OAV-00 through OAV-07 completed; independent final review and integration follow-ups OAV-07-F01 through OAV-07-F08 completed; all required fresh serial gates passed; 401 authorization contract confirmed.

Dated execution/progress entries below are historical snapshots. Current task statuses and the final OAV-07 Completion evidence record the completed plan.

## Objective and scope

Add flat `basic*` and `advanced*` keys to `ModelRouter.operationAccess` so an application can authorize basic and advanced endpoints independently while retaining the existing base operation as their fallback. For example, `list` covers both variants unless `basicList` or `advancedList` overrides it.

The maintainer selected:

- `basic` / `advanced` naming.
- Every paired model operation: `list`, `read`, `create`, `update`, `upsert`, `count`, and `distinct`.
- Subdocument list/read pairs.
- Data-router list/read parity.
- Unspecified variants inherit the base operation.
- Root batches and existing service-side authorization checks continue to use base operations.

The motivating configuration is:

```ts
// Implemented API: deny basic read while advanced reads inherit the base guard.
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

const options: ModelRouterOptions = {
  basePath: '/users',
  operationAccess: {
    list: true,
    read: true,
    basicRead: false,
  },
};
```

This denies the basic `GET /users/:id` endpoint while allowing both advanced read POST endpoints, subject to ordinary row/field policy. `GET /users` remains allowed.

**Contract resolved on 2026-10-05:** the user selected **“401 Unauthorized (Recommended)”** through the question tool. Denied operations return HTTP **401**; routes remain registered and present in `getEndpoints()` / OpenAPI, and permissions remain mutable at request time. Earlier discussion requested **404** for a missing basic read route; that is historical context, superseded by the confirmed authorization-splitting contract. An access rule of `false` does not omit a route.

## Review findings and corrections to the previous plan

### R1 — Exact variant lookup must precede base fallback

`getNestedOption` tries the exact key, then its parent's `.default`, then its parent value. It does not know that `basicList` should inherit `list`. Changing a route from `isAllowed(name, 'list')` to an ordinary lookup of `'basicList'` would therefore deny a previously allowed `{ list: true }` configuration, or select `.default` before the explicit base rule.

References: `packages/access-router/src/options/manager.ts:83-106`, `src/core.ts:550-573`, `src/core-data.ts:194-197`.

Correction: resolve the exact variant through the owning runtime's exact getter, then delegate to the unchanged base-operation resolution only when the variant is `undefined`. Explicit `false`, an empty array, or a guard returning false is terminal. Do not combine the base guard and variant guard with AND/OR or evaluate both.

### R2 — The proposed subdocument fallback would widen existing access

Today an explicit `subs.items` rule object closes unspecified operations. With `{ list: true, subs: { items: { read: true } } }`, `subs.items.list` is denied: `Core.isAllowed` evaluates the defined field object, which is not a `Validation`. Skipping this object and falling through to top-level `list` would grant access that is currently denied.

Also, the existing `subs: Validation` umbrella is not consulted when a particular field is absent; fallback goes directly to the top-level operation. The prior explanation that `subs: 'isAdmin'` guards every subdocument operation was inaccurate.

References: `packages/access-router/src/core.ts:550-570`, `src/interfaces/root.ts:65,147-158`.

Correction: preserve the defined-field boundary and existing umbrella behavior. Use `{ subs: { items: { list: true, basicList: false } } }` for a per-field split. OAV-00 characterizes these legacy cases; changing wildcard/subdocument inheritance is a separate contract decision.

### R3 — Keep route policy separate from data policy and service orchestration

The service layer uses base accesses for field selection, row filters, hooks, read-to-list fallback, related-model authorization, and subdocument mutation-response visibility. Public services do not universally enforce the initiating operation's `operationAccess`; direct service calls are trusted application calls, and root routers perform their own entry checks.

References:

- `packages/access-router/src/services/public-service.ts:113-234,279-328` — both reads retry using the base `list` guard; upsert dispatches to create/update internally.
- `packages/access-router/src/services/base.ts:287-299` — includes/subqueries authorize target base operations.
- `packages/access-router/src/core.ts:219-283` — populate target authorization.
- `packages/access-router/src/services/model-subdocument-service.ts:28-72` — response visibility checks base parent/subdocument read/list guards after persistence.
- `packages/access-router/src/routers/root-router.ts:211-253` — base-operation entry checks.

Correction: supply the route variant explicitly at the generated Express boundary. Do not derive it from `req.method`, install request-global variant state, pass variant keys into filters/hooks, or add blanket service operation guards. Preserve existing read fallback and response visibility, with explicit regression tests.

### R4 — Public typing needs more than fourteen additional fields

`OperationAccess` is currently also used in `PermissionSchema` rules. Simply adding transport fields to that shared type would suggest that `permissionSchema.name.basicRead` controls field access, which the implementation does not support. `SubRouteGuardOptions` already permits arbitrary string keys, so it does not need widening to accept four new nested variants. Data-router typed dotted setters currently use `keyof DataRouterOptions`, unlike the model router's extended-key setters.

References: `packages/access-router/src/interfaces/root.ts:65,147-162,229-241,291-316,400-404`, `src/routers/model-router.ts:151-183`, `src/routers/data-router.ts:260-285`, `src/runtime.ts:564-607`, `src/options/data-options.ts:11-39`.

Correction: separate route-operation typing from the existing field-rule shape, make the new route keys discoverable in emitted declarations, and cover the actual model/default/data setter APIs. Preserve already-supported field-rule and data-router assignments rather than narrowing unrelated legacy types.

### R5 — Request-controlled access selectors must not choose route variants

Populate descriptors already restrict `access` to `list` / `read`, but direct and root body schemas accept `options.populateAccess` as `z.unknown()`. `Core.genPopulate` forwards that value into the target operation check. Once applications configure real variant keys, arbitrary values such as `'advancedRead'` could select a route-only rule instead of the target's base read/list policy.

References: `packages/access-router/src/validation/common.ts:43-66`, `src/validation/model-router.ts:88,117,136,153,177,197`, `src/validation/root-router.ts:44,68,86,104`, `src/core.ts:231,267`, `src/interfaces/query-types.ts:272-278`.

Correction: validate wire `populateAccess` against the existing supported `PopulateAccess` values and test direct/root rejection of variant names before target persistence. Also reject reserved route-variant names at the shared populate boundary: legacy includes and subqueries forward generic options that are not checked by outer body schemas (`src/services/base.ts:514-565,1013-1030`). Check both option-level and per-descriptor effective access. This is necessary boundary work for this feature, not permission for a general validation rewrite. Existing trusted custom access strings outside the new reserved variants retain their previous behavior.

## Reviewed behavior contract

### Public keys and value types

All fourteen top-level keys have the existing `Validation` value type:

```text
basicList       advancedList
basicRead       advancedRead
basicCreate     advancedCreate
basicUpdate     advancedUpdate
basicUpsert     advancedUpsert
basicCount      advancedCount
basicDistinct   advancedDistinct
```

Subdocument fields gain `basicList`, `advancedList`, `basicRead`, and `advancedRead`. Existing `list`, `read`, `create`, `update`, and `delete` rules remain. No new routes are introduced for subdocument mutation variants or for unpaired `new` / `delete` operations.

`Validation` remains `boolean | string | string[] | GuardHook`. Strings use existing space-separated AND semantics; arrays OR their entries. Hooks receive the existing permissions object, run with `this` bound to the request, and may return a promise. Selected false guards are final; thrown/rejected operational errors retain existing handling.

### Top-level precedence

For a route with base operation `list` and variant `basic`:

1. Exact `operationAccess.basicList` from the owning runtime, including existing model-default exact lookup behavior.
2. If it is `undefined`, existing base `isAllowed(name, 'list')` resolution: exact `list`, `.default`, parent shorthand, and ordinary deny when no valid rule resolves.

Data routers use the same variant-to-base ordering with their own options; they do not inherit model defaults.

Do not initialize new variant keys to `false` in runtime defaults: that would suppress inheritance. Do not change `OptionsManager`'s general fallback or shallow assignment semantics. Characterize mixed runtime-default/model-specific cases instead of assuming recursive option-object merges.

Examples with an otherwise allowed row/field policy:

| Rules                              | Basic list | Advanced list | Root list entry |
| ---------------------------------- | ---------- | ------------- | --------------- |
| `list: true`                       | allowed    | allowed       | allowed         |
| `list: false`                      | denied     | denied        | denied          |
| `list: true, basicList: false`     | denied     | allowed       | allowed         |
| `list: true, advancedList: false`  | allowed    | denied        | allowed         |
| `list: false, basicList: true`     | allowed    | denied        | denied          |
| only `basicList: true`             | allowed    | denied        | denied          |
| `list: true, basicList: undefined` | allowed    | allowed       | allowed         |

### Subdocument precedence

For `items` basic list, the route-specific resolver uses:

1. Exact `operationAccess.subs.items.basicList`.
2. Exact `operationAccess.subs.items.list`.
3. A defined `operationAccess.subs.items` value: evaluate a scalar `Validation`; an object with no applicable key denies as today.
4. Only when the field rule is absent, top-level exact `operationAccess.basicList`.
5. Existing top-level base `list` resolution.

This ordering retains specific field rules over general rules. `undefined` inherits; defined false/invalid guards deny. Do not introduce nested `.default` behavior or reinterpret `subs` umbrella rules as part of this change.

```ts
operationAccess: {
  list: true,
  read: true,
  subs: {
    comments: {
      list: true,
      read: true,
      basicList: false,
      advancedRead: 'isAdmin',
    },
  },
}
```

### Route matrix

Paths below are relative to the configured model/data base path. Actual `idParam`, `queryRouteSegment`, and `mutationRouteSegment` continue to determine route paths.

| Base guard        | Basic route / new key                            | Advanced route / new key                                       |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `list`            | `GET /` → `basicList`                            | `POST /__query` → `advancedList`                               |
| `read`            | `GET /:id` → `basicRead`                         | `POST /__query/:id`, `POST /__query/__filter` → `advancedRead` |
| `create`          | `POST /` → `basicCreate`                         | `POST /__mutation` → `advancedCreate`                          |
| `update`          | `PATCH /:id` → `basicUpdate`                     | `PATCH /__mutation/:id` → `advancedUpdate`                     |
| `upsert`          | `PUT /` → `basicUpsert`                          | `PUT /__mutation` → `advancedUpsert`                           |
| `count`           | `GET /count` → `basicCount`                      | `POST /count` → `advancedCount`                                |
| `distinct`        | `GET /distinct/:field` → `basicDistinct`         | `POST /distinct/:field` → `advancedDistinct`                   |
| `subs.<sub>.list` | `GET /:id/<sub>` → `subs.<sub>.basicList`        | `POST /:id/<sub>/__query` → `subs.<sub>.advancedList`          |
| `subs.<sub>.read` | `GET /:id/<sub>/:subId` → `subs.<sub>.basicRead` | `POST /:id/<sub>/:subId/__query` → `subs.<sub>.advancedRead`   |

Data routers implement only the first two rows. `GET /new`, model delete, subdocument create/delete, and both subdocument update routes keep their current base guards. Filtered count/distinct POSTs are advanced even though their paths do not use `__query`.

### Secondary access and exposure

- Variant rules replace the initiating endpoint's operation guard; they do not grant fields, alter row filters, or replace secondary base-operation guards.
- Read-to-list fallback remains guarded by base `list`, even for advanced reads. Thus `read: false, advancedRead: true` can authorize the POST entry, but a miss still requires base `list` to retry. `basicList: false` disables the basic list endpoint, not list-policy fallback through an allowed read endpoint. Existing Forbidden/BadRequest results never retry.
- Upsert keeps its existing create/update branch behavior; an advanced upsert is not additionally gated by `advancedCreate` / `advancedUpdate`.
- Related-model populate/include/subquery authorization uses target base operations. A source advanced route does not make a target query use the target's advanced endpoint rule.
- Subdocument mutation-response visibility continues to use base parent/subdocument read/list rules. Disabling basic reads must not hide otherwise readable mutation responses. Existing hidden-successful-response contracts remain.
- Root entries keep existing operation names and base checks; `basicList` / `advancedRead` are not new root `op` values.
- Existing service methods retain their current checks and trusted-call behavior. No implicit transport is inferred from a service call's Express request method.
- Under the confirmed 401 contract, all endpoints remain in `getEndpoints()` and OpenAPI, including denied ones. Express HEAD fallback to a GET uses that GET's basic guard. Permission options remain mutable at request time, including the new variants.

## Working rules and related work

- Keep task paths and completion evidence repository-relative, per `docs/tasks/README.md`.
- The user excludes root `CHANGELOG.md` from this work. Preserve other sessions' changes; do not stage, commit, reset, or revert shared-workspace work.
- At creation, the worktree contained the unrelated untracked task `docs/tasks/20261005-122217-access-router-package-virtuals.md`. OAV-00 subsequently observed active virtuals edits in core/service code, `interfaces/{root,query-types,router-hooks}.ts`, `index.ts`, `routers/model-router.ts`, and later `runtime.ts`, `options/model-options.ts`, and `filter-type-tests.ts`, plus `test/virtuals-baseline.contract.test.ts`. Treat these as concurrent work; coordinate overlapping ownership and refresh source anchors before later implementation tasks.
- Implement an internal shared route-guard resolver and a route-owned entrypoint, for example `isAllowedRoute(name, baseAccess, variant)`. Base `isAllowed(name, access)` callers retain their existing behavior. Variant selection is server-owned, not request-supplied.
- Keep field/row/hook accesses as base operations. Separate the new route-access type from `PermissionSchema`'s existing operation-rule shape.
- Use owning-runtime option reads, not the router's construction-time `options` snapshot, for live guards. Preserve immutable option snapshots and per-runtime permission resolution.
- Keep existing entrypoints, bundling configuration, and request/response shapes. Rebuild generated declarations/output through the package build.
- Scope is the selected paired endpoints and their necessary authorization/type/documentation boundaries. Route removal, new unpaired aliases, generic wildcard access inheritance, and new service-wide operation enforcement require separate requirements.

## Baseline verification

Review evidence on 2026-10-05:

- Source/type/test/package review established the route matrix and R1–R5 above.
- A six-case in-memory probe against existing `dist/index.mjs`, using Express + supertest and the isolated runtime middleware, confirmed: base `list` ignores stored `basicList: false`; exact variant false is retrievable; naive missing-variant lookup does not inherit `list: true`; a defined subdocument field object denies its omitted list operation; a `subs: false` umbrella does not override an otherwise allowed top-level list when the field is absent; base `list: false` remains denied with stored `basicList: true`.
- A second comparative populate probe configured a target with `read: false, advancedRead: true`. The normal `read` access produced no populate descriptor, while the arbitrary `advancedRead` selector produced a descriptor with target fields and an unrestricted match. This confirms rule selection, not a database disclosure; no persistence ran.
- These probes performed no database persistence. They used existing output, not a fresh build, and are supporting review evidence rather than feature-completion or full-suite baseline claims.
- No package/workspace build, test suite, or lint was run during task creation. OAV-00's completion evidence below establishes a fresh baseline before operation-access source changes.

Repository commands, from repository root unless a working directory is named:

1. Fresh package build: `pnpm --filter @web-ts-toolkit/access-router... build`.
2. Focused tests after building: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`. Replace the placeholder with actual task files; do not depend on forwarding filters through the shell-script `test` command.
3. Focused source typecheck: `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`.
4. Full package gates: `pnpm --filter @web-ts-toolkit/access-router typecheck`, then `pnpm --filter @web-ts-toolkit/access-router test`.
5. Installed-surface suites: `test/strict-consumer-types.test.ts`, `test/export-contract.test.ts`, `test/documentation-examples.test.ts`, and `test/packed-consumer-compatibility.test.ts`. Source typecheck only includes `src/`; it does not replace these consumer checks.
6. Package inventory: `npm pack --dry-run`, working directory `packages/access-router`. This checks the workspace manifest's inventory; the existing packed-consumer suite verifies production manifest transformation and real installed runtime/declaration behavior.
7. Website: `pnpm --dir website build` after editing website docs.
8. Final workspace: `pnpm build`, `pnpm test`, `pnpm lint`, `git diff --check`.

Run builds/tests **serially**. `AGENTS.md` requires serial workspace tests because package scripts rebuild transitive dependencies into shared `dist/`; the package Vitest config also has `fileParallelism: false`. Preserve both. Record Mongo/dependency/environment blockers separately from feature failures.

## Priority definitions and ordered milestones

- P0: authorization contract or implementation/release gate.
- P1: required feature coverage, public typing, and consumer documentation.

Execute in dependency order:

1. OAV-00: record the confirmed contract and characterize the baseline.
2. OAV-01: public types and setter plumbing.
3. OAV-02: shared route-guard resolution.
4. OAV-03: model collection/document wiring.
5. OAV-04: data and subdocument wiring.
6. OAV-05: alternate-entry/secondary-policy and input-boundary regressions.
7. OAV-06: shipped declarations, docs, and consumer examples.
8. OAV-07: independent final integration review.

## Executable tasks

### Task OAV-00: Confirm the access/exposure contract and establish a fresh baseline

Status: completed

Priority: P0

Suggested owner: implementation coordinator with maintainer input

Dependencies: none

Primary ownership:

- This task file's decision record and baseline evidence.
- `packages/access-router/test/operation-access-baseline.contract.test.ts` (new).

Finding / references: R1–R3 and the earlier 404 request prompted implementation prerequisites. The user resolved status/exposure to 401 on 2026-10-05. Current subdocument-object and umbrella behavior must be characterized before replacing the route guard path. Refer to `src/core.ts:550-573`, `src/options/manager.ts:83-106`, and `test/read-list-fallback-authorization.integration.test.ts`.

Implementation requirements:

1. Record the user's 2026-10-05 question-tool selection, “401 Unauthorized (Recommended)”: preserve denial status, route registration/OpenAPI, and request-time permission mutability. Update unresolved/proposed wording while retaining historical review facts.
2. Record the confirmed preservation of reviewed closed subdocument field-object precedence, base `list` read fallback, and all existing secondary/base-service policies together.
3. Add compact baseline characterization tests for base/shorthand/default guards, explicit false/undefined, closed subdocument field objects, field-specific scalar guards, the legacy `subs` umbrella, and runtime-default/model-option interactions. Use isolated runtimes and unique model names; no database is needed for permission-resolution cases.
4. Run a fresh package build and existing representative suites: `test/model-router.routes.integration.test.ts`, `test/data-router.test.ts`, `test/model-subdocument-routes.integration.test.ts`, `test/read-list-fallback-authorization.integration.test.ts`, and `test/root-router.integration.test.ts`.
5. Capture before-fix failing evidence for variant inheritance and paired-route splitting when those regressions are added in OAV-02–OAV-04. Keep baseline tests for retained behavior; do not retain passing assertions that require the absent feature after implementation.

Acceptance criteria:

- The status/exposure decision is explicit and does not conflict with the user requirement.
- The retained fallback/secondary-access contract is reproducible in fresh baseline tests.
- Baseline commands/results are recorded; implementation proceeds only after contract confirmation and prerequisite failures are understood.

Decision record (2026-10-05):

- The user selected **“401 Unauthorized (Recommended)”** through the question tool on 2026-10-05. Authorization denials remain HTTP **401**. All routes remain registered and discoverable through `getEndpoints()` and OpenAPI; permissions, including future variant rules, remain mutable at request time. The earlier 404 request is superseded by this explicit authorization-splitting decision.
- Preserve the reviewed subdocument fallback: exact field variant → field base operation → defined field scalar/closed object → top-level variant only for an absent field → existing top-level base resolution. A defined field object with no applicable operation stays denied; top-level allows cannot reopen it. Legacy `subs` umbrella behavior is unchanged.
- Base `list` continues to authorize read-to-list retries. Preserve root base entry checks, field/row/hook policies, related-model populate/include/subquery checks, subdocument mutation-response visibility, upsert branch behavior, and existing trusted service-call policies. Route variants will only replace initiating endpoint authorization.
- OAV-00 owns this task document and the new baseline test file; runtime/source files are read-only. New aliases and their regressions belong to OAV-01 onward.

Verification: fresh package build, the new baseline file and five existing representative suites listed above, then source typecheck; record exact focused commands/results.

Completion evidence (2026-10-05):

- Session-authored changed files: `docs/tasks/20261005-131819-access-router-operation-access-variants.md`; `packages/access-router/test/operation-access-baseline.contract.test.ts` (new). OAV-00 was marked `in_progress` before work and `completed` only after its required checks passed. OAV-01 through OAV-07 remain pending.
- Decision outcomes: the user's question-tool selection confirms HTTP 401 authorization splitting with registered routes/OpenAPI and live permission mutation. Closed subdocument field objects, existing `subs` umbrella behavior, base `list` read fallback, and all existing secondary/base-service policies are explicitly preserved. Top-level blocking/proposed status wording is resolved; R1–R5 and the original review probes remain historical evidence.
- New baseline: 28 database-free cases use fresh isolated runtimes, unique `Oav00Permission*` names, unconnected Mongoose connections, and owning-runtime middleware/request flows; teardown clears each runtime's OpenAPI registry and destroys only its fixture connection. Coverage includes base/shorthand guards, string AND / array OR, `.default`, terminal false/empty-array/async-false versus undefined fallback, closed field objects (including no nested-default inheritance), field scalars/hooks with request/permissions identity and no top-guard evaluation, absent-field umbrella behavior, shallow model/default precedence, copied defaults versus live exact fallback, data/default isolation, and 401/HEAD/route-registration/OpenAPI/live-mutation behavior. All assertions characterize retained policy; none require aliases to remain absent or preserve the arbitrary-populate-selector behavior from the historical review probe.
- Fresh build: `pnpm --filter @web-ts-toolkit/access-router... build` passed initially and again after the concurrent virtuals correction: access-router plus four transitive workspace dependencies, with CJS/ESM/declaration output rebuilt.
- Required focused verification: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-baseline.contract.test.ts test/model-router.routes.integration.test.ts test/data-router.test.ts test/model-subdocument-routes.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/root-router.integration.test.ts` passed initially and on the refreshed build: **6 files / 106 tests** (28 new baseline + 78 existing representative tests). Existing read-fallback tests reproduce direct/root/trusted-service base-list denial, terminal Forbidden results, and successful list row/field/include/task/decorate policy. Builds and tests ran serially; `fileParallelism: false` is preserved.
- Source verification: `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` passed (exit 0) after the refreshed build. The initial run failed (exit 2) with four concurrent VIRT-01 TS2344 errors at `packages/access-router/src/filter-type-tests.ts:185,204,222,232`: interface `VirtUserVirtuals` (`:181-183`) lacked the string index signature required by the then-current `TVirtuals extends Record<string, unknown>` constraint. Investigation identified these fixtures as concurrent VIRT-01 changes. The virtuals owner changed the constraint to `extends object`; OAV-00 waited for the external build to finish, observed no external build/test process before its refresh, and reran the required build/tests/typecheck successfully. No source correction was made by this session.
- Additional checks: `pnpm exec eslint packages/access-router/test/operation-access-baseline.contract.test.ts`, `git diff --no-index --check -- /dev/null packages/access-router/test/operation-access-baseline.contract.test.ts`, and `git diff --no-index --check -- /dev/null docs/tasks/20261005-131819-access-router-operation-access-variants.md` passed. `git status --short` / concurrent source diffs were inspected to preserve virtuals work. Root `CHANGELOG.md` was not edited; no source feature, staging, commit, reset, or revert belongs to OAV-00.
- Blockers/follow-ups: no unresolved OAV-00 blocker. Later alias-resolution/paired-route tasks must add and capture their own before-fix regressions per requirement 5; their source ownership still needs coordination with active virtuals work. Final status also showed concurrent `packages/access-router/test/strict-consumer-types.test.ts` edits and new `packages/access-router/test/virtuals-config.contract.test.ts`; these remain virtuals-owned.

### Task OAV-01: Add route-access variant types and typed configuration paths

Status: completed

Priority: P1

Suggested owner: TypeScript public-API implementer

Dependencies: OAV-00

Primary ownership:

- `packages/access-router/src/interfaces/root.ts`, `access.ts`.
- `packages/access-router/src/index.ts` and `advanced.ts` type surface as needed.
- `packages/access-router/src/runtime.ts` data setter signatures.
- `packages/access-router/src/options/data-options.ts`.
- `packages/access-router/src/routers/data-router.ts` setter signatures.
- `packages/access-router/test/strict-consumer-types.test.ts` variant type fixtures.

Finding / references: R4. Model/default options have typed extended access keys; data setters do not. Route and field operation-rule types are currently shared.

Implementation requirements:

1. Add the fourteen optional route `Validation` keys, retain base operations/shorthand values, and make `.default` examples type-correct. Expose the route-access type through existing public entrypoints; no new package subpath is necessary.
2. Keep the existing field permission-rule shape separate so transport keys are not advertised as `PermissionSchema` field grants.
3. Add typed top-level dotted keys to model/default/data option APIs. Ensure `router.set`, `setOption`, owning-runtime setters, and existing property-helper forms support the intended configuration paths. Nested subdocument objects and the existing `operationAccess('subs.comments.basicRead', false)` property-helper form must work.
4. Preserve existing broad/legacy data option assignments; data routers only implement list/read variant behavior. Improve nested known-key completions without removing existing dynamic sub-rule support.
5. Add variant/base operation types or explicit literal mappings for internal route wiring. Preserve existing custom access-string compatibility outside the new typed mapping.
6. Leave runtime variant defaults absent and leave route options mutable.

Acceptance criteria:

- Package-name imports in strict `.ts`, `.mts`, and `.cts` consumers accept all fourteen model keys, four data keys, nested subdocument variants, and the supported dotted setters without `as never`/deep imports.
- Invalid top-level variant names/value types are rejected; `permissionSchema: { name: { basicRead: true } }` is not presented as valid field authorization.
- Existing consumer fixtures and source typecheck pass after a fresh build.

Verification: fresh package build, `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts`, then source typecheck.

Execution record (2026-10-05):

- Fresh OAV-01-only session; OAV-00 prerequisite is completed with its refreshed build, 106 tests, and source typecheck. Read this full task file, `AGENTS.md`, and `docs/tasks/README.md`; loaded the task-as-you-go and ai-friendly-ts-package skills. Marked OAV-01 `in_progress` before implementation.
- Initial `git status --short` confirms concurrent virtuals changes, including overlapping `src/interfaces/root.ts`, `src/index.ts`, `src/runtime.ts`, and `test/strict-consumer-types.test.ts`. Inspect current source/diffs and preserve the new virtual generic parameters with narrow patches. Required shared-output build/test checks will run serially after checking for other build processes.
- Before-source regression: `TMPDIR=<repo-root>/_tmp-oav01 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts -t OAV-01` failed as expected: **3 new `.ts` / `.mts` / `.cts` cases failed, 4 existing cases skipped**. Existing output lacks the public route/field/variant types, fourteen model/default dotted keys, four data dotted keys, and object `.default`; data setter signatures still reject dotted accesses. This supporting run used OAV-00's existing output, not a new feature build. `git check-ignore _tmp-oav01` confirmed ignored repository-local scratch storage; fixture teardown removed staged consumers. A new concurrent `packages/access-router/virt-repro.ts` appeared and is virtuals-owned.
- Implementation is present in the owned type/export/data-signature files, with three dedicated strict consumer cases appended around existing virtual fixtures. Before starting OAV-01's fresh verification, process inspection found a virtuals-owned chain running package build → package typecheck (which rebuilds) → virtual suites → existing strict fixture → export contract. OAV-01 waits for that chain to finish; its results are external and are not claimed as OAV-01 verification.
- The external chain finished and process inspection showed no active build/test before OAV-01's required fresh `pnpm --filter @web-ts-toolkit/access-router... build`: **passed** (access-router + four transitive packages; CJS/ESM and `.d.ts` / `.d.mts` rebuilt). Focused ESLint on all seven owned source/test files and tracked-file whitespace checks also passed. Required strict/export tests and source typecheck remain in progress.
- First required focused run, `TMPDIR=<repo-root>/_tmp-oav01 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts`: **43 passed / 3 failed** (2 files). Export contract and all four prior strict cases passed. The new fixtures passed every variant/path/negative check but incorrectly supplied `DefaultModelRouterOptions<Row>` to the existing global-default setters, which accept `DefaultModelRouterOptions<unknown>`; TS2345 concerned the unrelated identifier-hook generic. Corrected the fixture to the supported unparameterized default-options type without changing that API. Focused verification will be rerun before completion.
- Corrected required focused run with the same command: **2 files / 46 tests passed** (7 strict consumer cases, including the 3 new module-form cases, plus 39 export-contract cases). Package-name consumers prove all fourteen keys/model-default setters, four data keys/setters, `.default`, nested variants, shorthand, custom access compatibility, and rejected invalid names/values/field transport rules. Source typecheck and final declaration review remain before completion.

Completion evidence (2026-10-05):

- Session-authored changed files: `packages/access-router/src/interfaces/access.ts`; `packages/access-router/src/interfaces/root.ts`; `packages/access-router/src/index.ts`; `packages/access-router/src/runtime.ts` (data setter/getter signatures only); `packages/access-router/src/options/data-options.ts`; `packages/access-router/src/routers/data-router.ts` (setter signatures only); `packages/access-router/test/strict-consumer-types.test.ts` (three dedicated OAV-01 cases); `docs/tasks/20261005-131819-access-router-operation-access-variants.md`. OAV-01 was `in_progress` before implementation and became `completed` only after the required checks and declaration review passed. Top-level progress now records OAV-00/OAV-01 completed; other task statuses were not changed.
- Types/API: exported `OperationAccess` adds all fourteen optional `Validation` variants and `default`; `FieldOperationAccess` preserves the old field-rule shape separately, and `PermissionSchema` uses it. `SubOperationAccess` exposes the five retained operations and four list/read variants with dynamic legacy keys; old `Record<string, Validation | Record<string, Validation>>` sub rules and scalar `subs` remain accepted. Model/default extended options expose all fourteen dotted variants; data extended options expose four variants plus `default`/`list`/`read`, and actual data router/runtime/helper setters and getters use the extended type. Existing property-helper nested paths remain available. `PairedRouteAccess`, `RouteBaseAccess`, `RouteVariant`, and generic `RouteVariantAccess<TAccess>` provide typed wiring metadata; `RouteGuardAccess` retains custom string compatibility. Relevant types are reachable through root and the existing `/advanced` re-exports.
- Fresh required build: `pnpm --filter @web-ts-toolkit/access-router... build` **passed** (5 packages: access-router and its four transitive workspace dependencies; CJS/ESM/declarations rebuilt). The observed external virtuals build/test chain had finished before this build; process inspection also preceded subsequent focused checks. No build/test was started concurrently by this session.
- Required focused verification: `TMPDIR=<repo-root>/_tmp-oav01 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts` **passed: 2 files / 46 tests** — 7 strict consumer cases (4 retained + 3 OAV-01) and 39 export-contract cases. Here `<repo-root>` is the repository checkout; scratch fixtures were staged in ignored `_tmp-oav01/access-router-arf14-consumer-*` and removed by teardown. `.ts` uses strict Bundler resolution, `.mts`/`.cts` use strict NodeNext resolution. All fourteen keys are checked through every model/default setter family, including virtual-generic routers; all four data keys through router/runtime setters. Positive cases cover `.default`, shorthand, undefined values, nested/scalar/legacy sub rules, and public root/advanced type imports without casts/deep imports. Negative cases require real errors for typos, invalid guards/arrays/values, invalid mapped operations, and model/data field transport grants. Earlier expected pre-feature failures and the corrected global-default fixture mismatch are preserved in the execution record above.
- Source verification: `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` **passed** (exit 0).
- Fresh declaration inspection: reviewed `packages/access-router/dist/index.d.ts`, `index.d.mts`, `advanced.d.ts`, `advanced.d.mts`, and emitted `parsers-QwOD6Gi1.d.ts` / `.d.mts` under that same `dist/`. Confirmed variant/base type exports, all fourteen documented optional route keys, object `default`, known nested sub keys, distinct field-only `PermissionRule`, all model/default/data dotted keys, data setter/getter signatures, and preserved virtual generic parameters. Declarations were produced solely by the package build.
- Additional checks: `pnpm exec eslint packages/access-router/src/interfaces/access.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/index.ts packages/access-router/src/runtime.ts packages/access-router/src/options/data-options.ts packages/access-router/src/routers/data-router.ts packages/access-router/test/strict-consumer-types.test.ts`, `git diff --check`, and `git diff --no-index --check -- /dev/null docs/tasks/20261005-131819-access-router-operation-access-variants.md` **passed**. `git check-ignore _tmp-oav01` confirmed repository-scoped scratch is ignored. Refreshed current source/diffs/status throughout; root `CHANGELOG.md` has no diff from this work.
- Acceptance outcomes: all OAV-01 strict consumer keys/forms, negative field/value/name checks, previous fixtures, source typecheck, and shipped-declaration discovery pass. Runtime alias defaults remain absent; existing copy-on-write mutable options, scalar guards, broad data assignments, closed sub fields, legacy umbrella, and base-scoped route/service/field/filter/hook/root/related-target behavior are preserved. This task changes types/signatures only; route resolution/wiring and selector validation remain owned by OAV-02–OAV-05.
- External findings/follow-ups: no unresolved OAV-01 blocker. The existing global-default setter API accepts unparameterized `DefaultModelRouterOptions`; a fixture-only correction respected that contract. Concurrent virtuals generic/configuration/service/test changes were preserved; its temporary `packages/access-router/virt-repro.ts` appeared and was removed externally. Later OAV tasks must refresh overlapping source anchors and serialize builds with the virtuals owner; OAV-02 owns variant resolution and OAV-03/OAV-04 own endpoint behavior regressions.

### Task OAV-02: Implement shared variant-to-base authorization resolution

Status: completed

Priority: P0

Suggested owner: authorization implementer

Dependencies: OAV-01

Primary ownership:

- `packages/access-router/src/operation-access.ts` (suggested new internal resolver).
- `packages/access-router/src/core.ts`, `core-data.ts` route-owned authorization entrypoint.
- `packages/access-router/test/operation-access-variants.contract.test.ts` (new).

Finding / references: R1/R2. `getNestedOption` has no alias inheritance, and the prior subdocument chain bypassed a defined-field denial.

Implementation requirements:

1. Implement one explicit paired-operation/variant mapping and route-specific resolver shared by model/data cores. Prefer a route-owned entrypoint such as `isAllowedRoute(name, baseAccess, variant)`; preserve ordinary base `isAllowed` behavior.
2. Use exact variant option lookup before unchanged base fallback, including owning-model default-option behavior. Never use truthiness or boolean OR for missing-rule detection.
3. Implement the documented subdocument precedence, preserving the closed-object boundary and legacy umbrella behavior. Top-level variants apply to subdocuments only when field-specific rules are absent.
4. Evaluate exactly one selected guard through existing `canActivate` / `evaluateRouteGuard`. Preserve request `this`, permissions identity, async handling, and operational errors.
5. Read live runtime options for each check. No global/request ambient variant state or new guard cache may couple different routers, calls, or runtimes.

Acceptance criteria:

- Before/after regressions cover every mapped key, base-only inheritance, variant-only allow, exact false/empty-array/function denial, undefined inheritance, scalar shorthand, `.default`, model-default specificity, and no model-default leakage into data.
- Subdocument cases cover exact variant > field base > field scalar/closed object > top variant > top base, with an allowed top base that cannot reopen a closed field object.
- Two isolated runtimes with the same model name and opposite variants stay independent; runtime mutation affects later checks.
- Tests show only the selected guard executes and that operational failures are not converted to fallback permissions.

Verification: fresh package build, `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-variants.contract.test.ts test/operation-access-baseline.contract.test.ts test/runtime-isolation.integration.test.ts`, then source typecheck.

Execution record (2026-10-05):

- Fresh OAV-02-only session; OAV-00/OAV-01 are completed. Read the full task document, `AGENTS.md`, and `docs/tasks/README.md`; loaded the task-as-you-go and ai-friendly-ts-package skills. Set OAV-02 `in_progress` before implementation; later task statuses remain pending.
- Initial `git status --short` and current core/type source confirm active concurrent virtuals work and OAV-01's preserved virtual generics. Initial process inspection found no running build/test chain. Refresh overlapping source before narrow patches and check again before shared-output builds. Required before-fix regressions will use owning-runtime middleware and existing built output.
- Before-source base-boundary regression: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-variants.contract.test.ts` failed as expected: **49 failed / 14 passed (63 tests, 1 file)**. The temporary probe called current `isAllowed(name, baseAccess)` as generated boundaries do today. Table assertions exercised all fourteen model keys/four data keys; configured variants were ignored, variant-only grants denied, selected hooks/errors skipped, live variant conflicts ignored, and subdocument exact/top variants bypassed. Retained base/default/closed-field/custom cases passed. This supporting run used existing OAV-01 output, with owning-router runtime middleware and no database; source feature edits had not started.
- Before-source inheritance regression: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-variants.contract.test.ts -t 'maps .* with replacement and base inheritance'` failed as expected: **9 failed / 54 skipped (63 tests, 1 file)**. A second temporary adapter called ordinary `isAllowed(name, variantKey)` for the nine model/data pair tables. All fourteen model/four data keys reproduced missing-variant/explicit-undefined denial instead of base inheritance. The external virtuals owner ran a build between the probes; process inspection observed it and the run waited until it ended. Its output still had no OAV-02 resolver; its results are not claimed as task verification. The temporary adapters are replaced by `isAllowedRoute` in the retained regressions.
- Implementation: added internal `OPERATION_ACCESS_VARIANTS`, `isRouteVariantAccess`, and `resolveRouteOperationAccess` in `src/operation-access.ts`, plus `Core`/`DataCore.isAllowedRoute(name, baseAccess, variant)`. Ordinary `isAllowed` is unchanged. Subdocument mapping accepts only exact `subs.<field>.list/read`; its defined field boundary precedes top-level rules. The predicate is available for OAV-05 without validation integration or a new public entrypoint. Added supplemental reserved-key and mixed default/sub-field cases after the before-source runs.
- Initial focused lint: `pnpm exec eslint packages/access-router/src/operation-access.ts packages/access-router/src/core.ts packages/access-router/src/core-data.ts packages/access-router/test/operation-access-variants.contract.test.ts` failed with one concurrent virtuals diagnostic: `packages/access-router/src/core.ts:293:9`, `no-useless-assignment` on the initial `let virtualNames: string[] = []` in VIRT-02 projection code. Both try/catch branches replace it; this is outside OAV-02's additions. Reported the precise finding for the virtuals owner and preserved its source. `git diff --check` passed. Process inspection then observed an external virtuals focused test run; required OAV-02 builds wait for it to finish.
- Required serial verification after that external run ended: `pnpm --filter @web-ts-toolkit/access-router... build` **passed** (access-router plus four transitive packages; CJS/ESM and declarations rebuilt). `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-variants.contract.test.ts test/operation-access-baseline.contract.test.ts test/runtime-isolation.integration.test.ts` **passed: 3 files / 108 tests** (68 OAV-02 + 28 OAV-00 + 12 existing isolation cases). `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` **passed** (exit 0). Process inspection preceded each gate; no external build/test was active at those checks.
- Refreshed declarations show both `isAllowedRoute(name, baseAccess: RouteGuardAccess | string, variant: RouteVariant): Promise<boolean>` signatures and their server-owned metadata JSDoc, while preserving the ordinary `isAllowed` signatures and virtual service generics. Reviewed generated `packages/access-router/dist/parsers-CRj1WdCs.d.ts` / `.d.mts`; mapping/resolver/predicate remain internal to the existing bundled package surface.
- New-file whitespace checks `git diff --no-index --check -- /dev/null packages/access-router/src/operation-access.ts`, `git diff --no-index --check -- /dev/null packages/access-router/test/operation-access-variants.contract.test.ts`, and `git diff --no-index --check -- /dev/null docs/tasks/20261005-131819-access-router-operation-access-variants.md` **passed**. `git diff --exit-code -- CHANGELOG.md` **passed**. The repeated four-file focused ESLint command still reports only the same external VIRT-02 initializer diagnostic; final status awaits resolution of that check by the virtuals owner.
- Lint coordination resolution: after inspecting the current VIRT-02 try/catch and reporting the exact shared-core finding, removed only the redundant initial `= []` from `let virtualNames: string[]`. Both existing branches still assign it before use; virtuals logic and current source remain intact. This one-line, behavior-preserving check cleanup in the owned `core.ts` is the only OAV-02 edit outside its imports/route entrypoint. Required verification will be refreshed after this source change before completion.

Completion evidence (2026-10-05):

- Session-authored changed files: `packages/access-router/src/operation-access.ts` (new); `packages/access-router/src/core.ts` (two imports, route-owned entrypoint, and the one-line lint cleanup recorded above); `packages/access-router/src/core-data.ts` (imports and route-owned entrypoint); `packages/access-router/test/operation-access-variants.contract.test.ts` (new); `docs/tasks/20261005-131819-access-router-operation-access-variants.md`. OAV-02 was `in_progress` before edits and became `completed` after the refreshed required gates, focused lint, whitespace, and declaration review passed. Top-level progress records OAV-00 through OAV-02 completed; OAV-03 through OAV-07 remain pending. This fresh session implemented only OAV-02 and spawned no agents.
- Resolver/API: internal `OPERATION_ACCESS_VARIANTS` has the single typed mapping `list/read/create/update/upsert/count/distinct` → `basicList/basicRead/basicCreate/basicUpdate/basicUpsert/basicCount/basicDistinct` and the corresponding `advanced*` keys, checked with OAV-01's actual `PairedRouteAccess`, `RouteVariant`, and `RouteVariantAccess<TAccess>` types. Shared `resolveRouteOperationAccess({ baseAccess, variant, getExactOption, isAllowedBase, canActivate, subdocuments? }): Promise<boolean>` is called by both cores' `isAllowedRoute(name: string, baseAccess: RouteGuardAccess | string, variant: RouteVariant): Promise<boolean>`. Internal `isRouteVariantAccess(access: unknown)` recognizes exactly the fourteen flat reserved identifiers for OAV-05; no new public export/subpath was added.
- Resolution acceptance: exact live owning-runtime variant getter → one `canActivate` evaluation when defined; only `undefined` delegates to unchanged base `isAllowed`. False, null from JavaScript configuration, empty array, sync/async false guards are terminal. No base+variant combination, request-method inference, ambient variant state, options snapshot, guard-result cache, or variant defaults were introduced. Model exact-default specificity (including copied defaults, model shorthand/closed parents, and undefined → live-default behavior) is retained; data has no model-default inheritance. Ordinary `isAllowed` bodies and custom/alias calls retain their prior lookup semantics.
- Subdocument acceptance: only exact three-segment `subs.<field>.list/read` maps variants. Field exact variant → field exact base → defined field scalar/closed-object evaluation → top exact variant only for an absent field → existing top base resolution. Both list/read pair matrices reproduce the closed-field boundary even when top base and both top variants allow. Empty/undefined-key field objects, null/empty-array/scalar field rules, nested `.default`, absent fields, legacy boolean/function `subs` umbrellas, and mixed model/default sub rules are covered. Longer paths, other sub operations, and custom access strings delegate to ordinary base behavior.
- Before-fix evidence: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-variants.contract.test.ts` with the temporary current-base-boundary adapter **failed: 49 failed / 14 passed (63 tests)**; the same command with `-t 'maps .* with replacement and base inheritance'` and the temporary naive-alias adapter **failed: 9 failed / 54 skipped (63 tests)**. These supporting pre-source runs reproduced ignored overrides and missing inheritance across all fourteen model/four data keys. Final regressions call the actual `isAllowedRoute`; both temporary adapters are removed. Five supplemental reserved-mapping/mixed-default cases bring the final new suite to **68 tests**.
- Fresh required verification, run serially from repository root after the lint cleanup: `pnpm --filter @web-ts-toolkit/access-router... build` **passed** (5 packages, CJS/ESM/declarations); `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-variants.contract.test.ts test/operation-access-baseline.contract.test.ts test/runtime-isolation.integration.test.ts` **passed: 3 files / 108 tests** (68 OAV-02 + 28 baseline + 12 existing isolation cases); `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` **passed** (exit 0). These same gates passed before the cleanup as recorded above; the refresh verifies the final task source. Process inspection preceded each gate and found no active external build/test; `fileParallelism: false` is preserved.
- Runtime/guard evidence: the new database-free cases register unique models on unconnected fixture connections or empty data routers and append server-owned probes to built routers, using their owning-runtime middleware and RFC9457 response handling. Tests prove request `this` and permissions object identity, async guard handling, exactly one selected hook at every precedence level, thrown/rejected sentinel identity with existing HTTP 500 handling rather than permission fallback, live setter changes across requests and twice within a single request, immutable construction snapshots, and eight interleaved same-name/opposite-variant requests for both model and data runtimes. Subsequent base checks remain independent of explicit metadata and POST body selectors. Teardown clears only fixture OpenAPI registries and destroys fixture connections; no new consumer/temp directory was needed.
- Final checks: `pnpm exec eslint packages/access-router/src/operation-access.ts packages/access-router/src/core.ts packages/access-router/src/core-data.ts packages/access-router/test/operation-access-variants.contract.test.ts` **passed** after the minimal initializer correction; `git diff --check`, `git diff --no-index --check -- /dev/null packages/access-router/src/operation-access.ts`, `git diff --no-index --check -- /dev/null packages/access-router/test/operation-access-variants.contract.test.ts`, and `git diff --no-index --check -- /dev/null docs/tasks/20261005-131819-access-router-operation-access-variants.md` **passed**. `git diff --exit-code -- CHANGELOG.md` **passed**. Fresh emitted `packages/access-router/dist/parsers-BSLA0GpU.d.ts` / `.d.mts` show both route signatures/JSDoc, retained base signatures, and virtual service generics; all output came from builds.
- Discoveries/follow-ups: no unresolved OAV-02 blocker. The observed virtuals lint failure was a redundant initializer only and is resolved; active projection/finalizer/service/interface/router/runtime virtuals changes are preserved and must be refreshed by later owners. OAV-03/OAV-04 must call `isAllowedRoute` at generated Express entry guards with explicit `basic`/`advanced` metadata, while supplying base accesses to services/row/field/hooks and keeping unpaired guards base-scoped; authorization denial remains 401. OAV-05 can import `isRouteVariantAccess`/the shared mapping at its populate boundary. Generated route wiring, selector validation, and their integration regressions remain assigned to those pending tasks. No staging, commit, reset/revert, root changelog edit, or manual generated-output edit was performed.

### Task OAV-03: Wire all paired model collection/document routes

Status: completed

Priority: P1

Suggested owner: generated-model-router implementer

Dependencies: OAV-02

Primary ownership:

- `packages/access-router/src/routers/model-router.ts`, `model-router-route-context.ts`.
- `packages/access-router/src/routers/model-router-collection-routes.ts`, `model-router-document-routes.ts`.
- `packages/access-router/test/operation-access-model-routes.integration.test.ts` (new).

Finding / references: both variants currently invoke the same initiating base guard. Collection route checks are at `model-router-collection-routes.ts:44,89,129,162`; document checks at `model-router-document-routes.ts:62,79,102,133,172,212,251,309,345,417,435`.

Implementation requirements:

1. Pass server-owned basic/advanced metadata at each paired guard in the route matrix. Keep service arguments and data-policy accesses as base operations.
2. Keep `new` / `delete` on existing base checks. Filtered count/distinct POSTs use advanced variants even without an advanced path segment.
3. Keep authorization before validation hooks/service dispatch as today. Under confirmed 401 semantics, do not conditionally skip route/OpenAPI registration.
4. Exercise live mutation using the existing property helper and typed dotted setters; changing a variant must not require router reconstruction.

Acceptance criteria:

- For every paired operation, base-only configuration retains both variants; denying either variant blocks just that endpoint; allowing a variant over a denied base authorizes only that initiating endpoint.
- Both advanced read paths share `advancedRead`; basic list/new/count/distinct/mutations are unaffected by `basicRead: false`.
- Denied routes perform no service/persistence dispatch. Mutations use fresh rows per case and include both create/update upsert branches.
- HEAD uses the basic GET guard; custom `idParam` and query/mutation segments retain correct routing.
- `getEndpoints()` and OpenAPI still contain denied routes under the 401 contract, and ordinary row/field/validation failures retain their existing statuses.

Verification: fresh package build, `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-model-routes.integration.test.ts test/model-router.routes.integration.test.ts test/openapi.test.ts`, then source typecheck.

Execution record (2026-10-05):

- Fresh OAV-03-only session; OAV-00 through OAV-02 are completed, with OAV-02's final 108 tests/source typecheck recorded above. Read this task file, `AGENTS.md`, `docs/tasks/README.md`, and current owned route sources; loaded the task-as-you-go skill. Set OAV-03 `in_progress` before implementation; this session spawns no agents.
- Initial `git status --short` confirms active virtuals work, including `src/routers/model-router.ts` generic/setter additions and core/interface/service/output/test changes. Current route context and collection/document entry guards still use base authorization. Preserve current virtual generics/lifecycle code with refreshed narrow patches. Initial process inspection found no active external build/test; repeat operational checks before shared-output verification.
- Before-source HTTP regression: `TMPDIR=<repo-root>/_tmp-oav03 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-model-routes.integration.test.ts` **failed as expected: 28 failed / 7 passed (35 tests, 1 file)**. `<repo-root>` is the repository checkout. All seven real Mongo/supertest base-only cases passed; all fourteen deny cases returned 200/201 instead of 401, and all fourteen variant-over-denied-base grants returned 401 instead of success. Successful mutation cases use fresh rows and both upsert branches; runtime Core dispatch and actual registered Mongoose query/write methods are spied. This supporting run used OAV-02's existing output before any route source edits. `git check-ignore _tmp-oav03` confirmed ignored repository-local Mongo temporary storage.
- Implementation: `ModelRouter.assertAllowed(req, baseAccess, variant?)` now delegates to `req.macl.isAllowedRoute` only with explicit metadata, with a matching route-context signature. All fifteen paired model guards (both advanced reads included) receive fixed `basic`/`advanced` literals; new/delete and subdocument callers keep their existing base path. Service calls, validation order, and unconditional route/OpenAPI registration stay in place. Added supplemental HTTP regressions for HEAD/custom segments/live setters/shallow replacement, 17 no-database denied-entry requests, all route registrations, base-list read retries, internal upsert branches, and ordinary 400/403/404 results. Five-file focused ESLint passed. Process inspection then observed an active external virtuals focused test run; OAV-03 waits for that run before required shared-output build/tests.
- Required build after the observed external runs finished: `pnpm --filter @web-ts-toolkit/access-router... build` **passed** (5 packages; CJS/ESM/declarations rebuilt). Initial required focused command with `TMPDIR=<repo-root>/_tmp-oav03` and all three required files **passed 70 / failed 1 (71 tests)**: 57/58 new cases and all 13 existing model-route/OpenAPI cases passed. The sole failure was the new fixture normalizing basic upsert's existing OpenAPI `/` suffix to the collection list/create empty suffix; corrected the fixture to preserve that current path. Added three successful base validation/prepare/decorate-hook cases with route-variant traps, including both upsert branches. Route source is unchanged by this fixture correction; focused gates will be rerun before completion.
- Second focused run with the same required three-file command **passed 73 / failed 1 (74 tests)**: all route matrix, OpenAPI, and existing checks passed; the new upsert hook fixture expected branch `context.operation` (`create`) while current concurrent VIRT-04 source/output deliberately preserves initiating `upsert` at `src/services/public-service.ts` and internal overrides. Refreshed that source and corrected only the fixture expectation to the initiating operation; base create/update hook selection is still asserted through distinct spies and prepared/persisted markers. No service/lifecycle source change belongs to OAV-03. Refresh required build/tests/typecheck against the current virtuals source before completion.

Completion evidence (2026-10-05):

- Session-authored changed files: `packages/access-router/src/routers/model-router.ts` (`RouteVariant` import and private guard delegation only); `packages/access-router/src/routers/model-router-route-context.ts` (optional typed route metadata); `packages/access-router/src/routers/model-router-collection-routes.ts` (four paired guards); `packages/access-router/src/routers/model-router-document-routes.ts` (eleven paired guards); `packages/access-router/test/operation-access-model-routes.integration.test.ts` (new); `docs/tasks/20261005-131819-access-router-operation-access-variants.md`. OAV-03 was `in_progress` before implementation and became `completed` only after required refreshed checks, focused ESLint, whitespace, and current-source/diff review passed. Top-level progress records OAV-00 through OAV-03 completed; OAV-04 through OAV-07 remain pending. This fresh isolated task session spawned no agents.
- Route acceptance: all seven model pairs use fixed server-owned `basic`/`advanced` literals at their existing entry checks, including both advanced read endpoints and POST count/distinct. `assertAllowed` calls the live owning Core resolver when metadata is provided and ordinary `isAllowed` otherwise, throwing the existing `UnauthorizedError` for HTTP 401. GET new and DELETE by ID remain base-scoped. No request-method inference, ambient variant state, route omission, service/data-policy guard rewrite, request/response change, or construction-time permission snapshot was introduced. Current virtual generics, setters, lifecycle overrides, and concurrent core/service/output/interface/test work were refreshed and preserved.
- Before/after: the pre-source command `TMPDIR=<repo-root>/_tmp-oav03 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-model-routes.integration.test.ts` **failed 28 / passed 7 (35 tests)** against OAV-02 output, reproducing ignored denials and variant-over-base grants for all fourteen model keys. The retained test now has **68 passing cases**: 42 seven-pair matrix cases (base allow/deny inheritance, either variant denial, either variant grant over base denial), 17 generated-boundary cases, and 9 base-policy cases. Successful list/count/read/distinct requests use real Mongo/supertest with visible/private control rows; successful mutations assert returned and persisted data, fresh unique names/targets, rejected private-field writes, and both upsert create/update branches.
- No-dispatch evidence: each denied matrix request asserts zero additional calls to the actual request Core's `getPublicService` and to the registered Mongoose model's find/findOne/create/countDocuments/distinct and document save/deleteOne seams. A separate unconnected-model fixture sends **17 denied HTTP requests** (all fifteen paired endpoints plus the two extra existing-row upsert inputs), combining malformed built-in input with rejecting custom schemas. All return 401 before custom validation, validate/prepare hooks, service construction, or database work; buffering is disabled to expose accidental persistence immediately. Spies intentionally observe the live runtime dispatch, including filtered distinct's direct `req.macl` lookup.
- Boundary acceptance: `{ read: true, basicRead: false }` denies only basic read while both advanced reads, basic/advanced list/count/distinct/mutations, GET new, and DELETE remain usable. Four HEAD cases prove GET's basic guard in both directions. Seven custom-path pair cases use `idParam: 'recordId'`, query segment `search`, and mutation segment `write`, including both advanced reads and both upsert branches. Live property helper, typed router `set` / `setOption`, runtime setter, explicit undefined inheritance, and object-level shallow replacement change later requests without rebuilding; the immutable construction snapshot and endpoint list remain intact. All **17 existing model endpoints**, including denied ones, remain in `getEndpoints()` and served OpenAPI with 401 responses before/after live changes. Existing basic upsert's OpenAPI trailing slash is preserved.
- Base-policy acceptance: advanced read misses select only base `list`, with opposite basic/advanced list hooks uncalled; allowed fallback performs two lookups and applies list row/field/decorate policy, denied fallback performs one lookup and returns 401. Authorized advanced upsert persists both branches despite denied base/variant create/update entry guards. Three real mutation-hook cases select base create/update validate/prepare/decorate hooks, with prepared markers verified in persistence and route-variant hook traps uncalled; initiating `context.operation` follows current virtuals lifecycle (`upsert` for either upsert branch). Row/update/count/filter and distinct-field denials retain 403, body/query/service validation and invalid distinct retain 400, and allowed misses with retry disabled retain 404 on basic and both advanced read paths. Terminal policy/validation cases perform no persistence.
- Fresh required gates, serial from repository root after fixture corrections and seven supplemental base-denial cases: `pnpm --filter @web-ts-toolkit/access-router... build` **passed** (5 packages; CJS/ESM and `.d.ts` / `.d.mts` rebuilt); `TMPDIR=<repo-root>/_tmp-oav03 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-model-routes.integration.test.ts test/model-router.routes.integration.test.ts test/openapi.test.ts` **passed: 3 files / 81 tests** (68 OAV-03 + 5 existing model-route + 8 existing OpenAPI); `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` **passed** (exit 0). `<repo-root>` is the repository checkout. Process inspection preceded each gate and found no active external build/test; observed external virtuals runs were allowed to finish before this session started shared-output verification. `fileParallelism: false` is preserved.
- Final checks: `pnpm exec eslint packages/access-router/src/routers/model-router.ts packages/access-router/src/routers/model-router-route-context.ts packages/access-router/src/routers/model-router-collection-routes.ts packages/access-router/src/routers/model-router-document-routes.ts packages/access-router/test/operation-access-model-routes.integration.test.ts`, `git diff --check`, `git diff --no-index --check -- /dev/null packages/access-router/test/operation-access-model-routes.integration.test.ts`, `git diff --no-index --check -- /dev/null docs/tasks/20261005-131819-access-router-operation-access-variants.md`, and `git diff --exit-code -- CHANGELOG.md` **passed**. `git check-ignore _tmp-oav03` confirmed ignored repository-local temporary storage; Mongo fixture directories were removed by teardown, and the scratch marker was removed. Only ignored runner compile-cache data remains. Root `CHANGELOG.md` has no diff; no staging, commit, reset/revert, unrelated package edit, or manual generated-output edit was performed.
- Follow-ups/blockers: no unresolved OAV-03 blocker. Two new-fixture mismatches (existing upsert OpenAPI slash and concurrent initiating-operation lifecycle) were corrected and verified without source scope expansion. OAV-04 must pass metadata through the existing optional guard for subdocument list/read and wire DataRouter list/read; their source is not wired by this task. OAV-05 still owns selector validation and broader root/trusted-service/related-target/subdocument-response regressions; OAV-06 owns shipped docs/consumer discovery; OAV-07 remains the separate independent final review. Later owners must refresh active virtuals work and serialize shared-output checks.

### Task OAV-04: Wire data and subdocument list/read variants

Status: completed

Priority: P1

Suggested owner: data/subdocument-router implementer

Dependencies: OAV-03

Primary ownership:

- `packages/access-router/src/routers/data-router.ts` route guard wiring.
- `packages/access-router/src/routers/model-router-subdocument-routes.ts` list/read wiring.
- `packages/access-router/test/operation-access-data-subdocument-routes.integration.test.ts` (new).

Finding / references: data list/read checks at `data-router.ts:92,130,177,200,231`; subdocument paired list/read checks at `model-router-subdocument-routes.ts:29,48,100,120`.

Implementation requirements:

1. Wire four data-router keys with the same precedence as model list/read and preserve both advanced read paths.
2. Wire field-specific basic/advanced subdocument list/read keys. Keep subdocument mutation entry guards and service visibility logic on existing base operations.
3. Cover specific field overrides and absent-field inheritance separately; fixtures must not confuse row/field-policy denial with the initiating route guard.
4. Preserve owning-runtime subdocument discovery, option snapshots, custom segments/IDs, and live variant setters.

Acceptance criteria:

- Data and subdocument pairs split in both directions and retain base-only behavior, with no service/persistence work for denied entrypoints.
- A field base rule outranks a general top-level transport rule; a field exact transport rule outranks its field base. Defined field objects with omitted operations remain closed.
- Basic read denial does not block an otherwise allowed advanced subdocument read or any unchanged subdocument mutation entry.
- Existing data, subdocument-route/discovery, and mutation-visibility suites pass.

Verification: fresh package build, `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-data-subdocument-routes.integration.test.ts test/data-router.test.ts test/model-subdocument-routes.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts`, then source typecheck.

Execution record (2026-10-05):

- Fresh OAV-04-only session; OAV-00 through OAV-03 are completed, with OAV-03's final 81 tests and source typecheck recorded above. Read the full task file, `AGENTS.md`, `docs/tasks/README.md`, and current primary route sources; loaded the task-as-you-go skill. Marked OAV-04 `in_progress` before implementation; this session spawns no agents.
- Initial `git status --short` confirms concurrent virtuals changes across core/service/interface/runtime/model-router code and tests. Data-router setter signatures already include OAV-01's extended options; OAV-03's context accepts optional explicit variant metadata. Current data/subdocument list/read guards still use base-only checks. Preserve existing source with refreshed narrow patches and reuse the implemented resolver signatures. Initial process inspection found no active external build/test; repeat checks and wait for observed external work before shared-output verification.
- Initial pre-source fixture run, `TMPDIR=<repo-root>/_tmp-oav04 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-data-subdocument-routes.integration.test.ts`, failed **20 / passed 4 (24 tests)**. Eight subdocument cases reproduce ignored denials/grants; twelve data cases encountered a fixture-only 500 because the callable runtime middleware initializes model Core, not DataCore. Corrected the fixture to run the data router's existing owning-runtime `router.middlewares` before spying on DataCore. No route source was edited; rerun the corrected fixture for clean before-fix evidence. `<repo-root>` is the repository checkout and `git check-ignore _tmp-oav04` confirms ignored repository-local scratch.
- Corrected before-source HTTP regression with the same command **failed as expected: 16 failed / 8 passed (24 tests, 1 file)** against existing OAV-03 output. All eight base-only allow/deny compatibility cases passed; eight variant denials returned 200 instead of 401 and eight grants over denied bases returned 401 instead of 200 across both data and subdocument list/read pairs. Data read exercises both advanced paths; successful subdocument flows use real Mongo, restricted control rows, and base field projections. No route source edits preceded this run.
- Implementation: DataRouter's private guard now requires explicit `RouteVariant` metadata and calls the existing DataCore resolver. All five data entry guards and four paired subdocument guards receive fixed `basic`/`advanced` literals through the existing model context. Added no service or core changes. Current source/status was refreshed immediately before the narrow patches; newly observed virtuals-owned `src/acl/populate-target.ts` and current core refactoring remain external work.
- Focused ESLint on the two route sources and new regression file and `git diff --check` passed. Initial required `pnpm --filter @web-ts-toolkit/access-router... build` passed, but the next process inspection discovered an external virtuals build/test chain that began during it and was running `test/subdocument-populate-authorization.integration.test.ts`. Waited for that observed chain to end without interrupting it; refreshed current core/guard signatures and confirmed no active external build/test before repeating the required build. The overlapping run is not final serial verification evidence.
- The repeated build also passed, but external model-router integration/comparison work continued, including an externally issued tracked-work stash/build/test/restore cycle. Waited for those observed processes and the subsequent restored-worktree build to finish; `git status --short`, the exact two route diffs, and current context/resolver source confirm OAV-01/OAV-03/OAV-04 and virtuals tracked changes are restored, with no conflicts. This session issued no stash/restore/revert operation. Final verification starts from that restored current source after another quiet process check.
- Required restored-source `pnpm --filter @web-ts-toolkit/access-router... build` passed; focused `TMPDIR=<repo-root>/_tmp-oav04 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-data-subdocument-routes.integration.test.ts test/data-router.test.ts test/model-subdocument-routes.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts` passed **4 files / 197 tests** (75 new + 22 data + 29 subdocument/discovery + 71 mutation-visibility). Process inspection preceded both and found no active external build/test. A later inspection observed an external model permission test, which was allowed to finish before the source typecheck. Focused ESLint, tracked/new-file whitespace, and root changelog checks passed.
- Required `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` then failed (exit 2) with a single external VIRT-05 diagnostic: `packages/access-router/src/acl/populate-target.ts:73:13`, TS2352, direct conversion from `Populate` to `Record<symbol, unknown>` lacks a symbol index signature. The new VIRT-05 helper transports non-enumerable populate metadata and is outside route wiring. Reported the exact diagnostic; OAV-04 remains `in_progress` pending a passing source gate and refreshed current-source verification.
- Check cleanup: after reporting and rechecking the unchanged diagnostic while external debugging continued, inserted only the explicit `unknown` intermediary required by TS2352 at `packages/access-router/src/acl/populate-target.ts:73`. This one-line type-only cast correction preserves the helper's symbol lookup/runtime behavior and all virtuals implementation; it is the only OAV-04 source edit outside its two primary route files. No OAV-05 selector/secondary-policy source was changed. Required gates will be refreshed against current source before completion.
- After the cast cleanup, source typecheck passed (exit 0), and the same required four-file focused command again passed **197 tests** after quiet process checks. External VIRT-05 comparison builds were observed during earlier refresh attempts; waited safely without stopping them. Current external debug instrumentation in `src/services/service.ts` / `src/output/finalize-model-output.ts` remains virtuals-owned. A final uninterrupted build → focused tests → source typecheck refresh is required to record one serial current-source sequence.

Completion evidence (2026-10-05):

- Session-authored changed files: `packages/access-router/src/routers/data-router.ts` (`RouteVariant` import, private guard delegation, five paired guards only); `packages/access-router/src/routers/model-router-subdocument-routes.ts` (four paired guards only); `packages/access-router/test/operation-access-data-subdocument-routes.integration.test.ts` (new); `packages/access-router/src/acl/populate-target.ts` (the single type-only TS2352 cast cleanup recorded above; the helper itself is concurrent VIRT-05 work); `docs/tasks/20261005-131819-access-router-operation-access-variants.md`. OAV-04 was `in_progress` before implementation and became `completed` only after the final serial required gates, focused lint, whitespace, and current-source/diff review passed. Top-level progress now records OAV-00 through OAV-04 completed; every other task status is unchanged. This fresh task session spawned no agents.
- Route acceptance: data GET collection/read use explicit `basic`, POST query list and both POST query read paths use explicit `advanced`; the four subdocument list/read endpoints pass the same fixed metadata through OAV-03's existing optional model guard. Live owning-runtime `isAllowedRoute(name, baseAccess, variant)` selects the initiating guard, preserving 401 before validation/service dispatch. Field/row/hook/service arguments and subdocument parent/sub selection scopes retain base keys. Subdocument create/delete/both PATCH guards, root/service checks, and mutation visibility source retain their existing base calls. Current virtuals and OAV-01 setter work were refreshed and preserved by narrow patches; no request-method inference, ambient variant state, construction-time guard snapshot, or conditional registration was added.
- Before/after regression: `TMPDIR=<repo-root>/_tmp-oav04 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-data-subdocument-routes.integration.test.ts` **failed 16 / passed 8 (24 tests)** before any route source edits against OAV-03 output. The clean run reproduced all four pairs' ignored variant denials and denied-base grants; base-only allow/deny cases passed. The earlier fixture-only DataCore initialization failure is recorded above and was corrected without production changes. The retained new file now has **75 passing cases**: 29 database-free data cases, 42 real-Mongo subdocument cases, and 4 unconnected subdocument entry/discovery cases.
- Coverage: all four list/read pairs split in both directions, inherit allowed/denied bases, and allow either variant with a denied or absent base. Both advanced data read paths are exercised throughout. Real subdocument fixtures include listed/readable/private control rows, permitted base field grants, explicit advanced selections, and client filters. Exact field variant > field base > defined field scalar/closed object > top variant only for an absent field > top base is reproduced over HTTP, including omitted/undefined rules, no nested-default reopening, selected async guard/permissions identity, general-versus-specific conflicts, and unchanged absent-field `subs` umbrellas.
- Boundary coverage: four HEAD pair cases in both directions; custom `idParam: 'recordId'` / query segment `search`, including business-key parent `idField: 'key'`; property helper, typed router `set`/`setOption`, owning-runtime setter, explicit undefined inheritance, nested field replacement, and shallow whole-object replacement across later requests with frozen construction snapshots/endpoints retained. Same-name data runtimes with opposite permissions stay independent and ignore model defaults. Same-name unconnected models with divergent `items`/`reviews` schemas discover exactly their own eight subdocument endpoints/operation IDs. Served OpenAPI and `getEndpoints()` retain all five denied data and all eight denied subdocument endpoints before/after live changes.
- No-dispatch/policy coverage: every denied matrix request checks live request Core/DataCore service construction, row/field-policy seams, and Mongoose query/write seams remain uncalled. Separate malformed/valid denied requests cover all nine paired entrypoints before built-in/custom validation (**8 data + 6 subdocument requests**) and all four unpaired subdocument mutation guards. Successful advanced routes retain base row/field/decorate policy and ordinary 400/403/404 results. With basic reads disabled, create/delete/single PATCH/bulk PATCH still succeed; persistence, protected fields, hidden control rows, create response read+list visibility, and targeted update read-only visibility are asserted. Existing mutation-visibility tests also pass; broader OAV-05 boundaries remain assigned to that task.
- Final required gates, run serially from repository root after the cast cleanup and external runs ended: `pnpm --filter @web-ts-toolkit/access-router... build` **passed** (5 packages, CJS/ESM and `.d.ts` / `.d.mts` rebuilt); `TMPDIR=<repo-root>/_tmp-oav04 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-data-subdocument-routes.integration.test.ts test/data-router.test.ts test/model-subdocument-routes.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts` **passed: 4 files / 197 tests** (75 new + 22 data + 29 subdocument/discovery + 71 mutation-visibility); `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` **passed** (exit 0). Process checks before and between those final gates found no active external build/test; `fileParallelism: false` is preserved. Earlier overlapping builds were supporting attempts only; observed external verification chains were allowed to finish without interruption.
- Additional checks: `pnpm exec eslint packages/access-router/src/routers/data-router.ts packages/access-router/src/routers/model-router-subdocument-routes.ts packages/access-router/src/acl/populate-target.ts packages/access-router/test/operation-access-data-subdocument-routes.integration.test.ts`, `git diff --check`, `git diff --no-index --check -- /dev/null packages/access-router/test/operation-access-data-subdocument-routes.integration.test.ts`, `git diff --no-index --check -- /dev/null packages/access-router/src/acl/populate-target.ts`, `git diff --no-index --check -- /dev/null docs/tasks/20261005-131819-access-router-operation-access-variants.md`, and `git diff --exit-code -- CHANGELOG.md` **passed**. `git check-ignore _tmp-oav04` confirms ignored repository-local temporary storage; `<repo-root>` is the repository checkout. Mongo fixture directories were removed by teardown, the scratch marker was removed, and only ignored runner compile-cache data remains. No staging, commit, stash/reset/revert, manual generated-output edit, or root changelog edit was performed by this session.
- Discoveries/follow-ups: no unresolved OAV-04 blocker. The public callable runtime middleware initializes model Core only; data test spies must run the built data router's owning DataCore middleware first. The external VIRT-05 TS2352 error is resolved by the recorded one-line cast cleanup. External comparison work temporarily stashed/restored tracked edits; OAV-04 waited and verified its current patches restored without conflicts. VIRT-05's `src/services/service.ts` / `src/output/finalize-model-output.ts` debug instrumentation and its repeated model-permission comparison runs remain owned by that external task; its owner must clean/verify those before virtuals completion. OAV-05 remains pending for selector validation and wider root/trusted-service/related-target/secondary-policy regressions, followed by OAV-06 docs/consumer discovery and OAV-07 independent final review.

### Task OAV-05: Verify secondary/base-policy boundaries and validate access selectors

Status: completed

Priority: P0

Suggested owner: authorization integration/test implementer

Dependencies: OAV-03, OAV-04

Primary ownership:

- `packages/access-router/src/validation/common.ts`, `model-router.ts`, `root-router.ts` for supported populate-access validation.
- `packages/access-router/src/validation/types.ts` for the corresponding exported advanced wire-body option types (alignment recorded below).
- `packages/access-router/src/core.ts` shared populate effective-access validation, using the reserved mapping from `src/operation-access.ts`.
- `packages/access-router/src/acl/populate-access.ts` (new internal validation/error helper), plus narrow populate-planning error conversion in `src/services/service.ts` and reserved-selector BadRequest propagation in legacy read/list includes in `src/services/base.ts` (scope inclusion recorded below).
- OAV-07-F04 independent-review inclusion: exact custom target access retention through `src/acl/populate-target.ts`, internal access types in `src/acl/virtual-projection.ts` / `src/output/finalize-model-output.ts`, and the two target-plan normalization sites in Core/Service; public virtual configuration remains separately owned.
- `packages/access-router/test/operation-access-boundaries.integration.test.ts` (new).
- Existing read-fallback, root, cross-resource, correlated-include, and subdocument-visibility regressions as needed.

Finding / references: R3/R5. Internal checks are base-scoped, while permissive wire access selectors can otherwise name newly configured route keys.

Implementation requirements:

1. Reuse a supported `list` / `read` schema for wire `populateAccess`, consistent with the existing public type and populate descriptor access. Preserve omitted-option/default behavior and valid values across direct/root schemas. At the shared populate boundary, reject the reserved route-variant identifiers as effective data-policy access, including per-descriptor overrides and generic options forwarded through legacy includes/subqueries. Preserve trusted custom access behavior outside the newly reserved identifiers. Use the existing controlled BadRequest contract before target persistence.
2. Test that route metadata and client-provided fields cannot change target/base operation authorization. Do not propagate a transport selector through service options or mutable request state.
3. Preserve base read-to-list retry guards in both `_read` and `_readFilter`. Document the allowed-read/missing-row case separately from a denied initiating route and terminal Forbidden/BadRequest.
4. Test root model/data/subdocument entries using base operations with conflicting transport rules, including root base denial despite a permitted direct variant. Reject transport names as root `op` values.
5. Test related includes/subqueries/populate against target base denial and conflicting target variants. Preserve existing target no-query denial shapes, count semantics, and terminal filter denials.
6. Verify subdocument create/update response visibility still uses base parent/subdocument read/list rules after writes. Preserve successful empty/null response semantics.
7. Exercise trusted service calls under different HTTP methods to prove no implicit basic/advanced context leaks. Preserve current service enforcement rather than asserting all direct methods are blanket operation-guarded.
8. OAV-07-F04 independent review inclusion: preserve non-reserved custom target data-policy accesses through concurrent VIRT populate plan/finalizer metadata. Custom per-operation field/grant rules must not be silently normalized to `read` after the initial custom operation/selection/filter checks. Add focused runtime coverage with conflicting custom/read rules before any correction; keep public virtual configuration keys and the reserved-route boundary unchanged.

Acceptance criteria:

- Wire `populateAccess: 'basicRead'` / `'advancedRead'` is controlled BadRequest on direct/root requests before target work; supported read/list values still work.
- Nested legacy-include/subquery options and per-descriptor access cannot select reserved variants. Shared-boundary tests reproduce the comparative probe and prevent target dispatch despite `advancedRead: true` on a base-read-denied target.
- `{ read: true, basicRead: false }` retains permitted root read and ordinary trusted service behavior; root `{ read: false, advancedRead: true }` remains denied despite an allowed direct POST entry.
- Base `list: false` still blocks read fallback even when `advancedList: true`; `basicList: false` alone does not block base-authorized read fallback. Terminal Forbidden/BadRequest never retries.
- Disabling route reads does not unexpectedly remove readable mutation output; base read denial still hides responses after successful writes as before.
- No variant is used for field selection, row filtering, hook selection, related-model authorization, or root dispatch; focused boundary/regression suites pass.
- Trusted non-reserved custom populate access retains its exact target field/document-grant policy, including per-descriptor overrides, nested include/subquery forwarding, and hydrated output; a denied target `read` policy is not substituted after a granted custom access.

Verification: fresh package build; run `test/operation-access-boundaries.integration.test.ts`, `test/read-list-fallback-authorization.integration.test.ts`, `test/root-router.integration.test.ts`, `test/cross-resource-authorization.integration.test.ts`, `test/subdocument-populate-authorization.integration.test.ts`, `test/correlated-includes.execution.test.ts`, and `test/subdocument-mutation-visibility.integration.test.ts` via the focused Vitest command; then source typecheck.

Execution record (2026-10-05):

- Fresh OAV-05-only session; OAV-00 through OAV-04 are completed, including OAV-04's final serial 197 tests and source typecheck. Read the full task file, `AGENTS.md`, and `docs/tasks/README.md`; loaded the task-as-you-go and ai-friendly-ts-package skills. Marked OAV-05 `in_progress` before implementation; this session spawns no agents.
- Initial current status/diffs confirm active concurrent virtuals core/service/interface/runtime/output changes and the new `src/acl/populate-target.ts` metadata helper. OAV-04's type-only cast correction is retained. Refresh the actual effective-access boundary and surrounding error catches before assigning any necessary narrow ownership adjustment. Initial process inspection observed an external virtuals debug test; shared-output build/test verification waits for observed external work to finish.
- Ownership/scope adjustment before implementation: current `Core.genPopulate` (`src/core.ts`) still resolves descriptor access and checks target `isAllowed`; `src/acl/populate-target.ts` contains only non-enumerable virtual target-plan metadata. Keep effective-access validation at the current Core boundary, outside its best-effort virtual-planning catch, with a small internal `src/acl/populate-access.ts` helper using the existing reserved predicate. Validate the option and every descriptor before concurrent admission, retaining other trusted custom strings and omitted/default semantics. Do not alter the virtual metadata helper or its OAV-04 cast correction.
- Necessary error-path scope inclusion: current `Service.findOne` / `find` concurrent populate planning, `create` populate planning, and `updateOne` populate planning sit outside their `getClientRequestErrorResult` catches. A Core-only rejection would otherwise escape the declared service ErrorResult contract and root per-entry mapping. Include narrow catches at those planning sites and recognition of the dedicated populate BadRequest in `Base.getClientRequestErrorResult`. `Base.includeDocsRead` ignores every failed target result and `includeDocsList` returns the source unchanged on every failure; propagate target BadRequest at these two seams using the existing internal error contract (as count/correlated includes already do), so nested generic options/descriptors cannot be swallowed. Preserve other legacy denial/miss shapes and all initiating/base operation guards. Regressions must prove controlled direct/Core errors, trusted-service ErrorResult, root mapping, and zero queried-target persistence for nested failures. No independent service authorization or virtuals-debug rewrite is included.
- Before-source regression: `TMPDIR=<repo-root>/_tmp-oav05 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-boundaries.integration.test.ts` **failed as expected: 53 failed / 9 passed (62 tests, 1 file)** after a fixture-only setter correction. Existing OAV-04 output accepts reserved Core selectors, unsupported direct/root option selectors, generic include/subquery options/descriptors, and final request-schema transformations; trusted calls return successful results instead of BadRequest. Valid base access/default, supported descriptor override, existing descriptor wire validation, and three trusted non-reserved custom-access paths pass. The first run had the same counts but seven transformation cases used a nonexistent `router.requestSchemas` helper; corrected them to the supported `setOptions({ requestSchemas })` before this clean reproduction. No production source edits preceded either run. `<repo-root>` is the repository checkout; `git check-ignore _tmp-oav05` confirms ignored repository-local Mongo/runner storage. Observed external debug work had ended before these serial runs.
- Initial implementation adds shared optional wire validation and reserved-option/descriptor preflight at current `Core.genPopulate`, a dedicated controlled Core BadRequest carrying an ErrorResult, narrow service-planning catches, and legacy read/list BadRequest propagation. Added broader root/model/data/sub/trusted-service/target/fallback/post-save visibility regressions. Initial focused ESLint on the eight owned source/test files reports only an external VIRT-05 `no-useless-assignment` at `src/services/service.ts:585`: `targetMongooseModel` initializes to `undefined` but both existing try/catch branches replace it. Whitespace checks pass. Reported this exact initializer finding; preserve the target finalizer logic. Process inspection observes an external virtuals eleven-file verification run, so required OAV-05 shared-output build/tests wait for it to finish.
- Check-cleanup scope inclusion before change: the observed external run has ended. Remove only the redundant `= undefined` initializer from that current VIRT-05 local; both try/catch assignments and finalizer behavior stay intact. This one-line behavior-preserving ESLint cleanup is separate from OAV-05's planning catches and is recorded so the virtuals owner/final reviewer can attribute it. Refresh source and required gates after this edit.
- Initial `pnpm --filter @web-ts-toolkit/access-router... build` passed (5 packages, CJS/ESM/declarations), but the following process check revealed an external virtuals build/test chain that began during it. Treat that build as a supporting attempt only; wait for the observed twelve-file chain to finish and rebuild current source before final verification. Refreshed Core/service sources confirm OAV-05's narrow patches survive concurrent edits. Repeated eight-file focused ESLint passed after the recorded initializer cleanup; no broad virtuals correction belongs to this session.
- Required quiet-source build passed again; the exact seven-file focused command with `TMPDIR=<repo-root>/_tmp-oav05` then **passed 233 / failed 6 (239 tests)**. Five new-fixture failures concern unrelated existing guards: nested root subquery descriptors exceed default request depth 8, and count root options deliberately reject metadata fields. Raised only those nested tests' isolated runtime depth to 16 to reach shared validation and omitted metadata options for the count fixture. The sixth failure is external VIRT-04/VIRT-05 include preservation: `test/read-list-fallback-authorization.integration.test.ts:224` expects the existing successful `relatedUsers` include, but hydrated read/fallback output loses it. Reported the precise failure and inspected the current preservation seam before any correction; all other six-file existing regressions pass.
- Necessary acceptance-path scope inclusion before correction: `Base.includeDocs*` writes new include paths through `setDocValue` into hydrated Mongoose `_doc`. Current VIRT preservation in `Service.findOne` saves them using `get(doc, incPath)`, which cannot read non-schema `_doc` paths; the finalizer then strips the unsaved include. This is the required successful read-fallback/include criterion, not a virtual getter redesign. Use the already-imported model-aware `getDocValue` only at the two existing saved-include capture sites (`findOne`, and `find` for trusted non-lean lists); retain captured/finalized values, removal/restoration, association metadata, policy accesses, and finalizer logic. Verify hydrated read/list include output with a compact regression and the required existing fallback suite. Other active virtuals debugging remains externally owned.
- Before-correction regression for that inclusion: `TMPDIR=<repo-root>/_tmp-oav05 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-boundaries.integration.test.ts -t 'preserves finalized legacy include output on hydrated'` **failed as expected: 2 failed / 115 skipped (117 tests)**. Both trusted hydrated list/read successfully query the target but lose `related` from returned output, confirming the two precise capture sites. Process checks found no active external build/test before the probe; source correction follows this reproduction.
- Wire-type ownership alignment before change: `src/validation/types.ts` exports six `Advanced*Body` option shapes through existing `/advanced`, all still advertising `populateAccess?: unknown`. Update only those properties/import to the existing `PopulateAccess` type, matching the new shared list/read wire schemas and existing public service/root options. Verify generated `.d.ts` / `.d.mts` through the normal build and source typecheck; retain package entrypoints and trusted runtime custom-string compatibility. OAV-06 documents the clarified wire contract.
- Refreshed required build passed after the two hydrated capture corrections and wire-type alignment. The same exact seven-file command **passed 245 / failed 1 (246 tests)**: all six existing suites, including the previously failing read-fallback include, now pass; the two hydrated regressions and nested reserved/root cases pass. The sole remaining new fixture also sent unsupported `options` to direct POST count (its schema already forbids all options). Omitted that fixture field in the successful direct-count leg without changing source. Added explicit basic-read conflicts to root cases and base sub-list/terminal correlated-filter controls; final new-file inventory is currently 122 cases. Refresh the focused gate before completion.
- Next required focused run **passed 251 / failed 2 (253 tests)** after seven supplemental transformed-descriptor/terminal legacy-row-miss/operational-error controls (129 new cases total). Both failures were a new spy assertion omitting the expected initiating route's inherited source `read` check; changed it to require exactly that source base check and no target/list check. The shared transformed-descriptor BadRequest, zero persistence, every existing suite, and all other contract cases passed. Source is unchanged by these fixture-only corrections; final focused/source/declaration review follows.
- While finishing omitted/configured-default tests, process inspection observed a new external virtuals build followed by package typecheck (which also builds). Waited for those commands to end; their results are external and not OAV-05 verification. Current source now includes additional virtuals write/filter/association code, while the Core boundary, service catches, legacy propagation, two hydrated capture corrections, and initializer cleanup remain present. Refresh the required build/tests/typecheck against that current source. The isolated new suite now has 137 cases, including omitted-base-list defaults and trusted reserved-default direct/root ErrorResult mapping.

Completion evidence (2026-10-05):

- Session-authored changed files: `packages/access-router/src/validation/common.ts`, `packages/access-router/src/validation/model-router.ts`, `packages/access-router/src/validation/root-router.ts`, `packages/access-router/src/validation/types.ts`; `packages/access-router/src/acl/populate-access.ts` (new internal helper); `packages/access-router/src/core.ts` (populate validation import/preflight/effective check only); `packages/access-router/src/services/base.ts` (dedicated-error recognition and two legacy BadRequest propagation seams only); `packages/access-router/src/services/service.ts` (four populate-planning error conversions, two hydrated include capture corrections, and the recorded redundant-initializer cleanup only); `packages/access-router/test/operation-access-boundaries.integration.test.ts` (new); this task file. OAV-05 was `in_progress` before implementation and became `completed` only after its required serial gates and final focused checks passed. Top progress now records OAV-00 through OAV-05 completed; OAV-06/OAV-07 remain pending. This isolated task session spawned no agents.
- Shared source boundary: effective access still lives in `Core.genPopulate`; concurrent `packages/access-router/src/acl/populate-target.ts` only carries target virtual metadata. Preflight the option plus every descriptor before concurrent admission, then validate the final resolved access immediately before selection/target checks, using OAV-02's exact fourteen-key `isRouteVariantAccess` predicate. Reserved names cannot be hidden by valid overrides or reach parent/target selection/filter/operation policy. Other trusted custom strings keep their existing behavior. Core errors use a dedicated `BadRequestError` subclass with an internal ErrorResult; narrow service catches return that result, legacy list/read propagate target BadRequest, direct routes serialize controlled 400, and root maps service failures to 400 per-entry inside HTTP 200. Validation stays outside virtual planning's best-effort catch.
- Wire/type acceptance: shared optional `populateAccessSchema` accepts only existing `list` / `read`, reused by all six direct option schemas and all four root option schemas (read-filter and upsert share the existing root shapes). Existing descriptor enum restrictions remain. Six exported advanced body option types now use existing `PopulateAccess`, matching runtime validation and public service/root option types. Omitted options still delegate to service defaults; explicit base values and valid descriptor overrides work. Tests reject basic/advanced names, other wire strings, null, and objects before source/target persistence across all seven applicable endpoint cases including both upsert branches. Final-schema transformations and trusted reserved defaults cannot reopen selection, with controlled results and no target query/write.
- Before/after evidence: the clean pre-source command `TMPDIR=<repo-root>/_tmp-oav05 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-boundaries.integration.test.ts` **failed 53 / passed 9 (62 tests)** against prior output, reproducing the comparative target `{ read: false, advancedRead: true }` selector issue and nested alternate entry paths. The two added hydrated include regressions separately **failed 2 / skipped 115 (117 tests)** before their recorded narrow correction. Final retained new-file result is **137 passed**. Fixture-only setter/depth/count-option/initiating-spy corrections and intermediate results remain in the execution record; no production authorization policy was rewritten to satisfy a fixture.
- Target/base-policy acceptance: legacy and correlated read/list/count, list/read subqueries, model populate list/read, and subdocument populate read use target base guards despite allowed target advanced variants; every denial checks the actual registered Target model's find/findOne/countDocuments/aggregate/distinct/create/save seams and performs zero target query. Source may perform its prior lookup; denied subqueries perform no source lookup. Nested generic option and descriptor failures stop the model queried at that boundary and never query its leaf target; deeper legacy result seams propagate BadRequest instead of silently omitting it. Positive conflicts (base grant, variant deny) preserve target row/field projection, read/list cardinality, and exact count 2 independent of list limit. Terminal correlated/subquery false filters return Forbidden without target queries; legacy false-filter and populate omission/scalar contracts remain. Trusted non-reserved `inspection` access passes through Core/include/subquery paths.
- Root/service acceptance: real HTTP cases cover all seven model base operations, both advanced reads, both upsert branches, data list/read-by-ID/read-by-filter, and subList/subRead. Base grant plus denied initiating/basic-read variants still permits root entries; base denial plus allowed direct advanced variants produces direct success but root entry 401 inside HTTP 200 before service/persistence. All fourteen reserved names are invalid root operations for both target kinds. Trusted list/read/read-filter/create/update/upsert/count/distinct calls preserve existing behavior with every relevant base/variant route guard denied over identical GET/POST/PATCH/PUT methods; row/field projection and base decorate/mutation hooks still apply. Live request Core spies prove variant keys never enter field selection, filters, hooks, secondary base checks, or root dispatch. `Core.isAllowed`, route resolution, and service initiating guard contracts are untouched; no blanket service gate or ambient/method inference was added.
- Retry/response acceptance: both advanced `_read` / `_readFilter` paths need base list to retry a read-policy miss. `list: false, advancedList: true` cannot permit retry; `list: true, basicList: false` cannot block it. Allowed retries perform two lookups and use base list row/field/decorate policy; denied retries perform one. Allowed missing rows and allowed read-policy exclusions remain ordinary 404 with retry disabled, distinct from terminal Forbidden and BadRequest, which perform no retry. Operational target-guard errors remain 500 and do not become BadRequest or fall back. Direct/root subdocument create/single/bulk writes save exactly once and retain readable base output despite disabled basic reads/list routes; base parent/sub read denial returns successful null/empty output after persistence, and sub-list denial hides only create enumeration while targeted updates remain readable. Advanced upsert persists both branches using base create/update prepare hooks despite denied create/update route keys.
- Necessary integration correction: hydrated include capture now uses existing `getDocValue` at the two existing save-before-finalizer sites, matching `setDocValue` attachment into Mongoose `_doc`; successful legacy include output survives both non-lean list/read and list-policy read fallback. Its two regression cases and the existing fallback include/task/decorate case pass. The one-line `targetMongooseModel` initializer cleanup only resolves ESLint. Both scope inclusions were recorded before edits, with before-correction evidence. All concurrent virtual planner/finalizer/association/runtime/interface and newer `packages/access-router/src/services/model-subdocument-service.ts` VIRT-06 work was preserved; the latest required build includes those current helpers. No VIRT-06 source/test edit belongs to this session.
- Final required gates, serial from repository root after observed external builds/typechecks ended: `pnpm --filter @web-ts-toolkit/access-router... build` **passed** (5 packages; CJS/ESM and `.d.ts` / `.d.mts` rebuilt); `TMPDIR=<repo-root>/_tmp-oav05 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-boundaries.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/root-router.integration.test.ts test/cross-resource-authorization.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/correlated-includes.execution.test.ts test/subdocument-mutation-visibility.integration.test.ts` **passed: 7 files / 261 tests** (137 new + 7 fallback + 15 root + 15 cross-resource + 4 sub-populate + 12 correlated + 71 mutation-visibility); `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` **passed** (exit 0). Process checks before and between the final gates found no active external build/test; `fileParallelism: false` remains. Earlier overlapping attempts are supporting evidence only. `<repo-root>` is the repository checkout, with ignored repository-local Mongo/runner storage.
- Declaration/final checks: reviewed generated `packages/access-router/dist/advanced.d.ts`, `advanced.d.mts`, `parsers-ChFZvEZe.d.ts`, and `parsers-ChFZvEZe.d.mts`; all six body options expose `PopulateAccess = 'list' | 'read'`, schemas emit optional list/read enums, and internal validation/error helpers add no public entrypoint. `pnpm exec eslint packages/access-router/src/validation/common.ts packages/access-router/src/validation/model-router.ts packages/access-router/src/validation/root-router.ts packages/access-router/src/validation/types.ts packages/access-router/src/acl/populate-access.ts packages/access-router/src/core.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/test/operation-access-boundaries.integration.test.ts`, `git diff --check`, new helper/test/task `git diff --no-index --check -- /dev/null <repo-relative-file>`, and `git diff --exit-code -- CHANGELOG.md` **passed**. `git check-ignore _tmp-oav05` confirms ignored scratch; Mongo fixture directories were removed by teardown and the scratch marker removed, leaving only ignored compile cache. Current status/diffs were refreshed throughout. No staging, commit, stash/reset/revert, manual generated-output edit, or root changelog edit was performed.
- Discoveries/follow-ups: no unresolved OAV-05 blocker. OAV-06 must document wire-only list/read selectors, reserved shared-boundary errors, trusted non-reserved compatibility, root per-entry mapping, and route-only versus secondary policy distinctions, including successful hidden mutation responses. Legacy list/read target BadRequest now propagates instead of silently dropping output, matching count/correlated behavior; include this compatibility clarification. OAV-07 must independently review these recorded narrow ownership inclusions and rerun integrated gates after later work. External VIRT-06 subdocument helpers and probe/planner test activity appeared after the completed gates; preserve them and refresh anchors in later sessions. No separate unresolved virtuals defect is assigned to OAV-05.

Independent-review resolution evidence (2026-10-05, OAV-07-F04):

- OAV-07 reopened OAV-05 and expanded its requirements/acceptance before reproducing and correcting the custom-target policy gap. Historical implementation/evidence above is retained. Five focused regressions distinguish custom-only target fields/document grants from denied `read` grants through lean list, hydrated read, per-descriptor override, legacy include, and nested subquery; the clean before-correction probe failed **5 / skipped 137 (142 tests)**. See F04 below for exact probe and fixture-depth clarification.
- Minimal correction: Core and trusted descriptor metadata retain the exact non-reserved access rather than normalizing it to `read`; existing internal target/planner/finalizer access types carry those strings. Public `ModelVirtualAccess`/definition keys, wire list/read types, all fourteen reserved-name checks, and root/service operation guards stay consistent with their reviewed contracts. Custom fields and document-grant hooks now use the same access before/after target fetch. Source changes are limited to those two expressions and three internal type/import declarations; no target-policy implementation was duplicated.
- Fresh required package typecheck/build: `pnpm --filter @web-ts-toolkit/access-router typecheck` **passed** (exit 0; five-package CJS/ESM/declaration build plus source TypeScript check).
- Required OAV-05 suites plus review-fix regressions, serial after a quiet process check: `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-boundaries.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/root-router.integration.test.ts test/cross-resource-authorization.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/correlated-includes.execution.test.ts test/subdocument-mutation-visibility.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-finalizer.unit.test.ts test/concurrency.test.ts test/service.internal.test.ts test/nested-update-integrity.integration.test.ts` **passed: 12 files / 351 tests** — 142 boundaries + 7 read fallback + 15 root + 15 cross-resource + 4 sub-populate + 12 correlated + 71 mutation visibility + 10 VIRT populate/include + 14 finalizer + 5 concurrency + 10 internal service + 46 nested-update. All required OAV-05 criteria pass, including reserved-before-target errors, terminal denial, base retry/response policy, hydrated output, and trusted custom-only output. `<repo-root>` is the repository checkout and scratch is ignored/repository-local.
- Focused ESLint on the eight review source/test files and `git diff --check` **passed**. OAV-05 was re-completed after its fresh required checks; OAV-07 still owns all remaining final full-package/website/workspace gates and F04's integration closure.

### Task OAV-06: Document the complete matrix and verify installed-consumer discovery

Status: completed

Priority: P1

Suggested owner: public-API/docs implementer

Dependencies: OAV-01, OAV-02, OAV-03, OAV-04, OAV-05

Primary ownership:

- `packages/access-router/README.md`, `llms.txt`.
- Public option/method JSDoc in `src/interfaces/root.ts` and router setters.
- `website/docs/packages/access-router/configuration.mdx`, `routing.mdx`, and affected services/OpenAPI notes.
- `website/docs/packages/express-oidc-vault.md:1055` — one-line MDX literal-code formatting required to pass the website gate (scope inclusion recorded below).
- `packages/access-router/test/strict-consumer-types.test.ts`, `documentation-examples.test.ts`, `export-contract.test.ts`, and `packed-consumer-compatibility.test.ts` when new fixtures are needed.

Finding / references: current README/website show shared base operations only, and route-only fields must be discoverable without repository source. `package.json:23-66` and `tsup.config.ts:12-18` define the existing root/advanced/processors publication boundary.

Implementation requirements:

1. Add the complete basic/advanced matrix, exact-variant/base precedence, subdocument closed-field caveat, and examples for base-only, denied basic read, denied advanced list, and permission-based variants.
2. Explain the confirmed HTTP status/exposure contract, HEAD behavior, live mutation, root/service boundaries, read fallback, and secondary response/target policy. Do not describe transport denials as missing routes.
3. Make examples compile through package-name imports and supported option APIs; avoid duplicate object keys and constructor examples containing unsupported dotted properties. Show `router.operationAccess('basicRead', false)` for an in-place per-key update; object replacement retains ordinary shallow assignment semantics.
4. Inspect fresh `.d.ts` / `.d.mts` output for autocomplete/JSDoc on base and variant keys. Verify the route-access type is reachable from intended existing entrypoints and field-rule typing remains distinct.
5. Run strict/export/documentation/packed-consumer suites, package dry-pack inventory, and website build. Keep consumer work/evidence repository-scoped per task conventions.

Acceptance criteria:

- An installed consumer can discover supported keys, fallback/status behavior, imports, and the basic-read-only example from declarations and README.
- Documentation agrees with the implemented matrix and base-policy boundaries; examples and strict `.ts` / `.mts` / `.cts` fixtures pass.
- CJS/ESM and packed publication-transform tests pass without new export paths, dependency requirements, or hand-edited generated output.

Verification: fresh package build; run the strict-consumer, export-contract, documentation-examples, and packed-consumer-compatibility suites listed under baseline verification; run `npm pack --dry-run` from `packages/access-router` and `pnpm --dir website build`.

Execution record (2026-10-05):

- Fresh OAV-06-only session after OAV-00 through OAV-05 completed. Read the task/evidence, `AGENTS.md`, and `docs/tasks/README.md`; loaded the ai-friendly-ts-package and task-as-you-go skills. Set OAV-06 `in_progress` before implementation; this session spawns no agents.
- Initial `git status --short`, diff inventory, package metadata, and shipped docs confirm concurrent virtuals source/test changes, including overlapping public interfaces/router setters and strict consumer fixtures. Refresh current source/diffs before narrow additions. Process inspection observed an external virtuals package build followed by its embedded-subdocument suite; required shared-output verification waits for observed external work to finish.
- Implementation: added the complete matrix/fallback/default/subdocument/status/secondary-policy guidance to shipped README/llms and focused website sections; added option/setter/snapshot JSDoc without runtime behavior changes. Extended existing strict module-form fixtures with six advanced body PopulateAccess checks, export-contract coverage with real declaration-symbol hover/field-shape checks, documentation compilation with marked website examples and module-scope binding discovery for a runnable data split, and real transformed packed/artifact consumers with ESM/CJS variant HTTP flows. Current virtuals generics, getter documentation, and fixture additions are preserved. Initial focused seven-file ESLint and `git diff --check` passed. `git check-ignore _tmp-oav06` confirms ignored repository-local consumer storage. Observed external verification finished before the required serial gates begin.
- Required fresh `pnpm --filter @web-ts-toolkit/access-router... build` passed (5 packages; CJS/ESM and declarations). First four-file consumer gate with `TMPDIR=<repo-root>/_tmp-oav06` passed **82 / failed 4 (86 tests)**: all strict, export/hover, documentation, manifest transformation, and current-artifact identity cases passed. Four installed smoke cases reached the new OpenAPI assertion after successful 401/basic and 200/advanced flows but used an omitted data `idParam`; data options do not default that parameter to `id`. Corrected only the fixture/example configuration to explicit `idParam: 'id'` and clarified data matrix guidance. No runtime option/default change belongs to this task; rerun required consumers before completion. `<repo-root>` is the repository checkout; temporary consumers were removed by suite teardown.
- Corrected four-file gate with the same exact command passed **4 files / 86 tests** (7 strict + 41 export/hover + 31 documentation + 7 packed/artifact). Source `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` passed. `npm pack --dry-run` from `packages/access-router` passed: 17 workspace-inventory files, 342.0 kB packed / 1.9 MB unpacked. Observed a later external virtuals build and waited before the website command; newer validation/query/OpenAPI parity additions remain external.
- Website blocker: `pnpm --dir website build` failed (exit 1) after successful client/server compilation, solely while statically rendering `/docs/packages/express-oidc-vault`: `ReferenceError: token is not defined`. Current unchanged `website/docs/packages/express-oidc-vault.md:1055` contains unquoted prose `validateWithRequest({ token, scheme, req })`; MDX evaluates the braces. `git diff -- website/docs/packages/express-oidc-vault.md` is empty. Owner/prerequisite: website documentation maintainer must make that prose render as literal code, then rerun the required website build. This OAV-06-only session preserves the unrelated page. OAV-06 is `blocked`, not completed; OAV-07 remains pending. Final owned-file audit/current-source verification follows, with no claim that the failed website gate passed.
- Final audit clarification: scoped the basicRead-only claim explicitly to top-level model routes; subdocuments retain the documented field/top fallback and exact model-default specificity. Named all three public extended setter types individually. Source changes remain option/setter/snapshot JSDoc plus identical base-property redeclarations for base-key editor hover; no runtime behavior, entrypoint, or dependency was changed. Observed later external virtuals validation/route-parity build/typecheck work and waited for it before the final current-source consumer/build refresh.
- Necessary website-gate scope inclusion before edit: the unrelated OIDC page has no concurrent diff and its confirmed failure is literal-code formatting only. Quote just `validateWithRequest({ token, scheme, req })` with Markdown backticks at `website/docs/packages/express-oidc-vault.md:1055` so MDX renders the existing prose literally. This one-line check correction preserves the surrounding OIDC contract text and is required for OAV-06's mandatory full website build. Set OAV-06 back to `in_progress` for that narrow correction and rerun the website gate; the earlier failure remains historical evidence.

Completion evidence (2026-10-05):

- Session-authored files: `packages/access-router/README.md`; `packages/access-router/llms.txt`; `packages/access-router/src/interfaces/root.ts` (route/base/field/sub/default-option JSDoc and identical base-key redeclarations only); `packages/access-router/src/routers/model-router.ts` and `packages/access-router/src/routers/data-router.ts` (option snapshot/setter/permission-helper JSDoc only); `packages/access-router/test/strict-consumer-types.test.ts` (PopulateAccess additions within the existing three OAV-01 module-form cases only); `packages/access-router/test/export-contract.test.ts` (two emitted-declaration hover/shape cases); `packages/access-router/test/documentation-examples.test.ts` (marked website examples, llms staging, and module-scope binding discovery); `packages/access-router/test/packed-consumer-compatibility.test.ts` (installed variant HTTP/type usage); `website/docs/packages/access-router/configuration.mdx`, `website/docs/packages/access-router/routing.mdx`, `website/docs/packages/access-router/services.mdx`, `website/docs/packages/access-router/openapi.mdx`; `website/docs/packages/express-oidc-vault.md` (the recorded one-line literal-code formatting correction); this task file. OAV-06 was `in_progress` before feature edits and became `completed` only after all required checks passed; OAV-07 remains pending. This isolated session spawned no agents.
- Installed documentation acceptance: shipped README is self-contained with canonical root default/named imports, all seven model pairs/four data keys/four per-field sub keys, unpaired guards, variant replacement/undefined-only inheritance, model-default exact specificity versus shallow storage/copy behavior, shorthand/object default, closed field/nested-default/legacy umbrella caveats, base-only/basicRead-false/advancedList-false/permission examples, correct property and dotted setters, immutable snapshots/live reads, 401/HEAD/registered OpenAPI exposure, and root/trusted-service/read-fallback/upsert/field/filter/hook/target/mutation-output boundaries. Wire list/read selectors, reserved effective-populate validation, trusted non-reserved compatibility, and legacy target BadRequest propagation are explicit. Data identifier examples specify `idParam: 'id'`; the first fixture mismatch remains recorded above. Website additions agree and preserve surrounding virtual contracts.
- Fresh final build: `pnpm --filter @web-ts-toolkit/access-router... build` **passed** (5 packages: access-router plus four transitive dependencies; CJS/ESM and declarations rebuilt). Final required consumer command from repository root: `TMPDIR=<repo-root>/_tmp-oav06 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts test/documentation-examples.test.ts test/packed-consumer-compatibility.test.ts` **passed: 4 files / 86 tests** — 7 strict, 41 export/hover, 31 documentation, 7 packed/artifact. This final refresh follows the source JSDoc clarification and observed external virtuals build/typecheck work. Own gates ran serially, with process checks/waits for observed external shared-output activity; `fileParallelism: false` is preserved. `<repo-root>` is the repository checkout, and fixture work used ignored repository-local `_tmp-oav06`.
- Declaration/type acceptance: final `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` **passed** (exit 0). Reviewed generated `packages/access-router/dist/index.d.ts`, `index.d.mts`, `advanced.d.ts`, `advanced.d.mts`, and `parsers-DLyjqTN_.d.ts` / `.d.mts` within that `dist/`. Actual TypeScript export-symbol/type/hover checks resolve both root and advanced entry graphs, prove all fourteen route keys and endpoint/inheritance documentation, base list/read hover, nested closed-field/umbrella caveats, distinct field-only shapes, and router live/snapshot/setter documentation. Strict `.ts`/`.mts`/`.cts` retain OAV-01's all-key/setter/negative coverage and now accept list/read while rejecting route variants in all six advanced body option types. No generated file was manually edited.
- Packed acceptance: the existing real `createPublishPackageJson` transformer and root `pnpm build-artifact --version 0.99.0-test` fixture produce current tarballs/artifact trees; their JavaScript/declaration graph/README/llms contents match current output. Minimum peers (Express 5.0.0/Mongoose 8.0.0) and current majors (5.2.1/9.8.0) pass in both transformed tarballs and actual artifact trees. Each installation executes the new ESM and CJS HTTP flows: basic read/HEAD 401, both advanced reads 200 with protected fields absent, list inheritance/data-default isolation, live property/dotted/undefined setters, permission variants, variant-over-denied-base replacement, root base-entry 401/invalid-variant-op 400, shallow object replacement, frozen snapshots, and registered OpenAPI before/after mutations. Existing NodeNext `.mts`/`.cts` and Bundler consumers use typed variants/base-field rules; current-peer declaration checks keep `skipLibCheck: false`.
- Final package inventory: `npm pack --dry-run`, working directory `packages/access-router`, **passed: 17 files; 342.2 kB packed / 1.9 MB unpacked**. Inventory is README, llms, package.json, six CJS/ESM entry files, six conditional entry declarations, and two shared declaration graph files. Workspace placeholder metadata in this inventory is verified through the production transformation by the packed suite above; `package.json`/`tsup.config.ts` have no diff, and existing root/advanced/processors entrypoints and dependencies are retained.
- Required website gate: `pnpm --dir website build` **passed** (exit 0; client/server compiled and static files generated in `website/build`). The earlier sole OIDC-page `ReferenceError: token is not defined` is resolved by the documented one-line backtick correction, without changing its contract prose. No OAV-06 website blocker remains.
- Final checks/audit: `pnpm exec eslint packages/access-router/src/interfaces/root.ts packages/access-router/src/routers/model-router.ts packages/access-router/src/routers/data-router.ts packages/access-router/test/strict-consumer-types.test.ts packages/access-router/test/export-contract.test.ts packages/access-router/test/documentation-examples.test.ts packages/access-router/test/packed-consumer-compatibility.test.ts`, `git diff --check`, `git diff --no-index --check -- /dev/null docs/tasks/20261005-131819-access-router-operation-access-variants.md`, and `git diff --exit-code -- CHANGELOG.md` **passed**. Current status/owned diffs were refreshed; concurrent virtual generics, services/planners/output, strict fixtures, validation/OpenAPI/query additions, and newer hardening/debug tests are preserved. Fixture teardown removed consumer installations; removed the session scratch marker, leaving only ignored runner compile cache. No staging, commit, reset/revert, manual generated-output edit, or root changelog edit was performed.
- Follow-up: no unresolved OAV-06 criterion or blocker. OAV-07 remains the separate independent integration review and owns the final package/workspace build/test/lint audit after ongoing virtuals work; this session did not execute or preempt that task. Review the recorded one-line website-gate scope inclusion alongside the owned API/docs/consumer changes.

### Task OAV-07: Independently review and verify the integrated feature

Status: completed

Priority: P0

Suggested owner: integration reviewer distinct from the primary implementer

Dependencies: OAV-00 through OAV-06

Primary ownership:

- This task document's completion evidence and follow-up records.
- Repository-wide integration review; fixes must be assigned to their concrete owning task before completion.

Finding / references: route splitting is backward compatible only if alias resolution, closed subdocument policy, secondary base checks, input selectors, runtime mutation, and public types all agree. Use the reviewed contract and every prior task's acceptance criteria as the review checklist.

Implementation requirements:

1. Independently inspect each generated guard against the route matrix and run representative real HTTP flows, including conflict/deny/override/HEAD cases, service/root isolation, and source/target cross-resource policy.
2. Confirm that omitted variants produce baseline behavior and that no unintended field-rule, wildcard, service-wide, or exposure contract changed. Check model-default/data differences and same-name cross-runtime cases.
3. Require completion evidence for all acceptance criteria, fresh package typecheck/tests, installed-consumer/packed coverage, website build, and final serial workspace build/test/lint/whitespace checks.
4. Review `git status` / intended diff for accidental concurrent-work edits. Record any failing pre-existing/environment checks with exact reproduction; do not mark unresolved feature failures completed.
5. Record necessary follow-ups with unique IDs, ownership, dependencies, and acceptance criteria. Review documentation/status decisions against OAV-00 once more before marking the plan complete.

Acceptance criteria:

- All required task checks and integrated runtime/public-surface criteria pass with evidence.
- No unresolved feature blocker or contradictory 401/404/secondary-access requirement remains.
- Final diff contains the intended feature/tests/docs and task evidence; concurrent virtuals work is accounted for separately.

Verification: `pnpm --filter @web-ts-toolkit/access-router typecheck`, `pnpm --filter @web-ts-toolkit/access-router test`, `pnpm --dir website build`, then `pnpm build`, `pnpm test`, `pnpm lint`, and `git diff --check`, serially. Package tests already include the installed-surface suites; rerun a focused suite only after a new change or unresolved failure warrants it.

Execution record (2026-10-05):

- Fresh independent OAV-07-only reviewer; this session did not implement OAV-00–OAV-06 and spawns no agents. Read the full task file, every prior acceptance criterion and completion record, `AGENTS.md`, and `docs/tasks/README.md`; loaded the task-as-you-go and ai-friendly-ts-package skills. Dependencies are completed. Set OAV-07 `in_progress` before source/runtime/public-surface review and required verification.
- Initial `git status --short` / `git diff --stat` show the OAV implementation alongside active VIRT source/services/output/types/tests/docs work tracked in `docs/tasks/20261005-122217-access-router-package-virtuals.md`. Inspect actual current source and diffs, including the recorded external check cleanups, effective-populate/error seams, and hydrated include capture corrections. Initial process inspection found no external build/test process; repeat inspection before serial gates and wait for any observed external shared-output activity.
- Initial `git hash-object CHANGELOG.md` is `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`, matching the coordinator's recorded hash. Preserve root `CHANGELOG.md` throughout and verify the hash/diff at the final audit. No staging, commit, revert/stash, or manual generated-output editing is part of this review.
- Initial `pnpm --filter @web-ts-toolkit/access-router typecheck` passed (exit 0; five-package dependency build plus source TypeScript check), but an externally started package build/test overlapped that attempt and newer VIRT hardening edits appeared in `src/request-complexity.ts` / `src/services/base.ts`. This is supporting evidence only. Waited for the observed external chain to finish without interruption; refreshed status/diffs and found no active build/test before restarting the required serial gates. Requested a quiet shared-output verification window. External results are not claimed as independent verification.
- Quiet-source required `pnpm --filter @web-ts-toolkit/access-router typecheck` passed (exit 0; five-package build plus source check). `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router test` then failed (exit 1): **3 failed / 79 passed files (82); 1 failed / 1,399 passed tests (1,400)**, with two additional suites failing at import before collecting tests. All five OAV runtime suites and all four installed-surface suites passed. The failures are reproduced external integration findings below; they are not skipped or treated as completed gates. `<repo-root>` is the repository checkout; `_tmp-oav07` is ignored, repository-local scratch.

#### Integration follow-up OAV-07-F01: External VIRT source-module import initialization

Status: completed

Priority: P0 (required package gate)

Owner: VIRT-03 finalizer / VIRT-04 service integration; narrow correction coordinated and applied by the independent reviewer.

Dependencies: current VIRT-03/VIRT-04 implementation; required before OAV-07 completion.

Primary ownership: `packages/access-router/src/output/finalize-model-output.ts` import/evaluation lifetime only; existing `test/concurrency.test.ts` and `test/service.internal.test.ts` verification.

Finding: both source-import suites fail before collection with `TypeError: Class extends value undefined is not a constructor or null` at `src/services/public-service.ts:34`. The new static finalizer → Core import creates Service → finalizer → Core → services barrel → PublicService → not-yet-initialized Service. Built bundled HTTP flows do not expose this initialization order, so earlier focused VIRT/OAV runtime checks missed it.

Requirements / acceptance:

- Defer only the two scoped field-policy helper reads until document finalization runs, using a function-local dynamic import of the existing Core helpers. Preserve helper implementations, policy accesses, virtual definitions/plans, public exports, and finalizer ordering.
- Both existing source-import suites collect and pass; finalizer/runtime regressions, source typecheck, and the full required package gate pass. Record exact verification and resolution evidence; VIRT's later independent review retains ownership of its broader implementation.

Completion evidence (2026-10-05):

- Changed: deferred the existing two Core field-policy helpers in `packages/access-router/src/output/finalize-model-output.ts` through its invocation-local import; the resumed reviewer confirmed the correction remains in current source.
- Fresh final `pnpm --filter @web-ts-toolkit/access-router typecheck` and package test **passed: 83 files / 1,425 tests**, including collecting/passing concurrency (5), source-internal service (10), and finalizer (14) cases. The final serial root gate passes those same suites and all consumers.
- Root build/lint and tracked/new-file whitespace checks pass. Import initialization is resolved with existing policy helpers and finalizer ordering preserved; no remaining F01 blocker.

#### Integration follow-up OAV-07-F02: External VIRT initiating-upsert fixture agreement

Status: completed

Priority: P0 (required package gate)

Owner: VIRT-04 lifecycle integration; narrow existing-fixture correction coordinated and applied by the independent reviewer.

Dependencies: confirmed VIRT-00A D1 initiating-operation contract; required before OAV-07 completion.

Primary ownership: `packages/access-router/test/nested-update-integrity.integration.test.ts` lifecycle expectation only.

Finding: the existing upsert case returns 500 because its update validate hook asserts `context.operation === 'update'` at line 238. Current VIRT-00A D1 explicitly retains initiating `upsert` while selecting base update hooks; the production `Service.upsert` and public upsert branches implement that confirmed contract. OAV-03 already recorded the same fixture distinction without changing hook access policy. This existing fixture has no concurrent diff.

Requirements / acceptance:

- Align only the fixture's expected initiating operation (`upsert` for that entry, `update` otherwise), retaining base update validate/prepare/transform/afterPersist hooks and every real persisted-data/snapshot assertion. Assert the final hook context agrees too.
- The entire 46-case nested-update suite passes with all source-import/finalizer and required package/workspace gates; no production upsert guard, write policy, or lifecycle rewrite is part of this correction.

Completion evidence (2026-10-05):

- Changed: the two initiating-operation assertions in `packages/access-router/test/nested-update-integrity.integration.test.ts` agree with the confirmed upsert lifecycle; every persisted-data/snapshot and base update-hook assertion remains.
- All **46 nested-update cases** pass in the fresh **83-file / 1,425-test** package gate and final serial root gate; model route regressions also retain both upsert branches and base hook selection. Package typecheck, workspace build/lint, and whitespace pass.
- The original 500 fixture mismatch is resolved; no production lifecycle/authorization change or remaining F02 blocker.

Follow-up execution (2026-10-05): the one-import-lifetime and two fixture assertions were patched as recorded. Waited for another observed external build before the fresh `pnpm --filter @web-ts-toolkit/access-router typecheck` → focused five-file run. Typecheck passed; `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/concurrency.test.ts test/service.internal.test.ts test/nested-update-integrity.integration.test.ts test/virtuals-finalizer.unit.test.ts test/operation-access-boundaries.integration.test.ts` collected both previously broken suites and passed **211 / failed 1 tests (212), 4 passed / 1 failed files (5)**. All concurrency, nested-update, finalizer, and OAV boundary cases passed; the newly reachable source-internal case exposes F03 below. Focused ESLint for the two F01/F02 files passed. No claim of a complete package gate yet.

#### Integration follow-up OAV-07-F03: External VIRT legacy-join accessor materialization

Status: completed

Priority: P0 (required package gate)

Owner: VIRT-05 include target isolation / join indexing; narrow correction coordinated and applied by the independent reviewer.

Dependencies: F01 source-import initialization; current VIRT-05 join isolation; required before OAV-07 completion.

Primary ownership: `packages/access-router/src/services/base.ts` legacy `includeDocsList` finalized-row materialization only; existing `test/service.internal.test.ts` regression.

Finding: the now-collecting internal join regression at `test/service.internal.test.ts:313` observes **80 foreign-field accessor reads instead of 20**. VIRT's per-parent deep isolation reads the same returned target-row accessor once per matching parent in addition to the one indexed read. For 20 target rows and 12 parents, this re-runs target presentation accessors after indexing, defeating the retained single target-field-read/index contract. The test and its exact-read assertion are existing and unchanged.

Requirements / acceptance:

- Materialize each already-finalized target row once into an isolated stable plain value before indexing; retain VIRT's paired private association values and per-parent isolated copies. No raw/internal field reintroduction, getter re-finalization, target/base guard change, or unrelated virtual planner rewrite.
- The existing exact 20-read assertion passes, along with multiple-key/array joins, OAV hydrated include/base-policy regressions, VIRT populate/include isolation, typecheck, and required full package/workspace gates. Keep the existing regression assertion intact.

Completion evidence (2026-10-05):

- Changed: `packages/access-router/src/services/base.ts` materializes each already-finalized target row once before legacy join indexing, retaining private association values and per-parent isolated copies.
- The unchanged `packages/access-router/test/service.internal.test.ts:313` assertion requires exactly **20 accessor reads** for 20 targets/12 parents and passes, along with multiple-key/array joins, **142 OAV boundaries**, and **10 VIRT populate/include** cases in the fresh package and final serial root gates. Package typecheck, root build/lint, and new/tracked whitespace pass.
- No target getter rerun, hidden join-field reintroduction, or policy rewrite was required; no remaining F03 blocker.

Follow-up verification progress (2026-10-05): after materializing the finalized rows once, `pnpm --filter @web-ts-toolkit/access-router typecheck` passed and `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/concurrency.test.ts test/service.internal.test.ts test/nested-update-integrity.integration.test.ts test/virtuals-finalizer.unit.test.ts test/operation-access-boundaries.integration.test.ts test/virtuals-populate-include.integration.test.ts` passed **6 files / 222 tests** (5 concurrency + 10 internal service + 46 nested-update + 14 finalizer + 137 OAV boundaries + 10 VIRT populate/include). The exact 20-read assertion is unchanged and passes; hydrated includes, base target denials, nested controlled errors, private join metadata, and per-parent isolation pass. Focused three-file ESLint and tracked whitespace passed. Follow-ups await the required full package/workspace gates before completion.

External verification coordination (2026-10-05): VIRT-09/VIRT-11/VIRT-10 completion records and additive README/llms/public virtual JSDoc appeared during review, followed by externally issued workspace builds, packed-consumer tests, and typecheck. Refreshed those changes; OAV route/type/docs sections remain intact. Waited for each observed shared-output chain before the next gate. Current stable source hashes for shared core/service/base/finalizer and public docs/types were compared across waits. These external gate results are not independent OAV-07 evidence; VIRT-12 remains separately owned in its task file. The VIRT-09 historical description of the three package failures as pre-existing is not the OAV review's attribution: current import-graph/lifecycle inspection reproduces them as VIRT-03/04/05 integration issues resolved through F01–F03 above, without a broad virtual rewrite.

Package verification progress (2026-10-05): refreshed required `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router test` passed **83 files / 1,420 tests** (all 376 OAV runtime cases and 88 strict/export/documentation/packed cases). The added external VIRT performance file contributes 3 tests and later VIRT documentation adds 2 examples. Root `CHANGELOG.md` still matches the recorded hash. An external VIRT root serial test chain then began; subsequent shared-output checks wait for it.

#### Integration follow-up OAV-07-F04: Preserve trusted custom target-policy access through populate finalization

Status: completed

Priority: P0 (OAV-05 compatibility acceptance)

Owner: reopened OAV-05 alternate-entry/access boundary, coordinated with VIRT-05 target metadata/finalization; minimal correction applied by the independent reviewer after the recorded runtime reproduction.

Dependencies: OAV-05 shared validation plus current VIRT-05 target plan transport; required before OAV-05/OAV-07 completion.

Primary ownership: custom access retention in `packages/access-router/src/core.ts`, `src/acl/populate-target.ts`, `src/services/service.ts`, and internal planner/finalizer access types if needed; focused `test/operation-access-boundaries.integration.test.ts` regressions. Public virtual definition/configuration keys stay VIRT-owned.

Finding: final review of the extracted VIRT target helper interaction shows `Core.genPopulate` validates/selects/filters a non-reserved custom access, then normalizes unknown custom access to `read` for the retained target plan (`core.ts` planAccess block). `Service.resolvePopulateMeta` has the same normalization for trusted descriptors. A custom-specific target field rule can therefore be discarded by the later target finalizer under a conflicting denied `read` rule. Existing OAV-05 custom-string tests use scalar target field grants, so they cannot distinguish these policies. This source finding is a concrete unresolved compatibility concern; add a focused runtime reproduction before fixing. OAV-05 was reopened and its requirements/acceptance expanded before edits.

Requirements / acceptance:

- Retain the exact trusted, non-reserved target data-policy access throughout target selection, filters, document grants, and final trimming; reserve only the fourteen actual route keys. Preserve the agreed public virtual-access keys, base root/service checks, and existing custom option/descriptor precedence.
- Verify a custom-only target field and a custom document-grant hook with denied read/route variants through Core planning and real lean/hydrated populate, nested legacy include/subquery forwarding, and supported descriptor overrides. Capture before/after results, rerun relevant boundaries/typecheck and required package/workspace gates, append resolution evidence, then re-complete OAV-05.

F04 before-correction evidence (2026-10-05): after waiting for the externally running root test chain to end, `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-boundaries.integration.test.ts -t 'retains custom-only target fields'` reproduced **5 failed / 137 skipped (142 tests)** against current built output. Lean list, hydrated read, per-descriptor custom override, and nested legacy include return only target `_id`, dropping custom-authorized fields; the nested subquery returns no matching source rows after its custom target field is dropped. An initial subquery fixture hit the unrelated default depth limit; raised only that fixture runtime's depth to 16, then reran for the clean five-failure reproduction above. No production source change preceded either probe. The external root chain encountered the newly added cases too; its failure/result is not independent gate evidence.

F04 correction scope before change: remove only the two custom → read normalizations and carry exact non-reserved strings in existing internal target-plan/finalizer access metadata (three internal type declarations). Keep public `ModelVirtualAccess` configuration keys narrow; this preserves existing trusted data-policy strings without adding custom virtual definition keys or new transport selectors. The shared reserved preflight, default base read/list values, helper implementations, target query checks, and ordinary service/root policy remain intact.

F04 resolution progress (2026-10-05): the five new runtime regressions now pass with exact custom target fields/document grants and denied read-hook traps uncalled. Fresh required typecheck/build and the full OAV-05 seven-suite verification plus F01–F03/VIRT target-finalizer regressions passed **12 files / 351 tests**, as recorded in OAV-05's independent-resolution evidence above. OAV-05 is re-completed; OAV-07/F04 await the final package/website/workspace sequence. All further gate counts must use the updated 142-case boundary file (381 OAV runtime cases overall).

Completion evidence (2026-10-05):

- Changed: exact custom access retained at the two Core/Service metadata sites and three internal target/planner/finalizer access types, with five meaningful custom-only field/document-grant regressions in `packages/access-router/test/operation-access-boundaries.integration.test.ts`. The clean before-fix five-failure reproduction and OAV-05's fresh **12-file / 351-test** re-completion remain above.
- The resumed reviewer independently inspected those current sites and passed fresh package typecheck and **83 files / 1,425 tests**, including all **142 boundary cases / 381 OAV runtime cases**; the complete final serial root gate, website, root build/lint, and whitespace pass.
- Custom lean/hydrated/descriptor/include/subquery output keeps the selected custom grants and never calls denied read-hook traps. All fourteen reserved variants still fail before target queries; wire list/read and public virtual-definition keys remain aligned. OAV-05 and F04 are completed with no remaining compatibility blocker.

Post-F04 gate attempt (2026-10-05): `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router test` failed **1 / passed 82 files (83); 31 failed / 1,394 passed tests (1,425)**. All 381 OAV runtime cases, every virtual suite, source-internal/nested-update regressions, and strict/export/packed tests passed; only documentation examples failed with TS7016 because their copied consumer tree lacked the access-router conditional declarations. The same docs/test source hashes remain intact; external build/typecheck/consumer chains continued around this attempt. Missing staged declaration files are an external shared-output consistency concern, not grounds to relax TypeScript checks. Wait for observed external chains, then refresh the focused documentation check and required full gate against a quiet complete build. F01–F04 and OAV-07 remain under review until all gates pass.

Joint-track coordination (2026-10-05): the VIRT owner appended **VIRT-12-F01 FIXED** evidence for the same F04 correction (152 target/boundary tests plus typecheck) to `docs/tasks/20261005-122217-access-router-package-virtuals.md`; its broader VIRT-12 independent sign-off remains separately pending. **VIRT-12-F02** records an optional packed-consumer orchestration TS7016 concern. This reviewer did not edit that concurrent task file or use its results as independent checks. Requested a fully quiet shared-output window for the remaining OAV gates; no new product correction is assigned for a missing staged declaration while external writers are active.

Staging verification (2026-10-05): after the observed external packed-consumer chain ended, `pnpm --filter @web-ts-toolkit/access-router typecheck` **passed** and `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts` **passed: 1 file / 33 tests** on the same documentation/test source. No compiler check, fixture policy, or production source was relaxed. Fixture teardown removed the consumer tree, leaving only ignored runner cache. Another externally issued root serial test then appeared; wait for that entire shared-output chain before the final complete package and workspace sequence. Package scripts and `fileParallelism: false` / root `--workspace-concurrency=1` remain intact.

Externally invalidated attempt (2026-10-05): after waiting for two more external root runs and a package/decorator verification chain, the next `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router test` attempt built an externally temporary pre-feature source snapshot: the logged ESM root bundle was 335.32 kB rather than current 502.50 kB, and declarations reverted to the older graph. Result: **18 failed / 65 passed files (83); 444 failed / 981 passed tests (1,425)**, including missing route-resolver/type/virtual functionality and packed-artifact identity mismatch. Subsequent current-source hashes for Core, Service, Base, runtime, public types, finalizer, and docs match the reviewed restored feature source; no stash remains listed. This attempt does not verify current source. New external debug probes `packages/access-router-deco/test/zz-debug.test.ts` / `packages/access-router/test/zz-deco-probe.test.ts` and an external six-run decorator probe loop appeared; preserve them and wait for the owning comparison work to finish/clean its probes before the final gates. This reviewer performed no stash/restore/revert or source removal and will refresh only from the restored stable tree.

Resumed independent review (2026-10-05): a fresh isolated reviewer continued the interrupted OAV-07 after reading this entire 838-line record (including its final 130 lines), root `AGENTS.md`, and `docs/tasks/README.md`, and loading the task-as-you-go and ai-friendly-ts-package skills. Current source/diffs retain the route resolver/wiring, reserved populate boundary, and all F01–F04 corrections; OAV-00 through OAV-06 are completed. Initial process inspection found no active shared-output build/test chain; the previously noted debug probes are absent in current status/file inventory. Ignored `_tmp-oav07` exists and contains only its marker/runner cache. Recorded current source hashes for the shared core/services/runtime/types/planner/finalizer/docs/tests before the fresh serial gates. Root `CHANGELOG.md` still hashes to `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`. This session spawns no agents and leaves OAV-07/F01–F04 `in_progress` until fresh required gates pass.

Fresh restored-tree gate progress (2026-10-05): `pnpm --filter @web-ts-toolkit/access-router typecheck` **passed** (exit 0; five-package CJS/ESM/declaration build plus source TypeScript check). `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router test` **passed: 83 files / 1,425 tests** (430.69s Vitest duration), including **381 OAV runtime cases** (28 baseline + 68 resolver + 68 model routes + 75 data/sub routes + 142 boundaries) and **88 installed-surface cases** (7 strict + 41 export/declaration + 33 documentation + 7 packed/artifact). The current package build emits the restored feature ESM root bundle at 503.45 kB and the `parsers-DhUuvj9B` declaration graph. Process checks before/between/after these gates found no external build/test chain, and all 14 recorded source/doc/test hashes stayed identical. Consumer/Mongo fixture teardown left only the existing ignored marker/runner cache. Website and required workspace build/test/lint/whitespace still await this fresh sequence; no earlier invalidated attempt is used as final evidence.

Fresh website/workspace progress (2026-10-05): `pnpm --dir website build` **passed** (client/server compile plus static rendering); `pnpm build` **passed** (root recursive script, 31 of 32 workspace projects in scope, including consuming apps). Quiet process checks and identical reviewed source hashes preceded each gate. The required `TMPDIR=<repo-root>/_tmp-oav07 pnpm test` then failed at the attestation packed-consumer lane (**3 failed / 2 passed tests, 1 failed file**): backend ESM/browser-server fixtures cannot find installed `express`, and the browser-only TypeScript fixture cannot find the staged `/signer` declarations. Earlier root lanes passed: asset-inliner 772 + 1 todo, starter 335, OIDC 1,942, attestation node 346 / Redis 62 / Mongo 31 / browser 23. Root exited 1; remaining package results are not a completed workspace gate. Inspection confirms the attestation fixture file matches `HEAD` exactly (`eb988431bc1e2bc3181ca82670363554fbb7407b`) and has no concurrent diff. Its two installers invoke pnpm in repository-local temporary directories without a local workspace boundary, allowing pnpm to discover the parent workspace instead of installing the fixture manifest. The necessary narrow verification correction is owned by F05 below; no attestation product code or compiler assertion is changed.

#### Integration follow-up OAV-07-F05: Isolate repository-local attestation packed-consumer installs

Status: completed

Priority: P0 (required serial workspace gate)

Owner: OAV-07 verification integration; narrow existing attestation fixture orchestration correction.

Dependencies: required repository-local `TMPDIR` convention and the unchanged attestation ATT-08 packed suite; required before OAV-07 completion.

Primary ownership: `packages/express-request-attestation/test/packed-consumer.test.ts`, the two consumer install directories only.

Finding: stable-tree root verification reproduces three missing installed-module/declaration failures. Both consumers create a private manifest under `<repo-root>/_tmp-oav07` but lack `pnpm-workspace.yaml`; their `pnpm install --no-frozen-lockfile` discovers the enclosing repository workspace. Access-router's existing packed-consumer installer already creates an isolated `packages: []` workspace for this reason. No new feature failure or publish-surface change is inferred from this fixture-location failure.

Requirements / acceptance:

- Add only the same local `packages: []` workspace boundary to backend and browser-only fixture directories before installation. Keep real tarball installs, optional-peer/no-server-dependency checks, CJS/ESM/NodeNext/Bundler/README/browser assertions, and teardown intact.
- The unchanged five packed tests pass with `TMPDIR=<repo-root>/_tmp-oav07`; then the full serial root `pnpm test` passes. Focused/root lint and whitespace checks pass, with no dependency/manifest/product rewrite or root changelog edit.

F05 resolution progress (2026-10-05): added `writeFileSync(..., 'packages: []\n')` immediately before each of the two existing consumer installs, with one explanatory comment. `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer` **passed: 1 file / 5 tests** (36.07s). Real installed CJS/ESM, strict NodeNext/Bundler, README, browser-only no-server-peer, and installed-browser assertions all remain intact; the exact previously failing cases now pass. Reviewed source hashes remain identical and process checks are quiet. F05 remains `in_progress` until the required full root test/lint/whitespace verification passes.

Completion evidence (2026-10-05):

- Changed only two local workspace-file writes/comment in `packages/express-request-attestation/test/packed-consumer.test.ts` (4 added lines); real installs and assertions remain intact.
- Focused **5 packed tests** pass as recorded above; the final serial root gate passes attestation's **20 file runs / 467 tests**, including all browser and packed checks. `pnpm lint` and `git diff --check` pass.
- Missing installed peer/declaration fixtures are resolved; transient Chromium attempts are separately recorded and the final whole root run passes. No remaining F05 blocker.

Next root-gate result (2026-10-05): the repeated exact serial root command passed attestation's full five lanes, including **5 packed tests**, then reached another identical fixture-location failure in unchanged express-runtime tests: **2 failed / 339 passed tests (341), 2 failed / 9 passed files (11)**. The export consumer cannot import its installed runtime tarball, and the deployment consumer cannot import that runtime before exercising generated local/serverless bundles. Their current source hashes match `HEAD` (`2be46bf89878e4e4b82859a06c246ab001cf7c9c` and `c7305ab1a07acad3491d419b04250d06c163045e`); no external process/diff explains these failures. The required correction is assigned to F06 before editing. Inventory of all workspace pnpm consumer installers also identifies two remaining unisolated JSON-frame/PDF-reader fixtures; reproduce their focused installed-surface gates before any correction rather than assuming product failures or rerunning the root gate repeatedly to discover them.

#### Integration follow-up OAV-07-F06: Isolate repository-local express-runtime consumer installs

Status: completed

Priority: P0 (required serial workspace gate)

Owner: OAV-07 verification integration; narrow existing express-runtime fixture orchestration correction.

Dependencies: required repository-local `TMPDIR` convention; express-runtime ERT-09/ERT-B15 suites; required before OAV-07 completion.

Primary ownership: `packages/express-runtime/test/export-contract.test.ts` and `packages/express-runtime/test/deployment-docs.test.ts`, their single consumer install sites only.

Finding: the stable-tree root run reproduces two missing installed-runtime errors. Each private fixture manifest is created below the repository and pnpm finds its enclosing workspace. Both failures occur before packed export/CLI/type or local/serverless deployment verification; all other 339 runtime tests pass.

Requirements / acceptance:

- Add the established local `packages: []` boundary before each install. Retain real release-shaped tarballs, CJS/ESM/strict type/CLI checks, generated bundle execution, documented dependency sets, and teardown.
- The two unchanged focused files pass with repository-local TMPDIR; the complete serial root gate and root lint/whitespace pass. No production/runtime/manifest/compiler assertion rewrite is included.

F06 focused verification (2026-10-05): after adding one local workspace boundary at each existing install, `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/express-runtime exec vitest run --config vitest.config.mts test/export-contract.test.ts test/deployment-docs.test.ts` **passed: 2 files / 7 tests** (15.40s). Both previously failing installed-package/deployment cases now execute their full unchanged CJS/ESM/type/CLI/local/serverless assertions. Full root closure remains required.

Completion evidence (2026-10-05):

- Changed only local workspace-file writes/comment in `packages/express-runtime/test/export-contract.test.ts` and `packages/express-runtime/test/deployment-docs.test.ts` (3 added lines total).
- Focused **2 files / 7 tests** pass; the final serial root gate passes all **11 express-runtime files / 341 tests**, including real packed root/CLI/bin/types and generated local/serverless deployments. Root lint/whitespace pass.
- Existing runtime/manifest/compiler contracts are retained; no remaining F06 blocker.

#### Integration follow-up OAV-07-F07: Isolate remaining JSON-frame/PDF-reader packed consumers

Status: completed

Priority: P0 (required serial workspace gate)

Owner: OAV-07 verification integration; existing JSON-frame JFRAME-08 / PDF-reader PDFR-02 fixture orchestration only.

Dependencies: required repository-local `TMPDIR` convention, F05/F06 fixture finding; required before OAV-07 completion.

Primary ownership: `packages/json-frame/test/packed-consumer.test.ts` and `packages/pdf-reader/test/packed-consumer.test.ts`, their single install sites only.

Finding: the workspace installer inventory identified these last two consumers without a local workspace boundary. Fresh serial before-correction checks reproduced the same failure mechanism: `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts` **failed 1 / passed 4 tests (5)** because the installed README does not exist; `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/packed-consumer.test.ts` **failed 1 / passed 2 tests (3)** because PDF.js and package declarations are not installed. Both fixture files match `HEAD` exactly (`d071c81e06b1d1944859b6545df704a9c1ed650a`, `711d60ed7ce2c902c31aef0ca59e8e23a81421f6`) and have no concurrent diff. These are concrete fixture-location failures, not an assumed pre-existing product defect.

Requirements / acceptance:

- Add only the established local `packages: []` workspace file before each existing install. Preserve release-shape inventory, installed CJS/ESM/types/README/negative-type assertions, PDF browser bundling, dependencies, and teardown.
- Both complete packed suites pass under the same repository-local TMPDIR, then the complete serial workspace tests/lint/whitespace pass. No source/manifest/assertion changes or further installer refactor is included.

F07 focused verification (2026-10-05): after the two one-line workspace boundaries, the same exact focused JSON-frame and PDF-reader commands **passed: 1 file / 5 tests** (26.84s) and **1 file / 3 tests** (7.28s), respectively. Installed README/types/runtime and PDF strict declarations/browser bundling now execute their unchanged assertions. All observed missing-install fixtures have concrete before/after evidence; final serial workspace verification follows, with no repeated package/website build needed for these test-only changes.

Completion evidence (2026-10-05):

- Changed only workspace-file writes/comment in `packages/json-frame/test/packed-consumer.test.ts` and `packages/pdf-reader/test/packed-consumer.test.ts` (4 added lines total), after both recorded stable before-fix failures.
- Focused **5 JSON-frame / 3 PDF packed tests** pass. The final serial root gate passes JSON-frame **9 files / 531 tests** and PDF-reader **4 files / 205 node tests + 2 files / 32 real-browser tests**, with strict negative checks and browser bundling retained. Root lint/whitespace pass.
- All concretely found unisolated pnpm consumers are corrected; no remaining F07 blocker.

Latest serial root progress (2026-10-05): the complete root command now passes F05–F07's package suites (attestation 467 across five lanes, express-runtime 341, JSON-frame 531, PDF-reader 205 node + 32 browser), access-router **83 files / 1,425 tests**, client 914 node + 10 browser, and decorators **18 files / 563 tests**. The only reached failure is access-router-runtime's minimal packed consumer: **1 failed / 134 passed tests (135), 1 failed / 11 passed files (12)**. Its ESM/CJS/strict compiler matrix succeeds before a location assertion rejects the fixture merely because its real isolated install is below `<repo-root>/_tmp-oav07`. The current fixture matches `HEAD` (`1821727df02e39e8e142212fb450b0381e78c28e`) with no concurrent diff. The asserted workspace-exclusion contract needs repository-local containment-aware verification, assigned to F08 before edits; the full root run exited 1 and is not a completed gate.

#### Integration follow-up OAV-07-F08: Verify packed-runtime isolation within repository-local fixtures

Status: completed

Priority: P0 (required serial workspace gate)

Owner: OAV-07 verification integration; existing access-router-runtime ARRT-B13 location assertions only.

Dependencies: required repository-local TMPDIR and the existing minimal packed-runtime consumer; required before OAV-07 completion.

Primary ownership: `packages/access-router-runtime/test/packed-consumer.test.ts`, `assertIsolatedTransitiveResolution` location assertions only.

Finding: the private consumer already has a local workspace with pinned tarball overrides, undeclared/unhoisted transitive dependencies, and subprocesses stripped of `NODE_PATH`. Runtime/type checks pass, but four assertions reject any resolution below the entire repository, which necessarily also rejects the required repository-local consumer's own installation. The root failure at line 317 is concrete and stable; no shared-output race or production defect is involved.

Requirements / acceptance:

- Require runtime link targets and transitive lexical/real paths to be contained in this consumer directory, using a directory-separator boundary. This admits repository-local fixtures while rejecting workspace package/store leakage and any outside-consumer resolution. Keep all manifest/no-hoist/version/subprocess/strict compiler assertions intact.
- The complete five-case packed suite passes under repository-local TMPDIR, then full serial root tests/lint/whitespace pass. Do not relocate tests outside the repository or weaken type/runtime/isolation checks.

F08 focused verification (2026-10-05): replaced the four whole-repository exclusion assertions with stricter lexical/real containment in the specific consumer directory (`path.sep`-terminated prefixes). `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router-runtime exec vitest run --config vitest.config.mts test/packed-consumer.test.ts` **passed: 1 file / 5 tests** (84.09s). Minimal declared dependencies, absent root transitive links, sentinel installed versions, plain-node `NODE_PATH`-free resolution, ESM/CJS and all strict compiler configurations remain asserted. This is the concrete repository-local fixture adaptation required by the final gate; F08 awaits full serial root/lint/whitespace closure.

Completion evidence (2026-10-05):

- Changed only `assertIsolatedTransitiveResolution` in `packages/access-router-runtime/test/packed-consumer.test.ts`: runtime/transitive lexical/real paths must stay within this consumer's separator-terminated directory, rather than being outside every repository path.
- Focused **1 file / 5 packed tests** pass; the final serial root gate passes all **12 runtime files / 135 tests**, including minimally provisioned ESM/CJS/strict consumers, undeclared/unhoisted transitive edges, exact sentinel versions, and plain-node `NODE_PATH`-free resolution. Root lint/whitespace pass.
- Workspace package/shared-store leakage still fails the more precise containment requirement; no remaining F08 blocker.

Browser-runner interruption (2026-10-05): the next exact serial root attempt reached attestation's Chromium lane after passing prior packages and all 439 attestation node/Redis/Mongo tests, then reported **1 unhandled browser-session connection timeout, no collected tests (2 files)** at the runner's 60-second session deadline. It exited 1 before the packed lane. This is a genuinely failed gate, not proof of completion or an assertion to disable. Post-run process inspection found no live build/test/browser/database chain; memory, checkout disk, and shared-memory capacity were available. All recorded feature/fix hashes are unchanged. Rerun the same focused browser command on the quiet current build to establish whether this is transient; no timeout/config/assertion change is assigned without reproduction.

Browser-runner refresh (2026-10-05): `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/express-request-attestation test:browser` immediately **passed: 2 files / 23 tests** (1.69s) on the unchanged current build/configuration. No timeout/assertion was relaxed. The connection timeout is recorded as a transient runner interruption; the required full serial root gate is restarted rather than composing partial attempts into a passing result.

Repeated browser-runner stall (2026-10-05): the restarted root command passed the same earlier lanes and reached Chromium, but produced no test completion after the normal built-signer transform warning. The shell's **2,400,000 ms (40-minute) command deadline** ultimately terminated it with SIGTERM; no root pass is claimed. Current feature and fixture hashes remain identical; no live build/test/browser/database process remains after termination. Because this is a second runner interruption, investigate the complete attestation build → node → Redis → Mongo → Chromium chain with operational browser diagnostics before another full root attempt. Do not suppress errors, skip the browser lane, or relax its assertions/timeouts.

Complete browser-chain diagnosis (2026-10-05): `TMPDIR=<repo-root>/_tmp-oav07 DEBUG=pw:browser pnpm --filter @web-ts-toolkit/express-request-attestation test` **passed all five lanes: 20 file runs / 467 tests** (346 node + 62 Redis + 31 Mongo + 23 browser + 5 packed). Independent operational ps samples observed the single chain progress and finish; Chromium launched, connected to Vite, completed tests, exited 0, and cleaned its profiles. Available headless GPU warnings also occur on this passing run and are not asserted as the timeout cause. No source/config/assertion change was made for the intermittent runner interruption. The next complete serial root attempt retains optional Playwright launch diagnostics so any further stall has actionable operational evidence; only a full successful run can close the gate.

### OAV-07 Completion evidence (2026-10-05)

- **Final status:** OAV-00 through OAV-07 and follow-ups F01–F08 are **completed**, after fresh required gates on the restored feature tree. Every main task and follow-up has Completion evidence. Dated failed/interrupted/racy/pre-feature attempts remain historical evidence; none is substituted for the final passing checks. The motivating example now describes the implemented API. No unresolved OAV acceptance criterion, feature blocker, or required follow-up remains.
- **Independent authorization audit:** inspected `packages/access-router/src/operation-access.ts`, both cores, every paired generated model/data/subdocument guard, exact owning-runtime option getters, public types/setters, populate preflight/error seams, and current secondary base calls. All **14 model keys / 4 data keys / 4 nested list-read keys** map correctly. Model guards carry 15 explicit server-owned literals (both advanced reads included), data carries 5, subdocuments 4; advanced POST count/distinct remain advanced without a query prefix. New/delete and subdocument mutations use their existing base guards. Real HTTP/Mongo coverage in the final package/root suites verifies inheritance, either variant denial/grant over conflicting bases, zero denied-entry dispatch/persistence, HEAD, custom IDs/segments, registered endpoints/OpenAPI, live setters/shallow replacement, ordinary 400/403/404 secondary results, and 401 initiating denial.
- **Resolver/type audit:** exact live variant precedes unchanged base resolution; only `undefined` inherits. False, null, empty arrays, and sync/async false hooks terminate with exactly one selected guard; operational errors do not choose a fallback. Model exact defaults retain shallow/copy specificity and data has no model-default leakage. Subdocument precedence is exact field variant → field base → defined scalar/closed object → absent-field top variant → top base; nested defaults/legacy umbrella behavior stay documented. Same-name isolated runtimes and repeated live checks remain independent. `PermissionSchema` uses distinct base-only `FieldOperationAccess`, while all model/default/data setter forms expose the intended route keys in strict consumers. No method-derived/global variant state or initialized alias defaults are present.
- **Alternate-entry/target audit:** root operations retain base names and reject all aliases; trusted service orchestration, both read-to-list retries, upsert branch/base hook selection, field/row/filter policies, related target checks, and post-save subdocument response visibility retain their recorded base contracts. Wire `populateAccess`/descriptor types and schemas allow list/read. Shared option/descriptor/effective preflight rejects the exact fourteen reserved names before target queries even through generic nested includes/subqueries; controlled BadRequest propagates without relaxing terminal denials. Trusted non-reserved custom strings remain exact through target selection/filter/grants/final trimming, including F04's five custom-only lean/hydrated/override/include/subquery regressions with read-hook traps uncalled.
- **Public/package audit:** fresh generated `packages/access-router/dist/index.d.ts`, `index.d.mts`, `advanced.d.ts`, `advanced.d.mts`, and `parsers-DhUuvj9B.d.ts` / `.d.mts` within that same `dist/` expose all documented keys, separate field shapes, live setter/snapshot/endpoint JSDoc, and list/read wire selectors through existing entrypoints. Package metadata/tsup root/advanced/processors remain coherent. Shipped README/llms and website matrix/default/subdocument/401/HEAD/secondary guidance agree. All **88 installed-surface cases** pass: 7 strict `.ts`/`.mts`/`.cts`, 41 export/declaration-hover, 33 documentation, and 7 real transformed packed/current-artifact cases across minimum/current peers and ESM/CJS. Current output is generated by builds; the earlier staged-declaration race is absent in the fresh package and final whole workspace runs.

Fresh required commands, run serially from `<repo-root>` (repository checkout):

| Command                                                                                                  | Fresh final result                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck`                                                  | **Passed**, five-package CJS/ESM/declaration build plus source TypeScript check                                                                                                                                      |
| `TMPDIR=<repo-root>/_tmp-oav07 pnpm --filter @web-ts-toolkit/access-router test`                         | **83 files / 1,425 tests passed**; **381 OAV runtime cases** (28 baseline + 68 resolver + 68 model routes + 75 data/sub routes + 142 boundaries), all consumers/F01–F04 regressions                                  |
| `pnpm --dir website build`                                                                               | **Passed**, client/server compiled and all static pages rendered                                                                                                                                                     |
| `pnpm build`                                                                                             | **Passed**, existing recursive script, 31 of 32 workspace projects in scope, including consuming apps                                                                                                                |
| `TMPDIR=<repo-root>/_tmp-oav07 DEBUG=pw:browser pnpm test`                                               | **Passed**, existing `--workspace-concurrency=1` root script; **491 file runs / 10,547 passed tests across 34 lanes**, plus 1 existing todo and 1 existing skipped case (10,549 total); no failures/unhandled errors |
| `pnpm lint`                                                                                              | **Passed**, repository-wide ESLint                                                                                                                                                                                   |
| `git diff --check` and new intended-file `git diff --no-index --check -- /dev/null <repo-relative-file>` | **Passed**, including new OAV resolver/helper/five suites, reviewed target/planner/finalizer files, and this task document                                                                                           |

- **Workspace evidence detail:** the single final root run includes access-router **83 / 1,425**, decorators **18 / 563**, access-router-runtime **12 / 135**, client **44 / 914 node + 1 / 10 browser**, React 19 **20 / 268**, isolated React 18 **20 / 268**, and React installed/docs/exports **3 / 18**, as well as attestation **20 / 467**, express-runtime **11 / 341**, JSON-frame **9 / 531**, and PDF-reader **4 / 205 node + 2 / 32 browser**. Counts aggregate actual final Vitest summaries; repeated peer lanes are file runs rather than unique files. Optional `DEBUG=pw:browser` only adds launch diagnostics. Browser startup interruptions were investigated with unchanged full package checks before this whole successful root run; no timeouts/assertions/serialization were relaxed.
- **Findings/resolutions and authored files:** resumed work confirmed F01's deferred Core import, F02's initiating-upsert fixture, F03's once-materialized finalized joins, and F04's exact custom target policy remain fixed, then closed them with current package/workspace results. Final root verification concretely exposed F05–F07's repository-local pnpm fixture discovery and F08's whole-repository isolation assertion; each was recorded before its narrow correction and verified focused plus full root. This resumed session authored this task file and six test-only files: `packages/express-request-attestation/test/packed-consumer.test.ts`; `packages/express-runtime/test/export-contract.test.ts`, `packages/express-runtime/test/deployment-docs.test.ts`; `packages/json-frame/test/packed-consumer.test.ts`; `packages/pdf-reader/test/packed-consumer.test.ts`; `packages/access-router-runtime/test/packed-consumer.test.ts`. F05–F07 total 11 added orchestration/comment lines, F08 only precise containment assertions. Carried-forward review changes in `packages/access-router/src/output/finalize-model-output.ts`, `packages/access-router/src/services/base.ts`, `packages/access-router/src/core.ts`, `packages/access-router/src/services/service.ts`, `packages/access-router/src/acl/{populate-target,virtual-projection}.ts`, `packages/access-router/test/nested-update-integrity.integration.test.ts`, and the five boundary regressions retain their concrete ownership/evidence above.
- **Current-tree/workspace audit:** refreshed status/diffs and 14 source/doc/test hashes before/between/after gates; reviewed feature source stayed identical throughout this resumed session. Process inspection preceded every gate; external writers were absent and operational root samples observed one serial chain progressing to completion. Existing package `fileParallelism: false` and root serialization are preserved. Broader concurrent virtual implementation/types/tests/docs and `docs/tasks/20261005-122217-access-router-package-virtuals.md` remain separately owned; this review adds only the recorded narrow integration/fixture corrections and does not claim that owner's independent sign-off. No unfamiliar probes are present in the final feature/package inventory. Repository-local consumer fixtures were removed by teardown; session-created leftovers from completed root gates were cleaned after confirming no live test/browser/database chain, leaving only ignored runner compile cache.
- **Protected file/final disposition:** `git diff --exit-code -- CHANGELOG.md` passes, and final `git hash-object CHANGELOG.md` is **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**, identical to the supplied initial hash. No staging, commit, stash/reset/revert, manual dist edit, or root changelog change was performed. The only deferred policy is the separately agreed out-of-scope `subs` umbrella semantics; it is not an unimplemented OAV requirement. **Blockers / required follow-ups: none.**

## Dependencies, ownership, and execution guidance

The recommended schedule above is sequential. Shared hotspots are `interfaces/root.ts`, core authorization, `runtime.ts`, `data-router.ts`, and strict consumer fixtures. Coordinate virtuals and operation-access implementation before editing those files. Separate review/test research can proceed independently only after the OAV-00 behavior contract is recorded; shared-output builds/tests remain serialized.

User execution workflow (confirmed 2026-10-05): use a distinct fresh subagent/session for each task item, in dependency order and sequentially. Each session owns only its assigned task and must not spawn nested agents. OAV-07 uses a reviewer distinct from the primary implementers.

For each task, set `in_progress` before work and `completed` only after its required checks pass. Append changed-file, exact-command, result, and acceptance evidence. Use `blocked` for a missing maintainer decision or execution prerequisite and identify its owner.

## Maintainer decisions and deferred work

1. **Resolved — status/exposure (2026-10-05):** the user selected “401 Unauthorized (Recommended)” through the question tool. Preserve registered routes/OpenAPI and live permission mutation under 401 denial; the earlier 404 request is historical. Recorded in OAV-00.
2. **Confirmed preservation contract (2026-10-05):** retain reviewed closed subdocument field objects, legacy umbrella behavior, base `list` read fallback, and all existing secondary/base-service policies. Recorded in OAV-00; broader authorization changes require separately agreed work.
3. **Deferred — `subs` umbrella semantics:** current public typing permits an umbrella rule, but current resolution does not use it for absent fields. OAV-00 and OAV-06 characterize and document that retained behavior; a wildcard behavior change belongs only to a separate maintainer-approved task and is outside this completed plan.

## Definition of done

- OAV-00 records the contract decisions; OAV-01 through OAV-07 are completed with verification evidence.
- All selected model/data/subdocument paired routes support explicit variant override and backward-compatible base fallback.
- Root/service/field/row/hook/related-model/response policies keep their recorded base-operation contracts; request-controlled selectors cannot choose route variants.
- False guards are terminal, option updates are live, and isolated runtimes remain independent.
- Shipped declarations, README, examples, website, and packed CJS/ESM consumers agree on the implemented API/status behavior.
- Required serial package/workspace checks pass with fresh OAV-07 evidence, including installed consumers and website; failed/interrupted historical attempts are explicitly distinguished.

Historical task-file creation evidence:

- Source/package/test review, six in-memory middleware authorization cases, and the comparative populate-rule-selection probe completed. Implementation and full-suite verification remain pending.
- Read back the document; checked eight unique task IDs, dependency ordering, ownership, acceptance/verification requirements, and repository-scoped paths. `git diff --no-index --check -- /dev/null docs/tasks/20261005-131819-access-router-operation-access-variants.md` passed.
- During verification, concurrent untracked `packages/access-router/test/virtuals-baseline.contract.test.ts` and tracked edits to `src/interfaces/{root,query-types,router-hooks}.ts` appeared alongside the existing virtuals task. Inspection of the `root.ts` diff identifies VIRT-01 type/option work. Coordinate overlapping ownership and refresh source anchors against that work before implementation; this task creation changed only the new operation-access task document.

## Coordinator final task-file audit

Completed: 2026-10-05 23:16:10 PDT.

- After all sequential isolated task sessions returned, read the complete task record and independently checked the current route mapping, shared resolver, public option types/README, reserved populate boundary, and recorded integration-fix diffs.
- All eight main tasks (`OAV-00`–`OAV-07`) and eight required integration follow-ups (`OAV-07-F01`–`F08`) have `Status: completed` and dated Completion evidence. Their dependencies, acceptance outcomes, and verification requirements are accounted for. No current task/follow-up is pending, blocked, or in progress. Earlier progress/failure statements are explicitly retained as historical snapshots.
- Confirmed the independent review's fresh final results: package typecheck; 83 package files / 1,425 passing tests, including 381 operation-access cases; website/workspace builds; 491 serial workspace file runs / 10,547 passing tests; repository lint; and whitespace. The recorded one existing todo and one existing skipped case remain identified. No source/test change was made during this final coordinator audit, so those successful gates were not repeated.
- Refreshed `git status --short` / `git diff --stat`, reviewed the six narrow repository-local consumer-fixture corrections, and verified tracked/task-document whitespace with `git diff --check` and `git diff --no-index --check -- /dev/null docs/tasks/20261005-131819-access-router-operation-access-variants.md`. Concurrent virtuals work remains accounted for in its separate task record.
- Rechecked `git diff --exit-code -- CHANGELOG.md` and `git hash-object CHANGELOG.md`: no diff, with unchanged hash `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`. No staging or commit was performed. Final disposition: the entire operation-access task file is done; required blockers/follow-ups: none.
