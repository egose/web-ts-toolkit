# Access-router list CPU remediation

Created: 2026-10-28 00:58:46 (local time)

Execution outcome: ARCPU-01/02/03/04/07/06 completed sequentially with an
independent final review. ARCPU-05 constructor cloning is deferred after its
incompatible implementation was withdrawn. Cross-request config/catalog caching
was also rejected by ARCPU-04's bounded investigation. All final package, type,
decorator-consumer, lint and packaging checks passed; application latency is unmeasured.

## Objective and scope

Reduce avoidable authorization/configuration copying and repeated work in model list
responses, including lists with **no virtuals**. The application reports v0.57.0 is
significantly slower than v0.51.0 (`89180d219783fbfad412d8dfe19beae614f45c68`).
Starting checkout: `c6a9d7b` (v0.57.0), clean working tree.

Implement sequentially through separate subagents, followed by an independent
reviewer. Preserve authorization, snapshot isolation, stale-output rejection,
public APIs, hydration, metadata, row ordering and bounded hook admission.
No timing benchmark, load test, application reproduction or claimed speedup
percentage is required/requested. Use deterministic work-count checks and
functional regression tests. Do not modify the OIDC packages or dependency versions.

## Evidence and limitations

- `src/acl/service-authorization.ts:354` (`readServiceAuthorization`) copies the
  entire policy/configuration/related-target graph on each read.
- `src/acl/document-authorization.ts:203` (`readDocumentAuthorization`) reads that
  graph merely to obtain the access tuple and copies grants. The field evaluator
  subsequently reads the entire service graph again.
- `src/acl/output-field-filter.ts:121` (`evaluateAuthorizedOutputField`) extracts
  rules/reads records before its per-document decision memo is consulted; value
  copying (`copyOutputValue`) also reads the full service graph per output field.
- `src/acl/document-authorization.ts` (`stageRecord`, `memoizeDocumentFieldDecision`)
  validates mutable projected snapshots repeatedly. These checks are security
  boundaries, not freely removable overhead.
- `src/output/finalize-model-output.ts` (`finalizeSingleDoc`) reads call state per
  row, unconditionally creates `stableBase`, and serially evaluates fields.
- `src/acl/model-output-planning.ts` (`captureModelAuthorizationConfiguration`)
  walks schema/virtual configuration and copies on each capture.
- `src/acl/authorization-snapshot.ts` (`copyAuthorizationValue`) BSON-clones via
  serialize/deserialize; Date, Buffer and RegExp already have direct cloning.
- Existing task `docs/tasks/20261007-143507-access-router-explicit-service-authorization.md`
  defines detached reads and per-document/stage authority. This is an optimization
  follow-up, not a replacement of that contract. Populate feature plans are not
  duplicate remediation work.

The multiplicative paths are confirmed by source inspection, not a CPU profile.
The dominant cost in the user's application remains unmeasured. No baseline test
run was performed for planning. Previous conversational suggestions to globally
memoize detached read results, freeze/share mutable leaves, or blindly trust a
mutable plan's `fieldStates` are **not safe implementation instructions**.
`Object.freeze` does not make Date/Map/Buffer/BSON payloads immutable.

## Execution and verification rules

- Task-local aliases below describe allocation, not proof of execution. The
  coordinator alone updates this file and reconciles each result before starting
  its successor. No simultaneous agent builds/tests; shared `dist/` builds race.
- Each implementation agent reads this file, relevant source and existing tests;
  patches source and tests; reports changed paths, commands, actual results and
  limitations. Do not commit, reset, discard unrelated changes or update releases.
- All source paths below are relative to `packages/access-router/` unless stated.
- Retain detached read behavior for mutable leaves and callback arguments. Never
  expose a stored authority record or native leaf to application callbacks.
- Preserve request/runtime/model/scope/access binding assertions on cache hits,
  unchanged-snapshot checks before/after user callbacks, and same-ID distinct stages.
