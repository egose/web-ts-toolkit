# Access-router unsafe output-publication fusion

Created: 2026-10-30 08:28:47 PDT
Status: completed

Outcome: FUSE-01–06 executed sequentially, including independent review and a
sequential packed-Node16 coverage fix/re-review. The unshipped FUSE-02–04
prototype, both new options and the third benchmark group were **withdrawn by
FUSE-05** after failing the performance/guard retention gate. Small embedded gains
did not justify mixed primary results and repeated observed populate slowdowns. Final
runtime/source/declarations match the original before artifact; all eight existing
flags are unchanged. FUSE-06 independently accepted withdrawal; no blockers remain.

The subsequently authorized broader READ/LIST authorization fast path is tracked
in [a new phase](20261030-142406-access-router-unsafe-authorization-fast-path.md).
It intentionally permits additional isolation/graph-check omissions; it is not a
revival or delivery of the withdrawn fusion flags.

The new-flag contract and implementation evidence below are historical, **not
available API**. FUSE-02–04 are cancelled as retained-feature deliverables, while
their actual implementation/test history is preserved. No new speedup is delivered
and the original application/v0.51.0 performance concern remains unresolved.

## Original objective and authorization

The original objective was to introduce independent, default-false server model
options (implemented experimentally, then withdrawn; not available API):

```ts
unsafeFuseListOutputPublication?: boolean;
unsafeFuseReadOutputPublication?: boolean;
```

The user requested a task file followed by sequential subagent implementation.
This authorizes the first proposed bypass only: combine private intermediate and
final service output publication, omitting eligible intermediate output copies,
normalization and association/context work. It does **not** authorize skipping
permission evaluation, callback/grant isolation, final graph verification or all
authorization. Retain the feature only with demonstrated relevant performance
benefit and verification of the explicitly retained protections.

This is an intentionally weaker security feature, not a behavior-preserving
optimization. Omitted native/BSON normalization observations can change side
effects, exceptions and later authorization outcomes, including denial becoming
allowance. Matching benchmark output does not prove security equivalence.

Related completed phases:

- [Query-pipeline overhead](20261029-211734-access-router-query-pipeline-overhead.md):
  PIPE-01/02 rejected publication fusion under the previous security-preserving
  contract. This newly authorized feature changes that contract explicitly.
- [Initial output-copy flags](20261029-164234-access-router-initial-output-snapshot-copy-opt-outs.md):
  two existing copy flags and their comparison prerequisites stay unchanged.
- [Query CPU investigation](20261029-105358-access-router-query-cpu-follow-up.md):
  historical profiles/counterexamples are context, not a current baseline.

## Scope, findings and limitations

Primary scope: `packages/access-router/`, its downstream verification,
`scripts/benchmarks/` mode plumbing/tests/docs and this task file. Unprefixed
`src/` and `test/` paths below refer to `packages/access-router/`.

Inspected current source:

- `src/services/service.ts` (`finalizeDirectOutput`): isolates a projected source,
  resolves a row owner, runs `finalizeModelOutput`, deep-isolates its already
  associated result for metadata/includes, transfers the graph and creates the
  final output context. Its intermediate `onFinalized` callback is package-owned.
- `src/output/finalize-model-output.ts` (`finalizeSingleDoc`): children finalize
  before parent getters; trimmed output receives metadata, an association and a
  context before returning. Standalone finalizers also depend on this behavior.
- `src/acl/document-authorization.ts`: final output associations own snapshots or
  opted-out bounded admission plus exact graph identities. Transfers and public
  handle/context readers authenticate those associations.
- `src/acl/authorization-snapshot.ts`: copying and bounded clone-free admission
  have different native observation semantics. An identity walk alone is not a
  substitute for structural admission.
- `src/runtime.ts`, `src/acl/model-output-planning.ts`,
  `src/validation/public-admission.ts`: existing flags use literal-true server
  configuration, coherent warnings, captured options and public-control rejection.
- `scripts/benchmarks/access-router-core.mjs` and worker: separate six-comparison
  and two-copy groups, declaration/hash/getter verification, unchanged workloads.

Creation-time HEAD: `46d85e8`. Earlier access-router phase changes are now in HEAD;
there are unrelated uncommitted OIDC/client/example and root ESLint changes.
Preserve them. No current build, tests, profiles or timings were run during task
creation. Earlier verification is historical, not evidence for this feature.

Non-goals: commits/releases, dependency/lock changes, new public issuers or execution
tokens, disabling permissions, skipping final descendant identities, live callback
aliases, child-call caching, changing benchmark workloads, modifying historical
trees, or recovering v0.51.0 performance by assertion. Do not change unrelated work.

## Historical prototype contract and mandatory boundaries

FUSE-01 confirmed the concrete seam and recorded refinements before implementation.
The prototype used these conservative requirements:

Disposition note: FUSE-01 confirmed this contract and FUSE-02–04 implemented it;
FUSE-05 subsequently withdrew the entire unshipped feature. These requirements
explain the experiment, not current runtime/public options.

