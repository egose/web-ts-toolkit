# Access-router initial output-snapshot copy opt-outs

Created: 2026-10-29 16:42:34 PDT
Status: completed

Outcome: implemented both default-false output-copy flags with explicit comparison
prerequisites, captured ownership, bounded admission, fallback, warnings, installed
types/docs and independent benchmark selection. All runtime/consumer/downstream gates
passed; generated changelog formatting follows the scoped V5 exception below. The
repeatable final embedded LIST median gain was about 4–6% with comparison skips ON;
other results were smaller/noisier. No source/callback-copy opt-out, implicit unsafe
enablement, commit or release was performed.

## Objective and authorization

Design and implement explicit, security-affecting READ/LIST opt-outs for the
**initial output-association snapshot copy**, then measure whether the allocation
reduction justifies shipping them. The user requested this separate task file and
expects clone/copy opt-outs to improve query performance. This request authorizes
planning; no new flag or runtime behavior was implemented by creating it. The user
subsequently requested implementation of this file; work now follows the scoped
two-flag contract and its verification/performance gates.

This is a new feature phase, not a security-preserving optimization. It follows
[`20261029-105358-access-router-query-cpu-follow-up.md`](20261029-105358-access-router-query-cpu-follow-up.md),
whose QCPU-07 retained a small catalog-path improvement without changing snapshot
contracts. That task's rejected caches are **not** authorized by this feature.

**Starting scope:** two additional flags, not six additional clone bypasses and not
a global deep-clone switch. Initial root/nested **source** snapshots also supply
document-hook inputs; skipping those requires a different timing/isolation design
and is deliberately excluded. Broader copy opt-outs need a separate scope decision.

## Inspected evidence and limitations

Source inspected at `c8b765e`:

- `packages/access-router/src/acl/document-authorization.ts`:
  `associateDocumentAuthorization` unconditionally stores
  `copyAuthorizationValue(output, 'document')`, then captures graph identities,
  even when `requiresOutputSnapshotChecks` is false. Transfers through
  `transferDocumentAuthorization` / `transferDocumentAuthorizationGraph` issue
  associations for package-created copies too; this is not just one copy/request.
- `unchangedOutput` consults that value snapshot only when `validateSnapshot` is
  true, but always compares exact graph identities. Existing associations cannot
  be refreshed to legitimize changed ownership or a replaced graph.
- `createDocumentAuthorizationStage` stores a separate source snapshot;
  `resolveDocumentAuthorization` copies it again for the document hook. This is
  outside the proposed output-copy boundary. Grant/configuration/permission copies
  also have independent ownership purposes.
- `packages/access-router/src/acl/authorization-snapshot.ts`:
  `copyAuthorizationValue` enforces shape, keys, descriptors, cycles, depth/node and
  array limits, and normalizes/clones native leaves, including BSON wire hooks.
  `outputIdentities` alone is **not** an equivalent validator or a bounded traversal.
- `packages/access-router/src/output/finalize-model-output.ts` associates trimmed
  output before creating its service context; its metadata, getter-input and other
  isolation copies are different operations and stay in place.
- The prior QCPU profiles measured aggregate snapshot copying, not the isolated
  cost of these initial output copies. QCPU-07 counted fewer catalog split arrays,
  not fewer snapshot clones. Neither establishes a speedup for this feature.

No runtime tests, new profiles or performance baselines were run for task creation.
The earlier package/downstream results are historical evidence, not verification
of these proposed flags. There is no demonstrated vulnerability being fixed here:
this is an optional performance feature that intentionally removes protections.

## Public contract reviewed in ICOPY-01

### Names, defaults and prerequisites

Add server model/default-model boolean options:

| New option                                | Required existing option for omission to take effect |
| ----------------------------------------- | ---------------------------------------------------- |
| `unsafeSkipListInitialOutputSnapshotCopy` | `unsafeSkipListOutputSnapshotChecks: true`           |
| `unsafeSkipReadInitialOutputSnapshotCopy` | `unsafeSkipReadOutputSnapshotChecks: true`           |

Both new options default to **false**; only literal boolean `true` requests them.
The names and contract must be reviewed in ICOPY-01 before implementation. Neither
new option changes any of the existing six flags, and enabling a comparison skip
alone must retain its current initial-copy behavior.

For the authenticated initiating operation's captured settings:

| Output comparison skip | Initial-copy skip | Required behavior                                                                                         |
| ---------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| OFF                    | OFF               | Existing strict snapshot copy and comparisons                                                             |
| ON                     | OFF               | Existing unsafe comparison mode; initial copy remains                                                     |
| OFF                    | ON                | Copy skip is dormant; retain the copy and comparisons, warn about the unmet prerequisite                  |
| ON                     | ON                | Omit the initial output value snapshot on eligible graphs; retain mandatory admission and graph ownership |

Do not silently enable an existing flag, silently disable comparisons, compare to
`undefined`, or use the live output as a pretend snapshot. Explicitly unsupported
fast-path shapes use the strict initial-copy fallback, not fail-open admission.
Document this fallback: a requested copy skip is not a promise of zero copying.

### Operation ownership and capture

- READ and LIST remain independent. Top-level LIST covers `find`, public lists and
  root lists. READ covers `findOne`, `findById`, public identifier/filter reads and
  root reads. A READ-to-list retry keeps **READ** copy/comparison settings.
- Authenticated embedded/populated/included output descendants inherit the
  initiating model's captured output-copy mode, just like the existing output
  comparison mode. Do not add separate nested-copy flags in this phase. Target
  options cannot relax a strict parent or override the originating mode.
