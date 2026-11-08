# Access-router: mode-safe performance and focused cleanup

Created: 2026-11-05 08:49:39 PST (`20261105-084939`, generated with `date`).

Status: completed for the reconciled retained cleanup/tests/tooling scope.
ARPC-02/05 remain deferred; the original runtime-speedup objective is not complete.
Independent package-only acceptance passed on 2026-11-07.

## Objective and scope

Improve efficiency and simplify `packages/access-router` while preserving its current
processing and authorization contracts. Cover each of `readAuthorizationMode`,
`listAuthorizationMode`, `createAuthorizationMode`, and `updateAuthorizationMode`
in both `isolated` and `trusted`, including mixed settings.

Prioritize repeated immutable preparation, unnecessary orchestration, disabled-log
work, and demonstrably unused private code. Each performance change must benefit
the affected paths in both modes and avoid repeatable regressions elsewhere.
An unaffected path may remain performance-neutral; an aggregate speedup cannot
justify a slower mode, operation, or important workload.

This document records the initial review/backlog and its delegated execution below.
Public API redesign, new authorization flags, weaker isolation, and a broad service
rewrite are outside this objective. All source/document references
below are repository-relative; line numbers refer to the reviewed revision and
symbols are the durable lookup anchors.

### Verification scope — explicit user requirement

Test only `packages/access-router`. Use its focused test files during implementation
and its package-only suite for acceptance. This includes relevant unit/integration
tests owned by that package. Do not run whole-repository tests, grouped workspace
tests, or downstream-package test suites, including `access-router-deco`.

Build only `access-router` and transitive dependencies needed by its existing test
and typecheck scripts. Run lint only on affected package/tooling files. Benchmark
workloads must exercise `access-router` only; keep new benchmark-harness regression
tests under `packages/access-router/test/`. Existing access-router-specific timing
drivers under `scripts/benchmarks/` may be reused without running root test suites.

Repository-wide read-only symbol searches remain useful for reachability analysis.
Whole-workspace verification is outside this task's acceptance scope and is not a
completion blocker. This scope supersedes the draft's root/downstream test gates.

## Review coverage and evidence limits

- Reviewed revision: `6c3ceee`; `git status --short` was empty.
- Inspected mode selection, call/configuration ownership, service CRUD workers,
  output finalization/copying, document facts and stages, virtual/populate paths,
  sorting, concurrency, logging, and selected regression/work-count tests.
- Compared relevant historical CPU/ownership/mode tasks and benchmark documentation.
- No builds, tests, probes, profiles, or benchmarks were run during the initial source review.
  The findings below identify source-level work and cleanup opportunities, not
  measured speedups or newly demonstrated correctness defects.
- This is a focused service/output review, not an exhaustive review of every
  router, schema/index choice, database deployment, or downstream package.
- Current benchmark documentation explicitly excludes CREATE/UPDATE/UPSERT timing:
  `scripts/benchmarks/README.md:3–16`. Existing READ/LIST results cannot establish
  write-path performance, and write seeding outside timing is not write coverage.

### Findings and disposition

| Finding                                                                                    | Evidence                                                                                                                                                                                        | Impact / disposition                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal LIST and bulk CREATE prepare the finalizer per row                                  | `packages/access-router/src/services/service.ts:551–640,2144,2399`; `packages/access-router/src/output/finalize-model-output.ts:163–174,469–513`                                                | Repeated configuration wrappers, hook resolution and virtual-name preparation; ARPC-02. Batch helper reuse already exists but ordinary service paths do not use it. |
| Selected-value copies rebuild the same exclusion policy                                    | `packages/access-router/src/acl/output-field-filter.ts:310–350`; finalizer calls at `400,447`                                                                                                   | Repeated selection scanning/arrays/closures across fields and rows; ARPC-02. Raw-helper processing already prepares once per document.                              |
| Sort eligibility captures more configuration and rebuilds more sets than its apparent need | `packages/access-router/src/services/service.ts:659–711`; `packages/access-router/src/services/base.ts:102–173`                                                                                 | Possible READ/LIST overhead, especially with large policies/nested sort paths; bounded equivalence investigation ARPC-03.                                           |
| Empty virtual work and absent hooks retain async machinery                                 | `packages/access-router/src/output/finalize-model-output.ts:360–410`; `packages/access-router/src/helpers/concurrency.ts:9–45`; `packages/access-router/src/acl/output-field-filter.ts:105–148` | Possible common no-hook/no-virtual overhead; scheduling-sensitive investigation ARPC-04.                                                                            |
| Disabled debug logging still summarizes filters                                            | `packages/access-router/src/services/service.ts:1338–1368`; `packages/access-router/src/logger-helpers.ts:141–162,212–218`                                                                      | Avoidable filter traversal before the level check; ARPC-05.                                                                                                         |
| Bulk CREATE can repeat field-metadata visibility queries per row                           | `packages/access-router/src/services/service.ts:609–625,2109–2114,2399,3338–3365`                                                                                                               | Potential database round-trip amplification when field permissions are enabled; callback-sensitive investigation ARPC-06. LIST already batches this access check.   |
| Private static-policy chain and several arguments appear unused                            | `packages/access-router/src/acl/output-field-policy.ts:159–238`; `packages/access-router/src/acl/service-authorization.ts:863–874`; private signatures listed in ARPC-07                        | Concrete maintainability opportunity after repository-wide caller/export confirmation; ARPC-07. No runtime gain assumed.                                            |