1. Both new flags default to `false`; only literal `true` in model/default-model
   configuration requests fusion. Keep the existing six comparison options and two
   copy options independently configurable, with unchanged meanings and groups.
2. A requested operation's fusion is active only when **all four** matching existing
   options are explicitly effective `true`: top-level document snapshot skip,
   output snapshot skip, nested document snapshot skip and initial output snapshot
   copy skip. Otherwise it is dormant; preserve original publication and warn.
   Never silently enable a prerequisite. This prevents fusion from omitting source
   comparison observations while that operation still requests strict comparisons.
3. Capture mode before hooks/awaits. LIST and READ stay independent; READ-to-list
   retries retain READ mode. Authenticated related/embedded derivations inherit the
   initiating mode; target options cannot relax a strict origin. An inherited mode
   is not proof that a particular publication seam is eligible.
4. Eligibility is package-derived at a private service handoff, never a request,
   per-call/defaults control, public plan bit, hook context token or user callback.
   Standalone finalizer/helper publication, writes, write-derived reads and dedicated
   subdocument operations retain original publication.
5. Fuse only work whose intermediate DTO/context cannot escape into application
   callbacks or handle readers. Children exposed to parent getters retain required
   associations/isolation. Keep original fallback for unproven seams/graphs/bindings.
   No mutable validation certificate crosses an await or application/native work.
6. Always evaluate operation/row/field permissions with the original actor. Keep
   hook count/order/short-circuiting, detached source/hook/getter/grant inputs,
   captured configuration and same-ID row/child independence. Omitted publication
   normalization may change later decisions; actual callbacks are not skipped.
7. The final DTO retains controlled shape/key/descriptor/cycle admission and current
   limits (20,000 visits, depth 100, array length 20,000), exact request/runtime/model/
   scope/access/stage ownership, parent-child provenance and final root/descendant
   graph identities. Include/populate attachments and permission metadata remain
   correct. Do not legitimize a pre-associated mutated output by refreshing it.
8. Warn once per effective model/operation transition (activation/dormancy), including
   changes to prerequisites/default inheritance; logger failures must not undo option
   publication. Rollback affects new calls, not in-flight captured authority.
9. Shipped types/JSDoc/README and release notes explain prerequisites, fallback,
   operation boundaries, retained protections and denial-to-allowance risk. Do not
   describe fusion as a generic validation or clone bypass.

Confirmed FUSE-01 seam refinement: the first prototype is the private service
**root publication tail**, initially limited to stripped permission metadata with
a primitive top-level permission-field name, no produced includes/custom traversal,
ordinary authenticated bindings, a fresh root and bounded admitted graphs. Other
paths fall back. Keep early metadata-source copying/retention, all recursive child
associations and late child-owner validation. Recursive children already create no
`ServiceOutputContext` because their `onFinalized` callback is cleared. Mode
inheritance does not extend the private seam to standalone/populate-target finalizers.
Use a separate lexical package completion argument, never a field on public or
traversal finalizer args, to combine the eligible root's publication into one final
association/context without its post-finalizer whole-root copy.

## Sequential execution and verification

The coordinator owns this file and reconciles agent evidence before changing task
statuses. Use a fresh child session per task and task-local aliases only; never put
session IDs/URLs in shared evidence. Run **one subagent at a time**, in dependency
order. Shared builds/tests/benchmarks must also run serially (`AGENTS.md`). The last
task is a separate reviewer, not a runtime implementer. No other delegation implied.

Commands run from repo root after installed dependencies. Build output is shared;
do not run any of these build/test commands concurrently. Temporary fixtures and
preserved artifacts use a new ignored repo-local `_tmp*` directory; do not overwrite
earlier phase evidence. Replace `<repo-root>` placeholders before execution.

- **V1 Build:** `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`.
- **V2 Focused:** `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts <files>`;
  use actual package-relative test names and build first when they import dist.
- **V3 Package/types:** `pnpm --filter @web-ts-toolkit/access-router test`, then
  `pnpm --filter @web-ts-toolkit/access-router typecheck`. Package tests include
  packed-consumer, export and executable-documentation gates.