- Capture before hooks/awaits and retain the mode on issued calls, handles and
  transferred associations. Runtime rollback affects new calls, not in-flight or
  retained authority. No ambient request flag or cross-request authorization cache.
- Writes, write-derived read-like output, dedicated subdocument operations and
  fresh standalone helpers stay strict. An already-issued authenticated handle
  retains its own captured mode; a fresh raw-policy helper does not inherit it.
- Mirror current configuration rules: omitted model values inherit current model
  defaults, explicit false wins, model undefined restores inheritance, and only
  server configuration may select a mode. Never accept it from service defaults,
  per-call controls, authorization policy, HTTP/root/include/populate envelopes or
  subquery controls. Ordinary same-named business data remains inert data.

### Protections retained and explicitly weakened

**Always retain:** operation/row/field permission evaluation, original actor and
application callback counts/order, exact request/runtime/model/scope/access/stage
ownership, authenticated parent-child provenance, root/descendant identity checks,
and controlled rejection of forged/wrong-owner handles and public control injection.
Existing target-owned populate-operation admission must remain unchanged.

Retain detached callback inputs, document-source snapshots, grants, mutable native
copies supplied to callbacks, captured configuration, finalizer/getter isolation,
metadata handling and actual response-copy boundaries. Never replace those with
aliases to application-owned objects. This feature does **not** disable all cloning.

Before omitting an output snapshot, require **clone-free, bounded structural
admission** and exact identity capture. Preserve the existing limits (20,000 visited
nodes, depth 100, array length 20,000), safe keys, supported containers, descriptor
rules and cycle rejection; repeated non-cyclic aliases remain supported. Do not
count only unique identities to evade a visit limit. Non-enumerable data properties
must retain the current document-mode treatment. Unsupported/accessor/function/
symbol/unsafe-key graphs cannot become admitted merely because copying is skipped.
Unproven/exotic inputs, including proxies that cannot be safely admitted, use the
original copier/failure path. Do not raise bounds or add unbounded recursive work.

**Intentionally weaker in the new active mode:** the omitted pass no longer clones
or normalizes native leaves or runs its BSON serialization/validation hooks. Checks
provided solely by that normalization are not promised. Even with shape admission,
removing native/normalization observations can change application-visible side
effects, exceptions and subsequent permission outcomes. The previous investigation
demonstrated that skipping normalization observations can turn denial into allowance;
this must be disclosed, not called behavior-preserving. Independent retained checks
may still reject the same graph elsewhere; do not bypass them to make a benchmark run.

The prerequisite comparison bypass already permits scalar/native in-place changes
to reuse stale decisions. The new mode retains that risk **and adds** the lost
initial normalization/validation observations. Trusted, stable application data and
hooks are a deployment assumption, not a proof of security or historical parity.

### Warnings and rollback

Use a distinct copy-risk warning, not the current text claiming only comparisons
were disabled. Warn once per effective model/operation activation, including default
inheritance and activation when the prerequisite changes from OFF to ON while the
new option is already true. Warn about a dormant requested copy skip without per-row
or per-request spam. Repeating unchanged settings must not repeat warnings; failed
configuration publication must not emit an enablement warning. Logger failure must
not change configuration publication.

Document per-model opt-in, monitoring, restoring the new option to false and then
restoring strict comparisons, retained-handle behavior, and eventual removal/review
of this temporary workaround. Do not recommend enabling it globally by default.

## Execution and shared verification

All commands run from the repository root. Build/test/benchmark jobs must run
serially because package scripts rebuild shared dist outputs. Preserve unrelated
changes and existing workloads. No delegation has been requested or performed.

