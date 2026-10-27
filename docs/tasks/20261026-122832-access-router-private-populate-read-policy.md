# Access-router: configurable private-populate read admission and reference visibility

Created: 2026-10-26 12:28:32 local (`20261026-122832`, generated with `date +%Y%m%d-%H%M%S`).

Status: completed — PPR-01 through PPR-04 are completed; independent review and V1-V4 pass with no unresolved required finding.

## Objective and authorization

The user approved a runtime-owned flag for privileged virtual dependency loading:

```ts
api.setGlobalOptions({
  requireReadOperationAccessForPopulateDependencies: false,
});
```

Create this task record first, then implement its items using a fresh sub-agent for
each item, strictly sequentially, with coordinator review between handoffs and an
independent final reviewer. This record authorizes that execution; assignments are
not evidence that work or verification has already completed.

This is a new opt-in capability and intentional output-contract revision following
the completed [private populated dependencies phase](20261024-234103-access-router-virtual-populate-dependencies.md).
Preserve that phase's historical decisions and evidence. Its D1 gate and denied
population ID-fallback behavior describe the old contract; this record supersedes
them only within the scope below. No confirmed existing vulnerability is asserted.

## Fixed contract

### C1 — Runtime flag and captured configuration

- Add `GlobalOptions.requireReadOperationAccessForPopulateDependencies?: boolean`,
  default **true**, through the existing owning-runtime global option APIs.
- Only explicit boolean **false** enables bypass. Undefined/missing or malformed
  dynamic values must not accidentally enable it; follow surrounding validation
  conventions or normalize conservatively.
- True requires the captured target `operationAccess.read` before private loading.
  False bypasses that gate for declared private computation inputs. It does not
  grant public field, target operation, row, write, or query authority.
- Capture the flag coherently with source/target configuration and query intent
  before the first await. In-flight calls retain their mode, including nested
  output stages; later calls observe changes. Different runtimes remain isolated.
- Server configuration only: HTTP/root/client/service query options cannot switch
  it. Legitimate business fields with the same spelling keep ordinary data semantics.
- Target registration/schema validation and private field selection remain server
  declarations. `requireRegisteredPopulateModels` has its existing independent role.

### C2 — Private fetch policy

- Source/target field-level `permissionSchema` rules do not gate declared private
  inputs, as in the existing feature. Virtual output authorization still applies.
- With the flag false, do not execute `operationAccess.read` as a prerequisite for
  private loading. If only a virtual is output-eligible, no target operation check
  should be introduced solely for the private read.
- Private rows remain constrained by captured request-mode `baseFilter.read`,
  `overrideFilter.read`, and mandatory retained source reference IDs. These are
  **not bypassed** by the new flag. No private read-to-list fallback is introduced.
- Ordinary public populate match/access/related grants do not redefine private
  inputs. Compatible public/private fetches still union positive projections and
  deduplicate IDs; differing predicates/accesses/authority retain separate groups.
- Preserve batching, request/runtime concurrency limits and limit-one completion,
  original refs, declaration-specific fourth arguments, native-value isolation,
  terminal/nonrecursive private reads, and existing private/public error separation.

### C3 — Independent target-read output rule

For reference paths participating in an active selected/applicable
`dependsOnPopulate` plan, retain an explicit captured target-read visibility
decision separately from private fetch availability. Apply this rule in **both flag
modes**, regardless of the getter's result, omission, failure, or deferred denial:

| Source field / target read / original query                                          | Returned reference                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Source field unselected, excluded, or denied                                         | Omitted entirely                                       |
| Target caller-context base `read` operation denied                                   | Omitted entirely, **including its ID**                 |
| Source selected/permitted, target read allowed, ordinary populate requested/admitted | Original requested and authorized populated projection |
| Source selected/permitted, target read allowed, no ordinary populate                 | Exact original ID or array of IDs                      |

- The visibility gate uses the captured target base **read** rule and original
  actor/permissions, with existing exact/default/bare/runtime-default semantics.
  Ordinary descriptor list/custom access or a trusted public related operation grant
  does not override this additional dependency-reference read-visibility rule.
- This changes the old behavior that simply dropped denied populate descriptors
  and could retain IDs. Record an omission decision even without an ordinary
  populate descriptor; do not treat absent population as proof of read permission.
- Evaluate output-only gates only where reference output is potentially eligible;
  reuse captured strict-mode read admission when applicable rather than invoking
  an application guard twice for the same decision. Keep independent nested checks
  outside any one-shot captured admission context.
- Denied/failed visibility checks must never expose the field. Preserve ordinary
  public planning/query failure semantics and successful-write guarantees; private
  computation availability and reference visibility are distinct states.
- No active private plan means ordinary reference/populate behavior remains as
  before. Do not globally change unrelated references or no-feature configurations.
- Restoration uses exact retained refs/presence: scalar/array missing targets,
  nulls, duplicates, ordering and absence survive when restoration is allowed.

### C4 — Public/private separation and lifecycle

The getter's fourth argument is the only implicit private populated-input channel.
The first argument, snapshots, permission hooks, document handles, metadata and
ordinary decorate/decorateAll/task inputs retain their intended public/local views.
Only an authorized getter's deliberate return is computed output. Public selection
remains immutable; a readable but originally unrequested dependency is still hidden.
Keep public/private cache policy and mode ownership coherent, including errors.

Apply C1-C4 at shared seams for direct/root/trusted reads, read-to-list fallback,
create/update/upsert/new responses, ordinary populated/include targets, embedded
scopes, and dedicated subdocument list/read/mutation outputs. Preserve visibility
gates, operation/access triples, hydration materialization caveats and persistence.
No new caller hydration control, recursive population API, or writable virtual.

## Analysis coverage and current evidence

- Baseline HEAD: `21e0d70` (`feat: support private populated virtual dependencies`).
  Initial worktree has the unrelated untracked
  `docs/tasks/20261026-122137-moo-derived-fields.md`; preserve it and concurrent work.
- Read repository instructions, task conventions, the completed previous plan,
  current global option storage/types and the private loader/finalizer seams.
  No new build/runtime/typecheck/performance baseline was run for plan creation.