- **V4 Downstream:** `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- **V5 Lint/format:** scoped ESLint over affected access-router source/tests and
  benchmark scripts; changed-file Prettier, `git diff --check`. Preserve root ESLint
  user changes; record any blocker rather than mislabeling it a baseline failure.
- **V6 Runner:** `node --test scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs`.
- **V7 Performance:** preserve a fresh before artifact with entrypoint/declaration/
  lock/peer identities. Use unchanged existing worker/scenarios. Start 100-row
  plain-wide, document-rules and embedded separately: 24 fields, 32 bytes, one client,
  hook concurrency 10, five warmups, at least 50 measured requests and two paired
  alternating batches. Compare current all-eight ON/fusion OFF with fusion ON and
  check strict/dormant paths. Guard plain-narrow, hydrated, global-rules,
  large-config, populate and virtuals at 10/100 rows as relevant; repeat noisy
  results before deciding. Record median/p95/CPU, output fingerprints, denied fields,
  order, actual hydration, reads and hook/getter counts. Instrumented work counts
  are separate from uninstrumented timings. No wall-clock unit assertions.

## Tasks

### Task FUSE-01: Prove the private fusion seam and preserve a fresh baseline

Status: completed
Assigned: FUSE-01 boundary/baseline session (sequential).
Kind: investigation
Priority: P1 — contract/ownership decisions determine whether fusion is implementable.
Suggested agent: boundary and baseline investigator (FUSE-01 session)
Dependencies: none
Primary ownership: read-only service/finalizer/authorization review; focused boundary
fixtures and new ignored baseline artifacts. Avoid runtime implementation in this task.

Finding: the previous phase rejected omitted publication observations; new explicit
authorization permits those differences, but no-escape eligibility and final graph
ownership must still be established.
References: `service.ts:finalizeDirectOutput`,
`finalize-model-output.ts:finalizeSingleDoc`,
`document-authorization.ts:associateDocumentAuthorization` and `transferDocumentAuthorizationGraph`.

Requirements:

1. Map exact omitted/retained operations on direct/public/root LIST/READ and related
   service paths. Identify fallback for standalone finalizers, child-before-getter,
   include/populate assembly, traversal hooks, native/open bindings and writes.
2. Confirm/refine the above prerequisite/capture contract and specify a private
   handoff design without public authority or a live-output snapshot alias.
3. Build and preserve fresh before runtime/declaration/lock identities; run relevant
   baseline tests and initial all-eight-ON timing jobs using unchanged workloads.
4. Identify a deterministic failing-before work-count regression and a reproducible
   publication-normalization risk test to implement with FUSE-03.

Acceptance criteria: a concrete eligible seam with retained ownership/admission and
explicitly lost observations is recorded, or a blocker is identified; baseline
artifacts/settings/results are recorded without claiming security/historical parity.
Verification: V1, relevant V2 and initial V7 evidence; contract/source review.

Completion evidence:

- Confirmed the conservative private root seam and all-four-prerequisite contract
  recorded above. Source/stage/grant/getter work, recursive child associations and
  late descendant checks remain. Omit only eligible intermediate root association/
  context, private post-finalizer root copy and duplicate root transfer. No runtime
  implementation or shared source edits in this investigation.
- V1 serial build passed; V2 baseline **902 tests in 16 files** passed, including
  service/finalizer/native/ownership/READ-retry/public-boundary suites. Ignored
  boundary fixtures passed **8 tests plus 2 expected failing-before targets**.
- Six-row actual direct/public LIST baseline: **12 root contexts, 6 private
  post-finalizer copies, 6 document hooks and 1 adapter read**. Active target is
  6 contexts and 0 such copies, with hooks/read unchanged. Embedded children were
  associated before the detached parent getter; recursive child context count is 0.
- Native-risk fixture: a first-row Date getter return receives 3 observations;
  the private service copy's third observation denies the later same-ID row via
  its actual document hook. Fusion should omit that third observation, while
  retaining 2 document hooks, 1 getter and both rows' field-rule callbacks. This is
  the intentional denial-to-allowance risk, not equivalent authorization.
- New ignored evidence tree:
  `_tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/`.
  Official before artifact is `before-v1/` (not the incomplete `before/`);
  `before-metadata.json`, `seam-findings.md`, `coordinator-notes.md` and
  `timings/summary.json` retain detailed identities/raw evidence. Verified 14 dist
  files, 8 declarations and linked/hashed runtime dependencies. ESM SHA-256
  `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`;
  runner declaration SHA-256
  `85a7fa10ea3fb85b55523f746015f99944aebc753548a6c710d42d562fd8f65e`;
  lock SHA-256 `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- Six before-only timing jobs (2/scenario, V7 settings, 50 samples) passed with all
  eight existing flags ON and fusion absent/OFF. Median / p95 / CPU ms/request
  ranges: wide **17.51–18.25 / 20.71–21.63 / 23.23–23.43**; document-rules
  **21.30–22.00 / 24.58–25.15 / 27.57–29.73**; embedded
  **52.51–54.20 / 58.04–59.79 / 62.91–67.42**. All were lean, one read/request,
  stable validated fingerprints/order/denied fields, zero getters; document-rules
  ran 100 document hooks/request. These are not paired fusion gains.
- `git diff --check` passed. Earlier phase evidence verified unchanged. Unrelated
  OIDC work continued externally; none was restored or overwritten. No jobs remain.
  Full/new-mode/type/downstream/packed/lint/runner/guard gates await later tasks.

### Task FUSE-02: Add independent captured configuration, prerequisites and warnings

