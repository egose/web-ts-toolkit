# Access-router nested operation access and root entry guards

Created: 2026-11-03 08:26:14 PST (`20261103-082614`, generated with `date`).

Status: completed. NOA-01–NOA-05 and NOA-05-F02 accepted; F1/F2 resolved; fresh serial V1–V3 gates passed.

## Objective and scope

Replace flat operation-access variants such as `basicRead` and `advancedRead` with
per-operation scalar-or-object rules. The object has exactly four optional guard
members: `default`, `basic`, `advanced`, and `root`. Apply the structure consistently
to model operations, data list/read operations, and per-field subdocument operations.

This is an intentional breaking change: **remove** the old flat variants, not a
warning-only deprecation, alias, automatic translation, or compatibility period.
Document migration in `packages/access-router/MIGRATION.md`, which is shipped to
installed consumers. A clearly marked planned-contract section is added alongside
this task; runtime code is not changed by task creation.

Non-goals: new endpoints or root wire operations, route removal, changes to field/
row authorization or service trust, a generic OptionsManager rewrite, deep merging
of configuration, changes to request-schema variant names, or unrelated cleanup.

## Analysis and existing work

- Initial worktree: clean. Reviewed public option types and setters, the shared
  route resolver, model/data cores, generated-route guard call sites, root dispatch,
  live/captured authorization readers, selected existing guard tests, package
  scripts/entrypoints, shipped docs, and the migration-example extraction rules.
- The completed predecessor [operation-access variants task](20261005-131819-access-router-operation-access-variants.md)
  introduced the flat API. This task supersedes that API, not its historical evidence.
  Do not rewrite completed task/artifact records or mechanically rename unrelated
  `advancedRead` request-schema keys and client method names.
- `src/operation-access.ts` currently maps seven operations to fourteen flat keys.
  `src/routers/root-router.ts:isAllowed` uses base checks, not a root-specific rule.
- Base guards are also consumed outside HTTP entry: populate/include/private-input
  target admission, LIST retry, and post-write subdocument response visibility.
  Simply passing an operation-rule object to `evaluateRouteGuard` would deny these
  paths; reusing a transport member there could instead widen access.
- `src/options/manager.ts:resolveNestedOption` is a one-parent generic fallback,
  not the complete nested-operation resolver. `getExactModelOption` also consults
  the owning runtime's same exact default path. Preserve those distinct roles.
- Selected tests were inspected, not the entire dependency graph or every consumer.
  No build, runtime test, typecheck, or packed-consumer baseline was run: this
  deliverable is a task and planned migration documentation, not implementation.

All source references below are relative to `packages/access-router/` unless they
explicitly start with `packages/` or `website/`. Verification runs from repo root.

## Reviewed target contract

### Shape and values

Suggested public types (names can follow surrounding conventions):

```ts
interface OperationAccessVariants {
  default?: Validation;
  basic?: Validation;
  advanced?: Validation;
  root?: Validation;
}
type OperationAccessRule = Validation | OperationAccessVariants;
```

`Validation` remains `boolean | string | string[] | GuardHook`, not just boolean.
Preserve permission-string AND, array OR, request-bound `this`, async guards, and
operational-error propagation. Each object member is a `Validation`, not another
rule object. The outer `operationAccess.default` remains a `Validation` as well.

```ts
operationAccess: {
  default: false,
  list: true,
  read: {
    default: 'canRead',
    basic: true,
    advanced: 'admin',
    root: false,
  },
  subs: {
    comments: {
      list: true,
      read: { default: 'canReadComments', advanced: 'moderator', root: false },
      create: { default: false, basic: 'canComment', root: 'canBatchComment' },
    },
    attachments: true,
  },
}
```

Model entries `new`, `list`, `read`, `create`, `update`, `upsert`, `delete`, `count`,
and `distinct` accept the rule union. Subdocument entries `list`, `read`, `create`,
`update`, and `delete` do too. Keep existing trusted custom-access behavior except
for retired flat names and reserved nested configuration-member selectors. Data
routers use the same rule semantics for their supported list/read operations;
do not narrow unrelated existing data-option assignments.

### Entry-point mapping

Paths use default segments and are relative to the target base path.

