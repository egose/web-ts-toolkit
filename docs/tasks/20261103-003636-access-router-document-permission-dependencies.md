# Access-router document-permission dependencies

Created: 2026-11-03 00:36:36 (local repository clock)

Overall status: completed. DEP-01, DEP-02 and independent DEP-03 ran sequentially;
the coordinator reconciled delivered changes and verification evidence. No commits
or pushes were made.

## Objective and contract

Replace the global `alwaysSelectFields` model option with dependencies declared on
the document-permission calculation that needs them. This is an intentional
breaking removal: do not retain a deprecated option, compatibility alias, fluent
setter, default, projection input, or runtime fallback for `alwaysSelectFields`.

Retain existing synchronous/asynchronous `docPermissions` functions and add a
descriptor using the same `get` spelling as virtuals:

```ts
docPermissions: {
  dependsOn: ['ownerId'],
  get(doc, permissions, context) {
    return { owner: /* application-specific boolean */ false };
  },
}

docPermissions: {
  default: sharedFunction,
  read: { dependsOn: ['ownerId'], get: readFunction },
  list: listFunction,
}
```

- Accept functions/descriptors directly and in per-access maps, including default
  fallback and supported custom accesses/dotted option setters. Resolve the hook
  and its dependencies together from captured configuration; never combine the
  dependency list from one access with another access's hook.
- `dependsOn` is optional; absent/empty means no additional private fetch inputs.
  Follow virtuals' local top-level persisted-field convention, reject unsafe,
  dotted, or virtual dependency names, and document this contract. Existing
  fixtures needing nested inputs can declare the whole top-level persisted
  container. Do not introduce a new embedded document-permission hook family.
- Only the applicable document-permission descriptor supplies its dependencies.
  Keep the output/virtual/document-permission access distinction intact. Embedded
  scopes inherit owning-document grants; related targets resolve their own facts
  and private inputs. Preserve dedicated subdocument owning-parent preparation.
- Dependencies affect internal fetches, never output eligibility/authorization.
  Selected virtuals keep using their own `dependsOn`. Document-permission hooks
  still run if a declared input is missing/undefined (unlike virtual skipping).
- Preserve hook arguments, request `this`, boolean-map validation, stage-once
  execution, bounded scheduling, lean/hydrated and isolated/trusted semantics,
  and independent pre-write/post-write stages. Raw output helpers still perform
  no hidden queries or document-permission computation.

Non-goals: changing field/row authority, virtual getter semantics, release/version
bumping, rewriting historical evidence, or retaining the removed option.

## Analysis coverage and baseline

- Initial working tree was clean. Read root `AGENTS.md`, task/artifact conventions,
  package metadata, public entrypoint/build configuration, options and hook types,
  captured output planning, finalizer, and pre-write document-permission invocation.
- Inspected evidence: `src/interfaces/root.ts` (`ModelRouterOptions`,
  `ExtendedModelRouterOptions`, `DocPermissions`), `src/interfaces/router-hooks.ts`
  (`ModelDocPermissionsHook`, `ModelVirtualDescriptor`), `src/acl/model-output-planning.ts`
  (`captureModelAuthorizationConfiguration`), `src/acl/output-field-filter.ts`
  (`prepareOutputDocumentStage`), `src/acl/model-input-admission.ts`
  (`resolveInputDocumentGrants`), `src/core.ts` (`genDocPermissions`),
  `src/output/finalize-model-output.ts` (internal view before selected output).
  These paths are relative to `packages/access-router/`.
- Content searches identified removal/migration sites in projection planners,
  runtime defaults, model-router setters, approximately forty test files, shipped
  README/MIGRATION, website guides, access-router-deco fixtures/docs, and maintained
  benchmark scripts. This is an API improvement, not a claim of a security defect.
- Existing task search found historical virtual/planning tasks describing the old
  contract, but no task delivering this replacement. Leave historical task/artifact
  evidence unchanged; new maintained guidance must describe the current API.
- Baseline build/tests were not run before writing this task. Installed declaration
  contracts and all runtime paths still require verification during implementation.

## Execution rules

Run agents strictly sequentially: DEP-01 implementation, then DEP-02 migration,
then DEP-03 independent review. Each uses a separate session; the coordinator owns
this document/status and reconciles delivered changes before the next handoff.
Aliases are task-local, not private session IDs. No commits or pushes requested.