- Do not treat shared pure records as permission to cache arbitrary native values,
  schema changes, options mutations, related authority or caller-editable plans.
- New helpers stay package-private: absent from root, `/advanced`, `/processors`
  runtime exports and shipped public type options.

Commands run from the repository root (dependencies must already be installed):

1. **Build (V1):** `pnpm --filter @web-ts-toolkit/access-router... build`.
2. **Targeted tests (V2):**
   `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<affected>.test.ts`
   after V1; replace `<affected>` with actual test paths. Source-unit tests can run
   without a rebuild only if existing `dist` and workspace dependencies are current.
3. **Package correctness (V3):** `pnpm --filter @web-ts-toolkit/access-router test`
   (includes packed-consumer/export tests; Mongo integration uses
   `mongodb-memory-server`, requiring a usable Mongo binary).
4. **Declarations (V4):** `pnpm --filter @web-ts-toolkit/access-router typecheck`.
5. **Decorator consumer (V5):** `pnpm --filter @web-ts-toolkit/access-router-deco test`.
6. **Lint (V6):** `pnpm exec eslint packages/access-router/src packages/access-router/test`.

Prefer focused tests during implementation, one full package run at integration.
Full-workspace `pnpm test` is not required for these private package changes; if
run, preserve the root's serial workspace execution. Record unrun checks honestly.

## Ordered tasks

Priorities: P1 = remove the confirmed list-path amplification; P2 = smaller
safe optimizations or bounded investigations; P1 review = release gate.
Every fix includes focused tests, not a separate late test-only phase.

### Task ARCPU-01: Narrow internal authorization reads and reuse immutable permissions

Status: completed

Kind: improvement

Priority: P1 — full-config copies currently multiply by rows and fields.

Suggested agent: ARCPU-01 implementation session

Dependencies: none

Primary ownership: `src/acl/service-authorization.ts`,
`src/acl/document-authorization.ts`, `src/acl/output-field-filter.ts`, focused unit tests.

Finding/references: `readServiceAuthorization`, `readDocumentAuthorization`,
`getAuthorizationPermissions`, `copyOutputValue`, and their callers above.

Requirements:

1. Introduce narrow authenticated internal readers for actually needed slices
   (e.g. access tuple, output policy/catalog) rather than whole-record copies.
   Reuse only recursively immutable call-owned data; preserve detached leaves
   wherever data can escape to callbacks or internal consumers that may mutate it.
2. Reuse the frozen captured permission view per call; authenticate every read.
3. Route document access-only and per-field output-copy reads through the narrow
   path. Preserve `readServiceAuthorization` detached-read semantics.

Acceptance criteria:

- Existing mutable Date/Buffer/BSON/Map read-isolation tests still pass; wrong
  bindings reject on repeated reads and separate calls do not share permissions.
- Deterministic tests show access/catalog-only reads do not copy unrelated large
  filters/related graphs; ordinary no-virtual fields use the narrowed path.
- No new package exports or serialization-visible authority.

Verification: V1; V2 context/finalizer/projection suites and new work-count tests.

Completion evidence:

- ARCPU-01 implementation session delivered authenticated access/catalog/output
  projections, a narrow document reader, and one frozen permission view per call.
  Full detached reads and native-valued field-rule slices remain detached.
- Changed the three owned source modules and added
  `test/service-authorization-reads.unit.test.ts`; coordinator reviewed the diffs.
- V1 passed. V2 reads/context/finalizer/projection suites: **208 tests passed**.
  `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`,
  ESLint on changed files and `git diff --check` passed (repository root).
- Deterministic evidence: repeated narrow reads copy zero unrelated Date values
  versus 512 in one full read. A two-row/three-field no-virtual list has no full
  read per field/value copy; four row-level full reads remain for later tasks.

### Task ARCPU-02: Cache call-invariant field policy work before per-document decisions

Status: completed

Kind: improvement

Priority: P1 — rule extraction/classification and record reads repeat per field/row.

