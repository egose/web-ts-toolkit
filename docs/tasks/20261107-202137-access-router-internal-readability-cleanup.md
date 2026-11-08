# Access-router: internal readability cleanup without consumer changes

Created: 2026-11-07 20:21:37 PST (`20261107-202137`, generated with `date`).

Status: completed. All six tasks delivered and independently accepted on 2026-11-08.
Supported team usage, declarations and existing contract tests remain unchanged.

## Objective and authorization

Make live `packages/access-router` code easier to read and maintain through small
private extractions, clearer internal names and explicit argument roles. Teams using
the supported package interfaces must need **no changes to their code or configuration**.
The user requested this task file first and subsequently authorized implementation
by subagents. The execution record below distinguishes planned work from results.

This is a separate phase from
`docs/tasks/20261105-084939-access-router-performance-cleanup.md`. That phase removed
dead private code and added regression/measurement coverage. Its final outcome is
documented in
`docs/task-artifacts/access-router/20261105-084939-performance-cleanup/FINAL.md`.
Do not repeat that deletion work or restore the withdrawn preparation/lazy-logging
candidates. This phase makes no speedup claim and does not require a new benchmark
campaign to justify readability changes.

### Scope and non-goals

- Focus on model-service output completion, private populate argument roles,
  operation logging organization, and finalizer-local vocabulary.
- Preserve public exports, imports, types, method signatures, option names and
  defaults, response shapes, error contracts, hooks and supported subclass seams.
- Keep existing interface/contract-test assertions intact. Private import/call-site
  updates are allowed only when necessary for an approved mechanical refactor.
- No changes to authorization policy, copying/isolation, scheduling, caching,
  database query behavior, metadata exposure, public documentation examples or
  package dependencies/exports. No broad service architecture rewrite.
- Verify only `access-router`: targeted package tests while working, one final
  package suite, package typecheck and scoped lint. No whole-repository/grouped
  tests or downstream-package suites. Necessary transitive builds are allowed.

## Source review and limits

- Reviewed checkout: `28f7266`; `git status --short` was empty before this document.
- Inspected the relevant live service/finalizer/owner-binding paths, package exports
  and scripts, declaration examples, selected tests and the previous final report.
- No builds, runtime tests or benchmarks ran for this task-file review. The earlier
  report's 7,558 passing tests are historical evidence, not a fresh baseline here.
- Findings are maintainability opportunities, not confirmed behavior defects or
  evidence that smaller source files alone improve an architecture.
- Line references below identify this reviewed source; symbols are the durable anchors.

| Opportunity                                                                              | Inspected evidence                                                                                                                                                                | Bounded outcome                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Output orchestration contains a substantial inline metadata completion callback          | `packages/access-router/src/services/service.ts:551–638`, `finalizeDirectOutput`                                                                                                  | Separate response metadata construction from row orchestration, without moving its execution boundary.                                                |
| Recursive populate helpers forward many positional values with different ownership roles | Same file `1003–1091,1162–1333`, `finalizeSinglePopulateTarget`, `finalizePopulatePath`, `finalizePopulateForSingleDoc`                                                           | Make path position, source identity, target policy, receiver budget and execution context explicit through narrowly scoped private types/local names. |
| Start/end logging payload construction is mixed into the service implementation          | Same file `1335–1366`, `beginOp`, `completeOp`                                                                                                                                    | Give existing eager logging a cohesive home if extraction reduces coupling; do not change when summaries or clocks are evaluated.                     |
| Generic finalizer-local names obscure the preparation/build boundary                     | `packages/access-router/src/output/finalize-model-output.ts:128–178`, `Preparation`, `prepare`, `finalizeSingleDoc`                                                               | Consistent local vocabulary and short ownership comments, with no preparation reuse or engine rewrite.                                                |
| Apparently private refactors can still alter declarations or runtime dispatch            | `packages/access-router/src/acl/model-service-owner.ts:134–178`, `bindModelOwnerMethods`; `packages/access-router/src/services/base.ts:551–559`; generated `Service` declarations | Freeze declared method names and receiver/dispatch boundaries before extracting implementations.                                                      |