### Relationship to previous work

- `docs/tasks/20261029-105358-access-router-query-cpu-follow-up.md`, QCPU-03,
  investigated finalizer hoisting and retained no change: native-copy observations
  and dynamic hook lookup timing lacked an equivalence proof. ARPC-02 revisits
  only the remaining work in the subsequent owned architecture. Current
  `readServiceFinalizerConfiguration` builds a small wrapper over captured values;
  it does **not** deep-copy the full configuration on every row.
- `docs/tasks/20261029-211734-access-router-query-pipeline-overhead.md`, PIPE-03–05,
  records existing captured-path preparation and rejected eager indexing/string-rule
  compilation. Preserve the former; do not revive rejected experiments by default.
- `docs/tasks/20261028-121231-access-router-snapshot-validation-cpu.md` records a
  withdrawn slower comparator and deferred BSON constructor shortcuts. Neither is
  proposed here.
- `docs/tasks/20261031-153020-access-router-owned-authorization-redesign.md` is the
  completed ownership redesign underlying this new phase, not work to repeat.
- `docs/tasks/20261103-172737-access-router-output-authorization-modes.md` records
  OAM-01–04 and scoped acceptance complete, with OAM-05 root acceptance blocked by
  an OIDC browser logout assertion. That is historical evidence only; ARPC-01 must
  establish the present access-router baseline. The historical root failure is not
  a demonstrated failure or an acceptance gate for this package-only task.

## Shared preservation requirements

1. Preserve defaults, inheritance, atomic option updates and new-call-only mode
   capture. A related target uses its own READ/LIST mode and policy; embedded scopes
   keep their owning-stage semantics. Mode selection follows captured operation
   origins, including READ fallback and both UPSERT branches.
2. Both CREATE/UPDATE modes must detach output from live post-write documents.
   Trusted writes omit only the later disposable document-hook view. Preserve
   pre-write operation/input authorization, lifecycle hook data and persistence
   behavior. See `packages/access-router/src/acl/document-stage.ts:543–615`.
3. Reuse only proven immutable, private, call/scope/projection-owned preparation.
   Keep row stages, facts, field decisions, contexts, copied values, references and
   budgets independent, including repeated object identities and duplicate IDs.
   Preserve binding/publication checks at their required observation boundaries.
4. Preserve projection/denial results, hydration and native-value handling,
   metadata exposure/aliases, include/populate target ownership, callback receivers,
   arguments, multiplicity, ordering and supported configuration lookup behavior.
   Current dynamic/native lookup observations cannot be declared irrelevant merely
   because a cache would be faster.
5. Preserve request-wide hook/persistence limits, FIFO admission where promised,
   reentry, output publication/failure draining, stage closure, and selected-output
   depth/node/payload/work limits. Avoid retaining call-owned data after settlement.
6. Keep one shared authorization/output engine. Optimize shared preparation rather
   than duplicating isolated/trusted implementations or relaxing either contract.

## Mode and workload acceptance matrix

ARPC-01 must record concrete package-local fixtures/commands for this matrix. Reuse
current fixtures and meaningful regression tests; add coverage only for identified gaps.

| Dimension             | Required coverage                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four settings         | Generate all `2^4 = 16` tuples in fixed order READ, LIST, CREATE, UPDATE. Assert the actual resolved settings; cover default/inherited settings separately.                            |
| CRUD branches         | READ hit/miss and READ-to-LIST fallback; LIST empty/single/many; CREATE single/bulk; UPDATE by ID/filter; UPSERT create/update. Include direct service and public wrapper paths.       |
| Mode ownership        | For each affected parent operation, isolated/trusted parent × isolated/trusted related target; exercise target READ and LIST edges, embedded scopes, populate and correlated includes. |
| Work shape            | No hooks/virtuals, sync/async document hooks, static/dynamic field rules, allow/deny, narrow/wide selection, exclusions, nested arrays, hydrated/lean data, native values.             |
| Metadata/sort/logging | Permissions stripped/default/exposed, field maps enabled/disabled; nested/virtual/denied-but-sortable fields; debug enabled/disabled and level changes during a call.                  |
| Lifetime/boundaries   | Concurrent rows, duplicate IDs, reentry, option changes in flight, controlled failures, limits, and post-write live-source mutation.                                                   |
| Unaffected operations | COUNT/DELETE/DISTINCT and raw output helpers retain their current semantics; raw helpers remain isolated.                                                                              |

Use a compact real-service correctness and performance matrix for all 16 tuples.
Run richer payload/scale cases for each active mode and the mixed target cases;
the whole fixture Cartesian product need not be multiplied by all 16 tuples when
ARPC-01 documents why settings are irrelevant to that path. Combined CRUD or
mixed-target results must not conceal per-operation results.

### Performance protocol (P)

- Establish a current-revision baseline before production changes. Compare candidate
  versus that baseline and, where needed, the preceding retained change so gains
  remain attributable. Record source revision/diff, build/fixture hashes, Node,
  pnpm, dependencies, OS/CPU, concurrency, configured/resolved modes and protocol.
- Time actual access-router service/public READ/LIST/CREATE/UPDATE/UPSERT execution,
  including authorization and finalization. Helpers are diagnostic probes only.
  Seed/reset outside timing, but keep the actual write and its output work inside
  timing; restore equivalent state between repetitions. Report database-backed
  latency separately from deterministic-adapter service CPU/allocation measurements.