Suggested agent: ARCPU-02 implementation session

Dependencies: ARCPU-01

Primary ownership: `src/acl/output-field-filter.ts`,
`src/acl/document-authorization.ts`, `src/acl/field-authorization.ts`, focused tests.

Finding/references: `evaluateAuthorizedOutputField` prepares entries before
`memoizeDocumentFieldDecision`; `planCatalogProjection` classifies request rules.

Requirements:

1. Cache owned field rule entries and safe request-only classification per
   authenticated call/scope/access/path; consult decision caches before expensive
   preparation. Do not use caller-editable plan flags as authority.
2. Use statically proven grants/denials without invoking document-dependent
   callbacks; keep deferred/function rules per document and owning-parent routing.
3. Preserve stage/snapshot binding and mutation checks, including cached results
   and callbacks that mutate retained values. Do not share document grants.

Acceptance criteria:

- A plain multi-row static-schema test demonstrates call-invariant rule work is
  not repeated per row; hook/stateful rule counts and outputs remain correct.
- Mixed global/document rules, denies, backend grants, embedded ancestors,
  known-trimmed outputs and mutated-stage cache hits remain fail-closed.

Verification: V2 context/finalizer/projection, input and subdocument policy suites;
rebuild when dist-based tests are used.

Completion evidence:

- ARCPU-02 implementation session added private call/access/path preparation and
  memo-first decisions; recursively mutable rule values stay private and are
  detached for runtime evaluation. Snapshot/binding checks still apply on hits
  and settlement, with owning-stage checks preserved.
- Changed `output-field-filter.ts`, `document-authorization.ts`,
  `field-authorization.ts`; added `test/output-field-policy-cache.unit.test.ts`
  and updated ARCPU-01 counts. Coordinator reviewed source and tests.
- V1 passed. V2 ten context/finalizer/projection/reads/cache/input/subdocument
  suites: **415 tests passed**. Direct TypeScript check, changed-file ESLint and
  Prettier, export/declaration checks and `git diff --check` passed.
- One- and seven-row static lists both perform one schema read, three rule
  preparations and zero runtime scoped-rule evaluations. Document-dependent
  functions remain per stage. No timing/latency claim.

### Task ARCPU-03: Avoid unused no-virtual copies and hoist finalizer invariants

Status: completed

Kind: improvement

Priority: P1 — applies directly to the reported no-virtual list workload.

Suggested agent: ARCPU-03 implementation session

Dependencies: ARCPU-02

Primary ownership: `src/output/finalize-model-output.ts`, focused finalizer tests.

Finding/references: `finalizeSingleDoc` unconditionally deep-copies `stableBase`;
`finalizeModelOutputs` repeats captured-state setup for every row.

Requirements:

1. Do not create a getter-only stable document copy when no getter can run.
2. Hoist safe invariant access/schema/permission preparation once per finalizer
   invocation/scope. Retain independent document stages, contexts and native values.
3. Preserve per-getter mutation isolation when getters exist; do not freeze/share
   callback inputs as a replacement for the existing copy contract.

Acceptance criteria:

- Deterministic no-virtual list tests show the unused full-doc copy is absent
  without output/metadata/selection/hydration changes.
- Separate rows, callbacks and embedded/related children cannot contaminate one
  another; virtual mutation, getter failures and concurrency-one tests pass.

Verification: V1; V2 finalizer, context, virtual and request-hook-concurrency suites.

Completion evidence:

- ARCPU-03 implementation session changed the finalizer and document resolver;
  added `test/finalizer-preparation.unit.test.ts` and updated read-count assertions.
  Preparation stays private to each invocation/scope; callbacks never receive its
  retained native values. Coordinator reviewed source/tests.
- Deterministic evidence: the two-row static list's full reads fell **4 to 1** and
  unrelated Date copies **2,048 to 512**; one/two/seven-row lists each use one full
  setup read. No-virtual outputs no longer build the third getter-only document
  snapshot; required projected-stage and metadata copies remain.