## Non-negotiable compatibility rules

1. Preserve all supported package entrypoints (`.`, `./advanced`, `./processors`),
   exports and generated declarations. Some TypeScript `private` method names are
   emitted in declarations. Do **not** rename/remove/reorder declared class members
   merely because they are labelled private. Prefer retaining existing wrappers
   and renaming only unexposed lexical helpers/local types/locals.
2. Preserve receiver-dispatched methods, protected override behavior and runtime
   ownership. `bindModelOwnerMethods` wraps inherited methods on the actual
   instance; do not bypass those wrappers with a prototype call or move capabilities
   onto a replacement service object. No constructor-order/import side-effect change.
3. Preserve expression evaluation, callback multiplicity/arguments/receivers, query
   and hook ordering, errors, publication settlement and existing await/microtask
   boundaries. Do not add async wrappers, new awaits or early captures simply to
   make an extraction easier. Promise identity must remain where currently required.
4. Preserve all four authorization modes, defaults/inheritance/in-flight capture,
   READ fallback, both UPSERT branches, independent related-target READ/LIST modes,
   and embedded owning-stage semantics. Both write modes retain live-source detachment.
5. Preserve stage/binding checks, node/depth/work/payload accounting, receiving
   budgets, private reference handoffs, failure draining, hook/persistence limits
   and publication resource lifetime. Metadata remains output data, not authority.
6. Keep existing contract assertions, expected values, error checks and behavioral
   coverage. No deletions, weaker matchers, new skips or changed expectations to
   accommodate a refactor. Add characterization only for a demonstrated gap.
7. Preserve existing operation/query/work counts and bounded traversal. This is not
   authorization to add caches, batch metadata reads, make logging lazy, eliminate
   empty yields, or revive rejected performance experiments. No faster-runtime claim.

If a proposed extraction cannot satisfy these constraints, record its exact obstacle
and choose a smaller cleanup or defer it. A documented no-change decision must not
silently satisfy an implementation dependency: reconcile scope/status explicitly.

## Tasks and execution order

Priorities: P1 = establish/preserve compatibility or final acceptance; P2 = focused
maintainability improvement. Execute sequentially: the service is a shared hotspot,
and package commands rebuild shared `dist` artifacts. Do not run concurrent builds
or tests in this checkout. No subagent has run for this planning document. If later
delegated, use bounded handoffs and a final reviewer who was not an implementer.

### Task ARRC-01: Freeze the compatibility boundary and approve the move/name map

Status: completed
Kind: investigation
Priority: P1 — private-looking names and method movement can affect shipped contracts.
Dependencies: none

Primary ownership: package manifest/entrypoints and generated declaration inspection;
`src/services/service.ts`, `src/acl/model-service-owner.ts`, affected test imports
(all source paths here are under `packages/access-router/`).

Finding/references: `bindModelOwnerMethods:134–159` binds every inherited method
through runtime dispatch; generated declarations include `private finalizeDirectOutput`,
`private finalizePopulatePath`, `private beginOp` and `private completeOp`.

Requirements:

1. Capture the current source revision/diff, built declaration file inventory and
   hashes, relevant tests/work traces, and supported entrypoint/override boundaries.
2. Record a concise old-symbol → new-helper/module/local-name map and a keep list.
   Approve exact extraction boundaries for ARRC-02–05 before implementation. Proposed
   new filenames below are suggestions, not an instruction to create empty modules.
3. Identify cross-module/test callers with repository-wide read-only searches. Keep
   public/protected names and declared private class member names unchanged.
4. Run V1 baseline for affected families and V2 typecheck. Reuse current historical
   evidence only when its code identity and relevance are verified; label reuse.

Acceptance criteria:

- A compatibility/move ledger names the actual eligible helpers and unchanged seams;
  no unresolved public-contract change is embedded in a later task.
- Current declarations and focused behavior baselines are reproducible. Missing
  prerequisites/failures are explicit, not assumed to be historical.

Verification: V1 baseline, V2 typecheck, declaration/caller review and ledger review.

### Task ARRC-02: Separate response metadata completion from row orchestration