Status: cancelled
Assigned: FUSE-02 configuration session (sequential, after FUSE-01).
Disposition: implemented/verified as an unshipped prototype, then withdrawn by
FUSE-05. No new captured option/API is retained; earlier completion evidence below
is historical. Cancellation removes the retained-feature objective, not execution history.
Kind: improvement
Priority: P1 — unsafe selection must never be controlled by public/per-call inputs.
Suggested agent: server configuration implementer (FUSE-02 session)
Dependencies: FUSE-01
Primary ownership: `src/interfaces/root.ts`, `src/acl/unsafe-snapshot-options.ts`,
`src/runtime.ts`, `src/acl/service-authorization.ts`,
`src/acl/model-output-planning.ts`, `src/validation/public-admission.ts`,
service capture plumbing and focused option/capture tests.

Finding: only the existing eight flags have normalization, capture and public
admission guards; the new publication mode requires its own independent group.
References: `runtime.ts:deferSnapshotWarnings`,
`service-authorization.ts:resolveServiceAuthorization`,
`validation/public-admission.ts:assertPublicAdmission`.

Requirements:

1. Implement both options, literal-true normalization, default inheritance/explicit
   false/undefined reset, coherent activation/dormancy warnings and throwing-logger
   tolerance. Keep existing six/two groups and behavior unchanged.
2. Authenticate and capture effective fusion under the FUSE-01 contract; propagate
   only on real query/retry/traversal edges. Test opposite LIST/READ/target settings,
   in-flight rollback, handles, retries, wrong owners and strict helper/write paths.
3. Reject new controls in HTTP/root/service/defaults/policy/include/populate/subquery
   envelopes. Same-named business data is inert. No new public issuer/export.
4. Add accurate JSDoc; runtime fusion itself belongs to FUSE-03.

Acceptance criteria: targeted cross-products and negative tests demonstrate isolated
selection and untouched existing modes; no actual publication bypass is activated
by this config-only step.
Verification: V1/V2 and scoped V5; inspect generated option declarations.

Completion evidence:

- Added both options with literal-true/default-false normalization and a distinct
  `unsafeOutputPublicationFusionOptions` group. Original six/two/eight arrays are
  unchanged; `unsafeServerOptions` is the new admission/normalization aggregate.
- Private `CallRecord.outputPublicationFusion` captures origin and off/dormant/
  active mode once. `fusesOutputPublication(call, binding)` authenticates every
  selection read but grants no receiver/stage/seam/graph eligibility. Genuine
  query traversal/retry edges inherit root decisions; generic parent/provenance
  alone does not. READ retries retain READ origin, including related READ retries
  reached from an originating LIST. Existing comparison/copy inheritance is unchanged.
- Coherent activation/dormancy warnings observe all four prerequisites/defaults;
  throwing loggers and failed option validation cannot undo/partially publish modes.
  Added presence-based unsafe control rejection to nested service/public/defaults/
  policy envelopes; ordinary business names remain inert. No publication-tail,
  finalizer or association bypass in this config-only step.
- Changed seven source files and added four test files plus one shared fixture.
  V1 passed; final V2 **1,286 tests in 24 files**, including **356 new tests**,
  passed. Scoped ESLint, changed-source/test Prettier and diff checks passed.
  **16 declaration/JSDoc checks** passed across CJS/ESM root/advanced options;
  runtime/public type export-name sets remain unchanged.
- Ignored handoff/logs:
  `_tmp-publication-fusion-fuse02-config-20261030-b73c/coordinator-notes.md`.
  FUSE-01 artifact, earlier evidence, runtime dependencies, worker/core, package
  metadata and lock verified unchanged. No active jobs or FUSE-02 blocker.
  Full package/types/downstream/packed/docs/runner/performance await later tasks.

### Task FUSE-03: Fuse eligible private service publication and retain final authority

Status: cancelled
Assigned: FUSE-03 publication session (sequential, after FUSE-02).
Disposition: boundary-verified prototype implemented, then withdrawn by FUSE-05
after the performance/guard retention gate failed. No runtime bypass is retained;
earlier prototype evidence is preserved rather than claimed as a delivered speedup.
Kind: improvement
Priority: P1 — runtime fusion intentionally removes protections and must stay bounded.
Suggested agent: private publication implementer (FUSE-03 session)
Dependencies: FUSE-01, FUSE-02
Primary ownership: `src/services/service.ts`,
`src/output/finalize-model-output.ts`, narrowly necessary private authorization/output
helpers and focused service/finalizer/publication regression tests.

Finding: `finalizeDirectOutput` copies and re-associates an intermediate finalizer
result even though its root DTO/context do not reach the service decorator.
References: `service.ts:finalizeDirectOutput`,
`finalize-model-output.ts:finalizeSingleDoc`,
`document-authorization.ts:createServiceOutputContext`.

Requirements:

1. Implement the proven no-escape handoff and eligible single final DTO assembly/
   association. Keep default/dormant/fallback and standalone finalizer behavior.
2. Preserve callback/grant/getter isolation, permission evaluation and callback
   count/order. Children visible before parent getters remain properly finalized.
   No generic child cache, borrowed application DTO or bypass marker on public data.