- V1 and a final package rebuild passed. Thirteen focused suites: **371 tests
  passed**, including context/cache/finalizer, virtual direct/embedded/related
  output, boundaries and request-hook concurrency. Direct TypeScript check,
  changed-file ESLint/Prettier and `git diff --check` passed.
- Function/native/compound document-hook lookups remain resolution-local; no
  cross-row native-sharing shortcut was introduced. No timing benchmark run.

Independent review correction: mutable function-backed rule lookups could not be
cached, and a later static denial must not skip an earlier ancestor callback or
existing request-memo decision. ARCPU-06 fixed these with six failing-before
regressions. It also removed redundant single-context and unused embedded-config
copies with two failing-before work-count regressions. Real `Service.find` still
invokes single-row finalization, so ARCPU-07 now tracks the necessary integration
gap; pass-level helper counts alone do not establish list-route reuse.

### Task ARCPU-04: Bound configuration-capture reuse to a proven ownership lifetime

Status: completed

Kind: investigation

Priority: P2 — request-entry work is secondary to the per-field copy storm.

Suggested agent: ARCPU-04 capture implementation/investigation session

Dependencies: ARCPU-03

Primary ownership: `src/acl/model-output-planning.ts`,
`src/acl/service-execution.ts`, related capture callers and focused tests.
Avoid broad changes to runtime/options managers unless necessary and proven safe.

Finding/references: `captureModelAuthorizationConfiguration`,
`createServiceExecution` and related capture callers copy overlapping data.

Requirements:

1. Audit capture lifetimes, explicit option overrides, mutable native leaves,
   schema/registry changes and all runtime/default/model mutation entry points.
2. Implement bounded per-operation reuse/narrow reads where safe. A cross-request
   cache requires complete invalidation and native-leaf isolation evidence;
   otherwise explicitly defer it with reasons, rather than change live semantics.
3. Record whether a catalog/config cache is justified after ARCPU-01..03. Do not
   claim that config-time virtual validation already provides a reusable cache.

Acceptance criteria:

- Evidence-backed conclusion names inspected mutation paths and safe reuse scope;
  any delivered optimization has deterministic reuse/invalidation tests.
- In-flight calls keep their captured policy; subsequent calls see updated model,
  default, global, target and explicit override configuration.

Verification: V2 relevant execution/intent/config-capture/option-isolation tests;
an evidence-backed defer decision can complete this investigation without a cache.

Completion evidence and decision:

- ARCPU-04 session inspected Core/Service/helper/related/subdocument capture,
  receiver-effective options/defaults, every runtime single/bulk/dotted setter,
  registration/lazy adoption/bootstrap restore, OptionsManager set/assign/fetch/
  snapshot/restore, and schema/catalog/ref/virtual mutation.
- **Cross-request configuration/catalog cache deferred:** native Date/Buffer/BSON/
  Map/Set values can change without replacing frozen option roots; effective
  receiver options/defaults can differ from model options; schemas change outside
  setters and are not restored by bootstrap restore. Tests reproduce these cases.
  Setter-only generations or identity keys would produce stale authority. Residual
  cost: operation-entry recapture remains, rather than a stale global cache.
- Delivered narrower execution access/hydration reads; create execution full reads
  **2 to 0**, hydration derivation **1 to 0**, branch derivation **2 to 1**.
  Modified service authorization/execution and capture-comment source; added
  `test/service-execution-capture.unit.test.ts` and
  `test/model-authorization-capture.unit.test.ts`. Coordinator reviewed diffs.
- Package build, direct TypeScript check, changed-file ESLint/Prettier, private
  export checks and `git diff --check` passed. Seventeen focused suites, including
  direct/public effective options and old-vs-next capture, passed **546 tests**.
  An initially invalid ObjectId mutation assertion was corrected to use its setter
  and rerun successfully; no unresolved failure remains.