- `packages/access-router/src/interfaces/root.ts` (`GlobalOptions`) and
  `src/runtime.ts` (`AccessRuntime.globalOptions`, paths below relative to this
  package) currently expose/default `requireRegisteredPopulateModels`, not this flag.
- `src/acl/virtual-populate-dependencies.ts:250-285` captures target read operation
  and row policy with each dependency; `captureVirtualPopulateSnapshot` /
  `resolveVirtualPopulateDependencies` supply operation-owned terminal bindings.
- `src/acl/virtual-populate-execution.ts:364-405` currently always evaluates target
  read operation before row resolution. `request.available` combines these states;
  false prevents input availability and getter execution.
- `src/services/service.ts` (`genExecutionPopulate`, around 930) drops ordinary
  denied entries. `src/output/finalize-model-output.ts:720-739` restores refs when
  no public request is retained, without a separate target-read omission decision.
- Existing `test/virtuals-populate-dependencies.integration.test.ts:645-703` covers
  operation-denied private omission and old ID fallback, so those assertions need
  intentional contract updates together with new positive/negative cases.
- The prior phase has substantial cross-path/configuration/type/packed coverage.
  Existing results are context only, not verification of this revision. No exhaustive
  re-audit of every plugin, peer version, or downstream application is claimed.
- Focused task searches found no existing task for this flag or revised visibility.

## Scope and execution rules

Primary package is `packages/access-router`; shipped documentation, website
consistency and consumer fixtures are included. Downstream runtime/decorator build
and test integration is verification scope. Record any necessary production changes
outside that scope before editing. No dependency upgrades, publishing, commits,
staging, generated-output hand edits, or unrelated refactoring are requested.

P1 means required behavior/policy consistency before shipping; P2 means required
consumer/release-readiness work after core behavior. All tasks are mandatory.
Execute PPR-01 → PPR-02 → PPR-03 → PPR-04, one fresh sub-agent at a time. PPR-04
must be a reviewer other than the implementers. Do not spawn nested agents.
Update status before work and append exact verification evidence at completion.
Required follow-ups get new stable IDs and explicit dependencies/criteria; do not
mark the final review complete with a known required finding or failed gate.

Task-body `src/` and `test/` paths are relative to `packages/access-router` unless
qualified. Commands run from repository root unless stated. Requirements: Node >=22,
repository pnpm, installed dependencies and usable mongodb-memory-server
binaries; packed fixtures need registry access or an available cache.

Use ignored repository-local `_tmp-ppr` for temporary fixtures/logs. Verify the
parent and ignore rule before creation; replace quoted `<repo-root>` placeholders
before execution. Evidence contains repo-relative paths/placeholders, never local
absolute paths or full session identifiers. Preserve any concurrent worktree work.

Build/test commands run **serially**. Per-package scripts rebuild shared transitive
dist output; root tests use `--workspace-concurrency=1` and access-router Vitest
uses `fileParallelism: false`. Inspect active build/test processes before checks;
wait for concurrent owners rather than racing or stopping their processes.

### Verification gates

- **V1 — focused behavior:** fresh
  `pnpm --filter @web-ts-toolkit/access-router... build`, then
  `TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`.
  Replace test placeholders with actual affected/new suites and record exact
  commands. Establish meaningful before-fix failures for new behavior where practical.
- **V2 — source/integrity:**
  `pnpm --filter @web-ts-toolkit/access-router typecheck`, focused ESLint and
  Prettier on changed source/tests/Markdown; `git diff --check`, plus
  `git diff --no-index --check -- /dev/null <new-file>` for new untracked owned files.
- **V3 — package and installed API:**

  ```sh
  TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router test
  TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts test/documentation-examples.test.ts test/packed-consumer-compatibility.test.ts
  ```

  A fresh complete package run containing all four current consumer suites satisfies
  that second command; inspect their actual results instead of repeating unchanged
  work. Verify current generated `.d.ts`/`.d.mts` and transformed ESM/CJS consumers.
  Run `npm pack --dry-run` in `packages/access-router` for inventory, not as a
  substitute for installed-consumer tests. Website has a separate workspace: run
  `pnpm build` with working directory `website`, after its installed prerequisites.

- **V4 — final integration/review:** `pnpm build` and `pnpm lint` at root;
  `TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router-runtime test`
  and
  `TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router-deco test`
  serially. Confirm current V2/V3 cover final changes; reuse applicable exact fresh
  evidence. These scoped integration gates cover the changed server option/runtime
  boundary; broaden to other workspace tests if review establishes additional impact.
  Do not treat prior phase's whole-workspace results as results of this revision.

## Tasks

### Task PPR-01: Add the runtime option and immutable mode capture

Status: completed

Kind: improvement

Priority: P1 — a server-only opt-in must be typed, conservative, runtime-owned and stable across awaits.

Suggested agent: fresh configuration/snapshot implementer.

Dependencies: none.

Primary ownership: `src/interfaces/root.ts`, `src/runtime.ts`, dependency/config
capture helpers, and focused configuration/strict consumer fixtures.

Finding: no runtime option exists, and private dependency plans have no captured
choice of operation admission mode. See `GlobalOptions`, runtime defaults, and
`captureVirtualPopulateDependencies` / `captureModelAuthorizationConfiguration`.

Requirements:

1. Implement C1's exact property/default through existing global setters/getters.
2. Capture its value before awaits in the operation-owned dependency policy,
   including related/embedded/child snapshots, without putting policy on DTOs.
3. Verify types, default/true/false, conservative malformed dynamic values,
   setter forms, runtime isolation and in-flight versus later call ownership.
4. Keep the flag out of HTTP/client/query controls and persisted model typing.

Acceptance criteria:

- Typed installed consumers discover the boolean global option and reject nonboolean
  typed inputs/query use. Default capture is strict; only explicit false opts in.
- Changing globals during a suspended operation changes later captures only.
- Existing private descriptor validation, registration and snapshot tests pass.

Verification: V1 focused configuration/snapshot tests, relevant strict consumer
cases, and V2. Public behavior switch belongs to PPR-02; document its exact handoff.

Implementation and verification (PPR-01):