- **V1 Build:** `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`.
- **V2 Focused:** after V1, use
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts`
  with actual test paths. Relevant existing files include
  `test/query-snapshot-options.unit.test.ts`, `test/query-snapshot-work.unit.test.ts`,
  `test/query-snapshot-options.integration.test.ts`,
  `test/snapshot-review-regressions.unit.test.ts`,
  `test/authorization-snapshot-differential.unit.test.ts` and
  `test/service-authorization-finalizer.unit.test.ts`.
  These unprefixed test paths are relative to `packages/access-router/`.
- **V3 Package/types/downstream:** run separately, in order:
  `pnpm --filter @web-ts-toolkit/access-router test`;
  `pnpm --filter @web-ts-toolkit/access-router typecheck`;
  `pnpm --filter @web-ts-toolkit/access-router-deco test`.
  Include the package's packed-consumer/export checks, not source imports alone.
- **V4 Runner:**
  `node --test scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs`.
  Real-worker integration needs built output and a usable MongoDB binary.
- **V5 Lint/format:**
  `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks`;
  run Prettier checks on changed hand-maintained files and `git diff --check`.
  Preserve the generated `CHANGELOG.md` layout used by `pnpm changelog` /
  `.release-it.json`; whole-file Prettier fails on the unchanged HEAD version too.
  Review/diff-check the added Unreleased note rather than reformatting release history.
- **V6 Timing:** `pnpm bench:access-router`; settings/workloads are documented in
  `scripts/benchmarks/README.md`. Preserved before/after worker jobs are acceptable
  if all normal response, option-support and effective-mode checks remain active.

Use existing `plain-narrow`, `plain-wide`, `hydrated`, `document-rules`,
`large-config`, `embedded` and `populate` at 10/100 rows, 24 fields, 32 bytes, one
client, hook concurrency 10, five warmups and at least 25 samples. Include existing
global-rule/virtual cases when their code paths are affected. Keep `embedded` and
`document-rules` separate; do not add or combine scenarios. Alternate paired runs,
repeat noisy cases, and separate instrumentation/profiling from timing. Record
commit/dirty-build/lock hashes, dependencies, modes, median/p95, CPU, reads, output
fingerprints, document/field/getter callback counts and all failures. Shared evidence
must be repo-scoped and sanitized. Do not use wall-clock CI assertions.

Priorities: P1 = required security/contract/release gate; P2 = implementation or
measurement work. These are sequencing priorities, not claims of an existing exploit.

## Ordered tasks

### Task ICOPY-01: Bound the copy savings and finalize the unsafe contract

Status: completed
Kind: investigation
Priority: P1 — an output-copy bypass is not equivalent to skipping comparisons.
Dependencies: none
Primary ownership: this task document; bounded diagnostic counts/profiles of
`associateDocumentAuthorization`, its transfer callers and `copyAuthorizationValue`.

**Finding:** Initial output snapshots are still copied with comparisons skipped,
but their isolated cost and the net cost of replacement admission are unmeasured.

**Requirements:** Inventory/count initial output associations separately from
source/configuration/grant/callback/finalizer copies. Establish a fresh unchanged
baseline and review the proposed names, truth table, native-observation risks,
fallbacks and retained bounds. State exactly which observed behaviors may differ;
do not import the earlier blanket-cache prototype or assume its cost is removable.

**Acceptance:** Record the copy boundary, measured opportunity and reviewed contract
before source implementation starts. If the opportunity is immaterial or retained
protections cannot be supplied, recommend deferral rather than introducing risk
without a demonstrated benefit. A broader source-copy feature is not silently added.

**Verification:** Source/call-site review, separate operation counts and V6 baseline
in both existing comparison modes. Record settings, uncertainty and unrun checks.

Completion evidence:

- Reviewed and retained the two proposed names and prerequisite truth table. The
  user requested implementation of this plan. No source/callback/configuration
  copies are in scope; omitted native-normalization observations are explicitly
  unsafe. Start with ordinary object/array graphs and native leaves; proxies and
  Map/Set graphs use the original copy fallback. Do not infer passive iterators.
- V1 passed at `c8b765e`. Fresh before ESM SHA-256:
  `724057ea85e7fb0a6e6ab75df350fda305357901374683af610ec2b9618e3e4e`;
  lock SHA-256 `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
  Node 26.12.1. Twelve uninstrumented baseline jobs used the unchanged worker,
  100 rows, 24 fields, 32 bytes, 25 samples, five warmups, one client and hook
  concurrency 10, alternating OFF/ON/ON/OFF per existing workload.
- Before median ranges, comparison skips OFF / ON: wide **52.89–55.32 / 22.83–23.90
  ms**; document rules **314.61–326.83 / 26.40–26.53 ms**; embedded
  **768.06–792.73 / 67.61–71.63 ms**. Expected outputs and one read/request matched;
  document rules retained 100 hooks/request.
- Six separate five-sample diagnostic jobs counted **200 / 200 / 1,000** initial
  output copies and **5,200 / 2,800 / 10,200** copied nodes per wide/document/embedded
  request, respectively, in both modes. ON-mode inclusive initial-copy time was
  approximately **1.35 / 0.67 / 3.04 ms/request**; instrumentation perturbs timing.
  ON total copy calls were **1,118 / 6,118 / 11,818**: this feature cannot remove most
  copies. Document rules retained 1,200 field callbacks/request. The opportunity is
  bounded but worth a measured prototype; no large speedup is promised.

### Task ICOPY-02: Add server-only options, captured modes and accurate warnings

Status: completed
Kind: improvement
Priority: P2 — explicit opt-in and immutable ownership precede copy omission.
Dependencies: ICOPY-01
Primary ownership: `packages/access-router/src/interfaces/root.ts`,
`src/acl/unsafe-snapshot-options.ts`, `src/runtime.ts`,
`src/acl/model-output-planning.ts`, `src/acl/service-authorization.ts`, public/service
admission and focused configuration/capture tests. Unprefixed src paths in tasks
are relative to `packages/access-router/`.

**Finding:** The existing list normalizes/rejects six server-only flags; mode capture,
warnings and several tests explicitly assume comparison flags only.

**Requirements:** Add the two reviewed options and private captured output-copy mode.
Implement default inheritance, literal-true handling, dormant prerequisite behavior,
READ retries, descendant propagation and rollback as specified above. Keep the six
existing flag meanings unchanged. Audit list length/index assumptions rather than
blindly appending flags to every comparison-oriented array. Reject new controls by
presence on all existing public/method/default admission seams. Use copy-specific
active/dormant warnings, including atomic default publication and logger failure.

**Acceptance:** Tests cover each operation's four prerequisite combinations, all
eight flags' mode interactions (a small 256-mask capture matrix is suitable),
default-before/default-after setup, explicit false/undefined, truthy non-booleans,
in-flight capture and retained handles. Writes/fresh helpers cannot acquire the
mode. A target's options cannot override a parent's captured mode. No request or
ordinary authorization object can opt in. All existing six-flag cases still pass.

**Verification:** V1/V2, including configuration, capture, admission and retry tests;
V3/V5 at integration. Keep initial copying enabled until ICOPY-03 is implemented.

Completion evidence:

