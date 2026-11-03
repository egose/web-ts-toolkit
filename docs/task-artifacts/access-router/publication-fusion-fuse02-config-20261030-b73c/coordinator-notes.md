> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FUSE-02 coordinator-ready completion evidence

Suggested disposition: **completed configuration task only**. No FUSE-03 runtime
publication bypass, performance claim, commit or release. The coordinator alone
owns `docs/tasks/20261030-082847-access-router-unsafe-output-publication-fusion.md`;
this child did not edit it or any shared status/task file and did not delegate.

All commands below ran from the repo root, serially. Final process verification
found **zero** active build/test/Mongo/benchmark/browser/lint/format jobs. No
background job was spawned by this task.

## Changed files

Source:

- `packages/access-router/src/interfaces/root.ts`
- `packages/access-router/src/acl/unsafe-snapshot-options.ts`
- `packages/access-router/src/runtime.ts`
- `packages/access-router/src/acl/service-authorization.ts`
- `packages/access-router/src/acl/model-output-planning.ts`
- `packages/access-router/src/validation/public-admission.ts`
- `packages/access-router/src/services/service.ts` — admission only; publication tail unchanged.

New focused tests/fixture:

- `packages/access-router/test/output-publication-fusion-options.unit.test.ts`
- `packages/access-router/test/output-publication-fusion-capture.unit.test.ts`
- `packages/access-router/test/output-publication-fusion-capture.integration.test.ts`
- `packages/access-router/test/output-publication-fusion-admission.unit.test.ts`
- `packages/access-router/test/output-publication-fusion-fixture.ts`

Existing tests were not edited. Additional ignored evidence/scripts live only in
`_tmp-publication-fusion-fuse02-config-20261030-b73c/`.

## Exact configuration/capture contract and internal symbols

Public model/default-model option additions only:

```ts
unsafeFuseListOutputPublication?: boolean;
unsafeFuseReadOutputPublication?: boolean;
```

Both default false. Model/default setters and effective option-bag capture accept
only literal `true`; truthy values normalize false. A model's explicit false wins
over defaults; model undefined restores inheritance; default undefined clears to
false. No prerequisite is enabled automatically.

For `List` / `Read`, the requested mode is active only if all four matching
effective initiating-query options are true:

- `unsafeSkip{List/Read}DocumentSnapshotChecks`
- `unsafeSkip{List/Read}OutputSnapshotChecks`
- `unsafeSkip{List/Read}NestedDocumentSnapshotChecks`
- `unsafeSkip{List/Read}InitialOutputSnapshotCopy`

Missing request means `off`; a true request with any missing prerequisite means
`dormant`. The full configuration privately owns the prerequisite decisions;
`CallRecord.outputPublicationFusion` holds a frozen `{ origin: 'List' | 'Read',
mode: 'off' | 'dormant' | 'active' }` summary computed at the initiating root.
Descendants inherit this summary, never infer it from their document-check boolean
or reread target/live flags. Existing six comparison/two initial-copy/eight combined
arrays and their order/meaning remain unchanged.

New package-internal symbols (none is a package runtime/type export):

- `unsafeOutputPublicationFusionOptions` — independent two-name group.
- `unsafeServerOptions` — ten-name admission/normalization aggregate only.
- `outputPublicationFusionPrerequisites` — explicit four-name tuples per operation.
- `outputPublicationFusionMode(operation, read)` — literal-true off/dormant/active selector.
- `CallRecord.outputPublicationFusion` and `inheritOutputPublicationFusion` — private origin capture/inheritance.
- `fusesOutputPublication(call, binding): boolean` — authenticates request/runtime/model/modelName/scope on every read.
- `AccessRuntime.outputPublicationFusionModes` — coherent before/after warning snapshots.
- `assertUnsafeServerControls`, factored `assertControlAdmission` and `defaultsControlBuckets` — private admission plumbing.

Only explicit authenticated `snapshotDerivation` query edges inherit fusion:
embedded scope extension, matched non-count related target (including a supplied
exact model identity), and same-binding READ retry. READ-to-list retains READ origin;
an included READ reached from LIST can retain LIST origin through its own retry.
Arbitrary parent/provenance alone, including generic `readResponse` without the
retry edge, remains inapplicable to fusion. Its historical initial-copy behavior is
deliberately unchanged. Fresh helpers (also reentrant inside an active getter),
writes/read-like write output/write-derived reads and dedicated subdocument origins
are inapplicable. Wrong-owner readers/receivers/handles fail controlled authentication.

**FUSE-03 integration handoff:** obtain the genuine call/binding through
`readServiceExecution(receiver, execution)`, then use `fusesOutputPublication` only
as captured selection. This is not receiver/stage/graph/private-seam eligibility,
nor a validation certificate. No new plan/context/DTO token or field was added.
Standalone finalizers still publish normally even when their genuine query call's
mode is applicable. Keep the FUSE-01 private root-tail eligibility refinement,
recursive associations and late child validation independently.