- Include small/no-work controls and increasing row/field/selection sizes within
  existing limits. Exercise the optimization when both modes are active, rather
  than using fixtures that bypass all relevant authorization work.
- Use warmups, alternating/randomized paired baseline/candidate fresh workers,
  at least seven paired rounds per timing case, and two independent runs for a
  retained performance claim. Calibrate noise with baseline-versus-baseline runs
  and record the decision rule before inspecting candidate results.
- Record per-case wall time/throughput and CPU; use separate allocation/retained-heap
  probes where relevant. Collect work counts/query counts separately from timing.
  Do not time with spies, profiler instrumentation, forced GC, or concurrent builds.
- Verify output, errors and meaningful callback/query traces alongside measurements.
  Statistical noise is uncertainty, not permission to accept a repeatable slowdown.
  Investigate any repeatable regression in a mode/operation/control, then revise or
  reject the change. Do not average it away or increase the tolerance afterward.
- A performance improvement needs deterministic reduced work plus measured CPU,
  allocation or latency benefit on affected real paths in **both** modes, with
  other cases satisfying non-regression. If only allocation/work improves, label
  the claim accordingly; do not invent a wall-clock speedup. Cleanup can instead
  demonstrate reduced private complexity and passing behavior checks.
- A bounded investigation may complete with an evidenced no-change decision.
  If an improvement cannot meet acceptance, mark it deferred/cancelled with a
  rationale and explicitly revise dependent tasks before proceeding.

## Ordered tasks

Priorities: **P1** establishes essential evidence or targets repeated shared hot-path
work; **P2** is a bounded/conditional opportunity; **P3** is maintainability cleanup.
These priorities do not imply confirmed defects. Execute in numeric order: several
tasks touch `service.ts` and the finalizer, and paired results need clear attribution.

### Task ARPC-01: Establish the four-mode baseline and close write timing gaps

Status: completed
Kind: investigation
Priority: P1 — no all-mode improvement claim is currently supportable.
Dependencies: none

Primary ownership:

- Access-router-specific drivers and documentation in `scripts/benchmarks/`;
  new harness regression tests belong under `packages/access-router/test/`.
- `packages/access-router/test/write-output-test-fixture.ts`,
  `packages/access-router/test/owned-stage-test-fixture.ts` and focused mode/work tests.

Finding / references: `scripts/benchmarks/README.md:9–16` excludes write timing;
`packages/access-router/test/write-output-modes.unit.test.ts` provides real write
workers to use as behavioral references. Historical timing protocols must remain
identifiable rather than being silently repurposed for a different catalog.

Requirements:

1. Establish executable coverage for the matrix and protocol P; document the new
   driver/suite names, exact package-scoped commands and any unavailable prerequisites.
2. Measure where preparation, copying, scheduling, logging and metadata queries
   contribute on current code. Include real LIST/bulk CREATE work counts, and
   READ/UPDATE controls; distinguish I/O cost from router work.
3. Capture baseline access-router test/type/build results before implementation.
   Record any failure with reproduction evidence instead of inheriting historical labels.

Acceptance criteria:

- All 16 setting tuples have named real-service fixtures; CREATE/UPDATE and both
  UPSERT branches execute inside timing. Mode ownership and output checks pass.
- A reproducible baseline and noise/decision protocol exists, with a prioritized
  measurement summary for ARPC-02–06. Missing coverage is explicit and blocks the
  corresponding claim rather than being filled with historical results.
- The new harness rejects mode/fixture mismatches and checks stable write state;
  focused package-local harness tests protect those meaningful failure cases.

Verification: V1 mode/write families and package-local harness tests, V2 baseline,
and P. Record the concrete new commands before completing this task.

### Task ARPC-02: Amortize safe finalizer and selected-copy preparation

Status: deferred
Kind: improvement
Priority: P1 — repeated setup scales with service rows and selected values.
Dependencies: none for candidate preparation; ARPC-01 measurement acceptance is
still required before retaining a performance claim (see execution adjustment).

Primary ownership:

- `packages/access-router/src/output/finalize-model-output.ts`
- `packages/access-router/src/acl/output-field-filter.ts`
- `packages/access-router/src/services/service.ts`
- Finalizer/list preparation and write-output tests.

Finding / references: `prepare` at finalizer `163–174` runs through
`finalizeModelOutput:469–479` for each service row. `finalizeModelOutputs:482–513`
already shares preparation, but production batching was found in
`packages/access-router/src/acl/subdocument-output.ts`, not ordinary LIST/CREATE.
`copyOutputValue` at output-field-filter `310–350` rebuilds exclusions for each value.
`packages/access-router/test/finalizer-preparation.unit.test.ts:38–69` covers helper
batch preparation, not the ordinary service-row wiring.

Requirements:

1. First reuse immutable selected-copy policy per authenticated plan/scope rather
   than rebuilding it for every selected persisted/virtual value. Preserve negative
   selects, catalog eligibility, protected/opaque/reference rules and budget charges.
2. Separately measure and reuse safe finalizer preparation across actual LIST/bulk
   CREATE rows. Preserve per-row completions, metadata, include/populate handoffs,
   budgets and decoration order; blindly switching to the batch helper is insufficient.
3. Re-prove hook/virtual lookup equivalence under the owned architecture. Keep dynamic
   resolution local where required; do not hoist an entire resolver solely because
   its surrounding configuration is captured. Retain required binding checks.