- Added the exact optional boolean to `GlobalOptions` with shipped JSDoc and a
  built-in true default. Whole-record/exact setters, their `api.set` aliases and
  bare runtime setters normalize supplied undefined/malformed values to true;
  only primitive false opts in. Omitted properties preserve shallow assignment.
- Internal handoff: `resolveVirtualPopulateDependencies(...)` returns
  `dependency.target.configuration.requireReadOperationAccessForPopulateDependencies`,
  a captured boolean alongside the terminal target read/row policy. Source
  `AuthorizationConfiguration` carries the same property. PPR-02 must consume
  this retained value; the private executor still always checks target read here.
- `modelServiceGlobalOptions` captures the owning runtime globals once before
  related target capture/source hooks. The same snapshot feeds source, terminal
  dependencies, recursive include/populate targets and dedicated child output
  copies. Embedded finalization retains that source snapshot/token. Ordinary
  populate planning uses captured target names/registration posture; canonical
  target finalization uses its held model binding rather than a late registry read.
- No DTO/handle/query capability, per-model flag, getter signature or public output
  grant was added. Private static-ref registration/selection validation remains
  eager and independent of `requireRegisteredPopulateModels`.
- Owned files (package-relative): `src/interfaces/root.ts`, `src/runtime.ts`,
  `src/acl/model-output-planning.ts`, `src/acl/model-service-owner.ts`,
  `src/acl/related-execution.ts`, `src/acl/service-authorization.ts`,
  `src/acl/subdocument-output.ts`, `src/acl/virtual-populate-dependencies.ts`,
  `src/services/service.ts`, `test/private-populate-read-policy.config.test.ts`,
  `test/private-populate-read-policy.types.fixture.ts`,
  `test/strict-consumer-types.test.ts`, plus this record.
- Before-feature evidence: fresh
  `pnpm --filter @web-ts-toolkit/access-router... build` succeeded, then
  `TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/private-populate-read-policy.config.test.ts`
  produced **15 failed / 1 passed**, proving absent default/capture/normalization.
  Logs: `_tmp-ppr/ppr01-before-build.log`, `_tmp-ppr/ppr01-before-config.log`.
- Fresh implementation closure build succeeded (`_tmp-ppr/ppr01-build.log`).
  `pnpm --filter @web-ts-toolkit/access-router typecheck` then rebuilt the closure
  and passed source `tsc --noEmit -p tsconfig.typecheck.json`
  (`_tmp-ppr/ppr01-typecheck.log`); all following dist/consumer tests use that build.
- Final V1:
  `TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/private-populate-read-policy.config.test.ts test/virtuals-populate-dependencies.config.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts test/virtuals-config.contract.test.ts`
  — **4 files / 124 tests passed**, zero failed/skipped/todo
  (`_tmp-ppr/ppr01-config-snapshots-final.log`). New coverage includes both mode
  directions, frozen/derived/child/related copies, globals replaced during target
  capture and awaited hooks, later same-service calls, malformed JS values,
  runtime isolation, spoofed caller/model controls and same-spelled business data.
- Related seam regressions:
  `TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.integration.test.ts test/virtuals-populate-dependencies.intent.test.ts test/virtuals-populate-include.integration.test.ts test/service-authorization-related.integration.test.ts test/subdocument-populate-authorization.integration.test.ts`
  — **5 files / 186 tests passed**, zero failed/skipped/todo
  (`_tmp-ppr/ppr01-related-regressions.log`).
- Installed declaration consumers:
  `TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts -t 'PPR-01|DPV-01|SVA-10'`
  — **9 passed / 20 filtered skips**, zero failed/todo
  (`_tmp-ppr/ppr01-strict-consumers-final.log`). Root/advanced exports resolve
  the optional boolean and JSDoc from emitted `.d.ts`/`.d.mts`; strict Bundler,
  NodeNext ESM/CJS consumers reject nonboolean and model/query/wire controls.
- Intermediate corrections: the first post-change behavior run had **2 failed /
  120 passed** because the new legacy-include fixture omitted required join
  fields; supplied `localField`/`foreignField` and retained two actual source
  captures. The first strict run had **3 failed / 6 passed / 20 filtered skips**
  because its business fixture put `filter` in `FindArgs`; corrected to the
  separate `Filter` argument type. These were fixture corrections, with fresh
  passing reruns above (`ppr01-config-snapshots.log`, `ppr01-strict-consumers.log`).
- V2 passed: focused ESLint on all 12 owned source/test files; Prettier on those
  files and this record (13 files); `git diff --check`; and
  `git diff --no-index --check -- /dev/null <file>` separately for this record and
  the two new owned fixtures. Initial Prettier checking identified two long calls
  in the config fixture; formatting corrected and checking passed. Exact focused
  commands (brace expansion names only the owned files listed above):

  ```sh
  node_modules/.bin/eslint packages/access-router/src/{interfaces/root,runtime,acl/{model-output-planning,model-service-owner,related-execution,service-authorization,subdocument-output,virtual-populate-dependencies},services/service}.ts packages/access-router/test/{private-populate-read-policy.config.test,private-populate-read-policy.types.fixture,strict-consumer-types.test}.ts
  node_modules/.bin/prettier --check packages/access-router/src/{interfaces/root,runtime,acl/{model-output-planning,model-service-owner,related-execution,service-authorization,subdocument-output,virtual-populate-dependencies},services/service}.ts packages/access-router/test/{private-populate-read-policy.config.test,private-populate-read-policy.types.fixture,strict-consumer-types.test}.ts docs/tasks/20261026-122832-access-router-private-populate-read-policy.md
  git diff --check
  git diff --no-index --check -- /dev/null packages/access-router/test/private-populate-read-policy.config.test.ts
  git diff --no-index --check -- /dev/null packages/access-router/test/private-populate-read-policy.types.fixture.ts
  git diff --no-index --check -- /dev/null docs/tasks/20261026-122832-access-router-private-populate-read-policy.md
  ```

- Process checks found no competing repository builds/tests before checks; commands
  were serialized. `_tmp-ppr` parent/ignore rule was verified before creation.
  Concurrent moo task/source/new test files and the prior-phase cross-link are
  preserved. PPR-02 through PPR-04 remain pending; no PPR-01 environment blocker.