- Added the two server-only booleans, defaults/inheritance, captured query-only
  mode with explicit comparison prerequisite, and distinct coherent active/dormant
  transition warnings. The original six-option comparison list remains separate
  from the eight server admission keys. No request/per-call API was added.
- V1 passed. Focused configuration/capture/work/review runs passed **508 tests in
  five files**, including a 256-mask mode matrix, opposite target settings, READ
  retries, retained calls, inheritance and default publication. Later full/consumer
  gates remain ICOPY-06 work.

### Task ICOPY-03: Omit eligible stored output snapshots without aliasing authority

Status: completed
Kind: improvement
Priority: P2 — remove the allocation only at the authenticated output boundary.
Dependencies: ICOPY-01, ICOPY-02
Primary ownership: `packages/access-router/src/acl/document-authorization.ts`,
`src/acl/authorization-snapshot.ts` if a private bounded admission helper is needed,
and focused tests, for example a new `test/initial-output-snapshot-copy.unit.test.ts`.

**Finding:** `OutputRecord.snapshot` currently assumes a copy exists. Initial and
transferred associations take the same allocation path; identities alone do not
provide the current bounds/shape admission.

**Requirements:** Represent copied versus deliberately omitted snapshots explicitly
in private records (for example a discriminated union). A strict-comparison record
must always have a real detached snapshot. Never save the live output as a snapshot,
freeze application data, fabricate a handle or defer an omitted snapshot into a later
comparison. Run bounded clone-free structural admission and retain exact identity
capture in the active eligible path; preserve strict fallback for unproven inputs.
Do not trust custom type tags or frozen native objects as proof of safety. Keep
duplicate-association checks, transfers, contexts and lookup APIs authenticated.
Do not reuse a graph-validity certificate across callbacks, native hooks or awaits.

**Acceptance:** Exact copy counts drop at initial/transfer associations only in the
active mode and eligible graphs; comparison counts and all unrelated copy boundaries
remain as configured. OFF and dormant modes retain the original copier/normalization
behavior. Bounds, cycles, aliases, descriptors, native leaves, containers and unsafe
keys have deterministic acceptance/rejection tests. New active-mode native-hook
differences are explicit tests of the documented weaker contract, not weakened
expectations in the existing strict regression suites.

**Verification:** V1/V2 and deterministic operation counts; V3–V6 at integration.

Completion evidence:

- Private output records distinguish copied from omitted snapshots. Only active,
  authenticated eligible associations/transfers omit the snapshot; strict/dormant
  paths retain the original copy/identity/binding order. No live snapshot alias is
  stored and input values are not frozen.
- A bounded, descriptor-based admission/identity walk supports ordinary records,
  arrays and standard Date/RegExp/Buffer/BSON leaves. It counts repeated visits,
  rejects cycles/unsafe shapes and falls back to the original copier for proxies,
  Map/Set, native subclasses/unproven kinds. Native normalization/wire validation
  is deliberately omitted on eligible leaves, as specified by the unsafe contract.
- Focused tests verify exact initial-copy reductions, transfers, unchanged ownership,
  native-wire differences, source/grant detachment, bounds and seeded identity
  agreement. Initial failures were two test spies attempting to redefine BSON's
  non-configurable serialize export; replaced those probes with per-value wire
  hooks. No runtime check was removed to fix the tests. V1/V2 subsequently passed.

### Task ICOPY-04: Verify retained ownership and exposed unsafe behavior end to end

Status: completed
Kind: improvement
Priority: P1 — the new allocation mode must not become a general authority bypass.
Dependencies: ICOPY-02, ICOPY-03
Primary ownership: `packages/access-router/test/` configuration, snapshot, finalizer,
embedded/related, admission and consumer suites; a new focused HTTP integration suite
is appropriate. Keep basic source regression tests with ICOPY-02/03.

**Requirements:** Exercise LIST, READ, READ-to-list retries, multiple parents and
same-ID rows, embedded scopes, populate/includes (including correlated paths),
runtime replacement, independent reentry, async mutation and retained contexts.
Cover wrong request/runtime/model/scope/access/stage, equal descendant replacement,
forged handles, refreshing existing associations and transferred package copies.
Verify detached document hooks, grants, getter inputs and native leaves are unchanged
by these output-only flags. Keep permission callbacks/hooks and their order/counts.

**Acceptance:** Negative ownership/admission cases fail closed in every mode;
request controls cannot select flags, including inherited/non-enumerable controls
and nested envelopes. Scalar/native stale-decision risks and omitted normalization
observations are demonstrated only in explicitly unsafe cases. New flags OFF keep
the original six modes' behavior, including normalization regressions. Source-stage
snapshots and private populate-operation policy remain intact. Public types expose
the options only on server model/default options, not per-call or policy inputs.

**Verification:** V1/V2, actual READ/LIST HTTP paths, consumer fixtures; full V3 later.

Completion evidence:

- Extended real query/HTTP integration with four READ/LIST copy-mode combinations,
  ordinary population/includes, opposite target flags, READ-to-list retries,
  retained contexts, rollback, equal child replacement and new wire-control
  rejection. Existing source/comparator suites remain unchanged in expectation.
  Added the new keys to installed-consumer server-only type assertions and private
  runtime-export denylists; their compilation/packing gate runs in ICOPY-06.
- A focused integration/owner/normalization/differential run passed **246 tests in
  four files**. An earlier new helper expectation incorrectly retained a non-schema
  include attachment; source review confirmed field helpers pick catalogued fields,
  so corrected that test expectation without changing runtime behavior.