4. Cover READ/UPDATE, embedded scopes and related targets as consumers of shared code.
   Do not retain caches on long-lived services or key decisions by source/ID.

Acceptance criteria:

- Real service tests show eligible setup scaling by call/scope/projection, not
  rows × selected values; row stages/facts remain distinct. Existing helper tests
  alone do not satisfy this criterion.
- Select-copy and row-preparation changes each have attributable P evidence, or
  the unsupported subchange is explicitly excluded with evidence.
- Both modes gain on affected paths; singleton and other CRUD controls do not
  regress. Dynamic/native observation, failure and lifetime checks pass.

Verification: V1 preparation/modes/publication/related families, V2, and P.

### Task ARPC-03: Investigate narrower and reusable sort-path preparation

Status: completed
Kind: investigation
Priority: P2 — avoidable-looking READ/LIST work has observable configuration edges.
Dependencies: ARPC-01

Primary ownership:

- `packages/access-router/src/services/service.ts`
- `packages/access-router/src/services/base.ts`
- `packages/access-router/src/helpers/sort-policy.ts` and sort tests.

Finding / references: `getEffectiveAllowedSortFields:659–678` calls
`captureVirtualSnapshot:695–711`, copying permission schema/document-hook/metadata
configuration as well as virtuals. READ/LIST already hold captured configuration
at service `1531,1915`. `isVirtualDbPath` and its helpers in base `102–173` repeatedly
construct leaf/container sets while traversing field paths.

Requirements:

1. Measure wide-policy and nested-sort workloads with few/many/no virtuals.
2. Determine whether a private call-captured virtual/catalog view can supply the
   same classification; independently evaluate call-local scope membership reuse.
3. Preserve persisted explicit sortable grants, registered virtual exclusion,
   numeric/array paths, fallback sort behavior, capture exceptions, native lookup
   observations and supported Service overrides. Keep public snapshot behavior.
4. Bound this to sort eligibility. If narrowing changes observations, retain the
   current capture and evaluate only an equivalent smaller optimization.

Acceptance criteria:

- A documented implement/no-change decision addresses capture and set construction
  separately, with measurements and equivalence evidence.
- Any retained code reduces actual sort preparation in isolated/trusted READ/LIST,
  preserves adapter sort arguments/errors, and passes P including empty/small controls.

Verification: V1 sort/capture families, V2 for retained code, and P.

### Task ARPC-04: Investigate no-work scheduler and absent-hook overhead

Status: completed
Kind: investigation
Priority: P2 — common-path async overhead may be small or semantically significant.
Dependencies: ARPC-01; ARPC-02 removed after its candidate withdrawal (no retained
preparation changes need integration; see execution reconciliation).

Primary ownership:

- `packages/access-router/src/helpers/concurrency.ts`
- `packages/access-router/src/output/finalize-model-output.ts`
- `packages/access-router/src/acl/output-field-filter.ts`
- `packages/access-router/src/acl/document-stage.ts` only if a proven stage fast path is needed.

Finding / references: finalizer `360–410` awaits candidate mapping for an empty
candidate list. `mapWithConcurrencyLimit:15–22` constructs one worker and
`Promise.allSettled` for empty input. `prepareOutputDocumentStage:127–147` still
routes absent hooks through async invocation/resolution.

Requirements:

1. Measure the two opportunities independently: empty orchestration and genuinely
   absent root hooks. An embedded stage inheriting owner facts is not an empty stage.
2. Prototype the smallest equivalent shortcut only where material; preserve empty
   result shape, pending/resolved/failed stage rules, public async behavior,
   callback interleaving, reentrant admission and failure draining.
3. Do not bypass closure/publication/budget checks or omit the normalization/accounting
   required for empty facts. Hooks that exist but return no grants still execute.

Acceptance criteria:

- Evidence distinguishes reduced promises/work from a meaningful real-service gain
  in both modes; otherwise record no change.
- Retained shortcuts pass concurrency limits 1 and greater than 1, FIFO/reentry,
  publication failures, inherited facts, and hook-present/no-hook controls under P.

Verification: V1 concurrency/facts/publication and mode families, V2 for retained
code, and P. Add tests for observable scheduling risks, not implementation details.

### Task ARPC-05: Defer filter summaries until debug logging is enabled

Status: deferred
Kind: improvement
Priority: P2 — concrete mode-independent work on disabled logging paths.
Dependencies: ARPC-01

Primary ownership:

- `packages/access-router/src/services/service.ts`
- `packages/access-router/src/logger-helpers.ts`
- `packages/access-router/test/logger-redaction.test.ts`

Finding / references: `beginOp`/`completeOp` at service `1338–1368` evaluate
`summarizeFilter` before `debug:212–218` checks the level. The disabled-level test at
logger-redaction `125–147` checks logger invocation, not skipped summary traversal.

Requirements:

1. Add a private lazy message/context boundary or equivalent minimal gating so
   disabled debug events do not traverse filters to construct summaries.
2. Preserve enabled output, redaction/structure-only logging, fallback loggers,
   logger receivers and exception handling. Keep conservative enablement when
   `isLevelEnabled` is missing or throws.
3. Preserve timestamps/durations and a logger/level changing between begin/end.
   Avoid stale global enablement caches or redundant checks that alter custom
   logger behavior. Verify query handling with admitted complex/native filters.