### Task PPR-02: Separate privileged private loading from reference visibility

Status: completed

Kind: improvement

Priority: P1 — bypassing internal admission must not create public field or ID exposure.

Suggested agent: fresh executor/finalizer implementer.

Dependencies: PPR-01.

Primary ownership: `src/acl/virtual-populate-execution.ts`, shared plan/target state,
`src/output/finalize-model-output.ts`, narrow service/subdocument handoffs, and
feature-enabled runtime/authorization/parity/performance regressions.

Finding: current dependency execution always checks read admission and output has
only public-populate-present versus restore-ref state. C2/C3 require independent
private availability and target-read output decisions.

References: `executeVirtualPopulateBatch`, `readVirtualPopulateInputs`,
`hasVirtualPopulatePublicReference`, `genExecutionPopulate`, and `finalizeSingleDoc`.

Requirements:

1. Use the captured flag: true retains strict private admission, false bypasses
   only the operation gate; preserve row/transform/ID constraints and field inputs.
2. Capture/retain independent read visibility and omit entire denied reference
   paths before final output handles/presentation, in both flag modes. Preserve
   exact allowed restoration and authorized public selection union.
3. Share appropriate read-gate evaluation and compatible fetches without allowing
   public related grants/list access to override the new caller-read output rule.
   No late mutable lookup, ambient guard leak, or cache/mode authority confusion.
4. Cover the supported direct/root/trusted/mutation/template/related/include/
   embedded/dedicated-child seams under both hydration modes, including denied
   virtuals, missing/null/array refs, guard errors, live changes and query failures.
5. Preserve ordinary/no-active-plan behavior and documented public/private hook,
   context, metadata, persistence and scheduler boundaries. Update tests asserting
   old active-dependency denied-ID fallback explicitly; do not weaken unrelated cases.

Acceptance criteria:

- False + denied target read: virtual computes from permitted private rows, but
  no reference object or ID is returned; true + same denial: virtual and ref omitted.
- False + virtual-only selection performs no operation guard merely for private
  loading. Row/transform terminal denial still stops target I/O in either mode.
- Read-allowed public population returns only original allowed fields; no public
  population restores exact refs; parent denial/unselection always omits the field.
- Guard/context/snapshot/error regressions prove no double admission or unintended
  nested capture. Batched query counts/concurrency remain bounded with union sharing.
- Existing no-feature and unrelated references preserve their response contracts.

Verification: V1 new behavior regressions and affected prior DPV integration,
operation-guard, capture-boundary, intent, parity, traversal and performance suites;
relevant operation-access/subdocument/visibility regressions; V2.

Implementation and verification (PPR-02):

- Production ownership is limited to `src/acl/virtual-populate-execution.ts` and
  `src/output/finalize-model-output.ts`. The executor consumes PPR-01's captured
  terminal target boolean. False skips only private operation admission; the
  existing request row resolver/cache, transforms, mandatory original IDs and
  positive fetch unions remain in use. Compatible raw work also compares the
  captured mode, preserving cache/group ownership.
- Every active row/embedded occurrence retains its reference-to-captured-target
  binding independently of private fetch availability. A batch-owned promise map
  retains each caller-context base-read guard result, evaluated through the
  existing validator and shared hook gate with captured permissions and the
  original request. Strict private admission and output visibility share that
  decision. False-mode visibility is lazy, after source output selection and field
  authorization; unselected/denied/absent refs cause no output-only guard.
- The shared finalizer applies that visibility decision before reference copying
  and document-output association. A denied/failed decision omits the entire
  field, including ordinary list/custom/granted populations. Allowed output keeps
  the original public target DTO or exact retained reference slots. Row denial,
  private query failure and getter failure/deferred denial cannot turn an absent
  read grant into ID fallback. Private-only guard errors remain fail-closed output
  decisions and cannot fail a completed write. No operation/field/handle authority
  or private data channel was added to public outputs/hooks/metadata.
- Owned regressions: new `test/private-populate-read-policy.runtime.test.ts` and
  changes to `test/virtuals-populate-dependencies.{integration,operation-guards,parity,performance}.test.ts`.
  Old active-plan denied-ID/related-grant assertions now explicitly state PPR-02's
  intentional contract change; no-feature assertions retain ordinary ID fallback.
  Both modes cover exact/default/bare/runtime/custom guards, source document grants,
  row/transform/tenant/original-ID constraints, getter/query/guard errors, local
  snapshots/handles, arrays/null/absence/misses/duplicates, per-call mode changes,
  runtime isolation, fallback, direct/root/trusted reads and writes/templates,
  populated/include cached copies, embedded scopes and dedicated child outputs.
- Before-fix evidence: fresh
  `pnpm --filter @web-ts-toolkit/access-router... build` succeeded, followed by
  `TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/private-populate-read-policy.runtime.test.ts`
  — **36 failed / 20 passed**, proving denied reference leakage and absent false-mode
  computation before the executor/finalizer change. Logs:
  `_tmp-ppr/ppr02-before-build.log`, `_tmp-ppr/ppr02-before-runtime.log`.
  The initial implementation passed all **56** then-current new tests
  (`_tmp-ppr/ppr02-runtime-initial.log`).
- Intermediate corrections are not final passing evidence: the first eight-suite
  regression attempt exceeded its 120-second command timeout before a summary;
  completed output showed **3 integration + 40 operation-guard** old-contract
  assertion failures (`_tmp-ppr/ppr02-dpv-initial.log`). Updated only active-plan
  expectations, then all **8 files / 536 tests passed**
  (`_tmp-ppr/ppr02-dpv-revised.log`). A later expanded run produced **6 failed /
  436 passed**: the new false-mode custom-access cases correctly kept public custom
  and private read queries separate, while their inherited count expected one.
  Corrected those counts to two, preserving the authority separation
  (`_tmp-ppr/ppr02-expanded.log`).
- Fresh final closure build passed:
  `pnpm --filter @web-ts-toolkit/access-router... build`
  (`_tmp-ppr/ppr02-build.log`). Source typecheck also passed on the same final
  production source: `pnpm --filter @web-ts-toolkit/access-router typecheck`, including
  its closure rebuild and `tsc --noEmit -p tsconfig.typecheck.json`
  (`_tmp-ppr/ppr02-typecheck.log`).