### Task ARCPU-05: Direct-clone common BSON authorization leaves without changing semantics

Status: deferred

Kind: improvement

Priority: P2 — reduces allocation in required isolation/snapshot operations.

Suggested agent: ARCPU-05 BSON implementation session

Dependencies: ARCPU-04

Primary ownership: `src/acl/authorization-snapshot.ts`, focused snapshot/context tests.

Finding/references: `copyAuthorizationValue` BSON serialize/deserialize branch;
Date/Buffer/RegExp already use constructors and are not part of this finding.

Requirements:

1. Add direct independent clones for proven compatible common BSON types (e.g.
   canonical ObjectId/Decimal128/Long); preserve subtype/type/bit/value semantics.
2. Retain the existing BSON fallback for types/subclasses whose round-trip
   normalization cannot safely be replicated. Do not broaden accepted input or
   bypass structural limits, malformed-value rejection or accessor safeguards.

Acceptance criteria:

- Deterministic tests show fewer serialize calls for common canonical BSON leaves.
- Fresh independently mutable payloads and round-trip-equivalent values/types;
  unusual/subclassed/malformed types retain controlled fallback/rejection behavior.
- Existing BSON stale-document/output and read-isolation tests pass.

Verification: V1; V2 snapshot/context/finalizer and relevant native-isolation tests.

Initial implementation evidence (superseded by withdrawal below):

- ARCPU-05 session added conservative direct clones for canonical ObjectId
  (detected byte/word layout), Decimal128 (ordinary 16-byte payload), and signed
  Long (canonical 32-bit halves). Unsigned Long wire-normalizes to signed and
  therefore stays on fallback, as do subclasses/proxies/overrides/noncanonical
  shapes and all other BSON types. Prototype/wire-hook checks retain fallback
  when application overrides could change serialization. Coordinator reviewed diffs.
- Changed `authorization-snapshot.ts`; added
  `test/authorization-snapshot.unit.test.ts`; extended context isolation/stale
  native-output tests. Nested sixteen-leaf graphs and repeated call reads perform
  zero wire serializations with independently mutable payloads. Fallback tests
  preserve normalization/type/subtype/rejection. No timing claim.
- V1 and final package build, direct TypeScript check, changed-file ESLint/Prettier,
  export/declaration inspection and `git diff --check` passed. Ten focused suites:
  **310 tests passed**. Additional in-memory BSON 6 compatibility probe exercised
  nineteen canonical cases and ten fallback cases; dependencies were not changed.

Reopened after independent review: prototype/wire overrides installed **before**
the snapshot module imports become the captured baseline and bypass serialization
semantics. Three new regressions (Long bits, ObjectId bytes, invalid BSON version)
fail. Resolve with a genuinely safe smaller fast path or explicitly withdraw/defer
unsafe constructor paths; do not keep a known incompatibility or add speculative
behavioral probes. Earlier passing counts do not satisfy the final gate.

Resolution: all BSON constructor fast paths were withdrawn. Original wire cloning
is restored with a short explanation; useful canonical/native isolation, fallback,
stale-output and all three pre-import override regressions remain. Constructors
cannot reliably reproduce mutable wire-hook behavior without a trustworthy
baseline, so the serialize-count reduction criterion is explicitly **deferred**,
not achieved. Correctness takes precedence over this secondary allocation saving.
Residual cost: BSON wire-clone overhead remains in required snapshots/read copies.

Verification of withdrawal: dependency/package build, direct TypeScript check,
changed-file ESLint/Prettier and `git diff --check` passed. Ten focused suites:
**321 tests passed**, including the three previously failing reviewer cases.
Retained-cost assertions: sixteen serializations for sixteen graph leaf occurrences,
twenty-four across four detached full reads. No dependency or public API changes.

### Task ARCPU-07: Apply bounded preparation to the real list-service entry paths

Status: completed

Kind: improvement

Priority: P1 — independent review found ARCPU-03's helper reuse is not wired into
ordinary `Service.find` rows, the user's actual reported path.