- Source/callback isolation, forged/wrong-owner handles, graph replacement, async
  mode capture and native-observation risks are also covered by the focused new unit
  suite. Full package/consumer verification remains pending in ICOPY-06.

### Task ICOPY-05: Benchmark copy skips independently of the original six flags

Status: completed
Kind: improvement
Priority: P2 — a new security-affecting option needs reproducible incremental benefit.
Dependencies: ICOPY-03, ICOPY-04
Primary ownership: `scripts/benchmarks/access-router-core.mjs`,
`scripts/benchmarks/access-router-worker.mjs`, `scripts/benchmarks/access-router.mjs`,
their tests and `scripts/benchmarks/README.md`.

**Finding:** The current runner's OFF/ON/BOTH group describes exactly six comparison
skips. Extending that group's ON meaning would invalidate previous comparisons.

**Requirements:** Preserve the existing group's six-option meaning. Add independent
per-candidate OFF/ON/BOTH selection for the two initial-output-copy flags, distinct
candidate/baseline identities, declaration support detection and worker checks for
both configured and effective modes. Show dormant/N/A explicitly; never silently
enable the prerequisite or present unsupported historical flags as enabled. Test
the full requested comparison/copy cross-product and report its effective behavior.
Use unchanged workloads/settings and the paired matrix above. Measure initial-copy
allocations separately from retained structural/identity work and callback copies.

**Acceptance:** Repeatable incremental CPU/latency benefit with copy skips active
versus **the same comparison configuration with copy skips OFF**, with no relevant
repeatable regression beyond measured noise. Outputs, reads, hooks, field callbacks
and getter counts match the unchanged fixture contract. Default/dormant modes do not
gain by silently dropping safeguards. Disclose residual cost and historical dependency
confounds. If the feature does not earn its risk/complexity, do not ship it solely
because allocation counts fell; record a measured deferral/no-release decision.

**Verification:** V4–V6, with separate counts/profiles and uninstrumented timings.

Completion evidence (full timing tables/identities will be appended at ICOPY-06):

- Runner comparison ON still means exactly six flags. Copy OFF/ON/BOTH is a
  separate per-build choice with distinct candidate/baseline identities, declared
  support, explicit N/A/dormant labeling, verified getters and derived effective
  LIST mode. V4 passed **21 tests**, including all four real-worker combinations
  in the unchanged embedded/document-rule workloads.
- Two initial alternating 100-row comparison-ON batches measured copy OFF → ON
  wide mean medians **22.10 → 20.95 / 22.08 → 21.37 ms**, embedded
  **64.84 → 61.66 / 65.27 → 61.57 ms**. Document-rule gains were smaller. Final
  source validation also retained the relevant benefit; no historical parity or
  uniform application speedup is claimed.
- The unchanged nine-scenario 10/100-row matrix covered copy ON/OFF with both
  comparison settings. Noisy short-job cases and before/after default cases were
  repeated with longer measurement windows. Final defaults preserved the original
  comparisons/copies and showed no relevant repeatable penalty. See final evidence
  for individual regressions/noise, samples, CPU, p95 and build variants.
- Final separate counts retained structural admission while removing **200 / 200 /
  1,000** initial copies and **5,200 / 2,800 / 10,200** copied nodes per 100-row
  wide/document/embedded request. Same numbers of nodes were structurally admitted;
  all other copy calls remained. Dormant copy ON retained the original copies.
  Document rules retained 100 document hooks and 1,200 field callbacks/request.

Remaining integration work: full package/types/downstream/consumer gates, final
documentation review and sanitized evidence in ICOPY-06. The flags remain explicitly
unsafe and false by default.

### Task ICOPY-06: Document the security contract and complete release gates

Status: completed
Kind: improvement
Priority: P1 — implementation, public claims and measured evidence must agree.
Dependencies: ICOPY-02, ICOPY-03, ICOPY-04, ICOPY-05
Primary ownership: combined diff; `packages/access-router/README.md`, `packages/access-router/llms.txt`,
`src/interfaces/root.ts`, `src/interfaces/service-authorization.ts`,
`website/docs/packages/access-router/configuration.mdx`, benchmark docs and this task.

**Requirements:** Document exact names/defaults, prerequisite truth table, server-only
selection, descendants/retries/captured handles, fallback shapes, retained copies,
lost normalization behavior, warnings and rollback. Correct existing statements that
initial copies always remain, while explicitly preserving that promise when the new
options are false. Add release/migration notes through the repository's existing
release process without publishing a release as part of this task. Review the final
diff against every retained/weakened boundary; do not claim independent review if no
separate reviewer was authorized and used.

**Acceptance:** V1–V6 pass as applicable, with exact failures/blockers recorded rather
than dropped. Public declarations, packed consumers, runtime and docs agree. Record
actual before/after latency/CPU, deterministic savings, callbacks, reads, fingerprints,
versions, security limitations and the shipping/deferral decision. All new options
remain false by default; the original six still mean comparison skips only. No
source/callback/configuration/response-copy opt-out or new scenario slipped into scope.

**Verification:** Serial V3, V4, V5 and final paired V6; task/evidence and diff review.

Progress:

- Added shipped README/JSDoc/llms guidance, website parity, benchmark group guidance
  and an Unreleased changelog entry. No release has been published. The final
  runtime keeps the original comparison condition on copied records and adds a
  native-brand fallback for prototype-modified Map/Set values. Finalizer tests also
  cover detached getter inputs, concurrent same-ID stages and independent reentry.