- Final V1 policy/DPV command below passed **14 files / 914 tests**, zero
  failed/skipped/todo (`_tmp-ppr/ppr02-policy-dpv-final.log`):

  ```sh
  TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/private-populate-read-policy.runtime.test.ts test/private-populate-read-policy.config.test.ts test/virtuals-populate-dependencies.config.test.ts test/virtuals-populate-dependencies.integration.test.ts test/virtuals-populate-dependencies.operation-guards.test.ts test/virtuals-populate-dependencies.intent.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts test/virtuals-populate-dependencies.fallback.test.ts test/virtuals-populate-dependencies.parity.test.ts test/virtuals-populate-dependencies.traversal.test.ts test/virtuals-populate-dependencies.performance.test.ts test/virtuals-populate-dependencies.review.test.ts test/virtuals-populate-dependencies.dispatch.test.ts test/virtuals-populate-dependencies.planner.test.ts
  ```

- Final affected operation/visibility command below passed **13 files / 619 tests**,
  zero failed/skipped/todo (`_tmp-ppr/ppr02-visibility-regressions.log`):

  ```sh
  TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-baseline.contract.test.ts test/operation-access-variants.contract.test.ts test/operation-access-boundaries.integration.test.ts test/operation-access-model-routes.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts test/service-authorization-related.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/virtuals-finalizer.unit.test.ts
  ```

- Measured performance cases now run both flag modes and hydration modes, with
  limits one/two and 1/24 source rows. Each compatible target model still uses one
  query with deduplicated IDs/union projections. Persistence/hook peaks remain
  bounded; two ordinary descriptor guards plus strict admission for two target
  models total four checks, versus three in false mode (one visible target-read
  check and no output-only check for the hidden private target). These counts do
  not grow with rows/getters. No private target recursion/finalization was observed.
- V2 passed: focused ESLint (7 owned source/test files), Prettier (those 7 and
  this record), tracked diff whitespace and both new owned untracked files.
  Logs: `_tmp-ppr/ppr02-eslint-final.log`, `_tmp-ppr/ppr02-prettier-final.log`.
  Exact integrity commands:

  ```sh
  node_modules/.bin/eslint packages/access-router/src/acl/virtual-populate-execution.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/test/{private-populate-read-policy.runtime.test,virtuals-populate-dependencies.integration.test,virtuals-populate-dependencies.operation-guards.test,virtuals-populate-dependencies.parity.test,virtuals-populate-dependencies.performance.test}.ts
  node_modules/.bin/prettier --check packages/access-router/src/acl/virtual-populate-execution.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/test/{private-populate-read-policy.runtime.test,virtuals-populate-dependencies.integration.test,virtuals-populate-dependencies.operation-guards.test,virtuals-populate-dependencies.parity.test,virtuals-populate-dependencies.performance.test}.ts docs/tasks/20261026-122832-access-router-private-populate-read-policy.md
  git diff --check
  git diff --no-index --check -- /dev/null packages/access-router/test/private-populate-read-policy.runtime.test.ts
  git diff --no-index --check -- /dev/null docs/tasks/20261026-122832-access-router-private-populate-read-policy.md
  ```

- `_tmp-ppr` already existed; verified parent with `ls -d . _tmp-ppr` and ignored
  status with `git check-ignore _tmp-ppr/probe.log` before writing logs. Inspected
  processes before build/test groups, kept own build/test commands serialized and
  resumed checks after observed external moo consumer work cleared. Prior PPR-01
  edits and concurrent moo task/source/tests/docs/packaging work are preserved.
  No environment blocker or unresolved runtime failure remains for PPR-02.
- PPR-03 handoff: full package V3, current installed/packed consumers, new false-mode
  packed scenarios, public docs/JSDoc/website and pack inventory were **not run or
  revised** by PPR-02. The inspected old packed runtime fixture
  `test/virtuals-populate-dependencies.consumer.runtime.fixture.ts:102-106` denies the
  source reference before its target-read denial, so its existing `{}` assertion
  remains correct; extend it with a selected/permitted reference and actual bypass
  computation. Update the old denied-ID prose for active plans and explain the new
  precedence over related grants/list access. PPR-04 owns V4 integration/review.
- Independent review hotspots: captured terminal target identity across derived
  related/embedded/child plans and cached DTO copies; lazy deferred source-field
  eligibility; reuse of strict read decisions after row/query failure; ordinary
  admission versus the additional base-read visibility gate; mode/cache ownership;
  and limit-one nested guard/error behavior. The final two nonoverlapping runtime
  commands above cover **27 files / 1,533 passing tests**, not the full package.

### Task PPR-03: Document the revised contract and verify published consumers

Status: completed

Kind: improvement

Priority: P2 — apps must explicitly discover the opt-in and the intentional output-tightening change.

Suggested agent: fresh public-surface/documentation and consumer implementer.

Dependencies: PPR-02.

Primary ownership: shipped JSDoc, README and llms, website configuration/hooks,
strict/export/docs/real packed consumer fixtures and scoped compatibility fixes.

Finding: existing docs require target read for all private loads and describe ID
fallback after denied population. This needs precise revision, not an unqualified
statement that the flag bypasses every authorization dimension.

Requirements:

1. Document default true, false opt-in, server/runtime capture, private field versus
   operation versus row authority, all C3 output shapes and active-plan scope.
2. Include runnable denied-target examples proving private computation + omitted
   reference; show allowed public population and exact ID restoration controls.
3. Add release/compatibility guidance for denied-reference removal even in default
   mode, and its precedence over public related-operation grants/list descriptors.
4. Verify emitted root/advanced types and actual packed ESM/CJS behavior, strict
   NodeNext/Bundler consumers and documented example compilation. Preserve existing
   `dependsOnPopulate` declaration/typing, registration and hydration limitations.

Acceptance criteria:

- Installed users can configure the flag and predict private computation/public
  field visibility from shipped docs alone. Examples and runtime agree.
- Full server suite and installed-consumer cases pass; current declarations expose
  only intended global configuration, with no wire/query/DTO authority addition.
- Website build and pack inventory pass; no new package entrypoint is required.