| Operation           | Basic direct endpoint(s)  | Advanced direct endpoint(s)                   | Root entry selects       |
| ------------------- | ------------------------- | --------------------------------------------- | ------------------------ |
| `list`              | `GET /`                   | `POST /__query`                               | `list.root`              |
| `read`              | `GET /:id`                | `POST /__query/:id`, `POST /__query/__filter` | `read.root`              |
| `create`            | `POST /`                  | `POST /__mutation`                            | `create.root`            |
| `update`            | `PATCH /:id`              | `PATCH /__mutation/:id`                       | `update.root`            |
| `upsert`            | `PUT /`                   | `PUT /__mutation`                             | `upsert.root`            |
| `count`             | `GET /count`              | `POST /count`                                 | `count.root`             |
| `distinct`          | `GET /distinct/:field`    | `POST /distinct/:field`                       | `distinct.root`          |
| `subs.<field>.list` | `GET /:id/<field>`        | `POST /:id/<field>/__query`                   | `subs.<field>.list.root` |
| `subs.<field>.read` | `GET /:id/<field>/:subId` | `POST /:id/<field>/:subId/__query`            | `subs.<field>.read.root` |

Use the same object on unpaired operations: direct `GET /new`, `DELETE /:id`, and
subdocument create/update/delete select `basic`; their root counterparts select
`root`. Both direct subdocument update paths select `update.basic`, and root
`subUpdate`/`subBulkUpdate` select `update.root`. An `advanced` member does not create
an endpoint for an unpaired operation. HEAD follows the corresponding GET's rule.

Context is explicit server-owned dispatch metadata, never inferred from HTTP
method, request-global mutable state, or a caller-supplied selector. Root `op`
names remain unchanged; root sub-operation names map to their existing base
operations. The root router's own scalar `operationAccess` remains an independent
outer batch-endpoint guard and is not replaced by a target's `root` member.

### Fallback, defaults, and closed subdocument fields

For a top-level operation in context `basic`, `advanced`, or `root`:

1. Select the exact operation context member, if defined.
2. Otherwise select the operation's scalar guard, or its object's `default` member.
3. If still undefined, use outer `operationAccess.default`, or a scalar
   `operationAccess` shorthand.
4. If no applicable valid guard resolves, deny.

Only `undefined` falls through. Explicit `false`, `[]`, and a hook returning false
are terminal; do not AND/OR a selected member with its default. Invalid defined
JavaScript values must not turn into grants or cause fallback to an allowed rule.
A top-level operation object `{}` can inherit the outer `operationAccess.default`.

Preserve the current ownership/inheritance contract rather than inventing recursive
merges: exact context lookup checks the stored model path and then the owning
runtime's same exact default path before general scalar/default fallback. Thus a
runtime-default `read.advanced` can outrank a model's scalar `read` or
`read.default`, just as a runtime-default flat `advancedRead` does today. A model's
own defined member wins. Resolve the general operation node using existing base
lookup semantics, then inspect that selected object's own `default`. Do not add an
independent runtime `read.default` lookup behind a defined model operation object:
`read: {}` does not recursively inherit a runtime `read.default`. In contrast, a
whole operation object actually inherited through existing base lookup can supply
its own `default`. Characterize these cases without introducing runtime catch-all
inheritance through generic nested reads.

Omitted model `operationAccess` inherits configured model defaults; without grants,
the built-in model policy is deny. Preserve the documented special case for explicit
model `operationAccess: undefined`: runtime exact-operation paths can supply a
fallback, but a runtime bare or outer `.default` catch-all does not become inherited.
Data routers do not inherit model defaults. Shallow replacement, dotted-member
updates, live fresh reads, frozen construction snapshots, runtime isolation, and
in-flight captured-policy ownership remain unchanged.

For `subs.<field>`:

- An applicable exact context member is followed by that field operation's scalar
  or nested `default`, then **deny**. Never use the outer `operationAccess.default`
  or a top-level operation to fill a defined field's missing rule.
- A defined field object is closed: missing operations and empty operation objects
  deny if no applicable field/default-runtime exact rule resolves. Adding nested
  operation defaults does not create a field-level `subs.<field>.default` wildcard.
- An absent field rule uses the corresponding top-level operation and context.
- A field scalar, e.g. `subs.attachments: true`, remains its operation fallback.
  Preserve exact runtime-default specificity before scalar fallback.
- Keep existing `subs: Validation` behavior; do not turn it into a new wildcard
  policy for fields that currently fall back to top-level rules.

### Secondary checks are context-free

Existing base-operation checks (`isAllowed(name, 'read')` and captured equivalents)
resolve an operation scalar or its nested `default`, then the applicable existing
outer fallback. They **never** choose `basic`, `advanced`, or `root` implicitly.
The same closed-field rule applies to base subdocument checks.

This applies wherever the code already checks base operation access: target
populate/include/subquery admission, private populated dependencies when their
target flag requires it, READ-to-LIST retry, and mutation-response visibility.
Keep flag-controlled bypasses, trusted service admission, row/field policy, hook
base names, and upsert branch behavior unchanged. Do not add blanket entry guards
to trusted service calls or let a root grant authorize related targets.