- First V3 full package attempt: **5,835 passed, one failed** in
  `test/default-model-options.integration.test.ts`, where enabling the now-eight
  server options still expected six total warnings. Updated that assertion to
  explicitly require six comparison warnings plus two copy warnings and no repeats.
  This is the new flag contract, not a removed security check. Full rerun pending.
- Final boundary review narrowed omission to ordinary ownership tuples and moved
  their mode authentication before the clone-free graph operation. Accessor/proxy
  bindings retain the original copy fallback, so no graph admission result spans
  caller binding getters. Added that regression and retained the strict-mode order.
  Reverify this final runtime variant before completing the integration gate.
- Second V3 full attempt passed **5,829 tests** but its disposable MongoDB failed
  to bind a free-selected port in `test/virtuals-config.contract.test.ts`; all eight
  tests in that file then passed in a targeted rerun. No setup or authorization code
  was bypassed. A clean full rerun is in progress. Typecheck and the downstream
  suite already passed (**691 tests in 22 files**, including its typecheck).
- Whole-file `CHANGELOG.md` Prettier failed on both the changed file and
  `git show HEAD:CHANGELOG.md | pnpm exec prettier --check --stdin-filepath CHANGELOG.md`.
  Kept the existing generated release layout and explicitly scoped V5 accordingly;
  this does not authorize discarding unrelated work or reformatting release history.

Completion evidence:

- Clean final V3 run: `pnpm --filter @web-ts-toolkit/access-router test` passed
  **5,837 tests in 168 files**, with no skips, including packed consumers, public
  export/strict type and executable documentation checks. The earlier warning-count
  and Mongo-port failures remain recorded above, not mislabeled as passing runs.
- `pnpm --filter @web-ts-toolkit/access-router typecheck` passed. Downstream
  `pnpm --filter @web-ts-toolkit/access-router-deco test` passed **691 tests in 22
  files**, including its typecheck. Commands ran from the repo root serially; no
  full-workspace test run or independent delegated review was performed.
- Final V4 passed **21 runner/integration tests**, including the full requested
  comparison/copy cross-product. V5 source/test/runner ESLint and hand-maintained
  formatting/diff checks passed; `CHANGELOG.md` keeps the documented generated-style
  exception. No authorization test, check or structural limit was suppressed.
- Inspected the shipped declaration graph through root/advanced CJS/ESM entries:
  **16 option/hover checks** confirmed both new flags are discoverable on
  ModelRouterOptions/DefaultModelRouterOptions with default/unsafe/prerequisite
  JSDoc. Existing installed-consumer assertions reject those keys on public,
  per-call, policy and method-default types; private runtime issuers remain absent.
- The final rebuilt ESM still matches I4's measured hash below; the lockfile is
  unchanged. Retain the two explicitly unsafe flags for their bounded measured
  opportunity, not as a security-equivalent fast path. Defaults remain false, the
  original six comparison meanings remain intact, and rollout must be per-model
  and reviewed/measured by the application owner. No release was published.
- Scope delivered in this task only: output-association omission, clone-free
  structural/identity capture, ordinary-binding fallback, mode/options/warnings,
  focused/HTTP/consumer regressions and shipped docs. Source snapshots, callback/
  grant/configuration/metadata/getter/response copying, target-owned populate gates,
  permission evaluation and existing workloads were retained.

### Implementation measurement evidence

The measurements below are actual diagnostic results, not thresholds or promises.
They exercise LIST only; READ/retries are correctness-tested, not latency-profiled
in a new workload. CPU includes the Node client/server, not MongoDB. Values in the
tables are **means of each independent job's median, p95 and CPU**, not pooled
percentiles. Workload/host/JIT/GC variance is visible and no statistical confidence
or application-specific parity is claimed.

#### Builds and settings

- Source base `c8b765e430afc9f58b2cc20beafdbe61ad862694`, plus this task's local
  access-router changes. Node **26.12.1**, MongoDB **8.2.6**, Mongoose **9.11.4**,
  Express **5.2.1**, Zod **4.4.3**, identical workspace peers and lockfile. Concurrent
  unrelated OIDC work was preserved; host load was not controlled.
- Before ESM SHA-256 (B0):
  `724057ea85e7fb0a6e6ab75df350fda305357901374683af610ec2b9618e3e4e`.
  Initial implementation (I1):
  `f0c4d5aa67e0108965c031b563a7705330d692c0b78c73e9e06f01f992851d2f`.
  Map/Set brand-fallback revision (I2):
  `0294f201666353164352207d3734625ca879c88f98f0d9e43cefaf9aae4a7d18`.
  Reduced copied-record dispatch (I3):
  `d2c1b77601d5454087c16d1701cdc5b27fff6c8959959f862a2cbc85080a2ffa`.
  Ordinary-binding final runtime (I4):
  `e8b3e25b56a515bfadd0a16821104542e7f82f5fbad5eca2172d9a50fb2eac25`.
- Lock SHA-256 remains
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
  Preserved build/declaration hashes and effective getters were checked by workers.
  No dependency update, historical tree modification, publication or new scenario.
- **308 uninstrumented jobs**: 12 before baselines; 84 I1 comparison-skips-ON
  paired jobs (all nine scenarios, 10/100 rows, plus reversed priority repetitions);
  72 I1 strict/dormant jobs; and 140 later priority/default/noisy-case repetitions
  across I2–I4. **33 separate instrumented jobs** counted initial copies/admission
  separately from source/configuration/grant/callback copies. The temporary diagnostic
  directory-name collision was corrected before measurement and excluded.