Acceptance criteria:

- Real service calls show zero summary work when debug is disabled and unchanged
  enabled messages/call behavior for supported loggers.
- Large-filter and small-filter controls show benefit/non-regression under P for
  both modes and every CRUD path using these logging helpers.

Verification: V1 logging plus affected CRUD families, V2, and P.

### Task ARPC-06: Determine whether bulk-CREATE metadata queries can safely coalesce

Status: completed
Kind: investigation
Priority: P2 — potentially larger I/O savings, with application-observable constraints.
Dependencies: ARPC-01; ARPC-02 removed after its candidate withdrawal (the current
metadata boundary is unchanged; see execution reconciliation).

Primary ownership:

- `packages/access-router/src/services/service.ts`
- Field-permission metadata, write-output and filter callback tests.

Finding / references: LIST precomputes `fieldPermissionAccess:2109–2114`.
Bulk CREATE calls `finalizeDirectOutput:2399` without that batch metadata; its
fallback at `609–625` calls `getFieldPermissionAccess([source._id])`, whose
`3338–3365` implementation can perform two visibility reads per row.

Requirements:

1. Verify actual counts with `disableFieldPermissions: false` and requested maps;
   include disabled/stripped controls, denied rows, repeated IDs and custom filters.
2. Characterize `genFilter` callback counts, incoming ID filters, timing relative
   to save/change/output hooks, per-row grants and failure behavior before batching.
3. Determine if any existing, provably equivalent path permits coalescing. A normal
   per-row callback must not silently become a once-per-batch callback. Do not add
   a purity opt-in or infer purity from function identity to enable this optimization.
4. If equivalence cannot be proved under current contracts, conclude no change and
   document the remaining query cost. This investigation does not require batching.

Acceptance criteria:

- A query/callback trace and explicit equivalence or no-change decision exists.
- Any retained optimization reduces eligible queries in both create modes while
  preserving metadata, callback traces, errors, row ownership and write detachment;
  single CREATE/UPDATE and dynamic-filter cases pass P controls.

Verification: V1 metadata/write/filter families within access-router, database-backed
package integration evidence, V2 for retained code, and P.

### Task ARPC-07: Remove proven-unused private policy code and arguments

Status: completed
Kind: improvement
Priority: P3 — simplify maintenance without assuming a runtime saving.
Dependencies: ARPC-03, ARPC-04, ARPC-06. ARPC-02/05 removed after both candidates
were withdrawn; cleanup preserves restored baseline behavior, not archived candidates.

Primary ownership:

- `packages/access-router/src/acl/output-field-policy.ts`
- `packages/access-router/src/acl/service-authorization.ts`
- `packages/access-router/src/output/finalize-model-output.ts`
- `packages/access-router/src/services/service.ts`
- `packages/access-router/src/acl/prepared-query.ts` and mechanical private callers.

Finding / references:

- Repository TypeScript search found no external callers of the private chain
  `prepareStaticOutputPaths`, `staticFieldPolicy`, `StaticOutputPath`,
  `booleanRuleLookup`, `ordinaryContainer`, `canPrepareStaticOutputPolicy`
  (output-field-policy `159–238`; service-authorization `863–874`).
- `FinalizeModelOutputArgs.snapshot:92` appears unused; `finalizeDirectOutput`'s
  `sharedGate:557` is unused. Private `findPrepared:1905`, `createPrepared:2211`
  and `updateOnePrepared:2558` accept unused `decorate` arguments.
- Decoration is already performed after publication by
  `packages/access-router/src/acl/prepared-query.ts:167–277`.
- Several authorization reader comments still describe per-read native detachment,
  although current readers wrap call-owned slices (`service-authorization:796–860`).

Requirements:

1. Confirm reachability across all source, tests, scripts, entrypoint exports and
   generated declarations before removing each item. Earlier TypeScript search is
   a starting point, not proof of package-wide absence. These are read-only searches,
   not authorization to run other packages' tests.
2. Remove only the dead chain/parameters and their plumbing. Keep active call-field
   preparation and public decoration signatures/behavior. Keep the public
   `captureVirtualSnapshot` method and any still-used `FinalizeSnapshot` type.
3. Update stale ownership/reader comments to match current behavior. If a candidate
   is live, document its role instead of forcing its removal or redesigning it.
4. Reuse existing package behavioral/type/export checks; do not add tests that merely
   mirror deleted code. Measure bundle/runtime effects before claiming either.

Acceptance criteria:

- A short keep/remove ledger records search evidence and the final disposition of
  each candidate. Proven unused code/plumbing is gone, comments are accurate, and
  public API/declaration and decorator behavior checks pass.
- The diff remains a focused simplification, with no policy or mode contract change.

Verification: repository-wide symbol/export search, V1 decoration/preparation
families, V2, and final P controls (no separate speedup claim required).

### Task ARPC-08: Verify the integrated package result and publish measured conclusions

Status: completed
Kind: investigation
Priority: P1 — final acceptance must cover the combination of retained changes.
Dependencies: ARPC-01, ARPC-03, ARPC-04, ARPC-06, ARPC-07. ARPC-02/05 deferred
improvements are excluded from retained-change acceptance; verify both withdrawals
and the documented residual opportunities instead.

Primary ownership: this task record, access-router package checks and the evidence
bundle under `docs/task-artifacts/access-router/20261105-084939-performance-cleanup/`
(create during execution).