Status: completed
Kind: improvement
Priority: P2 — remove a mixed-responsibility callback without rewriting the output engine.
Dependencies: ARRC-01

Primary ownership: `packages/access-router/src/services/service.ts`;
a private helper such as `src/services/model-output-metadata.ts` if justified;
metadata/output preparation tests.

Finding/references: `finalizeDirectOutput:551–638` embeds metadata stripping,
grant exposure, field-map construction, aliases and budget accounting inside
`completeOutput`. `getFieldPermissionAccess:3327–3355` still performs live per-row
visibility queries; those are not batchable as part of this task.

Requirements:

1. Extract only the coherent completion responsibility; leave row admission,
   private association handling, finalizer invocation and final context capture
   easy to follow in the service. Document exact responsibilities in the move ledger.
2. Use narrow private inputs/types and an existing-receiver query callback only if
   needed. Do not introduce a service-container abstraction or pass the whole
   mutable lifecycle context to a helper that needs only field-access data.
3. Preserve when grants/source/metadata are read, association/include restoration,
   strip/disable/exposed-key behavior, `_view`/`_edit` placeholders, aliases,
   field-map awaits, budget debit order and final stage closure.
4. Do not hoist queries or stage reads out of the callback. Retain service method
   names/signatures and avoid a new promise hop at the existing completion boundary.

Acceptance criteria:

- Metadata construction has a cohesive named private implementation; the service
  shows row orchestration without duplicating the metadata policy in callers.
- Existing metadata, same-ID, query/callback trace, negative/empty output and
  failure/budget assertions pass unchanged in both modes. Declarations unchanged.

Verification: V1 metadata/output/lifetime families; declaration comparison; scoped lint.

### Task ARRC-03: Clarify populate traversal arguments and ownership vocabulary

Status: completed
Kind: improvement
Priority: P2 — positional forwarding obscures independent policy, source and receiver roles.
Dependencies: ARRC-02

Primary ownership: private populate helper bodies/types in
`packages/access-router/src/services/service.ts:974–1333` and private call sites;
related/populate tests. Do not move/rewrite ACL ownership or publication modules.

Finding/references: `finalizePopulatePath` forwards path/index, model metadata,
operation/context, gates, original value, references, budget/publication, parent
authorization and output address through recursion. These values have different
lifetimes and must not become an undifferentiated shared context.

Requirements:

1. Introduce narrowly named private argument/group types or improved local names
   where the approved map demonstrates a real reduction in positional ambiguity.
   Separate traversal position from operation/ownership and per-occurrence budget.
2. Preserve original/source identity versus finished target value distinctions,
   occurrence preregistration, sparse/null/nested-array handling, scalar IDs,
   target-cache identity, depth/address progression and publication cleanup.
3. Preserve default-argument evaluation and dispatch/await points. Do not copy
   document data, build a fresh context per node unnecessarily, merge row budgets,
   share mutable traversal state, or introduce new caching/recursive abstractions.
4. Keep declared class member names/order unchanged. Prefer body/local type changes
   over a new collaborator owning the existing WeakMaps or runtime capabilities.

Acceptance criteria:

- Call sites make each identity/policy/position/budget role readable without matching
  a long list of positional arguments; private types document their ownership.
- Existing target-mode, repeated-reference/ID, nested populate/include, mutation,
  resource cleanup, bounds and failure tests pass without assertion changes.
- Declarations and observed query/hook/copy/work counts stay unchanged.

Verification: V1 related/traversal/lifetime families, all-mode CRUD controls,
declaration/work comparison and scoped lint.

### Task ARRC-04: Give existing eager operation logging a cohesive implementation

Status: completed
Kind: improvement
Priority: P2 — isolate logging mechanics, not a new logging optimization.
Dependencies: ARRC-03

Primary ownership: `packages/access-router/src/services/service.ts:1335–1366`;
a private service-operation-log helper if the approved map justifies it;
`packages/access-router/test/service-logging-contract*.test.ts`.

Finding/references: `beginOp`/`completeOp` construct structured contexts, evaluate
filter summaries and clocks, and call `logger-helpers.ts`. This is separate from
query orchestration but its expression ordering is observable.