### Removal and migration

Remove all fourteen flat top-level variants and four per-field list/read variants
from supported configuration, emitted declarations, examples, and resolver maps.
For every former `basicX`/`advancedX`, use `x.basic`/`x.advanced`. Move a former base
guard to `x.default` when the operation becomes an object. Without an explicit
`x.root`, root entry inherits that default as it previously inherited the base rule.

Remove the public flat-name `RouteVariantAccess` template type (and document the
type-import break); expose a discoverable context/rule type instead. Preserve
unrelated custom string escape hatches, but do not advertise retired keys as named
setter paths or allow them to work as custom-operation aliases.

Reject removed flat configuration keys with actionable migration errors at model,
model-default, and data option admission, including dotted/fluent paths, before
publishing a partial update. Keep rejection of retired selectors at populate
boundaries; a diagnostic denylist is not compatibility support. Nested member
paths such as `read.basic`, `read.advanced`, and `read.root` are configuration, not
wire operations or alternate target-access capabilities. Wire populate selectors
remain the existing list/read set. Keep unrelated trusted custom accesses working.

Do not reject same-spelled business field names or permission strings, and do not
rename `requestSchemas.advancedRead`, validation exports, or client read methods.

## Executable tasks

Priority: P1 = authorization/API contract required before the breaking release;
P2 = consumer/documentation integration required before completion.
Tasks are sequenced because they share types, cores, tests, and generated output.

### Task NOA-01: Add nested rule types, admission, and shared resolution

Status: completed

Assigned: NOA-01 implementation agent (separate session; coordinator owns task status).

Reopened after independent NOA-05 finding F1, then corrected and reverified by the
original admission owner. The pre-remediation completion evidence is historical;
the F1 resolution below records the new source and maintained regressions.

Kind: improvement

Priority: P1 — defines the breaking authorization contract for every entry path.

Dependencies: none

Primary ownership: `src/interfaces/{access,root}.ts`, `src/index.ts`,
`src/operation-access.ts`, `src/runtime.ts` option admission, focused contract/type
fixtures; existing `./advanced` barrel re-exports must agree.

Finding/references: `OperationAccess`/`SubOperationAccess` and the extended model/
default/data option interfaces currently expose flat `Validation` fields;
`src/operation-access.ts:OPERATION_ACCESS_VARIANTS` resolves only those flat paths.
`src/runtime.ts:getExactModelOption` and `src/options/manager.ts:resolveNestedOption`
have materially different default behavior.

Requirements:

1. Implement the reviewed rule union and shared context-aware/context-free selection
   using explicit readers; allow captured readers without live runtime access.
2. Replace flat type entries/maps with discoverable nested paths, including operation
   whole-value setters and `.default/.basic/.advanced/.root` leaves. Cover model,
   runtime-default, data, and dynamic subdocument setter forms. Keep field policy
   types separate: `permissionSchema.name.read` is not a route-rule object.
3. Remove flat-name public types and implement removed-key admission diagnostics
   consistently for bulk, dotted, and fluent updates. Reject obsolete subdocument
   operation keys even where a dynamic operation index would otherwise accept them.
4. Add table-driven contract tests for three contexts and base checks, terminal
   false/empty-array/hooks, undefined/empty objects, malformed defined values,
   runtime exact specificity, omission versus explicit undefined, and closed fields.
5. F1 correction: preserve existing non-coercing/proxy-safe option/key validation
   before inspecting operation rules at `ModelRouter.fromModel`, `setModelOption`,
   and `setDataOption`; add maintained malformed-input regressions without changing
   retired-key diagnostics or normal nested-rule resolution.

Acceptance criteria:

- Public nested options/typed setter paths compile; old object keys fail consumer
  typechecks. Generic string escape hatches do not restore runtime flat-key support.
- Old-key updates fail without changing the prior effective policy. Same-spelled
  business fields, permission strings, and request-schema keys remain valid.
- The resolver selects/evaluates one guard only; live and captured-reader fixtures
  establish the fallback cases without a process-global default lookup.
- Malformed Proxy options and coercing non-string exact setter keys reject with
  controlled TypeError, zero application trap/coercion callbacks, unchanged policy
  and no model/data/options registry publication.

Verification: fresh package build and focused new resolver/admission contracts and
consumer type fixtures, following V1. Full V1/V2 are integration gates after NOA-04;
do not require still-unmigrated flat-API consumer tests to pass at this stage.

Completion evidence:

- Reviewed source/type/admission changes and maintained tests against the handoff;
  public rule/context types and nested setters are emitted, while retired option
  keys reject before publication and the flat-name public type is removed.