- Common settings: **24 fields, 32 payload bytes, five warmups, one client, hook
  concurrency 10**. Main matrix jobs used **25 samples**; later repeats used 50 or
  75 as labeled. Each pair used OFF/ON/ON/OFF or its reverse, fresh worker/database
  jobs and serial execution of this task's builds/tests/benchmarks. Instrumented
  times are not performance evidence. The fixture contract was unchanged.
- All measured builds/modes matched expected outputs and per-case fingerprints.
  Reads remained **1/request**, or **2/request** for populate; virtuals retained
  two getters/row. Separate counts retained **100 document hooks and 1,200 field
  callbacks/request** in document-rules. The 100-row fingerprints remain:
  wide `165d378f09870e575203f9e2c8f012b0778715ecc0c2fdd9b03f4bd436536ea3`;
  document rules `1c6e7ecaf6f8e6c2f4d6b57530734750466ff5a9a96869ed3d05641979c070ae`;
  embedded `4a32e28713aa14dc5248f87eda344bb089958fc984d4c50598c278651f656f13`.

#### Initial paired matrix: comparison skips ON, copy OFF → ON

I1, milliseconds, 25 samples/job; two jobs/build/case, or four for 100-row
wide/document/embedded after the reversed repeat. Comparison ON still means all
six existing comparison flags true; the two copy flags are independent. This is
incremental evidence **on top of that already-unsafe comparison configuration**,
not the effect of enabling only a copy flag under strict comparisons.

| Scenario/rows      | Median OFF → ON |  p95 OFF → ON |  CPU OFF → ON |
| ------------------ | --------------: | ------------: | ------------: |
| plain-narrow/10    |     4.18 → 3.77 |   5.72 → 6.04 |   6.28 → 5.72 |
| plain-wide/10      |     5.95 → 5.98 |   7.89 → 9.06 |   8.47 → 8.66 |
| hydrated/10        |     5.89 → 5.79 |   8.74 → 8.40 |   8.65 → 8.10 |
| document-rules/10  |     6.09 → 6.24 |   8.60 → 8.16 |   9.07 → 8.14 |
| large-config/10    |     6.35 → 6.08 |   8.09 → 8.40 |   8.45 → 8.18 |
| embedded/10        |    10.39 → 9.79 | 14.20 → 14.57 | 13.13 → 13.49 |
| global-rules/10    |     6.15 → 5.89 |   8.47 → 8.44 |   8.97 → 8.71 |
| populate/10        |     8.34 → 8.14 | 11.63 → 10.14 | 11.37 → 11.24 |
| virtuals/10        |     6.97 → 7.24 |   9.20 → 9.69 |  9.96 → 10.45 |
| plain-narrow/100   |   11.47 → 11.13 | 13.28 → 13.45 | 15.05 → 14.75 |
| plain-wide/100     |   22.09 → 21.16 | 25.00 → 24.22 | 28.56 → 28.12 |
| hydrated/100       |   23.77 → 22.47 | 26.22 → 25.91 | 30.36 → 29.38 |
| document-rules/100 |   25.22 → 24.89 | 27.81 → 27.68 | 32.59 → 32.00 |
| large-config/100   |   24.34 → 22.12 | 27.98 → 25.45 | 31.18 → 28.67 |
| embedded/100       |   65.06 → 61.62 | 70.47 → 66.50 | 80.04 → 77.13 |
| global-rules/100   |   25.13 → 23.85 | 27.58 → 26.72 | 31.76 → 30.77 |
| populate/100       |   27.80 → 26.52 | 30.38 → 28.37 | 35.03 → 32.85 |
| virtuals/100       |   29.12 → 27.36 | 31.52 → 30.38 | 35.66 → 33.97 |

#### Strict/dormant matrix: comparison skips OFF, copy OFF → requested ON

I1, milliseconds, 25 samples/job, two jobs/candidate/case. Both candidates run the
original copying/comparisons; requested ON is dormant. Differences here are noise,
not a claimed benefit from dropping protections; deterministic counts verify that
the initial copies remain.

| Scenario/rows      | Median OFF → ON |    p95 OFF → ON |    CPU OFF → ON |
| ------------------ | --------------: | --------------: | --------------: |
| plain-narrow/10    |     5.81 → 5.86 |     7.47 → 7.56 |     9.35 → 9.53 |
| plain-wide/10      |     9.00 → 9.18 |   12.68 → 11.60 |   12.83 → 12.80 |
| hydrated/10        |     9.58 → 9.45 |   13.28 → 13.56 |   13.66 → 13.11 |
| document-rules/10  |   34.63 → 35.15 |   37.68 → 38.21 |   36.94 → 37.91 |
| large-config/10    |    9.60 → 10.20 |   12.84 → 13.02 |   12.83 → 13.85 |
| embedded/10        |   83.29 → 82.00 |   88.95 → 86.30 |   87.25 → 86.56 |
| global-rules/10    |   34.29 → 33.84 |   39.05 → 36.49 |   36.75 → 35.94 |
| populate/10        |   13.55 → 14.05 |   19.76 → 20.23 |   18.61 → 18.83 |
| virtuals/10        |   12.63 → 12.11 |   16.38 → 16.00 |   17.25 → 16.13 |
| plain-narrow/100   |   27.74 → 25.20 |   32.32 → 32.80 |   31.24 → 28.90 |
| plain-wide/100     |   54.00 → 54.47 |   58.42 → 59.19 |   60.61 → 62.06 |
| hydrated/100       |   56.31 → 53.07 |   59.56 → 57.06 |   62.68 → 59.06 |
| document-rules/100 | 336.79 → 336.25 | 363.70 → 352.47 | 357.96 → 350.14 |
| large-config/100   |   55.83 → 55.09 |   59.34 → 60.21 |   62.74 → 61.79 |
| embedded/100       | 808.88 → 788.86 | 852.77 → 828.93 | 845.31 → 822.86 |
| global-rules/100   | 298.36 → 293.48 | 309.86 → 300.01 | 308.87 → 300.78 |
| populate/100       |   70.03 → 69.16 |   75.90 → 76.97 |   77.41 → 76.81 |
| virtuals/100       |   82.94 → 81.54 |   94.83 → 88.27 |   91.40 → 88.93 |