Finding / references: shared service/finalizer changes interact, and current
benchmarks lack write coverage; isolated helper improvements cannot establish
the user's all-mode non-regression requirement.

Requirements:

1. Review every acceptance criterion against actual code and evidence, including
   callback/process preservation and all four mode selectors. Record implemented,
   rejected and deferred candidates with reasons.
2. Run the integrated access-router matrix and P against the original baseline;
   compare each operation/mode/target combination, small controls, scale cases and
   retained heap.
3. Complete V2–V3 on the final retained tree; reuse still-valid focused evidence.
   Investigate failures against the current package baseline before calling them
   unrelated. Keep acceptance within the explicit package-only verification scope.
4. Preserve curated reports, protocols, fixture/source provenance and reproducible
   commands following `docs/task-artifacts/README.md`; link them from this record.

Acceptance criteria:

- Every retained performance claim has mode-specific measurements, and no required
  cell has an unexplained repeatable regression. Cleanup has concrete complexity
  reduction and passing contract checks.
- Required package checks pass; any unavailable package gate leaves acceptance
  blocked with the exact prerequisite. Investigation no-change outcomes remain
  visible. Whole-workspace and downstream suites are not acceptance gates.
- Evidence contains no credentials, private session IDs or machine-local paths;
  links resolve without relying on disposable scratch data. Claims are limited to
  measured workloads rather than universal guarantees for arbitrary applications.

Verification: P, V2, V3 and evidence/reference review, all within the declared scope.

## Verification commands and execution rules

Commands below defined the initial verification plan; actual executed commands,
results and scope adjustments are recorded in the execution evidence. Working directory:
repository root; commands explicitly select access-router rather than root test
scripts. Prerequisites: installed workspace dependencies, Node satisfying the
package's `>=24` engine, pnpm, and MongoDB memory-server prerequisites for its
database tests. Replace every angle-bracket placeholder before execution.

Use a fresh ignored `_tmp-arpc-<run-id>` repository-local directory for scratch,
confirm it with `git check-ignore`, and set `TMPDIR` to its absolute path at runtime.
Record that path as `'<repo-root>/_tmp-arpc-<run-id>'` in shared evidence. Preserve
useful material in the ARPC-08 artifact destination before handoff. No scratch
files or runtime artifacts were created during this review.

### V1 — Focused access-router checks after a meaningful change

Build first because tests mix source imports with `dist` imports:

```sh
pnpm --filter @web-ts-toolkit/access-router... build
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/finalizer-preparation.unit.test.ts test/service-list-preparation.unit.test.ts test/write-output-modes.unit.test.ts
```

The build filter includes transitive dependencies only to produce required artifacts;
the test filter has no ellipsis and executes only access-router's selected tests.
Use the same `vitest run` form with the actual affected files below, plus new
matrix/regression files recorded by the implementing task. File names in this
table are relative to `packages/access-router/test/`.

| Family                      | Existing focused suites                                                                                                                                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparation                 | `finalizer-preparation.unit.test.ts`, `service-list-preparation.unit.test.ts`, `owned-authorization-work.unit.test.ts`, `owned-authorization-projection-work.unit.test.ts`, `output-field-policy-cache.unit.test.ts`                                                                                                       |
| Modes / writes              | `owned-authorization-modes.unit.test.ts`, `owned-authorization-modes.integration.test.ts`, `write-output-modes.unit.test.ts`, `write-output-authorization.unit.test.ts`, `write-output-origin-ownership.unit.test.ts`, `write-output-source-lifetime.unit.test.ts`, `read-list-fallback-authorization.integration.test.ts` |
| Publication / facts         | `owned-authorization-stage.unit.test.ts`, `owned-authorization-facts.unit.test.ts`, `owned-authorization-publication.unit.test.ts`, `owned-authorization-boundaries.unit.test.ts`, `owned-authorization-many-bounds.unit.test.ts`                                                                                          |
| Related / decoration        | `write-output-populate.unit.test.ts`, `service-authorization-related.integration.test.ts`, `service-authorization-subdocuments.integration.test.ts`, `virtuals-populate-include.integration.test.ts`, `service-authorization-prepared-query.unit.test.ts`, `response-pipeline.internal.test.ts`                            |
| Sort / capture              | `sort-policy.unit.test.ts`, `basic-list-sort.integration.test.ts`, `sort-options.integration.test.ts`, `sort-field-authorization.integration.test.ts`, `query-snapshot-options.unit.test.ts`, `service-execution-capture.unit.test.ts`                                                                                     |
| Concurrency                 | `concurrency.test.ts`, `hook-concurrency.test.ts`, `request-hook-concurrency.test.ts`, `request-hook-ownership.test.ts`, `request-persistence-concurrency.test.ts`                                                                                                                                                         |
| Metadata / filter / logging | `permissions-posture.integration.test.ts`, `include-permission-metadata.integration.test.ts`, `field-permissions-placeholder.integration.test.ts`, `field-permissions-opt-out.integration.test.ts`, `filter-denial.integration.test.ts`, `logger-redaction.test.ts`                                                        |

For benchmark changes, add/run focused harness regressions through access-router's
Vitest suite. ARPC-01 must record exact commands for new package-local harness tests
and access-router-only write/mixed-mode timing; existing drivers must not be
described as measuring those workloads already. Do not invoke root benchmark test
suites as an additional acceptance gate.

### V2 — Access-router package acceptance