- Fresh transitive build and direct source typecheck passed. The focused resolver,
  admission, and installed-declaration suites passed **237 tests** (180/54/3), with
  36 negative diagnostic sites checked in each of three consumer module modes.
  Coordinator reconciled the saved test result counts with the handoff and checked
  the actual diff. Targeted lint/format and whitespace checks passed.
- Exact commands, helper signatures, and preservation limits:
  [NOA-01 handoff](../task-artifacts/access-router/20261103-noa01-nested-rules/handoff.md).
  Full V1–V3 and old consumer migrations remain later tasks, not passing baselines.

F1 resolution evidence:

- Reviewed the three-site ordering-only correction and five new maintained cases:
  shape/key-type validation precedes operation inspection/coercion, callbacks stay
  at zero, and controlled errors leave snapshots/policies/registries unchanged.
- The maintained cases demonstrated **56 pass / 3 fail** before the fix, then the
  admission suite passed **59/59**. Corrected build, direct/package typecheck,
  full nested matrices (**868**), and affected mode/atomicity checks (**249**) passed
  (**1,117 tests**, no failures/skips/todos), with targeted lint/format checks.
- All other work, docs, client files and prior evidence were preserved. Independent
  final V1–V3 still require a fresh run after F2. Exact commands and preservation:
  [NOA-01 F1 handoff](../task-artifacts/access-router/20261103-152713-noa01-f1/handoff.md).

### Task NOA-02: Dispatch direct, data, root, and subdocument entry contexts

Status: completed

Assigned: NOA-02 implementation agent (fresh session; NOA-01 handoff accepted).

Kind: improvement

Priority: P1 — gives `root` a real, independent entry guard without misclassifying POSTs.

Dependencies: NOA-01

Primary ownership: `src/core.ts`, `src/core-data.ts`, `src/routers/{model-router,
data-router,root-router}.ts`, `src/routers/model-router-*-routes.ts`, and direct/root
operation-access integration tests.

Finding/references: `Core.isAllowedRoute`/`DataCore.isAllowedRoute` support only
basic/advanced, while `RootRouter.isAllowed` uses base checks. Unpaired route
`assertAllowed` calls currently omit a variant entirely.

Requirements:

1. Wire the complete entry-point mapping above, including unpaired operations,
   model/data root entries, and every subdocument root mutation mapping.
2. Keep route metadata server-owned, root outer admission separate, normal field/
   row policy intact, and base checks context-free. Do not widen trusted services.
3. Migrate the existing direct/subdocument test matrices to nested rules, retaining
   coverage for both advanced reads, custom route segments, HEAD, live dotted/fluent
   updates, shallow replacements, and construction snapshots.

Acceptance criteria:

- `read: { default: false, root: true }` permits root read entry but denies direct
  reads; `read: { default: true, root: false }` does the reverse. Repeat for model,
  data, and subdocument list/read, and cover supported mutation/root mappings.
- Scalar rules and fallback/closed-field cases match the reviewed contract.
- Direct denial remains 401; root denial remains its existing per-entry unauthorized
  result. Denied routes remain registered and included in endpoint/OpenAPI output.

Verification: focused entry-selection/denial tests with service-dispatch assertions
(V1). Full end-to-end responses also depend on NOA-03's secondary-policy migration;
run the complete V1/V2 integration gates after NOA-04.

Completion evidence:

- Reviewed live base-core and explicit entry dispatch, required generated-route
  context metadata, root/sub-operation mappings, and preservation of the captured
  guard seam and root's separate outer guard.
- Fresh transitive build/source typecheck passed; focused helper/admission/base/
  entry tests passed **433/433**. The migrated model/data/subdocument route matrices
  passed **138/143**, leaving five demonstrated secondary-policy failures for
  NOA-03 (two LIST retry, three post-write subdocument visibility). They remain
  asserted, not skipped or weakened; they do not block this task's scope-limited
  entry-selection/service-dispatch acceptance. Full response integration is pending.
- Targeted lint/format and whitespace checks passed. All former 68 model, 75
  data/subdocument, and 68 core variant assertions remain, with 100 new entry/base
  tests. Exact commands, migration ledger, and failure details:
  [NOA-02 handoff](../task-artifacts/access-router/20261103-092402-noa02-entry-contexts/handoff.md).

### Task NOA-03: Preserve captured base checks and target selector boundaries

Status: completed

Assigned: NOA-03 implementation agent (fresh session; NOA-02 handoff accepted).

Kind: improvement

Priority: P1 — prevents target-access widening and secondary-check regressions.

Dependencies: NOA-01, NOA-02