## Warnings and admission

- Coherent model/operation off/dormant/active comparisons happen around validated
  publication, after all inherited model snapshots are restored. Activation and
  dormancy warn once per effective transition; unchanged modes/off restoration do
  not warn. Any of the four prerequisites/default inheritance can change the mode.
- Active fusion warnings explicitly disclose omitted intermediate
  normalization/association, changed side effects/permission outcomes, possible
  denial-to-allowance, eligible private graphs only, original fallback and restoring
  the specific flag false. Dormant warnings name all four prerequisites and say
  intermediate/final publication remain separate. READ classification is explicit,
  not the historical `unsafeSkipRead` prefix heuristic.
- Throwing loggers cannot undo option publication or cause repeated-selection
  warnings. Failed model/default validation publishes neither options nor warnings.
- Both names reject by presence in public HTTP/root/args/options, nested
  include/populate/`$$sq` envelopes, service control envelopes, method defaults and
  raw authorization dimensions. Unsafe diagnostics say server model configuration
  only, never recommend these names as per-call backend policy.
- Named defaults buckets are preflighted even when their placement is inherited or
  non-enumerable. Existing `Service.defaults` assignment semantics are preserved:
  unsafe assigned/mutated bags fail before invocation/dispatch, not as a new blanket
  assignment-time authorization rejection. Runtime model/default/dotted defaults
  setters reject synchronously before publication.
- Same-named persisted data, predicates, selections, task data and business paths
  remain inert. Obsolete global placement does not select fusion.

## Verification

V1 passed, serial five-package transitive build:

```sh
pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build
```

Final V2 passed **1,286 tests in 24 files**: **356 new tests** plus **930 unchanged
existing tests**. Exact final command:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  --reporter=default --reporter=json \
  --outputFile.json=../../_tmp-publication-fusion-fuse02-config-20261030-b73c/v2-final-results.json \
  test/output-publication-fusion-options.unit.test.ts \
  test/output-publication-fusion-capture.unit.test.ts \
  test/output-publication-fusion-admission.unit.test.ts \
  test/output-publication-fusion-capture.integration.test.ts \
  test/query-snapshot-options.unit.test.ts test/query-snapshot-options.integration.test.ts \
  test/query-snapshot-work.unit.test.ts test/initial-output-snapshot-copy.unit.test.ts \
  test/service-execution-capture.unit.test.ts test/model-authorization-capture.unit.test.ts \
  test/default-model-options.unit.test.ts test/default-model-options.integration.test.ts \
  test/service-defaults.integration.test.ts test/service-authorization-context.unit.test.ts \
  test/service-authorization-boundary-admission.contract.test.ts \
  test/service-authorization-public-boundaries.integration.test.ts \
  test/service-authorization-finalizer.unit.test.ts test/read-list-fallback-authorization.integration.test.ts \
  test/read-snapshot-checks.unit.test.ts test/read-snapshot-checks.integration.test.ts \
  test/list-snapshot-checks.unit.test.ts test/list-snapshot-checks.integration.test.ts \
  test/service-list-preparation.unit.test.ts test/finalizer-preparation.unit.test.ts
```

New-file counts:

| File | Passed |
| --- | ---: |
| `packages/access-router/test/output-publication-fusion-options.unit.test.ts` | 288 |
| `packages/access-router/test/output-publication-fusion-capture.unit.test.ts` | 35 |
| `packages/access-router/test/output-publication-fusion-admission.unit.test.ts` | 20 |
| `packages/access-router/test/output-publication-fusion-capture.integration.test.ts` | 13 |

Coverage includes all 256 original-eight cross-products with four independent new
request combinations and both operations; all four missing/truthy prerequisites;
opposite target/operation flags; genuine nested/retry edges and malformed owners;
defaults/explicit false/undefined; existing/new model creation; atomic/dormant/
throwing-logger transitions; operation/identifier/document-hook capture before
awaits and rollback; handles; actual Mongo READ/LIST/populate/include/root execution;
standalone publication; helper reentry; write/subdocument origins; presence-based
control rejection and inert business names. No wall-clock unit assertions.

V5 passed on all 12 changed source/test/fixture paths:

```sh
pnpm exec eslint packages/access-router/src/interfaces/root.ts \
  packages/access-router/src/acl/unsafe-snapshot-options.ts packages/access-router/src/runtime.ts \
  packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/model-output-planning.ts \
  packages/access-router/src/validation/public-admission.ts packages/access-router/src/services/service.ts \
  packages/access-router/test/output-publication-fusion-options.unit.test.ts \
  packages/access-router/test/output-publication-fusion-fixture.ts \
  packages/access-router/test/output-publication-fusion-capture.unit.test.ts \
  packages/access-router/test/output-publication-fusion-admission.unit.test.ts \
  packages/access-router/test/output-publication-fusion-capture.integration.test.ts