```sh
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test
pnpm exec eslint packages/access-router/src packages/access-router/test
```

Run these sequentially. The package suite includes existing packed-consumer,
strict-type, export and tree-shaking checks; preserve those while simplifying
private signatures. Its test/typecheck scripts rebuild access-router and needed
dependencies, but do not run dependency test suites. Lint any changed access-router
benchmark files by explicit path as well. Capture final tree identity and results;
do not repeatedly rerun unchanged gates without a reason.

### V3 — Final package integration and evidence review

- Confirm V1 regression/mode evidence, V2 package checks and P measurements describe
  the final retained tree; rerun only checks invalidated by later changes.
- Confirm every required CRUD/mode/related-target cell has package-local coverage
  and every retained claim has per-case non-regression evidence.
- Review public types/exports through access-router's own checks and reconcile
  task statuses, deferred decisions and durable references.
- Record verification as access-router-only acceptance, not whole-workspace acceptance.

Follow `AGENTS.md` build serialization: package commands can rebuild shared
transitive `dist` outputs, so do not run conflicting builds/tests concurrently in
one checkout. No root build/lint/test sweep, grouped test runner or downstream
package test command is required or authorized by this task.

## Definition of done and handoff

- Each task records status, changes/decision, commands/results, revision and durable
  evidence. A saved plan or written patch is not implementation completion.
- Investigations can complete with an evidenced no-change decision. Deferred or
  cancelled tasks do not silently satisfy dependencies: explicitly revise the
  dependent scope and dependency list, preserving the rationale.
- The final report lists gains by operation and mode, unchanged controls, cleanup
  outcomes and rejected experiments. It states measurement limits and any blockers.
- All retained changes satisfy behavior preservation, P and their required
  access-router-only gates. Missing package prerequisites leave the affected task
  blocked; root/downstream suites are intentionally outside this acceptance scope.

## Execution record

- Coordinator: delegated sequential implementation in the shared checkout; no
  conflicting builds/tests will run concurrently. Separate subagent sessions own
  bounded tasks, with an independent final reviewer for ARPC-08.
- Starting tree: revision `6c3ceee`; only this task document was untracked.
- ARPC-01 baseline session: in progress. Establish package-only checks and maintained
  all-mode CRUD measurement coverage before changing production code.
- Verification scope remains access-router only. No repository-wide or downstream
  test commands are authorized for this execution.

### Baseline delivery and execution adjustment

- ARPC-01 delivered real direct/public CRUD fixtures for all 16 tuples, source-sealed
  baseline/candidate selection, package-local harness tests and separate work probes.
  Package baseline: **7,403 tests / 204 files passed**, typecheck and scoped lint
  passed. See `docs/task-artifacts/access-router/20261105-084939-performance-cleanup/arpc-01-report.md`.
- The first short-sample calibration is too noisy in most cells and cannot support
  acceptance. A separately named longer-window/panel protocol is calibrating the
  unchanged frozen baseline; its cap/slowdown rules were not relaxed.
- ARPC-02's original dependency on completion of all ARPC-01 measurements is revised
  only to permit preparing a candidate while calibration runs. The immutable
  production baseline and passing package baseline are already delivered. No
  concurrent build/test/benchmark is permitted, no candidate timing starts before
  calibration settles, and unresolved evidence still blocks retention/claims and
  final acceptance. This is not a declaration that ARPC-01 is completed.
- Preliminary ARPC-03/04/06 source-only investigations run in separate read-only
  subagent sessions while measurements run; they do not change files or execute
  tests and are not recorded as completed tasks.

### Resumption and bounded decisions (2026-11-07)

- Earlier preliminary subagent sessions failed at their usage limit. Fresh sessions
  resumed the work sequentially; no success is attributed to failed sessions.
- ARPC-01 is completed as the baseline/instrumentation investigation: all 16 tuples
  have real-service fixtures, current package gates pass, and noise/claim limits
  are recorded. This does **not** certify the full performance matrix. Specialized
  workload and usable-measurement gaps remain gates on individual future claims.
- ARPC-02's bounded candidate passed 1,376 tests / 30 files but the focused v2
  calibration yielded **0/16 usable cells** (140 workers, seven pairs in two
  repeats). Observed preparation counts are not measured allocation savings.
  The subagent withdrew only its candidate edits and restored all source/dist
  bytes to the original baseline. The improvement is deferred, not completed;
  dependent scopes above explicitly exclude it. See
  `docs/task-artifacts/access-router/20261105-084939-performance-cleanup/arpc-02/withdrawal/report.md`.
- ARPC-03 completed with a source-backed no-change decision: narrower capture omits
  observable option/native/override behavior; membership reuse lacks an equivalence
  proof. No prototype or performance claim remains, so speculative sort timings are
  not a completion requirement for this rejected design. See
  `docs/task-artifacts/access-router/20261105-084939-performance-cleanup/arpc-03-report.md`.
- ARPC-04/06 delivered no-change recommendations and new characterization suites.
  Their runtime verification remains pending. ARPC-05 begins against the restored
  baseline, not the archived preparation candidate. Only one executor may run
  builds/tests/benchmarks at a time.

### Verified investigations and logging disposition

- ARPC-04/06 characterization ran against the unchanged production boundaries:
  **972 tests / 31 files passed**, including 50 new cases, filtered build and scoped
  lint. Empty-map/absent-hook ordering and accounting are observable; metadata
  callbacks and per-row DB mutation rule out blind batching. Both investigations
  complete with no retained optimization. Actual results supplement their original
  unrun reports in
  `docs/task-artifacts/access-router/20261105-084939-performance-cleanup/arpc-046-verification.md`.