Primary ownership: `src/acl/{model-output-planning,related-execution,
subdocument-authorization,virtual-populate-dependencies,virtual-populate-execution,
populate-access}.ts`, relevant core/service guard consumers, `src/services/{base,
public-service,service}.ts`, focused target/capture/boundary regressions.

Finding/references: `getCapturedAuthorizationOption` currently returns an exact
operation value; `subdocumentGateAllowed`, populate target gates, private-input
gates, and `PublicService` LIST retry pass resolved values to the guard evaluator.
`assertPopulateAccess` currently reserves flat variants against target selection.

Requirements:

1. Inventory live and captured base-guard consumers and route all existing operation
   checks through equivalent nested-default selection. Retain immutable actor/policy
   captures and the special exact-default fallback, with no live reread after awaits.
2. Keep target Q/D populate policy flags, actual-model binding, source/target row and
   field policy, READ retry behavior, upsert branch semantics, and hidden-successful
   write-response behavior unchanged.
3. Retain rejection of flat selectors and reject reserved nested route-member paths
   at shared target boundaries, including legacy include/subquery forwarding.

Acceptance criteria:

- `{ default: false, advanced: true, root: true }` on a target operation does not
  grant its context-free base admission. An allowed operation `default` still works
  when its basic/advanced/root entries deny.
- Cover public populate, private dependencies, include/subquery, LIST retry, and
  parent/subdocument post-write visibility in lean/hydrated cases where applicable.
- A paused operation retains its captured defaults/permissions across option updates;
  a fresh call sees the update. Cross-runtime policies never leak.
- Invalid route selectors fail before target work; allowed list/read selectors and
  unrelated trusted custom access strings retain their existing semantics.

Verification: focused operation boundary and affected populate/owned-authorization
tests (V1); record the exact extra regression files selected during implementation.
V2 remains a final integrated gate after NOA-04 migrates legacy consumer fixtures.

Completion evidence:

- Reviewed the captured scalar-selection adapter, live/captured caller inventory,
  separate same-owner default capture, retained captured-guard seam, subdocument
  visibility, and shared nested/retired target-selector rejection. Reviewed the
  narrow admission-order correction preserving existing proxy-safe mode validation.
- All five NOA-02 failures now pass without edits to their assertions. Fresh build
  and source typecheck passed; final scoped matrices passed **863/863** tests and
  target/capture suites passed **2,587/2,587** (**60 files, 3,450 total**, no skipped
  tests). Coordinator reconciled both saved JSON summaries with the handoff.
- Two legacy installed-consumer failures were demonstrated in
  `owned-authorization-types.test.ts` because its positive hook fixture still uses
  `basicRead`; they are explicitly excluded from the final runtime subset and are
  required NOA-04 migration, not a passing package baseline. Targeted lint/format
  checks passed. Inventory, exact commands, and failure history:
  [NOA-03 handoff](../task-artifacts/access-router/20261103-095702-noa03-captured-base-checks/handoff.md).

### Task NOA-04: Migrate installed-consumer examples and breaking documentation

Status: completed

Assigned: NOA-04 implementation agent (fresh session; NOA-03 handoff accepted).

Kind: improvement

Priority: P2 — installed applications must discover the new structure and migration.

Dependencies: NOA-02, NOA-03

Primary ownership: `README.md`, `MIGRATION.md`, `llms.txt`, option/router JSDoc,
`test/{strict-consumer-types,packed-consumer-compatibility}.test.ts`, migration
example fixtures, and relevant `website/docs/packages/access-router/` guides.

Finding/references: shipped README and existing packed consumer smoke/type fixtures
teach flat variants. `package.json:files` ships MIGRATION.md, and
`tsup.config.ts:onSuccess` copies it into the flattened production publish tree.
`test/migration-guide-fixture.ts:extractMigrationBlocks` requires explicit
classification of every migration TypeScript block.

Requirements:

1. Migrate maintained examples, assertions, JSDoc and website matrices to the nested
   API; retain old spelling only in migration/removal diagnostics, negative tests,
   or explicitly historical task evidence. Do not rename unrelated schema APIs.
2. Finalize the planned migration section added with this task: remove its pending
   marker only when implemented, give all seven flat-to-nested mappings, operation
   scalar-to-default and subdocument examples, new setter paths, removed type
   imports, root outer-versus-target policy, defaults, and context-free boundaries.
3. Add classified, compilable target examples to the shipped-guide fixture checks;
   historical examples stay `text` or deliberate negative fixtures. Use public
   package imports without suppression casts. Preserve existing migration coverage.