Suggested agent: ARCPU-07 list integration session

Dependencies: ARCPU-03, ARCPU-04

Dependency revision: ARCPU-05 is no longer a prerequisite. Its incompatible
optimization was removed and original BSON behavior verified; its remaining work
is explicitly deferred and does not block unrelated list-path preparation.

Primary ownership: `src/services/service.ts` (`finalizeDirectOutput`, `findPrepared`),
private finalizer/authorization readers if needed, focused service-entry tests.

Finding/references: `findPrepared` calls `finalizeDirectOutput` in its bounded row
map. That helper still full-reads configuration, resolves document authorization,
and invokes a new single finalizer pass for each row. Thus ARCPU-03's once-per-pass
setup still multiplies on canonical lists even though ARCPU-01/02 help each field.

Requirements:

1. Reuse private owned preparation within a logical list operation, or replace
   these remaining full-graph reads with narrowly detached slices, so unrelated
   configuration/filter/related-target payload copying does not scale with rows.
2. Preserve current per-row populate/include/authorization/decorate order, output
   contexts, metadata/field-permission flags, callback grants and native isolation,
   stable row order, and shared bounded hooks. Do not regroup lifecycle stages or
   introduce a cross-request cache to meet a count target.
3. Cover actual direct `Service.find` and public list wrappers with no virtuals
   using deterministic work counts; helper-only finalization tests are insufficient.

Acceptance criteria:

- One-row versus multi-row canonical list requests demonstrate invariant/narrow
  authorization preparation instead of unrelated full-config copies per row.
- Functional outputs, row-specific document hooks, decorator order/context,
  includes/populates, native mutation isolation and concurrency-one remain correct.
- Internal preparation remains private and exact call/binding/access checked.

Verification: V1; V2 new direct/public service-entry tests plus finalizer, direct,
public-boundary, include/populate, hydration and request-hook-concurrency suites.
Rerun final integration gates after this task.

Completion evidence:

- ARCPU-07 session used narrow detached metadata/document-hook/finalizer readers,
  rather than shared row state or an additional cache. Changed `service.ts`,
  service authorization, output field filter and finalizer; added
  `test/service-list-preparation.unit.test.ts` and updated helper read/copy counts.
  Coordinator inspected the real service-entry changes and new tests.
- Both direct `Service.find` and public `_list`, with zero virtuals, show for
  one/six rows: full reads **20/35 before to 17/17 after**, unrelated Date copies
  **1,632/3,072 before to 1,344/1,344 after**. The two count regressions failed
  before the change. Rule-slice reads remain one and rule preparations two for
  either list size. Fixed request-entry work remains; no latency claim.
- Per-row hook/grants/context isolation, same IDs, metadata flags/custom paths,
  decorator lifecycle order, lean/hydrated output, mutable lookup and in-flight
  versus next-call behavior are covered without regrouping row lifecycle stages.
- V1, direct TypeScript, seven changed-file ESLint/Prettier, `git diff --check`
  and six-entry/eight-declaration private-export checks passed. Twenty-two
  focused suites: **827 tests passed**; final seven-suite run: **285 passed**.
  Full package/decorator gates now return to the independent reviewer.

### Task ARCPU-06: Independent integration and security-contract review

Status: completed

Kind: investigation

Priority: P1 — completion gate for all delivered optimizations.

Suggested agent: ARCPU-06 independent review session (not an implementation agent)

Dependencies: ARCPU-01, ARCPU-02, ARCPU-03, ARCPU-04, ARCPU-07

Dependency revision: review verifies ARCPU-05's tested withdrawal and justified
deferral instead of requiring a constructor optimization to ship.

Primary ownership: review all changed files/tests; coordinator owns this task file.

Requirements:

1. Verify each acceptance criterion against actual diffs and test evidence,
   especially unchanged-snapshot enforcement on cache hits and native isolation.