Use fresh ignored repository-local `_tmp*` directories for logs, Mongo temp data,
packed consumers, and probes; confirm ignore status and set `TMPDIR` at runtime.
Keep shared documents repo-relative. Preserve useful review/acceptance evidence
under `docs/task-artifacts/access-router/` before handoff, not entire scratch trees.
Build/test commands must not overlap: package tests rebuild shared dependencies.

Priorities: P1 = core contract needed by this requested breaking change;
P2 = dependent migration/integration needed before delivery.

### Task DEP-01: Implement descriptors and replace private fetch planning

Status: completed

Kind: improvement

Priority: P1 — establishes the requested public/runtime contract.

Suggested agent: IMPLEMENT-01, public types and authorization runtime

Dependencies: none

Primary ownership:

- `packages/access-router/src/` types, exports, options/runtime, planners,
  invocation boundaries, and new focused descriptor regression tests.
- Avoid broad existing fixture/doc migration; DEP-02 owns it next.

Finding: document permissions currently accept only callable calculations, while
private hook inputs are maintained separately through `alwaysSelectFields` in
captured configuration and multiple projection paths. See analysis references.

Requirements:

1. Add discoverable exported descriptor/definition types with useful JSDoc and
   model-aware dependency keys consistent with virtuals. Extend direct/per-access,
   default, fluent, and dotted configuration surfaces without changing callable hooks.
2. Centralize safe definition/access resolution and validation. Ensure dependency
   arrays and hooks are captured together before awaits, including default fallback;
   reject malformed descriptors instead of silently disabling permission computation.
3. Replace every source `alwaysSelectFields` path with the active descriptor's
   dependencies, including ordinary reads/lists, populate/include targets, owning
   parents, helper projection planning, and create/update output stages.
4. Invoke descriptor `get` at every existing document-permission execution boundary,
   including pre-write authorization and explicit hook-to-metadata utilities.
5. Remove the old option/setter/default/type/planner input entirely. Do not leave an
   undocumented fallback. Preserve private fetch/output separation and snapshot safety.

Acceptance criteria:

- Focused tests demonstrate function/descriptor and per-access/default resolution,
  actual private projection, no response leakage, missing-input invocation, invalid
  dependency handling, and coherent captured dependencies under later mutation.
- Public source builds; new focused tests pass. No operational old-option source
  references remain (an explicitly documented removal mention is permissible).
- Hook execution order, request binding, and independent document/target stages hold.

Verification: package dependency build and focused Vitest checks from the shared
commands below. DEP-02 performs the full migrated test/type contract verification.

Completion evidence (IMPLEMENT-01; reconciled by coordinator):

- Added `src/acl/document-permissions-definition.ts` and
  `src/acl/persisted-dependencies.ts`; updated runtime/types/exports, all three
  document-hook invocation boundaries, snapshots, projection and parent/target planning.
- Added `test/document-permissions-dependencies.unit.test.ts`,
  `.integration.test.ts`, and `.types.fixture.ts`. Coordinator inspected resolver,
  validation, option changes and focused regression cases; source search confirms
  no remaining `alwaysSelectFields` reference under `packages/access-router/src/`.
- Agent verified sequential dependency build, package typecheck, strict standalone
  compilation of the new declaration fixture, scoped ESLint and `git diff --check`.
- Agent focused Vitest command covered both new test files plus
  `virtuals-config.contract.test.ts` and `doc-permissions-exposure.integration.test.ts`:
  56 passed, including 45 new cases. Working directory: package for Vitest, repository
  root for filtered pnpm commands. Runtime `TMPDIR` was ignored repository-local scratch.
- Additional legacy planner probe: 14 passed, 1 failed in
  `test/virtuals-projection-planner.unit.test.ts` (old option expected to fetch
  `address`). This expected migration work belongs to DEP-02, not a baseline claim.
- Definition-member dotted edits reject; dotted access setters replace whole
  definitions atomically. `get`/`dependsOn` are reserved descriptor members.

### Task DEP-02: Migrate consumers, regressions, and shipped guidance

Status: completed

Kind: improvement

Priority: P2 — prevents stale fixtures/docs from masking the breaking change.

Suggested agent: IMPLEMENT-02, consumer contracts and migration coverage

Dependencies: DEP-01

Primary ownership:

- `packages/access-router/test/`, `packages/access-router/README.md`,
  `packages/access-router/MIGRATION.md`, `packages/access-router/llms.txt` if relevant.
- Affected `packages/access-router-deco/` tests/docs,
  `website/docs/packages/access-router/`, `scripts/benchmarks/access-router*.mjs`.
- Targeted source corrections only when needed to satisfy this contract; record them.

Finding: maintained tests/types/docs/benchmarks still construct or assert the old
option; several tests explicitly exercise fetch-only fields and declaration hovers.
References include `test/export-contract.test.ts`, `test/model-router.test.ts`,
`test/virtuals-projection-planner.unit.test.ts`, and
`test/service-authorization-consumer.types.fixture.ts` within access-router.

Requirements:

1. Migrate each old private input to its actual consumer (document-permission or
   virtual descriptor). Preserve the behavioral reason and assertions for each test;
   do not weaken non-leakage/authorization coverage or mechanically add unrelated hooks.
2. Cover direct/per-access/default/custom configuration, sync/async and `this`,
   private denied/unrequested/excluded inputs, absent fields, empty dependencies,
   malformed definitions, and declaration/setter rejection of the removed option.
3. Verify owning-parent/subdocument, include/populate, lean/hydrated,
   isolated/trusted, explicit utilities, and pre/post-write pathways with maintained
   regression coverage. Fix any demonstrated contract gaps.
4. Update shipped README/JSDoc/MIGRATION and secondary website/decorator guidance.
   Explain the breaking removal, replacement shapes, persisted input constraints,
   active-access fallback, missing-input behavior, and no implied output permission.
5. Migrate active benchmark setups without rewriting historical task/artifact data.
   Check the packed library and declaration surface, not only repository source.

Acceptance criteria:

- Package tests and typecheck pass; decorator tests pass; current consumers/guides
  no longer rely on the old option. Removal/negative-test mentions are intentional.
- Packed CJS/ESM declarations accept both definition shapes and reject the removed
  typed API; new exported types and hovers explain the intended contract.
- Migration guidance agrees with real runtime behavior. No historical evidence rewritten.

Verification: shared package/type/decorator commands, packed declaration contract
tests, `npm pack --dry-run` or equivalent; changed benchmark syntax/smoke checks.

Completion evidence (IMPLEMENT-02; reconciled by coordinator):

- Migrated active tests/consumer fixtures, decorator fixtures/guidance, shipped
  README/MIGRATION/llms, website guides and benchmark setups. Coordinator reviewed
  representative projection, private ancestor, populate/include and export-contract
  changes; preserved security assertions and migration decisions are detailed in
  [the migration ledger](../task-artifacts/access-router/20261103-document-permission-dependencies/IMPLEMENT-02.md).
- Corrected dependency-driven generic inference with `NoInfer<TModel>` after the
  first full run demonstrated unrelated permission fields being inferred away.
  New declaration/packed-consumer tests pin known-model validation and untyped calls.
- Agent verified serialized access-router tests: 190 files, 6,131 passed; package
  typecheck passed; decorator tests: 23 files, 742 passed. Actual packed ESM/CJS and
  strict consumer contracts are included; final pack dry run inspected 19 entries.
- Scoped ESLint (84 changed/new TS/MJS files), six benchmark syntax checks, ten
  benchmark fixture/batch tests, current isolated/trusted worker/probe smoke checks
  and `git diff --check` passed. Exact commands/protocol and execution order:
  [VERIFICATION.md](../task-artifacts/access-router/20261103-document-permission-dependencies/VERIFICATION.md).
- A broader optional historical-benchmark run had 51 passes / 2 failures: missing
  sealed legacy build and a test reading retired source. Not claimed as baseline or
  performance verification. Current smoke checks passed independently; DEP-03 must
  keep this limitation visible, not silently declare those tests passed.
- A benchmark-only helper selects old fixture setup solely for explicitly historical
  artifacts; the current package has no legacy option/type/setter/projection support.
  Historical tasks/artifacts remain unchanged. Workspace checks are still pending DEP-03.

### Task DEP-03: Independently review and verify the integrated change

Status: completed

Kind: improvement

Priority: P2 — independent acceptance check for authorization-sensitive API changes.

Suggested agent: REVIEW-01, not either main implementer

Dependencies: DEP-01, DEP-02

Primary ownership: review entire delivered diff, focused regression additions or
small corrections if needed, and a concise durable acceptance report.