4. Verify both ESM/CJS installed entrypoints and emitted declarations expose the
   object/context types, typed setters, and removed-key behavior. Audit directly
   affected workspace consumers (including decorator/runtime integration) and update
   only usages that depend on this option contract.

Acceptance criteria:

- The installed README/declarations/MIGRATION are sufficient without repo sources.
- Migration examples preserve former root/base behavior by moving old base values
  into nested `default`, unless an explicit new `root` restriction is intended.
- Packed/public consumer tests prove new behavior and real rejection of obsolete
  keys/types; the production publish tree still contains the matching guide.

Verification: consumer/migration/packed compatibility checks in V2; focused content
audit and affected workspace checks in V3.

Completion evidence:

- Reviewed implemented README/MIGRATION/JSDoc/website guidance, classified migration
  targets, strict/packed declaration and runtime fixtures, and the contextual spelling
  audit. All ten original migration block purposes remain, with three compiled
  target examples added. No compatibility aliases or request-schema renames.
- Reviewed the narrow decorator type correction: scalar `@RouteGuard` names now
  derive from the actual existing hook allowlist instead of accidentally accepting
  nested option paths; typed nested configuration remains supported in options.
- Fresh build/package typecheck passed. Final **unfiltered** package suite passed
  **196 files / 6,712 tests**, no failures/skips/todos. Decorator build/typecheck and
  focused suites passed **13/13**; runtime build and focused suites passed **6/6**.
  Coordinator reconciled final saved results, not the earlier failing package run.
- Initial full-package failures were three mocks retaining the old root `isAllowed`
  seam; they now assert `isAllowedRoute(..., 'root')` while retaining all previous
  admission/service assertions. Final package rerun passed after all maintained edits.
  Scoped lint/format, document links, and whitespace checks passed.
- Full module conditions, file manifest, doc acceptance, commands and failure history:
  [NOA-04 handoff](../task-artifacts/access-router/20261103-100245-noa04-installed-consumers/handoff.md).
  Repository V3 and independent acceptance review remain NOA-05, not yet passed.

### Task NOA-05: Run serial integration gates and reconcile acceptance evidence

Status: completed

