# Access-router unsafe READ/LIST authorization fast path

Created: 2026-10-30 14:24:06 PDT
Status: completed

Final outcome: both flags are delivered and independently accepted under the
explicitly weaker opt-in contract. Latest `33662fae…` affected-package gates and
final-build timings pass; all eight tasks are complete and no known blocker or
required verification remains. Nothing was committed or published. Historical
failures/results below are preserved, not claims about the final artifact.

## Objective and authorization

Implement two independent, default-false server model/default-model options:

```ts
unsafeUseListAuthorizationFastPath?: boolean;
unsafeUseReadAuthorizationFastPath?: boolean;
```

The user explicitly requested this task file and sequential subagent implementation.
The goal is performance-first READ/LIST data flow closer to v0.51.0: **still run
permission rules and document hooks**, while intentionally removing selected newer
snapshot, defensive isolation, normalization, output-graph verification and repeated
authorization bookkeeping. This is option 4, **not** a complete authorization bypass
or the withdrawn publication-fusion experiment.

Security equivalence, identical historical behavior and v0.51.0 performance are not
promised. The new active mode may expose mutable inputs/grants, reuse stale decisions,
accept changed descendants and observe different native side effects or exceptions;
actual permission outcomes can change, including denial becoming allowance. Those
are intentional contract changes to document and test, not bugs to hide by weakening
default-mode tests. An explicit matrix of omitted/retained work must precede runtime
implementation. Do not promise a measured speedup before measurement.

## Existing work, source evidence and scope

Starting HEAD: `8fb1fe7`, clean worktree at creation. Earlier task changes have been
committed by the user since the prior session; this phase must not undo them.

- [Withdrawn fusion investigation](20261030-082847-access-router-unsafe-output-publication-fusion.md):
  omitted private publication work but retained expensive isolation/graph checks;
  failed acceptable-benefit retention. Do not recreate it with another name or
  delete its absence-of-fusion regressions. The proposed names are new and distinct.
- [Query-pipeline phase](20261029-211734-access-router-query-pipeline-overhead.md):
  retained record builders/catalog preparation stay in strict and existing modes.
- [Initial output-copy flags](20261029-164234-access-router-initial-output-snapshot-copy-opt-outs.md):
  the existing six comparison plus two copy flags keep their independent contracts.

Inspected v0.51.0 source, read-only via Git:

- `packages/access-router/src/services/service.ts` (`find`, `findOne`): filter/select
  planning, document grants, per-row finalization, populate/includes and decoration
  exist; `skim` could avoid some grant work. This is not raw unauthenticated querying.
- `src/output/finalize-model-output.ts` (`resolveDocPermissions`, `finalizeSingleDoc`):
  normalizes an isolated output, shares supplied grants, builds a shallow scope context,
  finalizes embedded children and evaluates rules/getters. It does not implement the
  modern document snapshot/opaque-output graph-owner modules.
- Current `src/acl/document-authorization.ts`: copies stage snapshots, hook inputs,
  grants and grants per decision; retains memo promises and exact output graphs.
- Current `src/acl/output-field-filter.ts`: repeated owner reads, ordered permission
  decisions and fresh child capture. Current finalizer/service add further context,
  getter/metadata/source/response copies and graph association transfers.

These observations locate possible work removal; they are not measured hotspot
rankings or evidence that v0.51.0 was security-equivalent. No build/tests/timings were
run solely to create this task file. FP-01 must establish a fresh baseline and
exact historical/current contract. Actual historical dependencies may differ.

Scope: access-router source/types/tests/docs, benchmark flag plumbing/reports/tests,
downstream verification and this task. Unprefixed source/test paths below refer to
`packages/access-router/`. Non-goals: update/delete/create/upsert/new or dedicated
subdocument optimization, complete ACL bypass, public/client selectors, cross-request
decision caches, historical-tag edits, dependency/lock changes, commits/publication,
unrelated packages, or a generic process-wide deep-clone switch.

## Selection contract

1. Both flags default `false`, enable only on literal server boolean `true`, and are
   independent of one another and the original six/two/eight option groups.
2. LIST activates only when **all four** effective LIST prerequisites are `true`:
   `unsafeSkipListDocumentSnapshotChecks`, `unsafeSkipListOutputSnapshotChecks`,
   `unsafeSkipListNestedDocumentSnapshotChecks`,
   `unsafeSkipListInitialOutputSnapshotCopy`. READ uses corresponding READ options.
   Requested false/omitted means **off**; requested true with any missing prerequisite
   means **dormant**, with original existing-flag behavior. Never enable prerequisites
   automatically or reinterpret the existing flags.
3. Reject presence in requests/HTTP/root/service per-call/defaults/authorization/
   include/populate/subquery controls; same-named ordinary persisted business data
   is inert. Capture before hooks/awaits on an authenticated query origin. Default
   inheritance, explicit false and undefined restoration follow existing options.
4. Genuine related/embedded descendants and READ-to-list retries retain the initiating
   operation's capture, never live target flags. A callback's independent service
   call captures its own settings. Arbitrary parent/provenance alone cannot relax
   helpers, writes or dedicated subdocument operations. Rollback affects new calls,
   not in-flight calls, descendants or retained handles.
5. Emit distinct effective activation/dormancy transition warnings, including changes
   to any prerequisite/default inheritance. Disclose mutation/stale-authority/native
   risks and restore-false guidance. Logging failures cannot change option publication.

## Runtime boundary for FP-01 to make concrete