Verification: V2/V3 and actual generated declaration review. Record results and
handoff any final-review hotspots; no historical passing counts substitute for checks.

Implementation and verification (PPR-03):

- Updated shipped README/llms, root `GlobalOptions` and virtual-dependency JSDoc,
  and website configuration/hooks to match the actual executor/finalizer. They
  document default true/literal-false opt-in, conservative malformed-JS handling,
  typed runtime setters/snapshots, capture before awaits/nested output and runtime
  isolation. False bypasses only private operation admission; declared input-field
  authority, virtual output authorization, request read-row filters and retained
  IDs remain distinct. Both-mode reference omission/population/exact-ID rules,
  active-plan scope and precedence over list/custom/related operation grants are
  explicit. The shipped README records the intentional default-mode denied-ID
  tightening that supersedes the previous D1 contract in this scope.
- Preserved registration/static-ref/selection, local/public views, optional typed
  fourth argument with `populated = {}`, native isolation and hydration caveats.
  The new flag is explicitly independent of `requireRegisteredPopulateModels`.
  PPR-03 production edits are JSDoc only; no runtime policy discrepancy required
  a production correction or new entrypoint/client control.
- The exact runnable README keeps its existing source-denied/read-false `{}`
  assertion and adds selected/permitted-source false-mode computation with no
  reference/ID, strict-mode denial, list-populate precedence and both-mode allowed
  public-mask/exact-ID controls. The installed array fixture exercises these modes
  in both lean/hydrated configurations, with missing/out-of-scope IDs, nulls,
  duplicates/order, source denial/unselection, immutable global snapshots, runtime
  isolation, conservative dynamic string input and unchanged stored refs. Getter
  values/call counts are asserted through real Mongo/HTTP consumers.
- Extended declaration export checks to inspect the optional boolean and policy
  hover through root/advanced `.d.ts`/`.d.mts`, and verify no model/root/child option
  addition. Documentation checks compile the actual emitted GlobalOptions hover
  example through all four entries/conditions. Packed consumers now also compile
  PPR-01's runtime-option boundary fixture, including its negative wire/query cases.
- Owned files: `packages/access-router/{README.md,llms.txt}`,
  `packages/access-router/src/interfaces/{root,router-hooks}.ts`,
  `packages/access-router/test/{documentation-examples.test,export-contract.test,packed-consumer-compatibility.test,virtuals-populate-dependencies.consumer.runtime.fixture}.ts`,
  `website/docs/packages/access-router/{configuration,hooks}.mdx`, and this record.
  PPR-01/PPR-02 changes, their strict fixture, prior-phase history/cross-link and
  concurrent moo work are preserved.
- Fresh closure build and source typecheck passed, serialized:
  `pnpm --filter @web-ts-toolkit/access-router... build`
  (`_tmp-ppr/ppr03-build.log`), then
  `pnpm --filter @web-ts-toolkit/access-router typecheck`
  (`_tmp-ppr/ppr03-typecheck.log`, including its closure rebuild and source
  `tsc --noEmit -p tsconfig.typecheck.json`). Reviewed current root/advanced
  declaration exports and the generated shared `parsers-BXKoUKMa.d.ts`/`.d.mts`
  GlobalOptions/virtual declarations: boolean optionality, JSDoc/example and
  fourth-argument signature survive. Generated output was not hand-edited.
- Intermediate failure: the initial complete V3 command
  `TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router test`
  finished **131 passed / 1 failed files; 3,747 passed / 4 failed tests**
  (`_tmp-ppr/ppr03-package-test.log`). All four failures were strict TS7022 in
  the new packed fixture's saved loop counter, in ESM/CJS across both peer/layout
  matrices. Added an explicit numeric counter annotation; no policy assertion was
  weakened. The isolated recheck below passed **1 file / 10 tests**, zero
  failed/skipped/todo (`_tmp-ppr/ppr03-packed-recheck.{log,json}`):

  ```sh
  TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/packed-consumer-compatibility.test.ts --reporter=default --reporter=json --outputFile='<repo-root>/_tmp-ppr/ppr03-packed-recheck.json'
  ```

- Final complete V3 run on the final implementation passed **132 files / 3,751
  tests**, zero failed/skipped/todo, in **1,136.20 seconds**. Its script rebuilt
  the closure first. Logs/results: `_tmp-ppr/ppr03-package-final.{log,json}`.
  Exact command:

  ```sh
  TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router test --reporter=default --reporter=json --outputFile='<repo-root>/_tmp-ppr/ppr03-package-final.json'
  ```

  Inspected all four current consumer suites in that run: strict types **29**,
  export contract **45**, documentation examples **54**, packed compatibility
  **10** (all passed). This satisfies V3's second consumer command without a
  duplicate unchanged run. The actual transformed tarballs and actual build-artifact
  package tree both pass ESM/CJS execution and strict Bundler/NodeNext compilation
  with minimum Express **5.0.0** / Mongoose **8.0.0** and current **5.2.1** / **9.8.0**.
  Current peers check the full installed declaration graph (`skipLibCheck: false`);
  minimum peers retain the existing peer-internal declaration skip. The exact shipped
  README and both-hydration array workflow execute through each installation/module
  matrix; these are behavior assertions, not documentation string-only evidence.

- `npm pack --dry-run`, working directory `packages/access-router`, passed:
  **17 files**, **555.0 kB** packed / **2.7 MB** unpacked, including README/llms,
  all three public JS/declaration entrypoints and shared declaration chunks
  (`_tmp-ppr/ppr03-pack-dry-run.log`). This inventory complements the real
  transformed/installed-consumer checks above.
- `pnpm build`, working directory `website` (its separate workspace), passed
  client/server compilation and static generation
  (`_tmp-ppr/ppr03-website-build.log`). No website or environment blocker remains.