Requirements:

1. Move cohesive existing payload/log mechanics behind narrowly named private
   helpers while retaining the two existing service methods and signatures.
   If an extraction merely adds indirection, prefer clearer local types/comments
   and record why a new module was not worthwhile.
2. Keep logging eager as today. Preserve the exact position of `Date.now`, summary
   traversal, model-name/options reads, level checks and logger resolution. Do not
   restore the withdrawn lazy-context candidate or cache level enablement.
3. Preserve cardinality-only messages, redaction, receiver/fallback/throw behavior,
   level changes during a call and duration accounting. Add no new CRUD log events.

Acceptance criteria:

- Logging responsibility is clearly identifiable without spreading trivial wrappers
  across modules. Existing start/end messages and event order remain unchanged.
- Existing native/complex-filter, replacement/missing/throwing logger, enabled/
  disabled/toggled logging and related-model contracts pass unchanged.

Verification: V1 logging families and CRUD work traces; declaration comparison; scoped lint.

### Task ARRC-05: Make finalizer-local names and ownership comments consistent

Status: completed
Kind: improvement
Priority: P2 — improve the remaining live-code vocabulary without moving decisions.
Dependencies: ARRC-04

Primary ownership: `packages/access-router/src/output/finalize-model-output.ts`;
the approved local/type names in touched service helpers. Avoid a package-wide rename.

Finding/references: `Preparation`, `prepare` and `finalizeSingleDoc:128–178` are
module-local names for distinct finalization phases. ACL preparation, fact
resolution, field evaluation and value materialization already have separate
responsibilities; naming must explain them rather than merge their engines.

Requirements:

1. Apply approved lexical renames, for example `Preparation` → `FinalizerPreparation`,
   `prepare` → `prepareFinalizer`, and `finalizeSingleDoc` → `finalizeOutputDocument`.
   Confirm names fit actual behavior; do not rename published/helper entrypoints.
2. Explain capture (configuration ownership), prepare (reusable inputs), resolve/
   authorize (stage facts/decisions), materialize (bounded output) and publish
   (operation settlement) where confusion exists. Do not rename everything to
   `authorize` or treat copied values as authorization certificates.
3. Retain operational rationale for native copying, budgets, reentry and handoffs.
   Remove historical task labels only when they add no enduring explanation;
   preserve committed evidence/history and error/log message text.
4. Keep this a mechanical naming/comment change: no moved checks, changed branching,
   new shared preparation, broad formatting churn or declared member reorder.

Acceptance criteria:

- Move/name ledger matches the delivered diff; names consistently distinguish
  preparation, per-row facts and completed output. Comments describe actual ownership.
- Existing finalizer/output/bounds assertions and public declarations are unchanged.

Verification: V1 preparation/lifetime families; mechanical diff review; scoped lint.

### Task ARRC-06: Independently accept the retained refactor and team-usage contract

Status: completed
Kind: investigation
Priority: P1 — accept only changes that require no consumer migration.
Dependencies: ARRC-01, ARRC-02, ARRC-03, ARRC-04, ARRC-05

Primary ownership: task completion evidence, final retained diff and package checks.
If delegated, the final reviewer must not be the main implementer.

Finding/references: method binding, declarations, metadata queries and async output
ordering are observable despite apparently private code. The preceding tasks cannot
be accepted solely because their new modules compile.

Requirements:

1. Review actual source/callers, approved names/moves and unchanged test assertions;
   assess ownership, errors, callbacks, query counts, bounds and module initialization.
2. Compare freshly built declaration bytes and export manifests against ARRC-01.
   Any difference must be resolved or explicitly reviewed before acceptance; do not
   silently weaken the no-consumer-change promise or approve public API renames.
3. Complete V2 once on the final source tree, reuse still-valid targeted evidence,
   and verify all 16 mode tuples, parent/target mixed modes, READ fallback and
   both UPSERT branches. Compare relevant work/callback traces separately from timing.
4. Record concrete maintainability outcomes and retained/deferred changes; preserve
   concise evidence under the artifact destination below. No speedup/bundle-saving claim.