Required active-mode direction (do not recreate fusion's conservative contract):

- Eliminate repeated document value snapshots/normalization, detached grant copying
  per field/read, and descendant graph walks where the new mode explicitly trusts
  application data/hooks. Broader source/context/callback isolation and embedded
  preparation reuse may be reduced to the historical level; FP-01 must name each
  boundary rather than imply all cloning vanishes.
- Do not issue a normal strict snapshot backed by a live alias. Private records
  must distinguish trusted/borrowed state from copied/validated state. Keep cheap
  opaque-handle issuance/root call/request/runtime/model/access/scope/stage matching;
  identify deliberately weakened descendant/source integrity separately. No public
  issuer, option token or caller-supplied certificate.
- Keep actual operation gates, row filters and field rules/document hooks/getters,
  original actor, grammar, short-circuit, hook error behavior and finite concurrency.
  No permission/document-result cache across requests or independent rows merely
  sharing an ID. Embedded children may reuse their owning parent's grants as in
  v0.51.0; unrelated rows/targets still resolve their own grants.
- Ordinary-data denied-field filtering, selected fields/order, populated target
  operation admission, includes, permission metadata stripping/exposure and registered
  virtual semantics remain. Prefer current shared evaluators, not a copied divergent
  historical service. Record unavoidable active-mode scheduling/mutation differences.
- Keep captured server configuration at the query origin, existing public request/
  filter/pagination/work limits, safe write-path handling and bounded new algorithms.
  Document if omitted snapshot passes lose per-document shape/native validation or
  their limits; do not pretend a graph identity walk still validates structure.
  Avoid unbounded newly introduced walks or silently admitting unsafe keys in new
  reconstruction code. Unproven/exotic shapes may fall back with explicit coverage.
- Default/off/dormant and all writes/dedicated subdocument/fresh helper behavior stay
  unchanged. Authenticated retained-handle helpers honor only their actual issued
  mode; fresh raw-policy helpers remain strict. Fast objects cannot silently cross
  into strict authority by refreshing an association.

FP-01 must settle the exact retained cheap authority vs deliberately omitted graph
and isolation promises; unresolved decisions block dependent implementation. This
user request authorizes those documented weaker internal guarantees, not accidental
default/write relaxation. Do not reimpose every strict copy/check inside the fast
path and then call reduced publication counts a performance success.

### Resolved FP-01 contract (implementation authority)

| Boundary         | Active trusted path                                                                                                                                                                                                         | Retained limitation / fallback                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration    | One coherent detached/validated origin policy/config/catalog/permission capture; private branded shared read/derived scope views replace per-row/child recopy                                                               | Server option replacement cannot change capture; mutable native/function configuration is no longer isolated per row. No cross-request policy/result cache.                                                                  |
| Source/stage     | Borrow ordinary lean projected row and document-hook input; explicit trusted stage has no snapshot member. Shallow working shell replaces full-source isolation. Hydrated rows normalize once with current Mongoose options | No source immutability or full hidden-document shape/bounds promise. Shallow-unproven/proxy/accessor/unsafe-root inputs use compatible copied state before hook, never a fake snapshot or repeated hook.                     |
| Grants/context   | Borrow ordinary returned grant map for field decisions/reads/owning embedded children; shallow diagnostic contexts and borrowed leaves                                                                                      | Keep modern mandatory once-per-row/target hook/error/gate behavior, not historical skim omission. Unrelated same-ID rows/targets never share grant/result state. Exotic grant fallback may copy once without rerunning hook. |
| Field decisions  | Existing grammar/extractor/ancestor ordering/short-circuit; cheaper pending/settled per-stage memo, no defensive clone/validation promise wrappers                                                                          | Actual async hooks/rules still awaited; scheduling/mutation outcomes may differ. No result memo across independent rows/IDs/requests.                                                                                        |
| Embedded/related | Cheap authenticated scoped views reuse captured config/catalog/permissions; each element has its own source/stage/leaf decision owner. Authenticated finalized target DTOs may be retained directly                         | Keep target operation/row admission, own target grants, reference fallback and private-populated-input channel. Parent grants never authorize unknown target objects.                                                        |
| Includes/output  | Separate private source/attachment lanes with shallow working shells and safe dotted spines. Safely reconstruct selected output once; finalize metadata/includes before one association/context                             | No unconditional correlated/source/metadata snapshot or post-finalizer whole-response copy, no graph-transfer/identity-admission passes for trusted rows. Metadata stripping/exposure/request-only maps remain.              |
| Virtuals         | Retain historical stable document base + separate per-getter document views, return staging, missing dependencies, child-before-parent ordering and bounded gate                                                            | Grant/context leaves may alias. Getter argument-one changes remain nonimplicit output writes; private argument-four admission/isolation unchanged.                                                                           |
| Authority        | Frozen opaque WeakMap handles and exact root request/runtime/model/name/scope/access/call/stage checks remain                                                                                                               | Trusted output has exact root association only, no snapshot/identity array. Root/helper authority survives descendant mutation; default/copied handles keep current graph validation.                                        |
| Child lookup     | Bounded private registry of actually emitted issued document-output roots, populated by builders/attachments, not scanning business data                                                                                    | Issuance membership is NOT reachability. Removed original children may still be looked up; new/replaced objects gain no child handle. Another row's child is not a memo-sharing shortcut even with same ID/provenance.       |
| Helpers          | Issued trusted handle keeps captured weaker behavior on exact associated roots; filtering still applies rules to current values using stale memo/shared grants                                                              | Fresh raw-policy helpers strict; known trimmed DTO handling remains fail-closed. No trusted-to-strict association upgrade or public certificate/issuer.                                                                      |
| Limits/native    | Keep public request/query/filter/pagination/work limits. Budget all new selected materialization/child/registry work at 20,000 slots/issued roots, depth 100; safe property definition/cycle control                        | Lose full-document 20,000-node/depth-100 validation for unvisited source/grants/context. Omit snapshot BSON/native/equality passes; selected values/hydration/getter views/serialization can still normalize.                |

Selected unknown proxy/custom/function/symbol/cyclic values must reject with a
controlled authorization error (virtual return channel retains fail-closed omission).
Supported shallow-unproven native/container values may use one compatible value-copy
fallback under the output budget. Never perform a recursive eligibility preflight
just to skip the old graph walks, rerun a hook after fallback, or publish partial
output after budget failure. Borrowed and copied rows may coexist; their private
record state, not call applicability alone, determines actual protection.

The active path is deliberately allowed to differ from v0.51.0: retains modern
mandatory hooks, policy/backend fields, captured target gates, handles, memo and
private populated inputs; can omit even the historical whole lean-source copy.
It targets historical-like reduced bookkeeping, not an exact legacy implementation.

## Sequential execution and shared gates

One child session per task, one active child at a time. The coordinator owns this
document/status reconciliation; agents return evidence without concurrent task-file
edits. Use task-local aliases, never full session IDs/URLs. A fresh independent
reviewer ends the sequence. Shared dist-writing builds/tests/benchmarks run serially
per `AGENTS.md`; finish owned background processes before handing off.

Commands from repo root with installed dependencies. Use new ignored repo-local
`_tmp*` directories for fixtures/preserved before/candidate/historical artifacts.
Do not overwrite earlier evidence; all committed evidence paths are repo-relative.

User clarification during FP-08: **do not run workspace-wide lint/build/tests**.
All remaining verification is limited to affected access-router/deco packages,
required transitive dependency builds and benchmark scripts. Do not invoke root
`pnpm test`, `pnpm build` or `pnpm lint`, even at final integration/review.

- **V1:** `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`.
- **V2:** `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 <files>`;
  replace `<files>` with actual package-relative paths; build first for dist imports.
- **V3:** `pnpm --filter @web-ts-toolkit/access-router test`, then
  `pnpm --filter @web-ts-toolkit/access-router typecheck`. Full package includes
  packed/export/executable-doc/strict-consumer gates.
- **V4:** `pnpm --filter @web-ts-toolkit/access-router-deco test --no-file-parallelism --maxWorkers=1`.
- **V5:** scoped ESLint over access-router source/tests and benchmark scripts,
  changed-file Prettier and `git diff --check`. Preserve documented historical
  whole-CHANGELOG formatting exception without unrelated reformatting.
- **V6:** `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs`.
- **V7:** unchanged benchmark workloads/response checks, separate embedded and
  document-rules scenarios; actual declarations/hash/getter/effective-mode checks.
  Preserve fresh current before and candidate with lock/dependency/peer/public-export
  identities. Primary 100-row plain-wide/document-rules/embedded: fields 24, bytes 32,
  one client, hook concurrency 10, five warmups, at least 50 (prefer 100) samples and
  two alternating paired batches. Compare all-eight ON/new OFF vs same build new ON,
  plus before and strict/dormant guards. Guard narrow/hydrated/global/large-config/
  populate/virtuals at 10/100 rows as relevant. Keep instrumented work counts separate
  from timing; no wall-clock assertions. Verify denied fields, row order, fingerprints,
  actual hydration, reads and actual hook/getter counts. Report median/p95/CPU and
  noise/outliers honestly. Historical comparison must identify source/dependency
  differences and must not claim parity from matching fixtures.

Performance is the delivery objective, not just flag plumbing. Require relevant
repeatable benefit; do not withdraw the feature silently on the first noisy result.
Use a bounded profiling/refinement attempt consistent with the authorized omission
matrix if needed. If acceptable benefit cannot be established, explicitly report
the blocker/disposition with evidence and preserve the prototype; no invented parity.

## Tasks

### Task FP-01: Define the historical-like fast-path contract and baseline

Status: completed
Assigned: FP-01 historical flow/baseline session (sequential).
Kind: investigation
Priority: P1 — exact omissions determine whether this is meaningfully faster than fusion.
Suggested agent: historical flow/baseline investigator (FP-01 session)
Dependencies: none
Primary ownership: read-only historical/current source review and new ignored
baseline/differential/work-count fixtures; no runtime implementation.

Finding: v0.51.0 retained permission evaluation without today's snapshot/grant/graph
owner system; the user accepts removing those protections only on opted-in queries.
References: historical/current `service.ts`, `finalize-model-output.ts`,
`document-authorization.ts`, `output-field-filter.ts`, `service-authorization.ts`.

Requirements:

1. Produce a compact exact matrix of current/v0.51.0/proposed copying, snapshots,
   grants, memo/async scheduling, ownership/handles, embedded capture, metadata,
   native observations, limits and remaining differences. Name retained vs lost
   guarantees; identify root/descendant/helper/write boundaries and bounded fallback.
2. Specify minimal private implementation using existing evaluators and distinct
   trusted record states. Cover includes/populate/embedded/virtuals/metadata, not just
   stripped simple roots. Identify high-value removals and tests demonstrating risk.
3. V1 build/preserve fresh before, actual dependency/export/declaration/hash identities,
   baseline focused checks and initial V7 timings. Characterize v0.51.0 read-only;
   reuse a genuine historical preserved build if available, otherwise record whether
   a reproducible separately built historical timing is possible without altering
   tags/dependencies. No new historical timing claim without an actual run.

Acceptance: concrete scoped omission/authority matrix and implementation handoff,
baseline artifact/tests/timing evidence, explicit historical/current limitations;
no unresolved implementation-blocking contract decision.
Verification: V1/relevant V2/initial V7 plus historical source evidence review.

Completion evidence:

- Confirmed actual v0.51.0 at `89180d219783fbfad412d8dfe19beae614f45c68` and the
  resolved matrix above. Historical source still cloned output/getter views and
  ran rules; modern mandatory hooks will not reproduce historical skim skipping.
  No remaining implementation-blocking contract questions.
- Fresh V1 passed; official before preserved at
  `_tmp-authorization-fast-fp01-20261030-142730/official-before/` with 14 dist files,
  8 declarations, 134 actual dependency identities and public runtime exports 46/48/6.
  ESM SHA-256 `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`;
  declaration hash `85a7fa10ea3fb85b55523f746015f99944aebc753548a6c710d42d562fd8f65e`;
  lock `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- V2 **992 tests in 22 files**, plus **10 ignored real-service work/risk fixtures**
  passed. Six embedded/dynamic rows with original eight ON made **36 stage copies,
  384 grant copies, 24 deep context copies, 390 transfer calls, 7 full call resolutions**.
  Ten wrong-root/tuple/forged cases already reject without graph observations.
- Six current-before V7 jobs, original eight ON/new absent, V7 settings/50 samples:
  wide median **22.271 / 21.712 ms**; document-rules **28.242 / 25.599**; embedded
  **67.015 / 69.449**. Lean/flags/order/denied data/read/hook/getter/fingerprint checks
  passed. Full p95/CPU/raw samples/settings retained; no candidate benefit claimed.
- Rebuilt unmodified historical source with **current dependencies/tooling/workspace
  deps**, using a supplemental ignored diagnostic tsconfig. Six separately timed
  source-only diagnostic jobs passed unchanged fixtures; median wide **9.330 / 8.527**,
  document-rules **10.685 / 8.251**, embedded **14.269 / 13.270 ms**. These were
  separate nonpaired batches, NOT frozen historical dependencies/performance or
  causal speed/parity ratios. Diagnostic available for later paired comparison.
  Initial ignored pnpm/declaration setup failures and recovery are documented;
  actual dependencies/current lock/source remained unchanged.
- Detailed matrix/references/risk targets in ignored `coordinator-notes.md` and
  `verification-summary.md`; artifact identities in `before-metadata.json` and
  `historical-diagnostic-metadata.json`. Source/grant mutation, omitted fetch-only
  Date observation and descendant replacement are candidate risk-test targets.
  All owned jobs finished; no product/task/dependency source edits by this agent.

### Task FP-02: Implement prerequisite-gated captured server configuration

Status: completed
Assigned: FP-02 configuration session, then a fresh sequential recovery session
after its usage-limit interruption.
Kind: improvement
Priority: P1 — a high-risk mode must never be wire/per-call-controlled.
Suggested agent: server configuration implementer (FP-02 session)
Dependencies: FP-01
Primary ownership: `src/interfaces/root.ts`, `src/runtime.ts`,
`src/acl/unsafe-snapshot-options.ts`, capture/service-authorization/public admission
and focused option/capture tests.

Finding: existing groups lack the two new flags; applicability must capture all four
origin prerequisites, not infer it from a child's comparison mode.
References: `runtime.ts:deferSnapshotWarnings`,
`service-authorization.ts:resolveServiceAuthorization`, `validation/public-admission.ts`.

Requirements: implement selection contract, independent group, literal normalization,
inheritance/undefined reset, coherent warnings, authenticated READ retries/descendants,
captured rollback and default/write/helper separation. Reject injected controls by
presence without rejecting same-named business data. Add JSDoc and focused positive/
negative/cross-product tests; existing six/two/eight arrays and meanings unchanged.

Acceptance: configured/captured effective mode proven across direct/public/root paths,
opposite READ/LIST/target options, all missing prerequisites, truthy values, loggers,
in-flight rollback and helpers/writes; no runtime omission in this config-only step.
Verification: V1/V2/scoped V5 and generated option/JSDoc inspection.

Completion evidence:

- Added independent two-name fast-path group and ten-name server admission/
  normalization aggregate; original six/two/eight groups unchanged. Both flags
  optional/default-false/literal-true, all four matching prerequisites required.
  Private frozen capture owns origin, off/dormant/active mode and prerequisite mask.
  Authenticated `readAuthorizationFastPath(call, binding)` verifies each read; it
  does not yet activate any copy/graph/runtime omission.
- Genuine root/related/embedded/read-retry capture, rollback and independent same-
  receiver hook queries are covered. Writes/write-derived reads, fresh helpers,
  arbitrary parents and dedicated subdocuments remain inapplicable. Target identity
  and opposite-operation options cannot relax origin selection.
- Coherent effective warnings compare captured publication signatures before logger
  reentry; missing-mask changes remain diagnosable, failed validation and throwing
  loggers do not rewrite publication. Descriptor-based presence preflight covers
  service/public/policy/helper/default/nested controls without invoking flag accessors;
  ordinary business names remain inert. Raw/dotted defaults preflight before cloning.
- The initial agent exhausted its usage limit after partial work. Recovery preserved
  the incoming diff/evidence, confirmed the prior accessor fix and added regression-
  first coverage/fixes for defaults, missing warnings and logger reentry. No partial
  status was called completed before recovery verification.
- Final V1 passed; V2 **1,846 tests in 41 files**, including **315 new option tests**,
  passed. Original existing tests unchanged. Extra source typecheck, scoped ESLint,
  changed-file Prettier and diff checks passed. **16 emitted option/JSDoc checks**
  and real CJS/ESM runtime configuration checks passed; exact runtime export sets
  remain 46/48/6 and declaration-name sets 186/322/17.
- Changed ten source files plus two new tests; document/field-helper changes are
  admission only. Current ESM SHA-256
  `b2b2e1f83a1146464f257f13671f0d3f20577b69f4d812bcdf0f631f8aed5582`.
  Official before, all prior evidence, 134 pinned dependency identities, original
  tracked tests, package/public entrypoints, benchmark worker/core and lock preserved.
  No owned jobs remain. Full package/consumer/downstream/runner/performance gates await
  subsequent tasks; configuration alone is not performance delivery.
- Ignored recovery handoff:
  `_tmp-fp02-recovery-20261030-153025/coordinator-notes.md`.
  Initial interrupted evidence remains in `_tmp-fp02-20261030-145752/`.
  FP-03 must replace configuration-only/future warning/JSDoc statements when the
  actual trusted runtime is implemented.

### Task FP-03: Implement the trusted query pipeline and boundary regressions

Status: completed
Assigned: FP-03 runtime implementation session (sequential, after verified FP-02).
Kind: improvement
Priority: P1 — remove major work rather than adding another flag around existing overhead.
Suggested agent: authorization fast-path runtime implementer (FP-03 session)
Dependencies: FP-01, FP-02
Primary ownership: private authorization snapshot/document/field-policy/filter/capture
helpers, service/finalizer/output flow and focused runtime/integration tests.

Finding: initial snapshots, per-field grant copies, graph transfers and repeated
configuration/owner preparation remain costly with original eight flags ON.
References: FP-01 matrix; `createDocumentAuthorizationStage`,
`memoizeDocumentFieldDecision`, `associateDocumentAuthorization`,
`authorizeEmbeddedOutputPlan`, `finalizeDirectOutput`.

Requirements:

1. Implement FP-01's specific omitted/retained boundaries with explicit trusted
   record states, no fake snapshot alias or public issuer/token. Use captured mode,
   never ambient/live options. All-off/dormant/legacy modes/writes remain original.
2. Keep actual rules/hooks/getters, row filters/operation/target admission, actor and
   normal-data selected/denied output. Preserve finite work concurrency/error handling
   and independent per-row/target grants; changes from mutable shared inputs/removed
   observations are explicit risk, not a hidden permission bypass.
3. Cover READ/LIST/retry/root, metadata on/off/dotted, embedded/populate/include/virtual,
   retained handles/helper behavior and same-ID/concurrent scopes. Add work-count
   reductions and at least two intentional mutation/native/graph-risk counterexamples.
   Do not weaken original strict tests or resurrect fusion selectors.
4. Build/run focused tests and preliminary paired V7. Minimal independent worker/core
   selection plumbing may move forward from FP-04 for genuine pilot activation,
   but workloads/checks stay unchanged. Attribute moved work for the next agent.

Acceptance: major work demonstrably omitted only in active mode, promised remaining
permissions/paths tested, explicit lost protections reproducible, preliminary genuine
timing evidence supports refinement/delivery rather than reduced counts alone.
Verification: V1/V2/scoped V5 and pilot V7; final retention gate FP-05.

Completion evidence (runtime/pilot delivered; final retention still provisional):

- Implemented explicit borrowed/copied source/grant/output records and privately
  branded captured configuration. Trusted stages have no snapshot member; outputs
  have exact root association and issued-member registries, not identity arrays.
  Genuine scope/target/retry preparation shares capture, never per-row decisions.
  Existing evaluators, actor, operation/row/target admission and mandatory hooks remain.
- Trusted service/finalizer uses shallow source/context shells, borrowed grant reads,
  cheaper settled/pending memo states, child-before-parent views and bounded selected
  materialization. Metadata/includes complete before one publication; target DTOs
  retained by actual identity. No authorization whole-source snapshot/normalization,
  grant/context deep copies or output graph/transfer passes for trusted rows.
  Getter document views/private-input isolation, copied rows/grants and selected
  native/value compatibility fallbacks remain deliberate costs.
- New regressions prove source/grant mutation across callbacks/awaits and omitted
  Date/BSON observations can turn denial into allowance. Trusted roots accept changed
  descendants; removed issued children remain members, replacements receive no
  automatic handle. Exact root/tuple/owner checks still reject forgeries. All new
  reconstruction/registry work is budgeted with safe descriptor writes/cycle errors.
- Six embedded/dynamic rows: stage/hook copies **36 → 0**, grant copies **384 → 0**,
  deep contexts **24 → 0**, whole lean source normalization **24 → 0**, transfers
  **390 → 0**, identity/admission passes **30/36 → 0/0**, full resolution **7 → 1**.
  Six real document hooks, 144 field callback bodies and one adapter read remain.
  Service contexts **12 → 6**; per-element stages/decisions remain independent.
- V1, source TypeScript, **2,585 tests in 58 files**, scoped ESLint/27-file Prettier/
  diff and private export/preservation checks passed. Added 52 runtime tests; new
  option tests transitioned from config-only to actual behavior (319 tests).
  All 192 original tracked tests and off/dormant/write behavior preserved.
  Full package/downstream/packed/runner/guard verification remains for later tasks.
- Final same-build paired pilot, V7 settings/50 samples/two alternating rounds,
  median/p95/CPU ms per request:

  | Scenario / round   | Original eight ON, new OFF | New ON                   |
  | ------------------ | -------------------------- | ------------------------ |
  | wide / 1           | 25.863 / 32.006 / 33.752   | 19.207 / 23.987 / 25.772 |
  | wide / 2           | 25.869 / 31.910 / 34.304   | 19.419 / 24.010 / 25.518 |
  | document-rules / 1 | 31.183 / 36.004 / 38.555   | 22.622 / 27.188 / 27.939 |
  | document-rules / 2 | 32.630 / 40.473 / 40.299   | 21.668 / 26.562 / 26.851 |
  | embedded / 1       | 80.012 / 92.031 / 97.415   | 36.128 / 47.409 / 48.455 |
  | embedded / 2       | 77.023 / 86.772 / 93.503   | 35.593 / 44.566 / 47.861 |

  Same-build median reductions about **25–26% / 27–34% / 54–55%**, with lower
  CPU in both rounds. Requested/effective modes/declarations/getters/hydration/
  denied fields/order/fingerprints/reads/hooks verified; embedded and document-rules
  separate. Absolute host times drifted, including official before; raw batches
  retained without selective pooling. These are pilot gains, not final guards or
  v0.51.0 parity. No new historical measurement in FP-03.

- Minimal independent worker/core third-group plumbing moved forward from FP-04;
  old workload/response checks remain unchanged. FP-04 must finish CLI/report/tests/
  consumer docs and update the old internal-export assertion while preserving exact
  six/two group assertions. That old assertion was inspected, not claimed passing.
- Ignored detailed handoff: `_tmp-fp03-20261030-155647/coordinator-notes.md`.
  Measured `final-candidate/` and `v7-final-pilot/` retained; ESM SHA-256
  `c26c217b9228be53cac54ed2a1bbde2920d04c61676569b7df32e3283e5dc401`.
  Official before/dependency/lock/earlier evidence preserved; runtime/type export
  exact name sets unchanged. No owned jobs remain or known FP-03 core blocker.

### Task FP-04: Ship consumer contract and independent benchmark modes

Status: completed
Assigned: FP-04 consumer/benchmark session (sequential, after FP-03).
Kind: improvement
Priority: P2 — installed users and timing reports must discover real behavior and risk.
Suggested agent: published contract/benchmark implementer (FP-04 session)
Dependencies: FP-02, FP-03
Primary ownership: package README/JSDoc/llms/release notes/secondary docs,
packed/declaration/strict/docs tests and benchmark CLI/core/worker/reports/tests.

Finding: current docs/benchmark support only original six/two groups; the new option
weakens more guarantees and is not the withdrawn fusion API.
References: `README.md` unsafe sections; benchmark `inspectSnapshotDeclarations`.

Requirements: executable public-import LIST/READ examples and truthful prerequisite/
off/dormant/active/capture/rollback/mutation/graph/native/remaining-check contracts;
installed CJS/ESM types/JSDoc and real packed Bundler/NodeNext/Node16 tests. No private
helpers exported. Add a third independent OFF/ON/BOTH group with old/partial support,
actual declaration/hash/getter verification and requested/effective labels; existing
six/two meanings unchanged. Real-worker smoke separately covers document-rules and
embedded, dormant and active modes, without workload/check changes.

Acceptance: consumer code/types/docs agree with actual runtime; historical-like scope
and differences clear; runner rejects fake support/unapplied options and identifies
which operation is measured. Matching fingerprints not called security equivalence.
Verification: V1/relevant V2 consumer/docs/packed/export/scoped V5/V6.

Completion evidence:

- Shipped README/JSDoc/llms, one Unreleased entry and secondary configuration/service
  docs describe the actual borrowed-state contract, all prerequisites, off/dormant/
  active selection, origin capture/rollback and unchanged write/raw-helper paths.
  Issued-member lookup is explicitly not reachability; root helpers may use stale
  decisions/shared grants. Lost unvisited document bounds/native observations and
  denial-to-allowance risk are disclosed; no zero-copy/security/historical parity claim.
- Executable public-only LIST/READ example exercises five real queries, missing
  prerequisite/default inheritance, active READ/LIST, rollback and issued-child/
  retained-helper behavior, with five hooks and no helper hook rerun. Actual packed
  NodeNext/Bundler/Node16 type/example workflows pass against minimum/current peers;
  current peers use `skipLibCheck: false`. Node16 emitted ESM/CJS README examples
  genuinely execute; package runtime requirement remains Node >=22.
- Completed independent third OFF/ON/BOTH CLI/eight-way candidate identities and
  requested vs verified LIST/READ configuration reports. Actual root optional-boolean
  declarations in both formats, all declaration hashes, both model getters and
  applied flags are checked before timing. Compiler validation runs in a short-lived
  separate process before runtime/peers, not the measured worker heap. Old/partial
  support stays OFF/N/A; unknown/unverified modes/baselines cannot report active/ratios.
  Config verification does not claim every row borrowed (`runtimeOmissionCounts: null`).
- V1 passed; relevant V2 **164 tests in five files** passed (68 executable docs,
  88 types/exports, 8 selected packed tests). V5 lint/changed-file/llms/new-entry
  formatting/diff passed, preserving the demonstrated historical whole-CHANGELOG
  exception. V6 **29 tests** passed including 16 real worker cross-product jobs;
  an extra preserved 18-job smoke includes two genuine before supported-OFF/N/A jobs.
  All 30 inspected workload/scenario/fixture/measurement/check blocks unchanged.
- FP-03's six runtime JS files remain byte-identical; only four source-interface
  comment/JSDoc changes, with complete syntax comparison. Runtime export sets remain
  46/48/6, declaration names 186/322/17 and no private issuer/budget/marker surface.
  Original 188 nonconsumer tests preserved; four consumer test files intentionally
  expanded. Consumer harness sync-child deadlock/declaration-filename issues were
  fixed without dropping checks; failures/recovery evidence retained.
- Ignored detailed handoff:
  `_tmp-fp04-consumer-benchmark-20261030-175617/coordinator-notes.md`, real packed
  artifacts/configs in `packed-evidence/`, extra jobs/reports in `runner-smoke/`.
  ESM remains `c26c217b9228be53cac54ed2a1bbde2920d04c61676569b7df32e3283e5dc401`;
  declarations updated only for docs. Prior evidence, lock, runtime behavior and
  metadata preserved; no owned jobs. Full integration/performance remains FP-05.

### Task FP-05: Integrate, measure and resolve performance delivery

Status: completed
Assigned: FP-05 final sequential verifier; current-artifact integration and timings delivered.
Kind: investigation
Priority: P1 — performance-first delivery requires demonstrated benefit and honest limits.
Suggested agent: integration/performance verifier (FP-05 session)
Dependencies: FP-03, FP-04, FP-07, FP-08. Added review-fix dependencies because the
formerly verified/measured artifact has two retained-contract defects; its earlier
results remain historical evidence, not acceptance of the forthcoming fixed bytes.
Primary ownership: integrated acceptance gaps, new ignored measurement artifacts,
narrow runtime fixes/refinement inside the accepted matrix, evidence for coordinator.

Finding: the new omission contract may remove substantial work, but counts cannot
prove speedup or v0.51.0 parity; fusion's prior failure/noise is a measurement warning.
References: V1–V7; FP-01 matrix and FP-03 regressions.

Requirements: all scoped V1–V6 serial gates on final source; V7 paired active/off/
before plus strict/dormant/all guard scenarios and bounded noisy-case repeats. If
needed profile separately/refine only within approved omissions. Verify measured
dist/build/declaration/export/lock identities after rebuilds. Historical timing if
available uses clearly identified dependencies; no historical parity claim from
ordinary outputs or source inspection. Preserve existing user work/evidence.

Acceptance: mandatory gates pass and repeatable relevant performance improvement is
demonstrated with scenario/median/p95/CPU/risk caveats. If unresolved, mark blocked/
explicit disposition and preserve prototype; do not silently call implementation
or investigations a solved performance problem. Record real-application gaps.
Verification: V1–V7, final installed/API/diff/artifact evidence review.

Completion evidence (recommended retention, pending independent review):

Review disposition: FP-06 reproduced missing cross-request/runtime parent binding
checks and selected BSON-container budget bypass. FP-05 is reopened/blocked pending
FP-07/08; rerun invalidated final gates and proportionate final-source performance
checks before completion. Do not relabel earlier measured artifact hashes as fixed.

Revalidation disposition: completed on the new FP-07/08 fixed bytes; the earlier
blocked state is resolved by the post-fix evidence below. Old timing tables remain
historical, not substituted for fixed-artifact results. Independent FP-06 re-review
is still required before overall acceptance.

Residual-review disposition: FP-06 subsequently reproduced uncharged policy-denied
selected native-container keys. FP-08 and final verification are reopened again;
the a0fff877… measurements remain valid for that artifact but do not accept the
next corrected bytes. No repeated full-workspace checks are authorized.

Latest disposition: the residual correction is implemented and independently
confirmed on `33662fae…` (FP-08 completion and FP-06 precheck below). Final FP-05
affected-package gates and fresh timings for these bytes passed; no code blocker
remains. All earlier tables stay tied to their own artifacts. Final independent
FP-06 evidence closure has passed.

- Full serial V1–V6 passed: V3 **6,296 tests in 178 files**, including all 11 packed/
  actual artifact-tree consumer checks, access-router typecheck, V4 **691 tests in
  22 files**, scoped ESLint/changed-file/llms/new-CHANGELOG-entry formatting/diff and
  V6 **29 runner tests**. Separate 44 unit + 8 integration runtime checks passed.
  Initial full V3 had two new include-fixture natural-order assumptions fail;
  adding explicit target `sort: 'name'` fixed the fixture, not runtime or assertions.
  All final gates reran; no runtime refinement or extra bypass was needed.
- **132 uninstrumented timing jobs / 8,100 measured requests**, with actual
  declaration/manifests/both-model getters, configured effective modes, hydration,
  order/denied fields/pre-post fixture fingerprints/reads/hooks/getters checked.
  Primary 100 rows, 24 fields, 32 bytes, one client, hook concurrency 10, five warmups,
  **100 samples/job**, two alternating reversed rounds. Same candidate bytes:

  | Scenario / round   | Eight ON, new OFF median / p95 / CPU ms | New ON median / p95 / CPU ms |
  | ------------------ | --------------------------------------- | ---------------------------- |
  | wide / 1           | 18.705 / 22.789 / 23.798                | 13.920 / 17.094 / 17.487     |
  | wide / 2           | 18.463 / 21.916 / 23.533                | 14.218 / 18.198 / 17.547     |
  | document-rules / 1 | 23.111 / 27.184 / 27.900                | 16.097 / 18.947 / 19.398     |
  | document-rules / 2 | 22.695 / 27.465 / 27.706                | 15.784 / 18.501 / 19.068     |
  | embedded / 1       | 58.421 / 64.103 / 69.221                | 26.654 / 30.855 / 31.405     |
  | embedded / 2       | 58.105 / 64.654 / 68.554                | 27.170 / 31.317 / 31.922     |

  Median improvements **23.0–25.6% / 30.4–30.5% / 53.2–54.4%**; CPU improves
  in both rounds. Official-before medians closely match same-build OFF, not a
  manipulated baseline. No cross-session absolute-time pooling or significance claim.

- All six active guards (narrow/hydrated/global/large-config/populate/virtuals),
  10/100 rows, 50 samples, two rounds: **all 24 pairs lower median/p95/CPU**, median
  gains about 19–36%. Populate retains two reads/request; other cases one.
- Strict/off/dormant guards disclose adverse small-case variations, not an
  unconditional no-regression promise: dormant 10-row wide up to **+7.0% / +0.532 ms**,
  reverse +1.6%; some strict small p95s **+19.5% / ~2.12 ms**. Earlier dormant
  embedded +5–6% effects did not repeat in a bounded 100-sample repeat (+1.3/+0.1%
  median). Small tail/order noise or modest new overhead is not ruled out; raw
  adverse batches remain preserved. No extra primary repetitions hunted a win.
- Paired actual v0.51.0 **source-only/current-dependencies** diagnostic medians:
  wide **5.795 / 6.055**, document **6.988 / 6.547**, embedded **9.360 / 9.050 ms**.
  Active approaches but remains **about 2.3–3.0× slower** than this diagnostic.
  It is not frozen historical environment/performance or behavior/security parity;
  modern policy/target/handle/memo/budget/private-input differences remain. Actual
  hooks run in both versions under the unchanged non-skim fixture.
- Instrumented six-row dynamic/embedded proof remains separate: zero stage/grant/
  deep-context/whole-source/transfer/identity work, one full resolution/config copy,
  six contexts/hooks, 144 callbacks, one read; one embedded scope derivation.
  Timing workers report omission counts null, not per-row borrowing proof. READ
  state behavior is tested, **not READ latency**; no real-application reproduction.
- Sealed `final-before/` and `final-candidate/` artifacts; post-package/deco and
  post-timing rebuild's **14 live dist files equal measured candidate**. ESM remains
  `c26c217b9228be53cac54ed2a1bbde2920d04c61676569b7df32e3283e5dc401`;
  declaration manifest `5d7ce47c3ea6117c01e5a375f8a58a7637dcb976eaac9b50ea92fa01a0173468`.
  Public runtime/type export sets, all 134 pinned dependencies, lock, original tests,
  metadata and earlier evidence preserved; no private API shipping or owned jobs.
- Detailed commands/raw jobs/median/p95/CPU/limits in
  `_tmp-fp05-integration-20261030-190227/coordinator-notes.md`, `measurements.md`,
  five `v7-*` batches and `final-verification.json`. Recommend retaining the
  experimental opt-in with authorized mutation/native/stale-graph risks; FP-06
  must independently check selection/default/write/consumer/measurement evidence.

Post-FP-07/08 revalidation (earlier a0fff877… candidate, before residual correction):

- No product changes in reopened verification. **Affected packages only**, per user:
  V1 and post-timing rebuild passed; full access-router **6,427 tests in 180 files**,
  typecheck, full deco **691 tests in 22 files**, scoped ESLint/45-file/llms/new-entry
  formatting/diff, V6 **29 tests** passed. Full package includes all **12 packed**
  cases, artifact-tree checks and actual minimum/current peer native workflows.
  Focused owner/native/runtime **174 tests** and all **9 reviewer fixtures** pass.
- New measured fixed ESM
  `a0fff8777b4185157578f8875ab043f7100537f0be035c616ad3facb5e2aef4f`,
  CJS `c069cae63c91810d8e65c473677c21377f596b0db2cf12de28320fd57f15fa56`.
  All 14 rebuilt live outputs match `final-fixed-candidate/` byte-for-byte; eight
  declaration files/exact public exports/134 dependency identities/3,500 files/lock
  and all earlier evidence preserved. No private APIs or test artifacts ship.
- **124 fresh timing jobs / 8,200 requests**, same settings/unchanged workloads,
  primary 100 samples/two reversed paired rounds, original eight ON:

  | Scenario / round   | Fixed new OFF median / p95 / CPU ms | Fixed new ON median / p95 / CPU ms |
  | ------------------ | ----------------------------------- | ---------------------------------- |
  | wide / 1           | 17.570 / 20.723 / 22.324            | 12.933 / 15.189 / 16.306           |
  | wide / 2           | 17.461 / 20.183 / 22.190            | 12.765 / 14.710 / 16.117           |
  | document-rules / 1 | 21.405 / 24.078 / 26.045            | 15.135 / 17.361 / 17.972           |
  | document-rules / 2 | 21.719 / 24.360 / 26.056            | 14.917 / 17.580 / 17.777           |
  | embedded / 1       | 54.183 / 59.809 / 65.064            | 24.662 / 27.867 / 29.301           |
  | embedded / 2       | 54.653 / 58.459 / 64.517            | 24.832 / 28.717 / 29.476           |

  Median gains **26.4–26.9% / 29.3–31.3% / 54.5–54.6%**, with lower p95/CPU
  in every primary pair. Direct fixed ON vs original before gains **22.6–54.6%**;
  same fixed OFF wide varied +1.9–5.2% vs before, not a zero-overhead default claim.

- All **24 fixed active guard pairs** (six scenarios/10–100 rows/two rounds) improve
  median/p95/CPU; median gains **15.1–33.3%**. Six paired old-candidate ON controls
  establish no broad ordinary-primary correction slowdown, not free arbitrary BSON
  preparation. Strict/dormant adverse observations and earlier +7%/+19.5% evidence
  remain disclosed; larger fixed effects diminished in bounded repeats, modest
  overhead/tail/order noise is not ruled out. No randomization/significance claim.
- Fresh same-dependency historical-source diagnostic pairing: fixed active remains
  **2.34–2.98× slower** than v0.51.0 source rebuilt with current peers/tooling/deps.
  This is not frozen historical environment/performance/parity. All actual hooks,
  denials/fingerprints/order/getters/reads/hydration/mode getter paths verified.
  CPU checked as recorded worker stats; latency recomputed from raw samples.
  READ runtime is covered, not READ latency; real app/BSON-heavy latency unavailable.
- Detailed final evidence:
  `_tmp-fp05-fixed-20261031-000229/coordinator-notes.md`, `measurements.md`,
  four `v7-*` batches, `packed-evidence/` and `final-verification.json`.
  All owned jobs finished. Recommend retaining the fixed experimental opt-in,
  pending independent FP-06 re-review; no workspace-wide checks ran.

Final residual-reviewed artifact revalidation (`33662fae…`):

- **No product changes.** V1 and final rebuild, full access-router **6,449 tests /
  180 files**, typecheck, full deco **691 / 22**, scoped ESLint/45-file formatting,
  llms/new-entry formatting/diff and **29 benchmark-runner tests** pass. Additional
  **196 focused product and 25 reviewer cases** pass using new exclusive caches.
  No workspace-wide build/lint/tests ran.
- All **12 packed cases**, including four fresh actual minimum/current-peer
  tarball/artifact installations, pass. Current native fixture is unconditionally
  awaited in all four, checking denied-wire LIST/READ 400 and ordinary Code/DBRef
  200, exact eight document/two wire hooks. Current consumers compile with
  `skipLibCheck:false`; actual minimum peers retain their established compatibility
  setting with strict application checks. All 14 installed outputs match current
  bytes. New deterministic tarball hash equals the independently reviewed tarball;
  it was freshly generated, not reused as evidence.
- **128 timing jobs / 8,600 measured requests**, unchanged workloads/checks/settings,
  primary 100 samples/job/two reversed rounds, same current build with eight ON:

  | Scenario / round   | New OFF median / p95 / CPU ms | New ON median / p95 / CPU ms |
  | ------------------ | ----------------------------- | ---------------------------- |
  | wide / 1           | 20.381 / 24.684 / 24.096      | 14.785 / 19.591 / 17.559     |
  | wide / 2           | 20.124 / 24.598 / 23.884      | 14.694 / 17.929 / 17.517     |
  | document-rules / 1 | 24.731 / 28.513 / 27.866      | 17.859 / 22.024 / 20.200     |
  | document-rules / 2 | 24.276 / 28.109 / 27.675      | 17.143 / 20.697 / 19.448     |
  | embedded / 1       | 63.969 / 72.432 / 70.141      | 29.124 / 34.678 / 32.212     |
  | embedded / 2       | 63.065 / 69.144 / 68.637      | 28.918 / 34.238 / 31.788     |

  Median reductions **27.0–27.5% / 27.8–29.4% / 54.1–54.5%**; every primary p95
  and CPU also improve. Current OFF vs official before primary medians range
  **-6.4% to +2.4%**, not a zero-default-overhead claim.

- Active guards: **23/24** initial pairs improve median, p95 and CPU separately;
  **22/24** improve all three. Narrow 10-row first median/CPU and virtual 10-row
  second p95 are adverse. ONE bounded repeat improves narrow median 18.1–30.1%,
  without replacing original observations. Strict embedded-10 repeat retains
  **+2.4/+2.8% median**; wide dormant repeat reaches **+10.3% / 0.820 ms median**,
  **+11.7% p95**, then +0.9% median reversed. Modest default overhead and sequential
  order/tail noise remain disclosed; no further win-hunting repeats/refinement.
- Fresh historical-source/current-dependencies reference remains **2.09–2.85×
  faster** than current active, not frozen-v0.51.0 parity. Old a0 ON correction-cost
  controls remain explicitly unaccepted; no broad primary correction slowdown,
  arbitrary BSON-heavy or real-application performance claim. LIST is timed, not
  READ. Work proofs retain zero omitted work, six hooks/144 callbacks/one read.
- New sealed `final-candidate/`: **all 14 post-timing rebuilt outputs match measured
  bytes**, eight declarations/public export sets unchanged, 134 dependencies/3,500
  dependency files/lock pinned. All captured prior product/evidence identities
  preserved; no private/test artifacts ship; no owned jobs remain. ESM/CJS remain
  `33662fae…` / `4ad8ab48…` as recorded in FP-08.
- Exact commands, raw samples, all initial/repeat adverse tables, four installed
  workflows and final hashes: `_tmp-fp05-final-20261031-152953/coordinator-notes.md`,
  `measurements.md`, `final-verification.json` and `measurement-verification.json`.
  Recommend retaining the experimental opt-in under the agreed weaker contract;
  independent FP-06 final evidence closure has passed as recorded below.

### Task FP-06: Independently review fast-path selection, behavior and evidence

Status: completed
Assigned: FP-06 fresh independent final evidence reviewer, after completed final FP-05.
Kind: investigation
Priority: P1 — the accepted weaker contract needs independent default/write/API review.
Suggested agent: fresh independent reviewer (FP-06 review session)
Dependencies: FP-01, FP-02, FP-03, FP-04, FP-05
Primary ownership: independent read-only runtime/diff/consumer/performance review,
focused adversarial verification. Implementers resolve findings sequentially.

Finding: intentionally lost protections are acceptable only in selected queries,
not by accidental wire/default/write relaxation or misleading authorization claims.
References: all acceptance criteria, actual source/tests/docs and raw evidence.

Requirements: independently inspect prerequisite/capture/injection/default/write/
helper/descendant boundaries, actual retained permission evaluators and omitted
isolation/graph checks, installed declarations/docs/packed surface, output limits/
new recursion, historical differences and benchmark measurements/confounds. Review
risks honestly rather than demand withdrawn guarantees or assume equivalence. Run
focused checks, report actionable findings, recheck fixes and invalidated gates.

Acceptance: findings resolved or explicitly blocking; independent session not a
runtime implementer; all statuses/evidence reconciled without security/historical/
whole-workspace claims not established. No commits/releases without a user request.
Verification: independent source/evidence/diff/packed review plus relevant V2/V5/V6.

Review findings/evidence:

- **FP06-R1 / P1:** active related derivation returns before the existing parent
  request/runtime equality check. With correct parent binding and target model but
  foreign child request/runtime, it issues a shared trusted child with parent
  permissions/provenance; OFF rejects. Private-seam reproduction, not a demonstrated
  HTTP exploit. Cheap cross-request ownership was retained, not an accepted waiver.
  FP-07 tracks the minimal tuple check and regression coverage.
- **FP06-R2 / P1:** selected BSON compatibility serializes before container admission
  and treats container-bearing BSON `Code.scope` as scalar. Real packed public
  LIST/READ returned HTTP 200 with 20,001 selected scope entries; shared remaining
  budget/depth also bypassed. A wire hook returning 21,000 accessor slots executes
  all reads before later rejection. This violates selected-materialization budget,
  not waived unvisited source bounds. FP-08 tracks bounded native/container handling.
- Independent V1, **1,357 tests in 24 files**, V6 **29 tests**, scoped ESLint/42-file
  formatting/diff, actual packed strict Bundler/Node16/NodeNext and five README
  executions passed. New review fixtures: **2 work proofs passed, 7 defect regressions
  failed**. Work removal/actual hooks/callbacks independently reproduced; no product
  or task edits by reviewer. All 14 live dist files matched earlier measured bytes.
- Reviewer independently recomputed latency statistics for **132 jobs/8,100 samples**,
  checked recorded CPU/modes/manifests/dependencies/denials/18 fingerprints and
  confirmed reported active gains plus strict/dormant adverse caveats. Prior full
  gates audited, not claimed rerun. No security/frozen historical/READ-latency/real-app
  equivalence claim. Performance supports provisional retention only after fixes.
- Handoff: `_tmp-review-fp06-20261030-200717/coordinator-notes.md`;
  `review-adversarial.test.ts` and `packed-public-bson.mjs` reproduce findings.
  Reviewer will recheck fixes/final-artifact evidence sequentially; no jobs remain.

Post-fix independent re-review:

- R1 accepted resolved; original nine reviewer fixtures and all 80 native tests
  pass. Independently audited the new fixed 124 timing jobs/8,200 samples and
  actual packed/public/consumer surface; reported gains and limitations hold.
- **P1 residual R2:** native plain-object loops skip policy-denied keys without
  charging the remaining shared work budget. Code/DBRef/wire expansions can complete
  21,000 policy checks (or 100 with two slots remaining); real newly packed public
  LIST/READ return 200 with filtered `{}` instead of controlled 400. No denied-field
  disclosure demonstrated, but bounded selected library work was retained.
  Re-review scratch: **6 regressions fail / 2 controls pass**. FP-08 is reopened.
- Independent **1,162 product tests**, V6 **29 tests**, source TypeScript/scoped
  lint/format/diff, actual packed strict compiles/five README executions pass.
  No product changes, workspace-wide commands or owned jobs. Detailed residual:
  `_tmp-rereview-fp06-20261031-004812/coordinator-notes.md`,
  `native-residual.test.ts` and `packed-residual.runtime.mjs`.

Fresh independent residual-fix precheck:

- **R1, original R2 and the denied-key residual are resolved** on `33662fae…`.
  Actual six-file correction/delta, prepaid key/depth/poison accounting and adjacent
  metadata/Map/shell/registry loops reviewed. No further blocker established within
  this bounded inspection; accepted borrowed-state/issued-member risks remain.
- **196 product tests / 3 files and 25 review cases / 3 files pass**, including the
  original nine, prior eight residual cases and eight new adjacent controls. All
  prior work-removal proofs retain actual hooks/rules and zero omitted copy/graph
  work. Fresh extracted current packed LIST/READ independently return **400** for
  oversized Code/DBRef/denied-wire containers and **200** for ordinary controls.
- All 14 live/packed outputs match the last-fix artifact; eight declarations and
  exact runtime/type export sets remain unchanged. Scoped lint/format/diff pass;
  product/task files and prior evidence preserved; no owned jobs remain.
- Handoff: `_tmp-rereview-fp06-residual-20261031-081635/coordinator-notes.md`.
  Proceed to FP-05; this precheck does not substitute for new full affected-package,
  strict/minimum-peer workflows or final-build timing/evidence closure.

Final independent acceptance:

- **PASS; no unresolved blocker or invalidated required gate.** Fresh reviewer was
  neither runtime implementer nor final integrator. Actual commands/results/logs
  confirm full **6,449 access-router / 691 deco / 29 runner** tests, scoped build/
  typecheck/lint/format/diff and all four fresh installed minimum/current workflows.
  Earlier independent code/public regressions are reused only after exact current
  source, tarball, 14-output and fixture identity checks; no false rerun claim.
- Independently recomputed **128 jobs / 8,600 raw latency samples**, regenerated all
  18 fixture fingerprints, inspected actual model getters/modes/hooks/reads/hydration,
  and checked 30 unchanged workload/check blocks. Primary median/p95/CPU gains and
  **all adverse guard/strict/dormant observations** above are confirmed. CPU is
  checked as recorded; no statistical, zero-default-overhead or frozen-v0.51.0 claim.
- All 14 live/sealed/installed outputs and eight declarations match the reviewed
  `33662fae…` runtime. Public runtime/type sets and default binding identity hold.
  Independently rehashed 134 dependency identities/3,500 files, official before and
  actual historical source; no older artifact substituted for final bytes.
- Product/user work/old evidence/HEAD/lock preserved. The coordinator's task-status
  reconciliation is the sole expected task-file exception to the earlier snapshot.
  No workspace-wide verification, new product changes or owned processes. No READ
  latency, arbitrary BSON-heavy/real-application performance, exhaustive security or
  historical-equivalence claim; accepted mutable/stale-authority risks remain.
- Handoff: `_tmp-fp06-final-20261031-143300/coordinator-notes.md`, `gate-audit.json`,
  `artifact-audit.json`, `measurement-audit.json`, `structure-audit.json` and
  `preservation.json`. Earlier review failures/interrupted baseline remain preserved.
  Recommendation accepted: **complete FP-06 and the feature; no further gate required**.

### Task FP-07: Restore cheap parent ownership in trusted related derivation

Status: completed
Assigned: FP-07 focused authority-fix session (sequential, after initial FP-06 review).
Kind: defect
Priority: P1 — parent permissions must not cross request/runtime ownership.
Suggested agent: focused authorization implementer
Dependencies: FP-03
Primary ownership: `src/acl/service-authorization.ts:deriveTrustedQueryAuthorization`,
related execution and focused authority/option tests. Avoid materializer/benchmark edits.

Finding: FP06-R1 above; trusted related early return skips receiving child
request/runtime equality with the parent, while preserving only supplied parent
binding/target checks.
References: `deriveTrustedQueryAuthorization`, `resolveServiceAuthorization` parent
check, review's `FP06 related derivation cheap owner boundary` reproductions.

Requirements: reject either foreign request/runtime before issuing shared trusted
authority, without graph/snapshot passes. Preserve target-own policy/model/scope,
origin capture and cheap legitimate related/embedded/retry derivation. Promote
failing tests, include genuine `createRelatedExecution`/receiving-service coverage.

Acceptance: active/OFF/dormant wrong-parent tuples reject; legitimate query paths
remain valid with no extra full-copy work. Regression fails before and passes after.
Verification: serial V1/relevant V2/typecheck/scoped V5. Final gates/artifact timing
revalidation belongs to reopened FP-05.

Completion evidence:

- Four-line receiving request/runtime comparison inside
  `deriveTrustedQueryAuthorization`, before shared call issuance, covers both direct
  derivation and resolver early return. Original copied path/error and target/edge/
  scope/origin behavior remain; no configuration copies or graph scans added.
- Added **50 authority regressions**. Corrected fixture showed **12 failing active
  cases before**, all passing after, including genuine registered receiving services.
  OFF/dormant/forged-source/target negatives and legitimate rollback/READ-retry controls
  pass; active related derivation/read still makes zero configuration copies.
- V1, **1,476 product tests in 32 files**, 4 independent owner/work fixtures,
  source TypeScript, ESLint/changed-file Prettier/diff passed. Original work-count
  reductions/hooks/callbacks unchanged. FP-08 native cases explicitly excluded,
  not called fixed. No full final-package/performance claim for these new bytes.
- Eight declarations/public exports/lock and earlier product/evidence preserved.
  Review's generated Vitest cache refreshed on rerun (documented); original defect
  logs/fixtures unchanged. New ESM
  `55af08e37a072258fa20f9233b2aad6888b942231cf793bdf01112079584c3e3`;
  old measured candidate remains preserved and is not relabeled as fixed.
  Handoff: `_tmp-fp07-20261030-203224/coordinator-notes.md`. No owned jobs remain.

### Task FP-08: Bound selected BSON-contained and wire-expanded materialization

Status: completed
Assigned: FP-08 sequential residual implementation, accepted by fresh independent precheck.
Kind: defect
Priority: P1 — selected containers must obey the promised shared slot/depth budget.
Suggested agent: focused native materialization implementer
Dependencies: FP-03, FP-07 (sequential ownership/verification handoff)
Primary ownership: `src/acl/trusted-output-materialization.ts`, selected native
runtime/retained-helper/virtual-return and public packed regression fixtures.

Finding: FP06-R2 above; `Code.scope` and wire-hook container expansion bypass selected
budget/depth or cause unbounded library-owned serializer work before rejection.
References: `materializeTrustedOutputValue` BSON branch and five review native repros.

Requirements: budget/validate selected native-contained/wire-normalized containers
before unbounded library-owned serialization/copy work, using the same remaining
budget, safe reconstruction, controlled errors and no partial publication. Preserve
appropriate single native normalization observations, ordinary supported BSON types,
default/copy behavior and no whole-source eligibility scans. Cover Code and other
container-bearing native families, native/proxy/accessor/cycle expansion, helpers,
virtual fail-closed channel and actual public LIST/READ. Do not merely weaken docs.

Acceptance: seven combined reviewer regressions pass after FP-07/08; over-budget,
deep and depleted-budget selected scope/wire graphs reject before the demonstrated
unbounded property reads; ordinary native controls remain usable. Active benchmark
paths keep prior omitted copies/graph work. Exact new caveats, if any, documented.
Verification: regression-first V2, serial V1/relevant V2/typecheck/scoped V5 and actual
packed public repro. Reopened FP-05 owns full invalidated gates/new artifacts/timings;
FP-06 independently rechecks both corrections.

Completion evidence:

- Native-local preparation now admits Code scopes, DBRef fields/IDs, nested native
  containers and wire-hook results against the same remaining selected slot/depth
  budget **before** library serializer traversal. Own-data descriptor handling,
  protected-key filtering, active ancestor/cycle state, per-occurrence alias charging
  and one data-method wire observation precede one serialize/deserialize of prepared
  values. No whole-source eligibility/graph/grant pass was added.
- Ordinary supported BSON families remain supported; native document roots, accessor
  state/hooks, custom serializer overrides, chained hook results and unproven state
  fail closed. README adds the precise selected-native caveat. Shared budget exhaustion
  remains a whole-result controlled failure, including virtual-return exhaustion;
  ordinary invalid getter returns retain fail-closed omission. Strings/binary remain
  scalar storage, not per-byte budgets; arbitrary application hook computation is
  not bounded by the library traversal contract.
- Regression-first corrected suite had **35 failures before**; final **80 native
  tests pass**, including exact depleted-budget/depth controls, Code/DBRef/wire scope,
  getter/helper/read-only/mixed fallback and supported native controls. Additional
  three native-as-document-root failures exposed/fixed a final narrow guard.
- V1, **2,105 product tests in 48 files**, **all 9 independent review fixtures**,
  source TypeScript, scoped ESLint/changed-file formatting/diff pass. Supplemental
  **19 BSON-6 diagnostics** pass, not falsely claimed actual Mongoose-8/min-peer gates.
  Actual newly packed public LIST/READ return 400/no partial data for oversized
  Code/DBRef containers, 200/checked shape for ordinary controls; wire expansion
  getter reads **21,000 → 0** with one hook observation. Actual strict packed
  Bundler/Node16/NodeNext and six emitted/example/native fixture executions pass.
- Exact FP-08 product scope: selected materializer, one new native unit suite and
  runtime fixture, packed-consumer regression wiring and precise README caveat.
  Ordinary non-BSON materializer body/FP-07 guard/other earlier code and evidence
  preserved. No workspace-wide commands. Detailed handoff:
  `_tmp-fp08-20261030-204719/coordinator-notes.md` and `handoff-*` artifacts/logs.
- New ESM `a0fff8777b4185157578f8875ab043f7100537f0be035c616ad3facb5e2aef4f`;
  eight declarations/exact public exports/lock unchanged. Old measured c26c217…
  bytes remain historical, not timings for this new candidate. No owned jobs remain.
  FP-05 affected-package full gates/new timings and FP-06 re-review are still required.

Reopened acceptance gap:

- Count/bound keys actually enumerated and filtered, including policy-denied keys,
  against the same remaining selected work budget without observing their values.
  Audit analogous newly introduced selected ordinary/native loops too; do not fix
  just one repro while leaving the identical accounting gap elsewhere.
- Preserve ordinary small native/value controls, exact/depleted-budget/depth tests,
  one-hook behavior, denied-value non-observation and poisoned whole-result failure.
  Do not reintroduce whole-source/grant/graph eligibility scans or weaken docs.
- Promote the six residual reviewer cases plus actual packed public repro into
  permanent tests, regression-first. Rerun affected scoped gates on new artifact;
  prior passing original cases are not sufficient to complete the retained bound.

Residual completion evidence:

- Selected ordinary/BSON keys now charge the shared budget **before** exclusion,
  policy or value access; accepted child roots use the prepaid slot. Named Maps,
  generated-alias shells and active metadata filtering admit work before filtering;
  denied metadata getters are not read. Request-only permission maps admit their
  path count before construction. No whole-source/grant/graph pass was restored.
- Original six residual failures reproduced first; **20 new product regressions
  failed before**, then all **102 native cases** (80 unchanged plus 22 new) pass.
  Three-slot native/depth/depleted/alias/cycle/one-hook/virtual-poison controls hold;
  denied accessors have zero reads. Real packed unknown-key LIST/READ reproduced
  200 before and now return controlled 400 with no partial data; ordinary controls
  remain 200. Policy calls stop within the remaining budget, before any call when
  only the Code root/scope slots remain.
- V1, **2,178 scoped product tests / 52 files**, **17 reviewer fixtures**, source
  typecheck, scoped lint/format/diff, newly packed strict consumer compiles/executions
  and artifact/preservation checks pass. Fresh independent confirmation above adds
  196 product/25 review cases. No workspace-wide commands, owned jobs or other edits.
- Detailed implementation: `_tmp-fp08-residual-20261031-011826/coordinator-notes.md`,
  `followup-only.diff`, `current-artifact.json` and new packed evidence.
  ESM `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`;
  CJS `4ad8ab48b44d91d4051c56e056bf3c2302e0f75c9fbd96b509a15b36f1003bea`;
  eight declarations/public exports/lock unchanged. Earlier a0fff877… full gates
  and timings are preserved history, not validation of these new bytes. Subsequent
  FP-05/06 final integration, timings and independent evidence closure are complete
  on these bytes, as recorded above.

## Definition of done

Both flags delivered with agreed four-prerequisite activation, independent strict
fallback behavior, explicit omitted/retained guarantees, retained actual permissions
and measured benefit; all required scoped gates and independent review pass. Types,
installed docs and benchmark mode discovery match the implementation. v0.51.0 is
an explicitly compared reference, not an unsupported equivalence/performance claim.
Any blocked/deferred outcome is documented as such, not disguised as a delivered
speedup. Existing eight flags, writes and unrelated work remain unchanged.