- Final V2 focused ESLint (6 owned source/test files), Prettier (10 owned
  source/test/docs files plus this record) and whitespace checks passed. Initial
  Prettier checking caught README table spacing and two long test expressions;
  corrected before verification. Logs: `_tmp-ppr/ppr03-eslint-final.log`,
  `_tmp-ppr/ppr03-prettier-final.log`. Exact integrity commands:

  ```sh
  node_modules/.bin/eslint packages/access-router/src/interfaces/{root,router-hooks}.ts packages/access-router/test/{export-contract.test,documentation-examples.test,packed-consumer-compatibility.test,virtuals-populate-dependencies.consumer.runtime.fixture}.ts
  node_modules/.bin/prettier --check packages/access-router/src/interfaces/{root,router-hooks}.ts packages/access-router/README.md packages/access-router/llms.txt packages/access-router/test/{export-contract.test,documentation-examples.test,packed-consumer-compatibility.test,virtuals-populate-dependencies.consumer.runtime.fixture}.ts website/docs/packages/access-router/{configuration,hooks}.mdx docs/tasks/20261026-122832-access-router-private-populate-read-policy.md
  git diff --check
  git diff --no-index --check -- /dev/null docs/tasks/20261026-122832-access-router-private-populate-read-policy.md
  ```

- Verified `_tmp-ppr` parent/ignore rule before fixtures/logs. Inspected processes
  before build/test groups; observed external moo source checking had cleared before
  shared closure builds, and all owned build/test commands ran serially. No new
  dependency, staging, commit or publication was performed.
- PPR-04 remains pending and owns V4's root build/lint and runtime/decorator package
  integration, plus independent policy review. Review hotspots remain lazy captured
  target-read visibility after source-field authorization, strict-guard reuse versus
  private row/query/getter failure, nested/derived target identities, original actor
  context/related-grant precedence, and mode/cache ownership. The full final V3
  evidence applies to current source; rerun affected gates if review changes it.

### Task PPR-04: Independently review policy separation and final integration

Status: completed

Kind: investigation

Priority: P1 — acceptance requires actual denial/privilege separation across output paths.

Suggested agent: fresh independent reviewer, different from all implementers.

Dependencies: PPR-01, PPR-02, PPR-03.

Primary ownership: full scoped diff/acceptance audit, meaningful review probes,
integrated gates and this record; substantive corrections go to fresh follow-up owners.

Requirements:

1. Verify C1-C4 against actual runtime, types/docs and all task evidence, especially
   captured mode/guard defaults, cache ownership, denied ID removal, public grant
   precedence, field-only bypass, row constraints, missing/error and nested paths.
2. Confirm original actor/context, one-shot admission boundaries and source fallback
   capture are preserved; add focused adversarial regressions for material gaps.
3. Run V4; confirm V2/V3 evidence applies to final source. Reopen or add required
   follow-ups for reproduced findings, then independently review their corrections.
4. Reconcile statuses, preserved baseline/concurrent work and definition of done;
   report exact passing/failing/skipped/todo counts and any true environment blocker.

Acceptance criteria:

- No unresolved required finding, failed/incomplete gate or silent scope reduction.
- False affects private operation admission only; denied reference values never
  survive final reconstruction, while authorized virtual results remain available.
- Final types/docs/runtime and affected downstream integration agree; actual
  independent review is recorded without session identifiers.

Verification: V4 and final V2/V3 evidence, focused review regressions, full changed
file/status/dependency audit. Mark overall complete only after these criteria pass.

Independent review and verification (PPR-04):

- Set PPR-04 in_progress before review. Read the full fixed C1-C4/task/evidence
  record, root `AGENTS.md` and `ai-friendly-ts-package`. Independently inspected the
  complete scoped production diff and actual source, tracked test/docs diffs and
  all three pre-existing untracked PPR fixtures. PPR-02 changes only the executor
  and finalizer; PPR-01's broader configuration/dispatch/related/child propagation
  was reviewed independently as well. No implementer summary substituted for source.
- **Disposition: accepted, no substantive finding or corrective task required.**
  C1's primitive-false normalization/default and server-only type/configuration
  boundary agree. One source global snapshot feeds terminal dependency, ordinary
  target, embedded and dedicated output captures; derived executions retain it.
  Actual target model bindings and original captured permissions survive awaits,
  output-cache copies and runtime boundaries. Later independent captures see updates.
- C2/C3 retain distinct operation decisions, private row availability and ordinary
  public authority. The new guard map is batch/captured-target-owned; strict private
  admission is reused for visibility, including after row/query failure. False
  private loading still resolves request read transforms/base scope and mandatory
  IDs, without an operation prerequisite. Output-only checking occurs after source
  selection/actual field authorization, uses the held caller-base-read rule, and
  cannot inherit list/custom/related operation grants. Final reconstruction omits
  denied refs before copying/association; allowed restoration uses retained slots,
  and admitted public population keeps its original mask.
- Reviewed compatible-query/family caches, predicate comparison and ID/projection
  coverage against the actual executor and measured tests: flag, runtime, model,
  schema, access, request-row semantics, predicates and capture ownership remain
  separate. Null/empty/absent/default refs, embedded arrays, repeated targets and
  multiple virtuals retain existing materialization/ordering behavior. No active
  plan preserves ordinary reference behavior. C4's fourth-argument-only private
  channel, public/local hooks/snapshots/metadata/handles, deliberate authorized
  virtual returns, mutation-row visibility before getters and successful-write behavior agree.
- Inspected the complete reconstruction graph through `finalizeDirectOutput`,
  `include-output`, document-authorization transfer and public presentation. Accepted
  existing boundary: an independently produced, authorized include value may reuse
  a source reference's output path; it has separate attachment provenance and is
  not the retained source ID or a private populated value. Successful read/list/count
  attachments remain ordinary output; misses and terminal denied include reads
  cannot restore the omitted source ref. This is covered by retained probes below,
  not inferred from path spelling. Trusted presentation can deliberately construct
  output as already documented; no new second authorization pass is claimed.
- Prior DPV one-shot include admission still consumes capture before application
  guards, and conditional list fallback retains source capture. Independent nested
  Core/service checks do not receive that admission. Pure field/output helpers still
  filter existing values without private I/O or the execution-only visibility gate.
  Reviewed direct/root/trusted, fallback, mutation/template, related/include, embedded
  and dedicated-child seams against their actual source and current regression cases.