Acceptance criteria:

- Public declarations/entrypoints and supported team usage remain unchanged; no
  migration, compatibility alias or weakened contract test is needed.
- Targeted checks, final package tests/typecheck/lint and independent diff review
  pass. Missing required prerequisites keep this task blocked with an exact reason.
- Maintained continuation/evidence references resolve without temporary files.

Verification: V1 as affected, V2 and evidence/privacy/reference review.

## Verification plan — proposed, not run

Working directory: repository root. Prerequisites: workspace dependencies, Node
`>=24`, pnpm, and MongoDB memory-server prerequisites for the package's DB tests.
Only the package's scripts may build required transitive dependencies. Do not run
root build/lint/test sweeps, numbered test groups or downstream-package tests.

### V1 — Focused regressions after each task

Build once when needed because tests import both source and `dist`:

```sh
pnpm --filter @web-ts-toolkit/access-router... build
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-output-preparation.unit.test.ts test/access-router-crud-harness.unit.test.ts
```

Use the same Vitest form with affected existing files below (names relative to
`packages/access-router/test/`), plus narrowly necessary new characterization tests.
Reuse existing coverage rather than introducing a second CRUD harness.

| Family                  | Existing suites                                                                                                                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Output/metadata         | `finalizer-preparation.unit.test.ts`, `service-list-preparation.unit.test.ts`, `service-output-preparation.unit.test.ts`, `permissions-posture.integration.test.ts`, `bulk-create-metadata-filter-trace.integration.test.ts`, `include-permission-metadata.integration.test.ts`                                |
| Related/traversal       | `write-output-populate.unit.test.ts`, `service-authorization-related.integration.test.ts`, `service-authorization-subdocuments.integration.test.ts`, `virtuals-populate-dependencies.traversal.test.ts`, `virtuals-populate-dependencies.integration.test.ts`, `virtuals-populate-include.integration.test.ts` |
| Lifetime/scheduling     | `no-work-output-scheduling.unit.test.ts`, `owned-authorization-publication.unit.test.ts`, `owned-authorization-many-bounds.unit.test.ts`, `request-hook-concurrency.test.ts`, `request-hook-ownership.test.ts`, `retained-model-service-ownership.integration.test.ts`                                         |
| Logging                 | `service-logging-contract.unit.test.ts`, `service-logging-contract.integration.test.ts`, `logger-redaction.test.ts`                                                                                                                                                                                            |
| Modes/writes/decoration | `access-router-crud-harness.unit.test.ts`, `write-output-modes.unit.test.ts`, `write-output-source-lifetime.unit.test.ts`, `read-list-fallback-authorization.integration.test.ts`, `service-authorization-prepared-query.unit.test.ts`, `response-pipeline.internal.test.ts`                                   |
| Deterministic work      | `access-router-crud-work.unit.test.ts`, `service-output-preparation.unit.test.ts`, `owned-authorization-work.unit.test.ts`, `owned-authorization-projection-work.unit.test.ts`                                                                                                                                 |

Record exact selections/results. Capture relevant pre/post trace reports using the
existing fixture report options; do not re-label counters as allocation or timing
measurements. Run lint on explicitly changed package files after each task.

### V2 — Final access-router-only acceptance

Run sequentially; one full package test run after implementation settles is enough
unless later source/test changes invalidate it:

```sh
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test
pnpm exec eslint packages/access-router/src packages/access-router/test
```

The package suite already includes export, packed-consumer, strict-consumer and
tree-shaking checks. Keep them intact; no downstream suite or root release run is
needed. Declaration/export comparison is separate from typecheck passing. Capture
all generated `.d.ts`/`.d.mts` file paths and bytes before and after, not only the
top-level `index` file or stale build artifacts.

## Task evidence and definition of done

- Use fresh ignored repository-local `_tmp-arrc-<run-id>` directories for disposable
  probes/logs; confirm with `git check-ignore`. Set `TMPDIR` to the absolute directory
  at runtime when tools use `os.tmpdir()`.