#### Final-runtime repetitions

I4, two independent alternating batches, **50 samples/job**, 100 rows,
comparison skips ON, copy OFF → ON. Neither p95 nor CPU improves uniformly: the
second wide batch had an ON outlier (one job p95 42.19 ms), and small-document gains
were inconsistent. Do not hide that variability behind the eliminated copy count.

| Case                     | Median OFF → ON |  p95 OFF → ON |  CPU OFF → ON |
| ------------------------ | --------------: | ------------: | ------------: |
| plain-wide · batch 1     |   24.34 → 22.35 | 28.02 → 25.61 | 29.44 → 27.66 |
| document-rules · batch 1 |   29.03 → 27.29 | 34.65 → 30.18 | 37.17 → 32.77 |
| embedded · batch 1       |   74.42 → 69.94 | 84.31 → 84.72 | 88.58 → 84.51 |
| plain-wide · batch 2     |   24.28 → 23.93 | 29.53 → 34.33 | 29.69 → 30.48 |
| document-rules · batch 2 |   27.16 → 26.86 | 30.47 → 29.80 | 32.65 → 32.59 |
| embedded · batch 2       |   66.71 → 63.99 | 72.74 → 71.90 | 79.19 → 75.19 |

The repeated embedded median gain is approximately **6.0% / 4.1%**, with lower
mean CPU in both batches. Wide median improved in both, but its CPU/p95 did not
consistently improve. This is a modest measured opportunity, not a broad latency
guarantee or a resolution of the historical performance gap.

I4 short/noisy-case repetition, **75 samples/job**, 10 rows, two jobs/candidate,
comparison skips ON, copy OFF → ON:

| Case           | Median OFF → ON |  p95 OFF → ON |  CPU OFF → ON |
| -------------- | --------------: | ------------: | ------------: |
| plain-wide     |     5.28 → 5.24 |   7.95 → 7.80 |   6.92 → 6.83 |
| document-rules |     5.80 → 5.55 |   8.83 → 8.66 |   7.69 → 7.58 |
| embedded       |   10.47 → 10.66 | 14.03 → 13.58 | 12.50 → 12.75 |
| virtuals       |     6.50 → 6.51 |   9.93 → 9.96 |   8.50 → 8.41 |

#### Default-mode guard repetition

B0 → I3, **50 samples/job**, two jobs/build/case, 100 rows, both new copy flags
OFF. Earlier 25-sample defaults had small mixed regressions; these longer repeats
did not show a relevant repeatable penalty. I4 only narrows the active omission
branch; the OFF/dormant copy path is unchanged and is correctness/count-tested.

| Case                                  | Median before → after | p95 before → after | CPU before → after |
| ------------------------------------- | --------------------: | -----------------: | -----------------: |
| plain-wide · comparison skips ON      |         22.03 → 21.87 |      24.39 → 24.19 |      27.38 → 26.63 |
| document-rules · comparison skips ON  |         25.43 → 25.41 |      28.36 → 29.23 |      30.80 → 31.07 |
| plain-wide · comparison skips OFF     |         50.97 → 50.91 |      54.77 → 55.61 |      55.96 → 55.61 |
| document-rules · comparison skips OFF |       304.51 → 302.15 |    312.14 → 312.10 |    315.86 → 311.59 |
| embedded · comparison skips OFF       |       771.40 → 758.60 |    817.35 → 781.24 |    798.76 → 787.46 |

#### Final deterministic copy/admission counts

I4, separate five-sample instrumented jobs, 100 rows. With comparison skips ON,
copy OFF → ON:

| Scenario       | Initial copies | Initial copied nodes | Structural admission visits with copy ON | All authorization copy calls |
| -------------- | -------------: | -------------------: | ---------------------------------------: | ---------------------------: |
| plain-wide     |        200 → 0 |            5,200 → 0 |                                    5,200 |                  1,118 → 918 |
| document-rules |        200 → 0 |            2,800 → 0 |                                    2,800 |                6,118 → 5,918 |
| embedded       |      1,000 → 0 |           10,200 → 0 |                                   10,200 |              11,818 → 10,818 |

Comparison skips OFF + requested copy ON retained **200 / 200 / 1,000** initial
copies and **5,200 / 2,800 / 10,200** copied nodes. Admission still traverses the
same number of nodes when omission is active; this is not a validation/identity
walk bypass. Most other copies remain, so these counts cannot justify removing
source snapshots or detachment boundaries in a later change without a new scope
and security decision.

## Definition of done

Either ship the two explicitly documented output-copy opt-outs with retained
ownership/bounds/isolation, full verification and demonstrated incremental benefit,
or record a bounded evidence-backed deferral. Creating this file is not completion
of the implementation tasks and is not evidence of a performance improvement.