- ARPC-05's minimal candidate passed correctness checks and eliminated the observed
  disabled summary calls, but **0/8 timing cells** satisfied the fixed noise cap.
  This is not measured allocation or non-regression evidence. The coordinator
  withdrew it rather than lowering P; ARPC-05 remains deferred with its exact
  candidate/guards archived. All 151 source and 15 dist files matched the original
  baseline after withdrawal; 638 tests / 11 files, typecheck/build and scoped lint
  passed. See
  `docs/task-artifacts/access-router/20261105-084939-performance-cleanup/arpc-05/withdrawal/report.md`.
- ARPC-07 now owns focused private simplification. ARPC-08 will review that retained
  change, harness/characterization tests, both withdrawals and the no-change
  investigation decisions. Neither deferred speedup is silently counted completed;
  their residual performance opportunities and measurement blockers remain visible.

### Cleanup delivery and final acceptance scope

- ARPC-07 completed: removed five dead private functions and one interface, unused
  finalizer/prepared-worker arguments and their mechanical plumbing, and corrected
  comments. Eight production files changed (17 added / 132 removed lines); public
  declaration bytes stayed identical. **1,623 tests / 36 files**, filtered build/
  typecheck and affected-file lint passed. Before/after 128 work/trace records were
  identical. See
  `docs/task-artifacts/access-router/20261105-084939-performance-cleanup/arpc-07-report.md`
  and the accompanying keep/remove ledger.
- ARPC-08 starts in a fresh independent reviewer session, not an implementation
  session. Its retained scope is this cleanup, maintained CRUD tooling and regression
  tests. It must run the final access-router-only suite, inspect public declarations,
  source behavior, task evidence/privacy/references, and verify neither withdrawn
  optimization has returned. No runtime speedup is claimed for cleanup.
- The original ARPC-08 integrated performance comparison applies to retained
  performance changes. Both candidates were withdrawn, so acceptance of the retained
  maintainability scope does not require another noisy timing experiment or certify
  the unmet speedup goals. The all-mode correctness matrix and unchanged outputs/
  callbacks remain required; deferred timing/heap/specialized performance evidence
  must be explicitly listed in the final report, not marked passed.

### Independent final acceptance (2026-11-07)

- Fresh independent ARPC-08 review accepted the retained cleanup/tests/tooling scope
  with no blocking finding. The reviewer inspected source/callers, public declarations,
  all-mode fixtures, archived measurements and both candidate withdrawals rather than
  relying solely on implementer reports. See
  `docs/task-artifacts/access-router/20261105-084939-performance-cleanup/arpc-08-review.md`.
- Final commands, run sequentially from repository root with an ignored repo-local
  TMPDIR, all passed:
  - `pnpm --filter @web-ts-toolkit/access-router typecheck`
  - `pnpm --filter @web-ts-toolkit/access-router test` — **7,558 tests / 210 files**;
    the final package suite ran once, with no failed/skipped/pending tests reported.
  - `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks/access-router-crud-v2-worker.mjs scripts/benchmarks/access-router-crud-v2.mjs scripts/benchmarks/access-router-crud-worker.mjs scripts/benchmarks/access-router-crud.mjs`
- All eight public declaration files remained byte-identical. Final 96 CRUD and
  32 preparation work/trace records matched the earlier before/after evidence.
  Source identity is `072039b46ed3603f995bd04a9b0e09817dce13cef58679774b45da5efa02caef`;
  exact manifests/results are in the independent verification packet. No source,
  test or tooling edits followed this final run; only task/index documentation.
- The evidence audit found no broken file links, malformed JSON, private session
  identifiers or machine-local paths. One trailing space in a sealed historical
  timeout excerpt was documented rather than silently changing its bytes/hashes.
- Root/grouped/downstream tests were **not run** and are not pending gates.

| Task    | Final disposition                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------- |
| ARPC-01 | Completed bounded baseline/tooling investigation; full performance matrix not certified.                  |
| ARPC-02 | Deferred; preparation candidate withdrawn because useful benefit/non-regression evidence was unavailable. |
| ARPC-03 | Completed no-change investigation; preserve observable sort capture/lookup/fallback behavior.             |
| ARPC-04 | Completed no-change investigation, with passing scheduling/accounting characterization.                   |
| ARPC-05 | Deferred; logging candidate withdrawn after noisy measurements, including an uncertain slower control.    |
| ARPC-06 | Completed no-change investigation, with passing real-DB callback/query characterization.                  |
| ARPC-07 | Completed private cleanup; no public API or policy change and no speedup claim.                           |
| ARPC-08 | Completed independent acceptance of the explicitly reconciled retained scope.                             |

Residual performance work requires usable baseline/candidate measurements before
reconsidering ARPC-02/05. Allocation/retained-heap, specialized related/sort/dynamic/
logging/failure/limit timing and actual DB latency remain unmeasured. No universal
or all-workload performance non-regression claim is made. The next action, if the
user chooses further speedup work, is a new bounded measurement effort on a stable
host; do not resurrect the archived candidates as already accepted optimizations.

Final bundle guide:
`docs/task-artifacts/access-router/20261105-084939-performance-cleanup/FINAL.md`.