- Before handoff, curate necessary ledgers/review evidence under
  `docs/task-artifacts/access-router/20261107-202137-readability-cleanup/` (proposed;
  create during execution), following `docs/task-artifacts/README.md`. Do not copy
  dependencies/generated consumers or overwrite the previous performance packet.
- Use repo-relative paths or quoted `<repo-root>` placeholders in shared evidence;
  replace placeholders before executing commands. Scrub credentials/private session
  identifiers and record omitted raw data/reproduction prerequisites.
- Keep task statuses and dependencies current. Every completed task needs its actual
  diff/decision, commands/results, source identity and resolved acceptance criteria.
- The final deliverable is clearer live internal code with unchanged team usage,
  not simply more files or renamed abstractions. Defer extractions that add coupling
  or require behavior changes, explaining their residual maintenance cost explicitly.

## Execution record

- Starting revision: `28f7266`; only this task file was untracked. User authorized
  implementation by subagents. The coordinator owns this shared task file.
- ARRC-01 baseline/map session: in progress. Separate bounded implementation
  sessions will run sequentially; no concurrent builds/tests in the shared checkout.
- ARRC-06 will use a fresh independent reviewer, not an implementation session.
- Tests remain access-router only; no root/grouped/downstream verification is planned.

### ARRC-01 accepted baseline and extraction map

- Fresh baseline: **1,171 tests / 31 files passed**, package typecheck/filtered build
  and four-file scoped lint passed. All eight generated declarations and 128
  deterministic work/trace records were frozen; production/tests were not edited.
- The previous performance report's full test pass was not reused: current test
  hashes differ, even though source/declarations match. ARRC-06 still owns the
  final full package run on this task's final tree.
- Coordinator accepted the bounded map in
  `docs/task-artifacts/access-router/20261107-202137-readability-cleanup/arrc-01-move-ledger.md`.
  Metadata may move to a callback factory without a new async hop; populate work
  uses clearer parameter/local roles and call-site comments, not signature changes
  or new traversal objects; logging uses local types/comments, not a new module;
  finalizer changes are lexical names/comments only. These are approved smaller
  implementations within the original task requirements, not deferred tasks.
- Preserve every declared class member's name/order and positional signature,
  runtime receiver dispatch and original expression/await boundaries. Operational
  source/declaration baseline copies are read-only; durable identities, keep/caller
  inventory, exact verification and reproduction limits are linked from
  `docs/task-artifacts/access-router/20261107-202137-readability-cleanup/arrc-01-report.md`.

### ARRC-02 metadata completion delivered

- Extracted the completion callback into private `services/model-output-metadata.ts`.
  The synchronous factory captures references only and returns the existing async
  body directly; no additional async wrapper or eager stage/row/flag reads. Service
  orchestration, receiver lookups, repeated ID reads, budgets and closure stay at
  their original boundaries.
- **1,143 tests / 29 files** plus seven new characterization tests, package
  typecheck/filtered build and scoped lint passed. All eight declaration bytes/paths,
  128 work/trace records and two publication observations match ARRC-01. All 247
  baseline test/fixture files are unchanged; no existing assertion was edited.
- Coordinator reviewed the extracted implementation and handoff. Evidence:
  `docs/task-artifacts/access-router/20261107-202137-readability-cleanup/arrc-02-report.md`.
  ARRC-03 now operates on that retained extraction; no pending runtime jobs.

### ARRC-03 populate vocabulary delivered

- Applied 34 approved parameter/local binding renames in the three populate helpers
  and role comments at 11 call sites. Method names/order, positional types/defaults,
  property keys, checks, awaits and WeakMap ownership are unchanged; token
  alpha-equivalence verified the rename-only implementation.
- **965 tests / 23 files**, package typecheck/filtered build and scoped lint passed.
  All eight declarations, 128 work/trace records and two publication observations
  match ARRC-01. The metadata extraction and all 248 current test/fixture files were
  preserved. Evidence:
  `docs/task-artifacts/access-router/20261107-202137-readability-cleanup/arrc-03-report.md`.
- ARRC-04 starts with the approved smaller implementation: meaningful local log
  context types/comments, not a new indirection-only module or lazy logging.