3. Preserve final bounded admission, exact bindings/graph/descendant provenance,
   same-ID independence, metadata/alias removal, include/populate copy origins and
   controlled rejection of forged/replaced owners.
4. Add deterministic real-service work-count tests that fail before fusion, the
   explicit risk counterexample and strict/dormant/active/fallback regressions.
   Never amend secure default expectations to make active fusion look equivalent.
5. Obtain preliminary paired uninstrumented performance evidence before expanding
   the prototype; if there is no relevant gain, report it and revise/withdraw rather
   than retaining complexity from operation counts alone.
   Minimal independent worker/core flag plumbing needed for the pilot may move
   forward from FUSE-04; keep workload/response checks unchanged and explicitly
   hand it off for FUSE-04's interactive selection/tests/docs completion.

Acceptance criteria: targeted service/direct/public/root READ/LIST and ownership/native
tests pass; deterministic publication work decreases only in eligible active mode;
native-observation differences are disclosed and reproducible.
Verification: V1/V2, scoped V5 and preliminary V7 (final retention belongs to FUSE-05).

Completion evidence (prototype only; retention is not established):

- Genuine execution is threaded privately into `finalizeDirectOutput`; an issued
  root plan/exact stage/request/model/access is authenticated before the finalizer
  and at its lexical completion. No public/traversal args, DTO/context or export
  gains a bypass selector. Eligibility remains stripped, primitive top-level metadata,
  no produced includes/custom traversal, ordinary owners and fresh admitted roots.
- Eligible completion omits intermediate root association/context and service root
  copying. Validation-only late child checks authenticate the actual owning-document
  chain to this row handle, not IDs/shared provenance; final graphs are freshly
  re-admitted after context creation and service async resume. An inherited-write
  escape-history latch forces fallback even if a root-exposing setter removes itself.
  Original source/getter/grant/return copies, callbacks and legacy fallback tail remain.
- Added **78 ordinary passing runtime regressions** in three files. Real six-row
  direct/public LIST: **12 → 6 contexts, 6 → 0 post-finalizer copies**, unchanged
  6 document hooks/1 read. Root HTTP READ plus three-row LIST: **8 → 4 contexts,
  4 → 0 copies**, unchanged 4 hooks/2 reads. Recursive child contexts remain 0;
  associated children and same-ID/concurrent row isolation are retained.
- Risk regression preserves default denial: default publication has **3 Date
  observations**; eligible fusion has **2** and allows the later same-ID name.
  Both retain 2 document hooks, 1 getter and 2 callbacks for each field-rule kind.
- V1, **2,547 tests in 64 files**, scoped ESLint/Prettier/diff and 16 declaration
  checks passed. Public runtime/type export sets and public/traversal finalizer
  args remain unchanged. Six strict/dormant unchanged-worker smoke jobs passed.
  Existing V6 was **20 passed, 1 failed**: its raw-source quoted-flag regex counts
  FUSE-02 prerequisite references twice. Actual six/two arrays remain unchanged;
  correcting that assertion and adding third-group coverage belongs to FUSE-04.
- Minimal independent worker/core third-group declaration/mode/getter plumbing
  moved forward as authorized. Workload definitions/response checks remain unchanged;
  FUSE-04 still owns interactive selection, reports, committed tests and docs.
- Ignored handoff/artifact: `_tmp-publication-fusion-fuse03-runtime-20261030-c92e/`,
  `coordinator-notes.md`, final `candidate-v3/` and `pilot-v3/summary.json`.
  All 14 live dist files match that candidate; ESM SHA-256
  `6a25bd0d008333f4261bda6f58285456501c56a573456f863c047a8aacae0ec4`.
  Before artifacts, dependencies, lock and earlier phase evidence remain unchanged.
- Final-source pilot: 18 uninstrumented jobs, V7 settings, 50 samples, two
  alternating repetitions of before/all-eight ON, candidate fusion OFF and ON.
  All modes/getters/hydration/order/denied fields/fingerprints/reads/hooks verified.
  Same-candidate ON median changes: wide **+0.7–1.1%**, embedded **+0.85% then
  −2.18%**. Document-rules' large second OFF difference was an outlier; ON versus
  before was approximately unchanged/1.52% slower. CPU/p95 vary. **No relevant
  repeatable gain established**; no unsafe scope expansion justified. FUSE-05
  must decide retention/withdrawal after final repeated/guard measurements.
  Full package/types/downstream/packed/docs/final runner/review remain outstanding.

### Task FUSE-04: Ship discoverable types/docs and independent benchmark selection

Status: cancelled
Assigned: FUSE-04 consumer/benchmark session (sequential, after FUSE-03).
Disposition: provisional consumer/runner surface implemented and verified, then
withdrawn with the feature by FUSE-05. Installed docs now state no fusion options
are available, and the runner again offers only the original six/two groups.
Kind: improvement
Priority: P2 — installed consumers and timings need accurate effective-mode discovery.
Suggested agent: consumer contract and benchmark implementer (FUSE-04 session)
Dependencies: FUSE-02, FUSE-03
Primary ownership: `packages/access-router/README.md`, shipped declaration/compile/
packed-consumer tests, relevant release notes and website docs, `scripts/benchmarks/`
mode plumbing/runner tests/docs. Do not change workload definitions or response checks.