pnpm exec prettier --check packages/access-router/src/interfaces/root.ts \
  packages/access-router/src/acl/unsafe-snapshot-options.ts packages/access-router/src/runtime.ts \
  packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/model-output-planning.ts \
  packages/access-router/src/validation/public-admission.ts packages/access-router/src/services/service.ts \
  packages/access-router/test/output-publication-fusion-options.unit.test.ts \
  packages/access-router/test/output-publication-fusion-fixture.ts \
  packages/access-router/test/output-publication-fusion-capture.unit.test.ts \
  packages/access-router/test/output-publication-fusion-admission.unit.test.ts \
  packages/access-router/test/output-publication-fusion-capture.integration.test.ts
git diff --check
```

Declaration/preservation/process verification passed:

```sh
node _tmp-publication-fusion-fuse02-config-20261030-b73c/summarize-tests.mjs
node _tmp-publication-fusion-fuse02-config-20261030-b73c/verify-contract.mjs contracts-and-preservation-final
node _tmp-publication-fusion-fuse02-config-20261030-b73c/check-processes.mjs
```

These evidence scripts intentionally create new result files with exclusive writes;
use a new output alias when rerunning contract verification, do not overwrite evidence.

## Emitted declarations, export and preservation confirmation

- TypeScript symbol/hover inspection passed **16** inherited property/entry checks:
  both options on ModelRouterOptions and DefaultModelRouterOptions from root and
  advanced CJS/ESM declarations. Both are optional `boolean | undefined`; JSDoc
  retains all four prerequisites, default/dormancy, fallback, capture/rollback,
  operation boundaries, retained protections and normalization/association risk.
- Generated declaration storage:
  `packages/access-router/dist/parsers-B6ckwHmh.d.ts` and `.d.mts`.
  SHA-256 both: `353f013aa8aee39f44c76d4e13aea5ab86f8d36cf678b7258c1a0386de42b3c7`.
- Runtime export sets exactly match FUSE-01: root 46, advanced 48, processors 6,
  each CJS/ESM. Public type export names also match (186/322/17 per entry/format).
  No new internal issuer/reader/group/guard export or package export path.
- Verified unchanged: all **540** official before-v1 regular artifact files,
  **2,051** earlier query-evidence files, **134** preserved dependency packages /
  **3,498** regular dependency files, lock, benchmark worker/core and package.json.
- Exact original service publication-tail text and complete finalizer/association/
  execution/related-execution/public-entrypoint source hashes match the preserved
  baseline. Only service admission changed. No runtime fusion wiring exists here.
- Current built ESM SHA-256:
  `91ab377f18515b4aecbbef6afeb6e6f6a434f2d60d0b5cd74d748b6e700bac26`;
  CJS `9a2d14f875cda2831d62c778ad7f8c4a81f63d5b58a4d37d4d3cd4271be432cf`.
  All 14 current dist hashes are retained in the contract evidence.
- Unrelated OIDC/example/client/root ESLint work was not edited, reverted or
  discarded. No dependency/lock/README/release/benchmark/workload/task edits.

Evidence files here: `v1-build.log`, `v2-final-combined.log`,
`v2-final-results.json`, `v2-summary.json`, `v5-eslint-final.log`,
`v5-prettier-final.log`, `v5-diff-check.log`,
`contracts-and-preservation-final.json`, `final-process-check.json`.
Logs/report paths were scrubbed to repo-relative paths; no session identifiers.

## Issues, limits and suggested task completion sentence

No unresolved FUSE-02 blocker. The first new-test run had two incorrect expectations
that unsupported boxed Boolean objects in direct private configuration should
produce a mode instead of controlled snapshot rejection. Corrected the tests to
preserve that rejection, while separately checking server option-bag normalization
to false. The declaration evidence script initially compared line-wrapped JSDoc
without whitespace normalization; corrected the evidence assertion, not the API.
Both final gates pass. Vitest emits a non-fatal future Vite native-config-loader
warning; no configuration/dependency migration was attempted in this task.

Intentionally not run/delivered: runtime publication fusion/risk/work-count changes,
full V3 package/typecheck/packed/docs gates, V4 downstream, V6 benchmark runner,
V7 performance/retention or independent FUSE-06 review. They remain later-task work;
no security equivalence, speedup, complete-package/workspace verification or
historical performance parity is claimed. This child stopped at FUSE-02.

Suggested coordinator completion evidence: “FUSE-02 added independent default-false,
literal-true server configuration with all-four-prerequisite root-origin capture,
authenticated query inheritance, coherent activation/dormancy warnings and public/
service/defaults/policy control rejection. V1 and scoped V5 passed; V2 passed 1,286
tests in 24 files (356 new), including unchanged eight-flag regressions. CJS/ESM
JSDoc/options and unchanged export/preservation identities verified. Publication
tail/finalizer/association remain original; runtime fusion belongs to FUSE-03.”