### ARRC-04 eager logging organization delivered

- Added local start/completion extra-context type names and concise ownership/order
  comments, preserving both methods and every eager executable expression. Whole-file
  runtime AST and ESNext/CommonJS emitted code remained identical for this step.
- **516 tests / 8 suites**, package typecheck/filtered build and scoped lint passed.
  All eight declarations and 128 work/trace records match the baseline; all 248
  test/fixture files and prior implementations are unchanged. Evidence:
  `docs/task-artifacts/access-router/20261107-202137-readability-cleanup/arrc-04-report.md`.
- ARRC-05 starts as a lexical-only finalizer rename/comment step. No logging
  optimization, new module, await or API was introduced by ARRC-04.

### ARRC-05 finalizer vocabulary delivered; interruption reconciled

- The subagent tool handoff hit a usage limit, but the finalizer implementation,
  actual command records and report were already saved. On resumption, the
  coordinator checked actual source hashes and the saved Vitest JSON instead of
  assuming the error meant either successful work or no edits.
- Renamed only approved lexical bindings (`FinalizerPreparation`, `prepareFinalizer`,
  `finalizeOutputDocument`, `preparation`) and added short phase/ownership comments.
  Token/binding alpha-equivalence, unchanged export headers and unchanged ESNext/
  CommonJS runtime emission after lexical normalization are recorded in the report.
- **928 tests / 20 files**, package typecheck/filtered build and scoped lint passed.
  All eight declarations, 128 work/trace records and two publication observations
  match ARRC-01; all 248 test/fixture files and earlier implementations are unchanged.
  Evidence:
  `docs/task-artifacts/access-router/20261107-202137-readability-cleanup/arrc-05-report.md`.
- ARRC-06 begins in a fresh independent reviewer session. It owns actual final
  source/caller/test/evidence review, fresh final package-only tests/typecheck/lint,
  declaration comparison and unchanged team-usage acceptance. No queued runtime jobs.

### ARRC-06 independent final acceptance (2026-11-08)

- A fresh non-implementer reviewer inspected the actual metadata extraction,
  populate bindings/callers, eager logging, finalizer names, runtime dispatch,
  original assertions and new characterization tests. No blocking finding or
  implementation repair was needed. Approved smaller boundaries are delivered
  work, not deferred tasks.
- Fresh final commands ran sequentially from repository root using an ignored
  repo-local TMPDIR:
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` — passed, including
    required filtered/transitive builds.
  - `pnpm --filter @web-ts-toolkit/access-router test` — **7,565 tests / 211 files
    passed**, zero failures/skips/todos; the full package suite ran once.
  - `pnpm exec eslint packages/access-router/src packages/access-router/test` — passed.
  - Two existing publication-work cases were recaptured with a name filter because
    the full run's reporter omitted their stdout observations. The other 48 cases
    were filtered only for that diagnostic and had passed in the full suite; no
    source skips were introduced.
- All **8 declaration files / 782,693 bytes** remain byte/path-identical, as do all
  14 public/manifest/config files and all **247 original test/fixture files**.
  The only test addition is seven metadata-boundary characterization cases. All
  16 actual CRUD mode tuples, mixed target modes, READ fallback, both UPSERT
  branches and both write modes' detachment passed.
- Final **128 work/count/ordered-trace records plus 2 publication observations**
  match ARRC-01 exactly. No caching/query/scheduling/authorization or public API
  change, consumer migration, compatibility alias or speedup claim is introduced.
- Tested source: 152 files,
  `e63cf3cc91fb0236e354ea741678892a2800c09dac7dd0c2ddfdbda4bd160814`.
  No production/test/tooling edits followed final acceptance; only this task's
  coordinator status/completion documentation was updated.
- All task statuses are completed; no remaining blocker or runtime job. No
  root/grouped/downstream test suite or performance benchmark campaign ran.
- Final review, exact command/identity manifest, curated log and preservation/
  reproduction limits:
  `docs/task-artifacts/access-router/20261107-202137-readability-cleanup/arrc-06-review.md`
  and `docs/task-artifacts/access-router/20261107-202137-readability-cleanup/README.md`.