Assigned: NOA-05 independent review agent (fresh session; none of NOA-01–NOA-04's implementers).

F1 and F2 corrections were independently reverified; the same independent reviewer
returned ACCEPT after fresh V1–V3 gates. The initial request-changes report remains
historical evidence, distinct from the final corrected-source acceptance below.

Kind: improvement

Priority: P1 — release gate for a cross-path authorization API break.

Dependencies: NOA-01, NOA-02, NOA-03, NOA-04, NOA-05-F02

Primary ownership: acceptance review and this task's verification/completion record;
fixes belong with their owning task rather than an undocumented follow-up.

Finding/references: existing package tests build shared dependency output before
Vitest; root `AGENTS.md` requires serial workspace test execution. Old variant
coverage spans runtime, secondary paths, and packed consumers, not just route tests.

Requirements:

1. Run V1–V3 serially against the final source, reconcile each acceptance criterion
   with delivered tests, and inspect the active diff for accidental authorization
   widening or unsupported compatibility branches.
2. Audit removed spellings contextually; exclude historical tasks/artifacts and
   unrelated `requestSchemas`/client naming, not all matches indiscriminately.
3. If work is later delegated, obtain final review from someone other than the main
   implementer; do not claim independent review unless it actually happened.
4. Record exact commands/results and any limitations. Preserve useful curated
   evidence under `docs/task-artifacts/access-router/<run-id>/` if scratch material
   becomes necessary to substantiate acceptance; do not commit raw scratch trees.

Acceptance criteria:

- V1–V3 pass and types, implementation, root behavior, and shipped docs agree.
- No runtime flat-key aliases/translators remain; denied targets/closed fields stay
  denied across direct/root/related paths. No new service trust or wire capability.
- Every task has verified completion evidence; unmet required gates remain blocked,
  not silently waived. No implementation is marked completed by this task's creation.

Verification: V1–V3 and `git diff --check`; update evidence after the last source edit.

Independent review evidence (pre-remediation):

- Fresh V1 matrices passed **863** tests; target/capture checks passed **2,589**
  without the former consumer exclusion. Fresh package suite inside root test
  passed **196 files / 6,712** tests. Package typecheck and root build/lint passed.
- Root `pnpm test` failed on the client packed consumer's contradictory root engine
  expectation (`>=20` versus declared `>=24`), so browser/later workspace coverage
  is incomplete. No current-source failure is waived or labeled a proven baseline.
- A separate built-package observer demonstrated F1: Proxy ownKeys/key coercion
  occurs before controlled rejection at three new admission sites. No grant or
  registry publication was observed. Maintained tests missed these malformed paths.
- The reviewer made no production/maintained-test changes. Criterion matrix,
  reproducible observer, source identity and exact gate outcomes:
  [NOA-05 request-changes review](../task-artifacts/access-router/20261103-142416-noa05-independent-review/review.md).
  Preserve this historical report; post-remediation acceptance needs new evidence.

Final completion evidence:

- The independent reviewer inspected both correction diffs, verified zero
  trap/coercion callbacks and unchanged policy/registry rejection, and reconciled
  every acceptance criterion against corrected source and fresh tests. Verdict:
  **ACCEPT**, no remaining API/authorization finding or required-gate blocker.
- Final V1 passed **868** operation/admission/entry/capture tests, **2,589**
  target/capture tests without exclusion, and **249** extra mode/atomicity tests.
  Package typecheck passed. Fresh unfiltered access-router suite within root test
  passed **196 files / 6,717 tests** (the original 6,712 plus five F1 cases).
- Serial repository `pnpm build`, `pnpm test`, and `pnpm lint` all passed. All 25
  packages with default test scripts completed: **34 Vitest invocations, 651 passed
  files, 19,259 passed tests, zero failures/skips, one reported asset-inliner todo**.
  These aggregate repeated lanes are not a unique-test coverage claim. Client
  Node/jsdom, full decorator/runtime and later React/app scripts were reached.
- An initial corrected-source root run failed because the chosen ignored TMPDIR
  made dependency-created Unix socket paths too long. An independent socket probe
  reproduced that limit; a fresh shorter ignored checkout-local TMPDIR resolved it.
  The reviewer then reran **all** V1–V3 gates successfully, with no source/assertion/
  filter changes. Both attempts and the resolution evidence are preserved.
- All 2,208 pre-existing files stayed unchanged during independent review. No
  production or maintained-test edits followed the final gates; coordinator closure
  updates only this task's status/evidence. Preserved evidence, links, privacy,
  formatting and whitespace checks passed. Known nonfatal warnings and the jsdom
  (not real-browser) coverage limit are explicitly documented.
- Final criterion matrix, exact commands/timestamps, per-package totals, source
  identity and preservation limits:
  [NOA-05 independent acceptance](../task-artifacts/access-router/20261103-154411-noa05-final/review.md).

### Task NOA-05-F02: Align the client packed test with current Node engine metadata

Status: completed

Assigned: F2 client-test agent (fresh session; F1 correction accepted before starting).

Kind: defect

Priority: P2 — small integration prerequisite blocking the required root test gate.

Dependencies: NOA-01 (reopened F1 correction; execute sequentially)

Primary ownership: `packages/access-router-client/test/access-router-client.packed-consumer.test.ts`
and narrowly required focused test evidence. Do not change package engine policy.

Finding/references: independent F2 demonstrates a contradictory assertion at line 81:
the root is expected to have Node `>=20`, while root `package.json` declares `>=24`
and the immediately following packed-manifest assertion already expects `>=24`.
The relevant files match HEAD, but no clean-HEAD command baseline was run. The
required current-source root test fails before client browser/later workspace gates.

Requirements:

1. Correct only the stale expected root-engine metadata; retain packed manifest
   equality, current engine assertion, and all Node/browser consumer coverage.
2. Run the complete serialized client package test script, including its browser
   phase. Do not filter or exclude the failing test or alter runtime policy.
3. Return a sanitized handoff with the exact minimal diff and verification outcomes;
   NOA-05 independently reviews it and reruns root gates after both corrections.

Acceptance criteria:

- Root and packed engine assertions agree with existing Node 24 metadata.
- Complete client Node and browser suites pass with no new exclusions/skips.
- No root/lockfile/package engine or unrelated production source changes.

Verification: `pnpm --filter @web-ts-toolkit/access-router-client test` from repo
root with ignored checkout-local TMPDIR, followed by NOA-05's fresh V3 checks.

Completion evidence:

- Coordinator reviewed the one-line expected root-engine change (`>=20` to `>=24`);
  all packed metadata assertions and runtime/engine policy are otherwise unchanged.
- Complete unfiltered client script passed: transitive build, all four typechecks,
  Node Vitest **45 files / 954 tests**, browser-config Vitest **1 file / 10 tests**,
  no failures/skips/todos. The existing browser phase is jsdom, not a real browser
  engine/version matrix. Formatting, preservation and whitespace checks passed.
- No production source, engine metadata, lockfile or earlier evidence changed.
  Exact diff, command, results and limits:
  [NOA-05-F02 handoff](../task-artifacts/access-router/20261103-153840-noa05-f2/handoff.md).
  Full root acceptance remains NOA-05's independent corrected-source gate.

## Shared verification and definition of done

Prerequisites: repository dependencies installed with `pnpm install`, repository
Node/pnpm versions from package metadata, and MongoDB memory-server support for
database-backed tests. Some packed-consumer checks also need registry/cache access.
Never present unavailable prerequisites as a passing or pre-existing baseline.

Before running checks that use `os.tmpdir()`, create a fresh ignored repository-local
`_tmp*` directory, verify it with `git check-ignore`, and set `TMPDIR` to its absolute
path at runtime. Recorded commands use `'<repo-root>/_tmp-<run-id>'`; substitute a
real checkout-local directory before execution. Preserve useful referenced evidence
according to `docs/task-artifacts/README.md`. Do not run these build/test commands
concurrently: they can rewrite the same transitive `dist/` files.

### V1 — focused checks after each owning task

Build first with `pnpm --filter @web-ts-toolkit/access-router... build`. During
NOA-01–NOA-03, select the newly added/migrated tests for that task, recording exact
commands and any transitional failures; do not claim an all-suite pass. After
NOA-04, run the complete operation matrix:

```sh
TMPDIR='<repo-root>/_tmp-<run-id>' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-baseline.contract.test.ts test/operation-access-variants.contract.test.ts test/operation-access-model-routes.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts test/operation-access-boundaries.integration.test.ts
```

Add focused new/captured/populate regression files selected by NOA-01/NOA-03 to
the recorded command. Keep existing filenames if renaming has no concrete benefit.

### V2 — package and installed-consumer gates

Run separately and serially from repo root:

```sh
TMPDIR='<repo-root>/_tmp-<run-id>' pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp-<run-id>' pnpm --filter @web-ts-toolkit/access-router test
```

The package suite includes strict consumer, shipped migration, and production-style
packed compatibility checks; update their assertions rather than bypassing them.

### V3 — final repository integration

Run `pnpm build`, `pnpm test`, and `pnpm lint` serially from repo root, with the same
checkout-local TMPDIR when applicable. Keep root test workspace concurrency at one.
Review the diff/content/links and run `git diff --check`. Verify new durable files
are not ignored. Any failed required gate needs an evidence-backed resolution or a
blocked status with its prerequisite, not a claim of completion.

Done means all tasks' criteria and required gates pass, breaking migration guidance
is shipped and describes implemented behavior, no flat-variant support remains,
and a new maintainer can execute the tests and understand the fallback without this
conversation. No unresolved maintainer decision is identified at task creation;
if characterization exposes a conflict with this contract, record it before changing
security behavior rather than silently guessing.

## Task-creation evidence

- Changed only this task and the explicitly planned section in
  `packages/access-router/MIGRATION.md`; implementation tasks remain pending.
- Runtime/build/type/packed checks: not run (documentation/planning deliverable).
- Verified from repo root: `pnpm exec prettier --check docs/tasks/20261103-082614-access-router-nested-operation-access.md packages/access-router/MIGRATION.md`
  and `git diff --check` pass. The initial formatting check identified unaligned new
  tables; those were corrected before the passing rerun.
- Read-only document checks pass: five pending task IDs and ordered dependencies,
  required task fields, local Markdown links and focused test references, no private
  identifiers/machine-local paths, and no trailing whitespace in either document.
  `git check-ignore --no-index` confirms both documents are not ignored.
- Existing executable TypeScript migration blocks are byte-for-byte unchanged;
  planned/historical examples added here are explicitly non-executable `text`
  blocks until NOA-04 adds target examples against implemented declarations.

## Implementation execution record

- The user authorized implementation by sequential subagents. Run one task agent at
  a time, in NOA-01 through NOA-05 order. The coordinator reviews actual changes and
  reported checks before accepting each handoff and starting the next dependency.
- NOA-05 must use a fresh review agent, not one of the NOA-01–NOA-04 implementers.
- At implementation start, the only worktree changes were this task and the planned
  `packages/access-router/MIGRATION.md` section created with it. Preserve both and
  any subsequently observed unrelated user work. No commits or pushes are requested.
- NOA-01's first invocation was interrupted by a usage limit after creating partial
  work. The same implementation session resumed and supplied its final handoff;
  NOA-02 did not start before that handoff was reviewed. No parallel task agents ran.
- Sequential execution completed: NOA-01, NOA-02, NOA-03, NOA-04, independent
  NOA-05 request-changes review, original admission owner F1 correction, separate
  client-test owner F2 correction, then the same independent reviewer's final
  corrected-source acceptance. The coordinator reconciled each handoff before
  advancing. No commits or pushes were made.