Finding: current installed documentation and benchmark selection know only six
comparison and two copy flags, not the independently requested publication mode.
References: `README.md:Temporary unsafe initial output-snapshot copy switches`,
`scripts/benchmarks/access-router-core.mjs:inspectSnapshotDeclarations`.

Requirements:

1. Document names, all prerequisites, default/dormant/active/fallback, rollback,
   READ/LIST/retry/descendant limits, kept permissions/isolation and additional native
   observation risks. Add executable public-import examples and release notes.
2. Verify exported options/JSDoc in CJS/ESM declarations and packed consumers; no
   internal handoff/token becomes a public export or import path.
3. Add a third independent OFF/ON/BOTH benchmark group, genuine declaration/hash/
   getter checks, requested/effective/dormant labels and old/partial-build handling.
   The six comparison and two copy groups must keep their original ON meaning.
4. Extend runner tests and real-worker smoke coverage including dormant fusion and
   separate embedded/document-rules workloads; leave workloads/checks untouched.

Acceptance criteria: installed types/docs/examples agree with runtime; runner rejects
missing/unapplied flags and reports real requested/effective modes; smoke outputs and
hook/read counts match on unchanged fixtures, without an equivalence claim.
Verification: V1, relevant V2 packed/docs/export gates, V5/V6.

Completion evidence (provisional feature; final retention awaits FUSE-05):

- Added experimental installed README/JSDoc-aligned examples, llms index, secondary
  configuration docs and one Unreleased note. All disclose all-four prerequisites,
  server-only/default-false selection, origin capture, narrow root/fallback boundary,
  remaining permissions/isolation/bounds/owner chains and denial-to-allowance risk.
  No speedup or generic clone/validation-bypass promise.
- Added consumer/declaration/packed/executable public-import checks. V1 passed;
  focused V2 **141 docs/export/strict-consumer tests**, **4 packed tests** and
  **20 separate work-count/risk tests** passed. Model/default/extended properties
  and hover JSDoc verified across CJS/ESM root/advanced; private helpers absent.
  Runtime exports remain 46/48/6 and declaration-name sets 186/322/17.
- Completed independent third OFF/ON/BOTH prompt/eight-way candidates, baseline
  identities and reports. Requested/effective LIST/READ configuration is explicit;
  READ is not timed and active config does not prove each graph fuses. Actual
  declarations/hash/both-model getter paths are verified; old/partial builds stay
  supported-OFF/N/A. Malformed manifests and missing/unapplied options reject.
- Fixed the previous V6 failure by transpiling/reading the actual exported option
  groups, asserting exact six/two/eight names/order independently of prerequisite
  references. Final V6 **30 tests passed**, including 16 real-worker eight-way
  embedded/document-rules jobs. Two actual before-artifact supported-OFF compatibility
  smoke jobs also passed. Workloads/response checks remain byte-verified unchanged.
- Scoped ESLint/changed-file Prettier/diff checks passed. Historical whole CHANGELOG
  formatting failure is demonstrated against the original; only the new entry is
  formatted, without unrelated churn. Coordinator task-file Prettier also passed.
- Ignored handoff/logs:
  `_tmp-publication-fusion-fuse04-consumer-runner-20261030-d84f/coordinator-notes.md`.
  All 14 live dist files still match FUSE-03 `candidate-v3`; protected runtime/
  dependency/lock/earlier evidence files unchanged. No active jobs or FUSE-04 blocker.
  Full package/types/downstream/final performance and independent review remain.

### Task FUSE-05: Verify integrated correctness and measure whether fusion is worth retaining

Status: completed
Assigned: FUSE-05 integration/performance session (sequential, after FUSE-04).
Kind: investigation
Priority: P1 — extra security risk is unjustified without a repeatable measured benefit.
Suggested agent: integration and performance verifier (FUSE-05 session)
Dependencies: FUSE-01. The prerequisite FUSE-02–04 prototype execution was completed
before this task began; their later cancellation records this task's withdrawal,
not missing experiment inputs. They are no longer retained-feature prerequisites.
Primary ownership: final focused gaps, ignored measurement artifacts and verification
evidence. Runtime fixes must be attributed explicitly; no unrelated package changes.

Finding: preliminary counts cannot establish query speedup or retained security
boundaries; final-source integrated verification and paired measurements are required.
References: this document's V1–V7, existing service/native/ownership/cross-product tests.

Requirements:

1. Run V1–V6 serially on final runtime, including full access-router/types/downstream/
   packed/docs/export gates and focused boundary/cross-product gaps.