Finding: this change crosses callable-option resolution, fetch/output separation,
captured authority, and multiple runtime boundaries; isolated unit success alone
cannot demonstrate integration correctness.

Requirements and acceptance criteria:

1. Audit each acceptance criterion against implementation and tests, especially
   descriptor/map ambiguity, fallback, mutation during awaits, dependency validation,
   missing inputs, related/owning-parent isolation, and pre-write hook invocation.
2. Confirm the removed option has no live runtime/type/setter behavior, dependencies
   grant no output, public declarations and shipped docs agree, and no alternate path
   silently skips descriptor hooks. Add regressions for any defects found.
3. Run final workspace build/test/lint sequentially and package typecheck as needed
   after corrections. Record exact results/limitations; do not label an unproven
   failure pre-existing or mark required verification complete when blocked.
4. Preserve a concise reviewed-scope/findings/check-results report under
   `docs/task-artifacts/access-router/20261103-document-permission-dependencies/`.
   Coordinator reconciles evidence and updates this task before final delivery.

Verification: shared commands below, diff review, `git diff --check`, preserved
reference/ignore/privacy checks. No unresolved acceptance findings at completion.

Completion evidence (REVIEW-01; reconciled by coordinator):

- Independent review found F1: dedicated parent/write fetches could omit declared
  schema-hidden metadata, including hidden descendants of a top-level dependency.
  Added failing real-Mongo reproductions, then fixed active-definition dependency
  retention in `model-subdocument-service.ts`, `model-input-admission.ts`, and
  `service.ts`. Private fetch expansion still grants no write/output access.
- Added four regression cases, including immutable readonly dependency replacement.
  Coordinator inspected the corrections and new regressions. Final package typecheck
  and six focused files / 121 tests passed after the source changes.
- `pnpm build`, full serialized `pnpm test`, and `pnpm lint` passed. Workspace
  results: 18,677 passing test executions and 1 todo across 645 file/lane executions
  (includes repeated peer/browser lanes, not unique tests). Access-router: 190 files /
  6,135 passed; decorator: 23 files / 742 passed. Packed ESM/CJS consumers are included.
- Initial workspace test failure was investigated: a socket probe reproduced
  `listen EINVAL` for a 112-byte temporary Unix-socket path and succeeded at 92 bytes.
  The complete suite passed with shorter ignored repository-local `TMPDIR`; no
  tests were skipped or unrelated package behavior changed to bypass the failure.
- Final pack dry run verified 19 entries and the installed declaration/doc surface.
  Ten benchmark fixture/batch tests passed. Optional historical-benchmark failures
  remain an explicit limitation; no historical/performance acceptance is claimed.
- Reviewer verified all four preserved documents and ten local links, privacy,
  whitespace, scratch ignore status and non-ignored destinations. Coordinator reran
  `git diff --check`, checked the final task/bundle references and privacy, and
  confirmed no old option/resolver references remain in access-router source.
- Durable evidence: [bundle index](../task-artifacts/access-router/20261103-document-permission-dependencies/README.md)
  and [independent acceptance report](../task-artifacts/access-router/20261103-document-permission-dependencies/REVIEW-01.md).
  No unresolved acceptance finding or required-check blocker remains. Generated
  consumers/builds, dependencies, Mongo files and redundant raw logs are disposable
  scratch; necessary findings/protocol/results are preserved in the curated bundle.

## Shared verification commands and definition of done

All commands run at repository root unless `--dir` specifies a package. Use a
runtime absolute `TMPDIR` pointing inside a fresh ignored repository-local scratch
directory when tests use temporary files; do not paste machine-local paths here.

```sh
pnpm --filter @web-ts-toolkit/access-router... build
pnpm --dir packages/access-router exec vitest run --config vitest.config.ts <focused-test-paths>
pnpm --filter @web-ts-toolkit/access-router test
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router-deco test
pnpm build
pnpm test
pnpm lint
git diff --check
```

Replace `<focused-test-paths>` before executing. Package export-contract tests
exercise actual packed CJS/ESM installed consumers; inspect the generated declarations
and pack listing as well. Record checks actually run, not merely planned commands.

Done means DEP-01–03 are completed with reconciled evidence, required checks pass,
the breaking removal is documented, no unrelated work is discarded, and useful
handoff/review material is not available only in ignored scratch directories.