2. Run V3, V4, V5, V6 serially; verify packed exports/declarations do not expose
   internal helpers. Fix findings with focused tests before marking complete.
3. Check no-virtual list coverage includes work counts, not timing assertions;
   existing virtual/private-populate/request-bound tests remain intact.

Acceptance criteria:

- Required checks pass and no unresolved correctness/isolation issue remains.
- Deferred work has rationale and residual risk; no benchmark speedup is claimed.
- Final report distinguishes removed repeated work from unmeasured application latency.

Verification: V3–V6, export/packed/declaration inspection and final diff review.

Initial independent review evidence (not completion):

- Full V3: **4,414 passed / 3 failed**, 143/144 files passed. Failures are the
  demonstrated ARCPU-05 pre-import BSON override regressions above; packed-consumer
  build/tests passed. ARCPU-05 must resolve them before review completes.
- V4 passed. V5: **650 tests passed** across twenty files. V6 passed. Changed/new
  source/test/task Prettier and `git diff --check` passed.
- Reviewer fixed six rule-caching/ancestor-memo behavioral regressions and two
  excessive-copy regressions, retaining failing-before tests; identified ARCPU-07.
- Six CJS/ESM runtime entries and eight emitted declarations inspected: twenty-seven
  private helper/type names absent, exported targets valid. These checks must be
  rerun after remaining implementation changes. Full workspace/benchmarks not run.

Final independent review and completion evidence:

- After ARCPU-05 withdrawal and ARCPU-07 integration, the reviewer found/fixed five
  additional stored-source cache-eligibility/native-coercion regressions and one
  Set-backed metadata cross-row contamination regression. Cache eligibility is
  now proven against the owned stored source, not its normalized detached copy;
  non-reusable schema/prefix values remain resolution-local. The four-field
  metadata slice now uses authorization snapshot copying, which owns Sets too.
  Failing-before tests are retained; earlier ancestor/memo/lookup fixes survive.
- V3 `pnpm --filter @web-ts-toolkit/access-router test`: **4,448 tests passed**
  across **145 files**; builds and packed-consumer checks passed.
- V4 `pnpm --filter @web-ts-toolkit/access-router typecheck`: passed.
- V5 `pnpm --filter @web-ts-toolkit/access-router-deco test`: **650 tests passed**
  across **20 files**, including its dependency build.
- V6 `pnpm exec eslint packages/access-router/src packages/access-router/test`:
  passed. Final focused five-suite run: **190 tests passed**. All gates ran serially
  from the repository root; no conflicting `dist` builds.
- Prettier passed on seventeen changed/new package files and this plan;
  `git diff --check` passed. Six CJS/ESM entries and eight emitted declarations
  inspected again: thirty-four private helper/type names and reuse flags absent,
  export targets valid. No public API or package metadata changes.
- Independently confirmed actual direct/public no-virtual lists retain constant
  seventeen full reads and 1,344 unrelated Date copies for one versus six rows;
  per-row grants/context/callback ordering, hydration, metadata and stale snapshot/
  memo isolation remain covered. No unresolved in-scope correctness finding.
- BSON wire copying, required row snapshots, and operation-entry recapture remain.
  Full-workspace tests, application reproduction and timing/load profiles were not
  run. Removed repeated work is verified; application speedup is not claimed.

## Definition of done and execution evidence

All tasks have reconciled evidence (or explicit justified investigation deferrals),
changes are limited to the package and this plan, integration gates pass, and the
independent reviewer has checked the authorization boundaries. A required blocked
test keeps the affected task blocked, not completed. Record actual commands/results
below as work proceeds; no timing baseline or performance percentage is inferred.

- Planning baseline: inspected source/tests and prior authorization task; no baseline
  checks were run at planning time. Actual implementation/review checks are above.
- Final reconciliation: source/tests inspected by the coordinator after sequential
  implementations and independent review; all remaining deferred work is explicit.
  No changes were committed and no release versions were modified.