2. Run V7 repeated active-versus-all-eight-ON and guard measurements with identical
   dependencies/workloads and verified modes; preserve raw evidence/build hashes.
   Report medians/p95/CPU and confounds honestly, separately by scenario and size.
3. Verify final rebuilt dist equals the measured artifact, public runtime export sets
   have not gained internal APIs, declarations expose only intended options and the
   dependency lock/unrelated work is unchanged by this phase.
4. Retain only a relevant repeatable gain without a material reproducible guard
   regression. If not established, withdraw the runtime prototype and reconcile
   dormant API/docs/tasks explicitly; do not mark an undelivered speedup completed.
5. If eligibility bookkeeping outweighs the saved work, a bounded refinement inside
   the already confirmed seam may be investigated before deciding. Preserve every
   promised final bound/identity/owner/isolation check; share results only inside a
   proved closed synchronous segment, never across native/application work or an
   await. Attribute runtime changes, add regressions and rerun invalidated gates.
   Do not expand eligibility, disable more protections or change workloads to force
   a win. A withdrawal must affect only this phase's documented changes, not user
   work, prior delivered optimizations or existing eight flags.

Acceptance criteria: mandatory checks pass, performance retention/withdrawal is
evidence-backed and unresolved application/v0.51.0 gap remains explicit. Required
unrun gates keep the task blocked, not completed.
Verification: V1–V7 and final diff/artifact identity review.

Completion evidence — withdrawal, not a delivered optimization:

- Repeated the unchanged FUSE-03 final prototype (no refinement implemented):
  **168 uninstrumented jobs / 12,300 requests**, including 144 prototype decision
  jobs, all primary/10–100-row guards, conflicting-case repeats, strict/dormant
  checks and artifact-identical withdrawal controls. Primary/decision repeats used
  100 samples; guard/strict/dormant jobs used 50, with two alternating rounds.
- Final bounded same-candidate ON/OFF median changes: wide **−0.43%, +0.53%**;
  document-rules **−0.86%, +3.64%**; embedded **−1.90%, −2.00%**;
  populate **+10.57%, +3.11%**, with populate CPU **+12.8%, +7.2%**. Earlier
  populate guards were also slower (**+3.47%, +10.11%**). Narrow apparent gains
  did not repeat. Small embedded wins are disclosed, but mixed primary results and
  repeated observed guard slowdowns fail the acceptable-benefit retention gate;
  these are not independently proved causal regressions or a universal no-gain claim.
- All jobs verified actual Source/Target option-getter paths, declared/requested/
  effective modes, identical dependencies/lock, output/denied fields/order/fingerprints,
  reads/hooks/getters and actual hydration. Embedded/document-rules stayed separate.
  Only LIST was timed; READ configuration/runtime checks are not READ latency.
  CPU includes Node server/client, not MongoDB. Substantial host/order variation
  also occurred between byte-identical control artifacts; raw outliers remain
  preserved. No significance, causal host diagnosis or application/historical parity.
- Proved no closed replacement for the two final root admissions around native
  context work and service await/resume. Did not remove final checks or broaden
  eligibility to force a win. The authorized inverse patches restored only the
  phase's 35 known paths (25 original files, 10 new prototype fixtures), preserving
  originals/patches in ignored evidence. Both new flags, capture/warnings/runtime,
  experimental API/docs/examples and third benchmark selection were removed.
- Final retained diff: withdrawal notice in access-router/benchmark READMEs,
  negative installed/packed option-surface regressions and robust exact six/two/eight
  runner export inspection. Former JavaScript option names have no runtime selection
  path. New regressions preserve original direct/public READ/LIST context/copy counts
  and the third-Date-observation denial even with former names supplied as inert options.
- Final V1 passed; V2 **799 tests in 17 files**; V3 **5,906 tests in 174 files**
  and typecheck; V4 **691 tests in 22 files**; scoped ESLint/changed-file formatting/
  diff checks; V6 **21 runner/integration tests** all passed serially. Full V3
  includes packed/release-shaped consumers, executable docs, exports and strict
  declaration compilation. Whole-workspace verification was not claimed.
- All **137 runtime source files and 14 dist files** equal official FUSE-01 before
  and the measured withdrawn-final artifact. All eight declarations/options and
  public runtime export sets (46/48/6) remain original. ESM SHA-256
  `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`;
  runner declaration hash
  `85a7fa10ea3fb85b55523f746015f99944aebc753548a6c710d42d562fd8f65e`;
  lock/dependency identities unchanged. Earlier evidence/user work was preserved.
- Ignored detailed handoff:
  `_tmp-publication-fusion-fuse05-integration-20261030-112318-e5b7/coordinator-notes.md`;
  `timings-overview.md`/JSON and six timing summaries retain full median/p95/CPU/raw
  evidence. Prototype `candidate-current-v1/` still matches FUSE-03 candidate-v3;
  `withdrawn-final-v1/` matches live/before. Frozen diagnostic worker/core permit
  replay without retaining a public third group. No current FUSE-05 blocker/jobs.