- Added `packages/access-router/test/private-populate-read-policy.review.test.ts`
  (**32 cases**, both hydration modes). New adversarial coverage proves deferred
  function source denial adds no false-mode output guard, deferred grants use the
  captured target rule despite live global/target updates, two private masks/native
  Date mutations remain isolated while sharing one query, a one-shot read decision
  is not rerun after row/query failure, and final include collisions preserve only
  actual produced attachment provenance without source IDs or private fields.
- Fresh V1 supplement, using current rebuilt output from V4 below:

  ```sh
  TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/private-populate-read-policy.review.test.ts test/private-populate-read-policy.runtime.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts --reporter=default --reporter=json --outputFile='<repo-root>/_tmp-ppr/ppr04-focused.json'
  ```

  **3 files / 134 tests passed**, zero failed/skipped/todo: new review **32**,
  policy runtime **88**, retained prior capture-boundary review **14**. Duration
  **24.89 seconds**; `_tmp-ppr/ppr04-focused.{log,json}`. No behavior failure or
  production correction was needed. Subsequent test edits were formatting only.

- Fresh V4 commands completed in sequence (root build, root lint, runtime test,
  decorator test; final root lint repeated after adding the review fixture):

  ```sh
  pnpm build
  pnpm lint
  TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router-runtime test
  TMPDIR='<repo-root>/_tmp-ppr' pnpm --filter @web-ts-toolkit/access-router-deco test
  pnpm lint
  ```

  Root build and both lint runs **passed**, with no unrelated blocking error.
  Runtime: **12 files / 135 tests passed**, **171.13 seconds**. Decorator:
  **20 files / 646 tests passed**, **71.23 seconds**, including its source typecheck.
  Both package commands rebuilt their transitive closures; zero failed/skipped/todo.
  Logs: `_tmp-ppr/ppr04-root-build.log`, `_tmp-ppr/ppr04-root-lint.log`,
  `_tmp-ppr/ppr04-runtime-test.log`, `_tmp-ppr/ppr04-deco-test.log`,
  `_tmp-ppr/ppr04-root-lint-final.log`.

- Independently inspected PPR-03's actual final JSON/log and all current consumer
  results: **132 files / 3,751 passed**, zero failed/skipped/todo. The four suites
  are strict **29**, exports **45**, docs **54**, packed **10** = **138** passing
  consumer checks. Audited packed fixture extraction, actual publisher/artifact
  installation, ESM/CJS execution and Bundler/NodeNext compilation across minimum
  and current peers; current peers check the full declaration graph. PPR's fixture
  covers literal-false/strict controls, source denial/unselection, list precedence,
  allowed public masks/exact arrays, malformed values and runtime isolation.
- Read current root/advanced `.d.ts`/`.d.mts` export aliases and the shared generated
  declaration's optional boolean, JSDoc/example and private getter types. Metadata,
  all three entrypoints, build configuration and installed import forms agree.
  Actual PPR-03 source typecheck, website build and **17-file** pack inventory logs
  were inspected and reused. The evidence audit verified all **28** pre-review
  changed PPR package/website files predate the final V3 start; none changed during
  this review. `_tmp-ppr/ppr04-evidence-audit.log` records parsed totals/freshness.
  These valid unchanged V2/V3 checks plus the new focused suite cover final source;
  no duplicate full-package/consumer/website run was necessary.
- Final V2 passed: root ESLint includes the new fixture; focused Prettier on that
  fixture and this record; `git diff --check`; and separate
  `git diff --no-index --check -- /dev/null <file>` for this record and all four
  untracked owned fixtures. Initial reviewer-fixture Prettier checking requested
  multiline test declarations; formatting was corrected. Existing source/docs V2
  evidence remains applicable. Logs: `_tmp-ppr/ppr04-prettier-review.log` and
  `_tmp-ppr/ppr04-prettier-final.log`.
- Scoped change/status audit: **12 production source files, 13 test/fixture files,
  four shipped/website docs and two task records** (31 paths, including the new
  review fixture). Production ownership is the union of PPR-01/PPR-02/PPR-03 above;
  this reviewer changed only the new review fixture and this record. Prior D1
  history remains intact with its phase cross-link. Concurrent moo task/source/
  tests/packaging/website changes are preserved and are not PPR-owned. The index
  remains empty. No nested agent, commit, staging, publish, dependency upgrade or
  generated-output hand edit occurred.
- `_tmp-ppr` parent and ignore rule were checked before logs. Process inspection
  found external repository builds/tests idle before shared-dist checks; all owned
  build/test commands were serialized. No external worker was stopped. Review
  established no broader test impact beyond the planned server/runtime/decorator
  boundary, so root `pnpm test` was not run and no full-workspace test claim is made.
  No environment blocker, failed/incomplete required gate or required finding remains.

## Definition of done and execution record

PPR-01 through PPR-04 and required follow-ups must be completed with actual evidence.
C1-C4 must hold across supported paths/modes; meaningful before/after regressions,
package/installed/downstream checks and independent signoff must pass. Deferred
capabilities require explicit rationale and supported-contract consequences.

Creation evidence: inspected current source and referenced test contracts, task
workflow and repository verification scripts; `git log -1 --oneline` reported the
baseline above. Initial status contained only the unrelated moo task listed above.
No implementation or runtime tests were run before this plan was saved. Formatting
initially required table/list-spacing corrections, now applied. Pre-handoff checks:
`node_modules/.bin/prettier --check` on this file and the prior phase's small
cross-link update; `git diff --check`; and
`git diff --no-index --check -- /dev/null docs/tasks/20261026-122832-access-router-private-populate-read-policy.md`.
Reviewed four unique task IDs, acyclic dependencies, required fields, existing
related links and repo-scoped paths. Actual implementation evidence is appended
by each owner; the original moo task remains unrelated work.

Final reconciliation: PPR-01 → PPR-02 → PPR-03 → independent PPR-04 are completed,
with no required follow-up or deferred C1-C4 criterion. V1/V2, final V3 and scoped
V4 are accepted with the exact fresh/reused evidence above. Earlier pending/handoff
statements are historical stage records. The linked prior DPV phase remains a
completed historical record of the old D1 rule; this phase's intentional reference
omission/default-strict contract is the current accepted behavior in its active-plan
scope. All definition-of-done requirements are satisfied; overall status is completed.