- Historical CHANGELOG formatting failure remains byte-identical to its original;
  no new entry survives withdrawal. Unrelated later tests were awaited without
  killing them or claiming their results, followed by quiet preservation verification.
  FUSE-06 remains the required separate independent review.

### Task FUSE-06: Independently review withdrawal and reconcile delivery

Status: completed
Assigned: FUSE-06 independent review session (sequential, after FUSE-05).
Kind: investigation
Priority: P1 — independently verify withdrawal leaves the original boundary intact.
Suggested agent: fresh independent reviewer (FUSE-06 review session)
Dependencies: FUSE-01, FUSE-05. Revised after verified withdrawal: cancelled
FUSE-02–04 retained-feature deliveries are not prerequisites for review of the
restored original boundary, absent API and preserved experiment evidence.
Primary ownership: read-only combined diff/runtime/contract/evidence review and focused
verification. Implementers resolve findings sequentially before review completion.

Finding: withdrawal and its absence from runtime/installed controls must be
independently verified; implementer assertions/fingerprints cannot establish that
the original eight-flag boundary was restored or that the retention claims are sound.
References: completed task acceptance criteria and delivered source/tests/docs.

Requirements:

1. Verify complete new-flag/runtime/consumer/third-group withdrawal, original
   permissions/isolation/final graph/bounds/callback/standalone/write behavior and
   unchanged original eight flags against preserved source/runtime identities.
   Check exact inverse patch scope and unrelated-work preservation.
2. Check CJS/ESM negative option types/exports, installed withdrawal notice, original
   benchmark mode support and measured final artifact/evidence agree. Independently
   assess repeated measured gains/regressions and host-noise limitations; do not
   turn matching fingerprints into security equivalence or causal speedup claims.
3. Run focused adversarial checks as needed; record findings by severity, evidence
   and acceptance impact. Do not claim security equivalence, historical parity or
   entire-workspace verification not actually performed.

Acceptance criteria: actionable findings resolved/reverified or explicitly blocking;
review is a separate session from runtime implementation; coordinator reconciles
statuses, measured benefit, remaining risk and unrun checks.
Verification: independent source/diff/evidence review, relevant V2/V5 and invalidated
integration gates rerun after fixes.

Completion evidence:

- Independent FUSE-06 review found no runtime/API/required-gate blocker and accepted
  withdrawal. It replayed all inverse patches in memory, checked all 137 source/14
  dist bytes, actual transformed 18-file packed contents and all 168 raw timing jobs.
  It recomputed latency summaries from 12,300 raw samples; CPU ratios use job
  statistics because original raw CPU counters were not separately persisted.
- Independent V1 build passed. V2 **933 tests in 19 files** and **3 selected actual
  packed tests** passed. V6 **21 tests**, including 8 real worker jobs, plus scoped
  ESLint/7-file Prettier/diff checks passed. Prior full 5,906-test package/typecheck
  and 691-test downstream results were audited, not falsely claimed rerun.
- One P3 nonblocking gap: the packed Node16 config compiled older fixtures but did
  not include the new withdrawal `.mts`/`.cts` fixture. Separate installed Node16
  tests passed. FUSE-05 follow-up added exactly those two paths; both minimum-peer
  and current-major packed gates passed. The independent reviewer then reran the
  **1 current-major packed test**, checked actual generated Node16 configuration
  (`strict: true`, `skipLibCheck: false`, both fixture files) and compiler exit 0.
  Scoped lint/format/diff passed; P3 is resolved with no other product changes.
- Evidence wording is reconciled above: repeated observed slowdowns justify rejecting
  acceptable benefit versus added risk, but host/order outliers prevent claiming
  independently proved causal performance regressions.
- Final re-review again confirmed all 137 source files, 14 dist files, 8 declarations,
  lock/original option groups/public exports and no fusion API/third selection.
  Earlier full gates remain applicable because the follow-up changes only packed
  fixture selection. No full-workspace, prototype security-equivalence, application
  or v0.51.0 performance claim is made; no active relevant jobs remain.
- Detailed independent report:
  `_tmp-review-fuse06-withdrawal-20261030-125920-c19a/coordinator-review.md`.
  P3 fix evidence:
  `_tmp-fuse06-node16-followup-20261030-131813-f60d/coordinator-followup.md`.
  Independent closure:
  `_tmp-review-fuse06-node16-rereview-20261030-132617-b82e/coordinator-rereview.md`.
  Coordinator reconciled all statuses/dispositions; FUSE-02–04 are cancelled as
  retained-feature deliveries, with implementation/risk/timing history preserved.

## Definition of done

All tasks have reconciled dispositions and required gates pass, including independent
review. The rejected unshipped feature is absent from runtime, public option types,
advertised docs and benchmark selection; original source/dist/eight-flag behavior
matches the preserved before artifact. Withdrawal regressions and repeated relevant
performance/risk evidence remain. No new speedup or unsafe mode is claimed delivered;
no unsupported security/historical-parity claim, commit/publication or unrelated-work
modification is made.
