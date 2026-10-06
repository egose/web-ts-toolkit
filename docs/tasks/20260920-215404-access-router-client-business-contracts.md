# Access Router Client Business Contract Review

Created: 2026-09-20 21:54:04 local time

## Final coordinator disposition

**Completed: all 10 items** (seven original tasks and three discovered follow-ups).
Each implementation item ran in a separate sub-agent session, sequentially;
CLC-07 was independently reviewed and resumed after its separately implemented
correction. Every item has completed status and Completion evidence below.

- Coordinator reviewed the final task status/evidence inventory, scoped diff and
  new-file inventory, shared traversal/config helpers, model interception changes,
  and independent acceptance audit. No outstanding scoped item remains.
- Final client gate: **843 tests across 42 files**, including strict typechecks,
  packed consumers, documentation compilation, and built-ESM jsdom tests. Current
  changed-file lint and whitespace checks pass; packed output is verified.
- Workspace build passed. Workspace tests and lint had unrelated failures;
  exact results, file ownership and concurrent-work limitations remain in CLC-07.
  This completion does not claim globally passing workspace tests/lint.
- Coordinator independently confirmed `git diff --exit-code HEAD -- CHANGELOG.md`
  and scoped `git diff --check` pass. Root CHANGELOG is unchanged. No commits made.

## Objective and product requirements

The client supports browser/Node business applications consuming access-router:
typed CRUD and projected documents, editable model wrappers, parent-scoped
subdocuments, lazy batch operations, correlated related-data queries, and optional
authenticated caching. Correct identity isolation, faithful transport semantics,
reliable form persistence, bounded query construction, and discoverable installed
types/docs are core requirements.

Implement the actionable findings below in **fresh, sequential sub-agent sessions**.
Scope: `packages/access-router-client`, its package website docs when needed, and
this task record. Do not modify root `CHANGELOG.md`. Preserve unrelated worktree
changes (many sibling packages already have active edits). No dependency upgrades,
protocol redesign, automatic mutation retries, or manual generated-dist edits.

## Coverage, triage, and limitations

- Inspected package metadata/README, model persistence, correlated builders and
  subquery helpers, cache lifecycle/keying/settlement, grouped config normalization,
  representative tests and prior client review records. A research-only agent
  traced transport findings through installed Axios internals.
- Deduplicated against the August client plans and September boundary review
  `20260906-225058-access-router-client-boundary-review.md`. CLC-01/02/03 cover
  new edge cases after BND-01/02/09. CLC-05 implements the existing
  BND-07-FOLLOWUP rather than inventing a duplicate issue. The current request to
  implement review tasks authorizes selecting its recommended consistent-write
  contract; preserve reserved member behavior, do not redesign the method API.
- Baseline: client package had no worktree changes. No tests/builds run during
  planning; source-derived defects require regression evidence during execution.
- This is a focused residual review, not an exhaustive dependency audit or
  real-browser/version certification. No production performance measurements were
  collected. Existing BND-12 copy-cost measurements do not justify removing
  defensive copies; copy optimization remains deferred until a concrete workload
  and latency budget exist. Narrow persistence-interface extraction remains a
  separate optional follow-up, not required for the fixes here.
- Offline sync, optimistic server version checks, cursor pagination and automatic
  retries require server/product contracts; do not invent these features locally.

## Coordination and shared verification

P1 = identity isolation or silent correctness/data-loss risk. P2 = bounded
robustness, config fidelity, or consumer usability. Execute CLC-01 through CLC-07
in order, with discovered CLC-03-F01 immediately after CLC-03 and CLC-04-F01
immediately after CLC-04; only one
agent/build/test command runs at a time. Each agent sets its
own task `in_progress` before work and appends **Completion evidence** before
setting `completed`. Evidence includes files, exact commands/results and
before/after regressions where feasible. Required-check failures leave a task
`blocked`, with prerequisite and owner. Independent findings become explicit
follow-ups rather than hidden scope growth.

Commands run from repository root unless noted; installed workspace dependencies,
supported Node and usable mongodb-memory-server binaries are prerequisites.

- V1 targeted: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run <concrete test files>`.
- V2 package: `pnpm --filter @web-ts-toolkit/access-router-client test` (transitive
  builds, source/test/strict declaration typechecks, Node integration tests and
  built-ESM jsdom smoke). Do not run shared-output builds concurrently.
- V3 published: `npm pack --dry-run --json` from `packages/access-router-client`;
  package packed-consumer, docs.compile and exports tests (included in V2).
  Inspect emitted public declarations and CJS/ESM exports after rebuilding.
- V4 final workspace assessment: run `pnpm build`, `pnpm test`, `pnpm lint`
  serially, and `git diff --check`. Record unrelated active-worktree failures
  separately; do not edit siblings to make this review green. Scoped package
  gates and changed-file lint must pass. An unrelated workspace failure must be
  disclosed in final evidence, not represented as a successful global gate.

Definition of done: every selected task delivered, acceptance criteria checked,
required scoped tests passing, docs/types/runtime agree, independent final review
recorded, global gate results reported truthfully, and root CHANGELOG unchanged.

## Tasks

### Task CLC-01: Frame cache keys without cross-partition collisions

Status: completed

Kind: defect

Priority: P1 — key ambiguity can defeat explicit identity partitioning.

Suggested agent: cache identity specialist (fresh session)

Dependencies: none

Primary ownership: `packages/access-router-client/src/services/interceptors.ts`
(`generateCacheKey`, `generateDataKey`); focused cache regressions.

Finding: at `interceptors.ts:517-543`, key fields are joined with `_`. Identical
GET configs with data `payload` / partition `tenant_a` and data `payload_tenant`
/ partition `a` have the same key. Authorization is intentionally redacted, so
distinct identities can join/cache-hit across this boundary. Source and installed
Axios permit string GET bodies; exploitability in an application is not asserted.

Requirements:

1. Encode components structurally, preserving type/value distinctions and secret
   redaction; do not use raw credentials as partition substitutes.
2. Preserve request-time identity capture, cache isolation and normal reuse.

Acceptance criteria: deterministic concurrent and completed-hit regressions for
the exact collision prove distinct keys, separate dispatch and identity-correct
data; ordinary same-identity hits still deduplicate; synthetic secrets never
appear in raw/decoded keys. Check falsy/string body distinctions at the same seam.

Verification: V1 new regression plus cache unit and BND-02 boundary suites.

Completion evidence:

- Changed files: `packages/access-router-client/src/services/interceptors.ts`,
  `packages/access-router-client/test/access-router-client.clc01-cache-keys.unit.test.ts`,
  and this task record. Cache key components now occupy separate JSON tuple
  fields; normalized bodies carry their type instead of collapsing falsy values
  or conflating strings with serialized objects/primitives. Credential headers
  still pass through the existing redactor before encoding.
- Before fix: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc01-cache-keys.unit.test.ts`
  exited 1: **13 failed, 3 passed**. Both request orders reproduced the exact
  `payload`/`tenant_a` versus `payload_tenant`/`a` collision: equal keys, only one
  dispatch, and the wrong identity's data for concurrent callers and completed
  hits. Falsy and typed-value/string body cases also reproduced collisions.
- Required V1 after fix: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc01-cache-keys.unit.test.ts test/access-router-client.cache.unit.test.ts test/access-router-client.bnd02-boundary.unit.test.ts`
  exited 0: **3 files, 68 tests passed**, including all **16 new regressions**.
  The collision cases now dispatch once per identity, with same-identity tails
  and completed hits reusing the correct independent data. Raw/decoded keys
  exclude all synthetic recognized credential and sensitive-header values.
  Existing request-time identity capture, cache lifecycle, normalization,
  response transformation and per-caller status-policy coverage passed.
- Additional checks (all exit 0):
  - `pnpm exec eslint packages/access-router-client/src/services/interceptors.ts packages/access-router-client/test/access-router-client.clc01-cache-keys.unit.test.ts`
  - `pnpm --filter @web-ts-toolkit/access-router-client typecheck:source && pnpm --filter @web-ts-toolkit/access-router-client typecheck:test`
  - `git diff --check -- packages/access-router-client docs/tasks/20260926-215404-access-router-client-business-contracts.md`
- Execution: one fresh session, no nested agents; commands ran sequentially
  without builds. No public docs, CHANGELOG, sibling files, or other task
  implementations changed; no commit. Vite emitted its existing advisory about
  future native config loading, with no test failure.
- Follow-up findings: none newly identified within CLC-01. At that handoff,
  CLC-02 through CLC-07 retained their existing scope and pending status.

### Task CLC-02: Publish deduplicated errors only after Axios transformation

Status: completed

Kind: defect

Priority: P1 — error body shape and parsing outcome depend on caller ordering.

Suggested agent: transport settlement specialist (fresh session)

Dependencies: CLC-01

Primary ownership: `src/services/interceptors.ts` source rejection and response
error interceptor; focused tests, all within the client package.

Finding: source adapter catch at `interceptors.ts:769-780` resolves the shared
slot before Axios `dispatchRequest` transforms an HTTP rejection. A raw JSON 404
body reaches a permissive tail as a string while the rejecting source sees an
object. Existing `bnd02-boundary.unit.test.ts` uses an already-parsed object for
its divergent-status case, masking the order defect.

Requirements: delay sharing settlement-rejected responses until transformed;
retain prompt rejection/cleanup for transport and parse failures. Preserve
per-caller validateStatus and caller-owned response config.

Acceptance criteria: raw JSON 404 object/string bodies have matching values/types
in both policy orders; malformed strict JSON rejects all attached callers and a
later retry dispatches; no stranded slots/unhandled rejection; existing success
single-transform, teardown and status-policy cases pass.

Verification: V1 CLC-02, BND-02/03/04 and cache suites.

Completion evidence:

- Changed files: `packages/access-router-client/src/services/interceptors.ts`,
  `packages/access-router-client/test/access-router-client.clc02-error-transforms.unit.test.ts`,
  and this task record. Source adapter HTTP settlement rejections now leave the
  shared slot pending until the response error interceptor receives Axios's
  transformed body. Transport errors still reject at the adapter catch, and
  parse errors still reject at the existing transform wrapper.
- Before fix: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc02-error-transforms.unit.test.ts`
  exited 1: **9 failed, 10 passed**. Rejecting-source cases exposed raw JSON to
  tails for object and string bodies in default/strict parsing modes; malformed
  strict JSON incorrectly fulfilled both permissive tails.
- Required V1 after fix (plus CLC-01 preservation):
  `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc02-error-transforms.unit.test.ts test/access-router-client.bnd02-boundary.unit.test.ts test/access-router-client.bnd03-transforms.unit.test.ts test/access-router-client.bnd04-disposal.unit.test.ts test/access-router-client.cache.unit.test.ts test/access-router-client.clc01-cache-keys.unit.test.ts`
  exited 0: **6 files, 95 tests passed**, including all **19 new CLC-02 cases**.
  Both policy orders preserve transformed values/types and caller-owned response
  configs. Four attached callers reject malformed strict JSON with parse errors;
  a later retry dispatches and can populate a valid cache entry. Plain transport
  errors without config reject source/tails and permit retry. Bounded settlement,
  existing single-transform/status-policy/disposal coverage all pass; Vitest
  reported no unhandled rejections.
- Additional checks (all exit 0):
  - `pnpm exec eslint packages/access-router-client/src/services/interceptors.ts packages/access-router-client/test/access-router-client.clc02-error-transforms.unit.test.ts`
  - `pnpm --filter @web-ts-toolkit/access-router-client typecheck:source && pnpm --filter @web-ts-toolkit/access-router-client typecheck:test`
  - `git diff --check -- packages/access-router-client docs/tasks/20260926-215404-access-router-client-business-contracts.md`
- Execution: fresh isolated session with CLC-01 completed; no spawned agents.
  Commands ran sequentially without builds. Existing CLC-01 and unrelated dirty
  work preserved; no public docs, root CHANGELOG, other task implementations, or
  commits. Vite's existing future-native-config advisory was non-failing.
- Follow-up findings: none newly identified within CLC-02. Public documentation
  remains assigned to CLC-06; broader package/workspace gates remain CLC-06/07.

### Task CLC-03: Preserve grouped config semantics without normalization collisions

Status: completed

Kind: defect

Priority: P2 — batches silently choose a different member's transport query.

Suggested agent: grouping contract specialist (fresh session)

Dependencies: CLC-02

Primary ownership: `src/services/cache-utils.ts` (`normalizeGroupedRequestConfig`)
and grouped config/adversarial tests within the client package.

Finding: `cache-utils.ts:129-141` sorts URLSearchParams by key AND value, equating
`mode=first&mode=second` and its reversed sequence although Axios preserves that
sequence and servers can use first/last/ordered semantics. `adapter.ts:400-437`
then dispatches only the first config. Also verify the same equality seam's
tagged Date/URLSearchParams values against plain objects mimicking their tags:
the current normalizer returns unescaped `{ __type, ... }` records.

Requirements:

1. Preserve repeated-value order (stable distinct-key ordering may remain).
2. Prevent special-value/plain-object structural collisions; preserve supported
   grammar, no caller mutation, cycle rejection and pre-claim validation.

Acceptance criteria: reversed repeated values and mimicked special-value records
reject before dispatch/claim; equal repeated sequences group once; distinct-key
reordering remains supported; rejected requests remain directly executable;
Date/config/cancellation/function and adversarial regressions pass.

Verification: V1 BND-09, adapter integration, ARC-22 adversarial/parity and added cases.

Completion evidence:

- Changed files: `packages/access-router-client/src/services/cache-utils.ts`,
  `packages/access-router-client/test/access-router-client.clc03-grouped-config.unit.test.ts`,
  and this task record. URLSearchParams entries now sort stably by key only;
  duplicate values retain their order. Plain objects normalize into their own
  tagged entry envelope recursively, so Date/URLSearchParams tags cannot collide
  with ordinary caller records, including within arrays. Supported input grammar,
  undefined-property omission, cycle rejection and option validation are retained.
- Before fix: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc03-grouped-config.unit.test.ts`
  exited 1: **10 failed, 5 passed** with the corrected fixture. Both member orders
  reproduced reversed-duplicate and special-value/plain-tag collisions, including
  nested array cases: grouping dispatched once and both results received the
  first member's Axios-serialized query instead of rejecting. The initial fixture
  run was **11 failed, 4 passed**; its extra failure involved basic-read config
  merging and an incorrect direct-response envelope. The fixture was corrected
  before source changes, using `readAdvanced()` for faithful direct-query checks.
- Required V1 after fix:
  `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc03-grouped-config.unit.test.ts test/access-router-client.bnd09-grouped-config.unit.test.ts test/access-router-client.adapter.integration.test.ts test/access-router-client.arc22-adversarial.unit.test.ts test/access-router-client.arc22-parity.integration.test.ts`
  exited 0: **5 files, 88 tests passed**, including all **15 new CLC-03 cases**.
  Every collision now rejects with zero dispatch, and both original requests
  subsequently execute with their own Axios-serialized queries. Equal repeated
  sequences group once despite distinct-key interleaving; caller values retain
  their original order. Ordinary tag-shaped data and shared acyclic references
  remain supported. Duplicate-request and later-already-claimed failures release
  earlier claims. Existing Date/config/function/cancellation/cycle, integration
  and adversarial/parity regressions pass.
- Additional checks (all exit 0):
  - `pnpm --filter @web-ts-toolkit/access-router-client typecheck:source && pnpm --filter @web-ts-toolkit/access-router-client typecheck:test`
  - `pnpm exec eslint packages/access-router-client/src/services/cache-utils.ts packages/access-router-client/test/access-router-client.clc03-grouped-config.unit.test.ts`
  - `git diff --check -- packages/access-router-client docs/tasks/20260926-215404-access-router-client-business-contracts.md`
- Execution: fresh session, no nested agents; all build/test/check commands ran
  sequentially, with no builds needed for these scoped checks. CLC-01/02 and
  unrelated work preserved; no public docs, root CHANGELOG, other task
  implementations or commits. Vite's existing future-native-config advisory was
  non-failing. Broader package/published/workspace gates remain with CLC-06/07.
- **Follow-up CLC-03-F01 — basic-read URLSearchParams merging**:
  Status: completed. Kind: defect. Priority: P2 — caller query values are lost.
  Suggested agent/owner: fresh client transport-config session.
  Dependencies: CLC-03. Primary ownership: `src/services/model-service.ts:968-975`
  and focused direct-config tests. The initial rollback probe directly executed
  basic `read()` with `params: new URLSearchParams('mode=second&mode=first')`;
  Axios serialization at dispatch contained only
  `include_permissions=true&try_list=true`. The generated plain-object params
  replace URLSearchParams through `mergeConfig`. This is separate from grouped
  normalization; no implementation change made here. Requirements/acceptance:
  reproduce direct basic-read loss, define and preserve ordered caller params
  alongside generated options (including their existing precedence), verify
  no caller mutation, and inspect other generated-param merge sites for the
  same behavior. Run focused direct-config and adapter integration regressions.
  Scope clarification from inspection: the same replacement occurs in model
  list/create/upsert/update, data list, and five basic subdocument operations
  (even their empty generated params discard URLSearchParams). Cover all eleven
  sites through one internal merge helper. Preserve ordinary object-param merging,
  scalar false/zero serialization, and generated undefined pagination keys
  overriding/omitting caller values, as existing Axios object merging does.
  Preserve caller entry order/duplicates for non-generated keys; replace all
  duplicates of generated keys. Group transport keeps caller config while its
  per-entry body carries generated options; verify successful grouping and
  direct execution after rejected grouping. Required checks also include
  CLC-03/BND-09 focused suites, source/test typechecks and changed-file lint.

  Completion evidence:
  - Changed: new internal
    `packages/access-router-client/src/services/request-config.ts`, callers in
    `src/services/model-service.ts`, `src/services/data-service.ts`, and
    `src/services/sub-ops.ts` within that package, new
    `packages/access-router-client/test/access-router-client.clc03-f01-params.unit.test.ts`,
    and this follow-up record. All eleven generated-param merge sites now use
    `mergeServiceParams`: clone URLSearchParams, replace generated keys with
    `set` (or delete omitted nullish values), then retain Axios config merging.
    Non-generated caller entries retain their complete order, duplicate values,
    blanks and encoding semantics. Ordinary object params keep Axios's existing
    merge behavior. Wrapper/default-config merges were inspected and do not
    generate these service options.
  - Before fix:
    `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc03-f01-params.unit.test.ts`
    exited 1: **14 failed, 12 passed**. The exact basic-read probe dispatched
    only `include_permissions=true&try_list=true`; every other affected site
    also lost caller duplicates, including all five empty subdocument merges.
    Plain-object controls and grouped transport passed before the fix.
  - Required focused/integration checks:
    `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc03-f01-params.unit.test.ts test/access-router-client.clc03-grouped-config.unit.test.ts test/access-router-client.bnd09-grouped-config.unit.test.ts test/access-router-client.adapter.integration.test.ts test/access-router-client.arc22-adversarial.unit.test.ts test/access-router-client.arc22-parity.integration.test.ts`
    exited 0: **6 files, 114 tests passed**, including **26 follow-up cases**.
    The exact read now dispatches
    `mode=second&mode=first&include_permissions=true&try_list=true`.
    All eleven sites preserve caller params and generated precedence for
    URLSearchParams and object inputs. Coverage verifies false/zero values,
    omitted pagination keys, frozen config/headers/object params, detached
    URLSearchParams passed to a custom serializer, and lazy dispatch.
    Grouped reads still send caller params once with independent generated
    options in each body entry; reversed duplicates reject before claims and
    both basic reads subsequently execute directly with their own full query.
  - Additional checks (all exit 0):
    - `pnpm --filter @web-ts-toolkit/access-router-client typecheck:source`
    - `pnpm --filter @web-ts-toolkit/access-router-client typecheck:test`
    - `pnpm exec eslint packages/access-router-client/src/services/request-config.ts packages/access-router-client/src/services/model-service.ts packages/access-router-client/src/services/data-service.ts packages/access-router-client/src/services/sub-ops.ts packages/access-router-client/test/access-router-client.clc03-f01-params.unit.test.ts`
    - `git diff --check -- packages/access-router-client docs/tasks/20260926-215404-access-router-client-business-contracts.md`
  - Execution: fresh isolated session, no nested agents; commands ran sequentially.
    Vite's existing future-native-config advisory was non-failing. No commits.
    Follow-up findings: none independent. CLC-06 owns public documentation of
    ordered caller params and generated-option precedence; broader gates remain
    CLC-06/07. Existing completed-task and unrelated worktree edits were preserved.

### Task CLC-04: Bound recursive correlated-query preparation

Status: completed

Kind: defect

Priority: P2 — cyclic/deep filters can overflow the stack during synchronous calls.

Suggested agent: query construction boundary specialist (fresh session)

Dependencies: CLC-03

Primary ownership: `src/correlated.ts`, `src/helpers.ts` and a small internal
traversal helper if justified; correlated/subquery regression tests.

Finding: `correlated.ts:146-225` (`scanNode`) recursively scans every advanced
filter without a cycle guard. Clone/freeze helpers handle cycles but remain
unbounded by depth/size; `helpers.ts:6-44` (`replaceSubQuery`) also recurses
unbounded. Cyclic arrays/objects or very deep query builder input can fail with
RangeError instead of a controlled `CorrelatedIncludeError`.

Requirements:

1. Add one coherent bounded input traversal policy before recursive work;
   reject cycles and excessive depth/node work with a controlled error.
   Document concrete conservative limits and where they apply.
2. Cover filters, captured args/options and supplemental conversion; preserve
   shared acyclic references, normal query cardinality, inert descriptors,
   `$escape` literal semantics and existing lazy subquery support.
3. Do not freeze caller-owned objects or execute lazy requests during validation.

Implementation clarifications (CLC-04, current session):

- Use a maximum depth of **64 edges** from each input root (root depth 0), and
  **10,000 expanded value visits** per preparation boundary, counting containers,
  primitive leaves, array slots and repeated DAG occurrences, not unique objects.
  Capture shares one budget across supplied id/filter/args/options; conversion
  also checks selected effective args and the rewritten filter before cloning.
- Structurally validate `$escape` contents for copy/serialization bounds while
  keeping them literal during marker scanning and subquery rewriting. Inspection
  found rewriting currently descends into escapes; preserving the required
  literal contract needs a regression and correction in the same helper.
- Live requests remain opaque during scanning/capture (no traversal of executors,
  service/config graphs or metadata). Once rewriting exposes `__query` as `$$sq`
  wire data, validate that data before recursive cloning, including metadata
  changed after capture. This is needed to prevent a conversion-budget bypass.
  The helper must also recognize a live request at its root or as an array
  element before descending; otherwise opaque input could bypass preflight and
  expose arbitrary enumerable request properties to recursive rewriting.
- Public documentation belongs to CLC-06; record exact limits and boundaries here
  and in internal implementation comments for that handoff.

Acceptance criteria: object/array/mixed cycles, depth and wide-input boundaries
reject predictably with zero HTTP; valid shared DAGs and limit-adjacent input
work; direct/grouped and all seven include-builder behaviors remain green.
Tests assert deterministic work limits rather than wall-clock performance.

Verification: V1 new bound tests, correlated unit/integration/filter-type tests,
and existing helper/subquery tests identified during implementation.

Completion evidence:

- Changed: `packages/access-router-client/src/correlated.ts`,
  `packages/access-router-client/src/helpers.ts`, new internal
  `packages/access-router-client/src/query-traversal.ts`, new
  `packages/access-router-client/test/access-router-client.clc04-query-bounds.unit.test.ts`,
  and this record. An iterative ancestor-path traversal rejects cycles, depth
  over 64 and more than 10,000 expanded value visits with
  `CorrelatedIncludeError` before marker scanning, snapshot clone/freeze or
  subquery rewriting. Shared acyclic references are revisited against the budget,
  so small exponentially expanding DAGs cannot evade the bound. Children are
  read incrementally, rather than eagerly materializing unbounded value lists.
- Before fix:
  `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc04-query-bounds.unit.test.ts`
  exited 1: **85 failed, 5 passed**. Object/array/mixed cycles and 20,000-edge
  chains reproduced stack overflows; 65-edge, 10,001-node and 32,767-expanded-node
  DAG inputs were accepted. Captured args/options and supplemental list/count
  conversion reproduced the same defects. Exposed subquery metadata bypassed
  bounds; escaped descriptors were interpreted instead of left literal.
- Final required V1 (all exit 0):
  `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc04-query-bounds.unit.test.ts test/access-router-client.correlated-includes.unit.test.ts test/access-router-client.correlated-includes.integration.test.ts test/access-router-client.correlated-filter-types.unit.test.ts test/access-router-client.bnd10-defaults.integration.test.ts test/access-router-client.model-service.integration.test.ts test/access-router-client.data-service.integration.test.ts test/access-router-client.adapter.integration.test.ts test/access-router-client.url-encoding.unit.test.ts test/access-router-client.config-immutability.unit.test.ts`
  passed **10 files, 269 tests**, including **92 CLC-04 cases**. The additional
  cases/checks cover effective inherited args, aggregate conversion work,
  helper-root/array-element live requests, and successful direct/grouped
  execution after rejected supplemental conversion. Existing correlated tests
  cover all seven builders, direct/grouped outer requests, marker grammar,
  nested includes and real-server escape/subquery behavior. BND-10 plus model,
  data and adapter suites cover existing helper/subquery consumers.
- Boundary/ownership results: exact 64-edge and 10,000-node filters convert;
  an 8,191-visit DAG works while a 32,767-visit DAG rejects. Holes count as
  array slots. Invalid input causes zero dispatch. Call args/options share the
  capture budget; effective forwarded defaults and rewritten subquery metadata
  share the conversion budget. Escapes retain literal semantics while their
  structural contents are bounded; live requests retain opacity and execution
  ownership, and exposed metadata is checked before detaching it. Caller
  containers and live requests are not frozen; repeated conversions are detached.
- Additional final checks (exit 0):
  - `pnpm --filter @web-ts-toolkit/access-router-client typecheck:source && pnpm --filter @web-ts-toolkit/access-router-client typecheck:test && pnpm exec eslint packages/access-router-client/src/correlated.ts packages/access-router-client/src/helpers.ts packages/access-router-client/src/query-traversal.ts packages/access-router-client/test/access-router-client.clc04-query-bounds.unit.test.ts`
  - `git diff --check -- packages/access-router-client docs/tasks/20260926-215404-access-router-client-business-contracts.md && git diff --exit-code -- CHANGELOG.md`
- **CLC-06 documentation handoff:** describe root depth 0 / maximum 64 edges,
  10,000 expanded visits including primitives and repeated DAG occurrences,
  structural checking beneath `$escape`, opaque live requests until metadata
  conversion, and synchronous `CorrelatedIncludeError` with zero HTTP. Bounds
  cover plain-object/array preparation, not byte lengths or arbitrary behavior
  of exotic instances. Undefined optional roots are absent; capture budgets
  combine supplied id/filter/args/options, and conversion budgets combine id or
  rewritten filter with the effective forwarded args bag. Conversion can reject
  when expanded `$$sq` data or combined defaults exceed the budget even if each
  original builder input fits. Internal generated wire-envelope keys do not
  consume the filter-only budget. No new public exports or protocol fields.
- Execution: fresh isolated session, no nested agents or commits. Test/check
  commands ran sequentially; no build was needed for these source-level scoped
  gates. Existing worktree changes preserved. Public docs and root CHANGELOG
  were not edited. Vite's existing future-native-config advisory was non-failing.
  Broader package/published/workspace gates remain assigned to CLC-06/07.
- **Follow-up CLC-04-F01 — bound service-default normalization**:
  Status: completed. Kind: improvement. Priority: P2 — bounded constructor work.
  Suggested agent/owner: fresh client-defaults boundary session.
  Dependencies: CLC-04. Primary ownership:
  `src/services/shared.ts:270-376` and BND-10 default tests. Source-derived finding:
  adapter/service construction uses a separate recursive default clone/freeze
  path with cycle checks but no depth or expanded-work budget; construction
  happens before correlated capture/conversion. CLC-04 now bounds selected
  defaults at conversion, but does not change that independent constructor
  contract. Requirements/acceptance: reproduce deep/wide/DAG default failures,
  define conservative limits and controlled errors consistent with the existing
  default-value grammar, reject before recursive normalization, retain detached
  defaults and precedence, and pass BND-10 plus source/test typechecks. This is a
  separate follow-up, not a prerequisite for CLC-05 or hidden scope in this fix.

  Implementation policy / CLC-06 handoff:
  - Service-default normalization uses maximum **64 edges** (the entire defaults
    bag is depth 0) and **10,000 expanded value visits** per normalization call.
    Count the bag, operation args/options containers, primitive/Date leaves,
    array slots including holes, and every repeated DAG occurrence. The budget
    spans all operation defaults together; generated empty option bags are added
    afterward and do not consume the caller-input budget.
  - Direct ModelService/DataService construction checks its supplied defaults;
    adapter factories check the effective shallow-merged adapter/service defaults
    when creating each service. `createAdapter` itself does not normalize defaults.
    Overridden adapter fields do not count toward the effective bag. Two individually
    valid defaults bags can exceed the budget after merging.
  - Every per-request `cloneServiceDefaultValue` also checks its selected value as
    a fresh depth-0 root with the same limits, before recursion. Per-call argument
    precedence remains unchanged. Correlated capture/conversion retains CLC-04's
    separate aggregate budgets and `CorrelatedIncludeError` contract.
  - Rejections are synchronous `UnsupportedServiceDefaultValueError`, with
    `Service defaults depth limit 64 exceeded at <path>` or
    `Service defaults node limit 10000 exceeded at <path>`. Cycles retain
    `Service defaults do not support circular value at <path>`. Paths start at
    `defaults`, using `.key` and `[index]`. The existing supported/rejected value
    grammar and detached Date semantics remain intact. There is no request or
    descriptor opacity exception for defaults and no frozen-input exemption.
  - These are structural work limits before recursive clone/freeze, not byte
    limits or bounds on arbitrary getter/proxy/exotic-instance behavior. The
    iterative traversal machinery is internal and shared with CLC-04; public
    exports and protocol fields are unchanged. CLC-06 owns public documentation.

  Completion evidence:
  - Changed: new internal `packages/access-router-client/src/bounded-traversal.ts`,
    `src/query-traversal.ts`, `src/services/shared.ts`, new
    `test/access-router-client.clc04-f01-default-bounds.unit.test.ts`, and
    `test/access-router-client.clc04-query-bounds.unit.test.ts` within that package,
    plus this task record. Extracted the existing iterative traversal into shared
    machinery with boundary-specific container/error policies. Constructor and
    per-request default clones now preflight before recursive normalization;
    removed the redundant constructor clone wrapper. Query traversal preserves
    its existing limits, opaque values, optional-root handling and error messages.
  - Before fix:
    `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc04-f01-default-bounds.unit.test.ts`
    exited 1: **44 failed, 19 passed**. Six direct/inherited/factory model/data
    construction routes reproduced RangeError on 20,000-edge chains and accepted
    65-edge, 10,001-visit array/object/sparse inputs and 32,769-visit defaults DAGs.
    Whole-bag/merged budgets and per-request clones also reproduced missing bounds.
  - First combined run after implementation: **265 passed, 1 failed**. A prior
    CLC-04 fixture deliberately constructed oversized defaults to test conversion;
    it now correctly fails earlier with `UnsupportedServiceDefaultValueError`.
    Constructor rejection is covered by the new suite; updated the old test to
    retain aggregate conversion rejection for individually valid inherited args
    and filter. Added incremental-read and frozen/request-shaped default probes.
  - Final required focused checks:
    `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc04-f01-default-bounds.unit.test.ts test/access-router-client.clc04-query-bounds.unit.test.ts test/access-router-client.bnd10-defaults.integration.test.ts test/access-router-client.config-immutability.unit.test.ts test/access-router-client.correlated-includes.unit.test.ts test/access-router-client.correlated-includes.integration.test.ts test/access-router-client.correlated-filter-types.unit.test.ts`
    exited 0: **7 files, 268 tests passed**, including **65 follow-up regressions**
    and all **92 CLC-04 cases**. Exact 64-edge/10,000-visit boundaries and supported
    DAGs succeed; excessive inputs reject without HTTP or caller freezing. Tests
    cover whole-bag and merged work, incremental stopping before distant getters,
    null-prototype data, unsupported-value/cycle messages and paths, detached Dates
    and repeated request clones. BND-10/config tests retain adapter/service/per-call
    precedence, subquery behavior, direct/grouped parity and config immutability.
  - Additional final checks (all exit 0):
    - `pnpm --filter @web-ts-toolkit/access-router-client typecheck:source`
    - `pnpm --filter @web-ts-toolkit/access-router-client typecheck:test`
    - `pnpm exec eslint packages/access-router-client/src/bounded-traversal.ts packages/access-router-client/src/query-traversal.ts packages/access-router-client/src/services/shared.ts packages/access-router-client/test/access-router-client.clc04-f01-default-bounds.unit.test.ts packages/access-router-client/test/access-router-client.clc04-query-bounds.unit.test.ts`
    - `git diff --check -- packages/access-router-client docs/tasks/20260926-215404-access-router-client-business-contracts.md && git diff --exit-code -- CHANGELOG.md`
  - Execution: fresh isolated session, no nested agents; commands ran sequentially.
    Vite's existing future-native-config advisory was non-failing. No public docs,
    root CHANGELOG, sibling work or commits changed. No independent findings.
    CLC-06 owns the public budget/migration documentation described above; broader
    package/published/workspace gates remain assigned to CLC-06/07.

### Task CLC-05: Persist direct writes to absent model fields

Status: completed

Kind: defect

Priority: P1 — common optional/projected form fields silently fail to save.

Suggested agent: model persistence specialist (fresh session)

Dependencies: CLC-04

Primary ownership: `src/model.ts`, model regression/type fixtures. Implements
existing BND-07-FOLLOWUP from the September boundary task record.

Finding: `model.ts:502-515` creates accessors only for existing data keys.
Assigning an absent optional/projected key creates an untracked wrapper shadow;
save omits it, reset leaves it, and later `set()` cannot repair the forwarder.
Seven BND-07 characterization tests document this defect. Public `ModelData`
and README already advertise ordinary field assignment.

Requirements:

1. Implement the previously recommended consistent-write contract: absent
   nonreserved top-level assignments track/persist like `set`/`assign`.
   A focused wrapper interception mechanism is authorized for this task.
2. Preserve public method/reserved-name behavior, private state ownership,
   `instanceof Model`, serialization, projection identity, draft semantics,
   queued saves and independent returned-wrapper reconciliation.
3. Replace historical defect characterizations with corrected regression
   assertions; do not leave tests that require silent data loss. Preserve
   untracked nested mutation semantics. Reject unsafe writes without mutation.

Acceptance criteria: optional/projection-omitted fields persist through direct
assignment, helper-after-direct, reset/revert, concurrent and queued save cases;
original and returned models remain independent; reserved methods still function
and reserved data is available via helpers; strict public consumer types agree.

Verification: V1 all model/BND-06/07/08/projection-identity suites;
`pnpm --filter @web-ts-toolkit/access-router-client typecheck`.

Execution: fresh isolated session, no nested agents; commands sequential. Current
user authorization explicitly selects ordinary top-level assignment for absent
fields and focused wrapper interception. CLC-04 is completed. Public documentation
and the historical follow-up resolution link remain assigned to CLC-06.

Implementation policy / CLC-06 documentation handoff:

- Ordinary nonreserved top-level assignment now writes the same document data as
  `set`/`assign`, even when the field was absent or projection-omitted. It creates
  a forwarder rather than a wrapper shadow. Helper-after-direct writes, dirty
  reconciliation, serialization, save and reset agree. Nested in-place object/
  array edits remain untracked unless explicitly marked or made through `set`.
- Wrapper methods, internal state names and inherited prototype members remain
  reserved on direct access. Direct assignment to them throws `TypeError` before
  mutation. Their document values remain helper-only (including `_snapshot` and
  `_saveQueue`); the existing `set` path prohibition on `__proto__`, `constructor`
  and `prototype` segments still applies. `then` is now explicitly helper-only:
  direct reads return `undefined` even if document data contains a function there,
  and direct writes throw. `ModelData` excludes `then` and inherited Object-member
  names in addition to public Model members. Model methods are stable owner-bound
  functions; fluent methods return the intercepted wrapper, not its raw target.
  Inherited Object helpers retain the public receiver so legacy descriptor
  mutations cannot bypass interception.
- Direct keys and `assign` keys must be nonempty literal string keys representable
  without reinterpretation by the existing model path normalizer: no `.`, `[` or
  `]`, no `__proto__`/`constructor`/`prototype`, and no numeric spelling that
  normalizes to another key (for example `01`). Direct symbol writes and enumerable
  symbol keys in `assign` throw `TypeError`. `assign` checks every input key before
  applying any values, so an invalid later key does not partially apply earlier
  fields. Dotted/bracket nested paths belong to `set`/`markModified` under their
  existing BND-08 grammar. This is key validation, not transactional execution of
  arbitrary caller getters/proxies.
- Structural wrapper mutation (`defineProperty`, `delete`, `setPrototypeOf`,
  `preventExtensions`, and consequently freeze/seal and legacy getter/setter
  definition helpers) throws `TypeError` before changing wrapper/data/dirty state.
  This prevents shadows, API replacement and disabling future forwarding.
- Reset of an added field restores absence in `toObject()` and returns `undefined`
  through both direct reads and `get`, including an already-installed forwarder
  (previous forwarders returned `null` after removal). Forwarder slots may remain
  enumerable after reset; `toObject`/`toJSON` serialize document data. Reverting an
  absent field to `undefined` reconciles clean against an absent baseline. This
  does not introduce a server unset/delete protocol: ordinary JSON omission of
  undefined values remains unchanged; reset is a local operation.
- Both `new Model` and `Model.create` return intercepted instances preserving
  `instanceof Model` and constructor identity. The existing constructor typing
  remains `Model`; `Model.create`/service responses expose `ModelData`. Existing
  persistence identity/draft rules remain. New-field reset during an in-flight
  save retains the persisted baseline even if the local key was removed; newly
  edited but unsubmitted fields retain an absent prior baseline. Returned wrappers
  receive detached snapshots/dirty sets and independent queues via module-private
  target lookup, never by assigning private state through the public write trap.
- CLC-06 should document these migration details in shipped docs/JSDoc and link
  historical `BND-07-FOLLOWUP` to this completion evidence. The historical
  investigation remains historically accurate; its seven tests now assert the
  fixed contract instead of requiring silent loss.

Completion evidence:

- Changed files:
  - `packages/access-router-client/src/model.ts`
  - `packages/access-router-client/test/access-router-client.clc05-model-writes.unit.test.ts` (new)
  - `packages/access-router-client/test/access-router-client.bnd07-absent-fields.unit.test.ts`
  - `packages/access-router-client/test/access-router-client.arc21-projection-identity.integration.test.ts`
  - `packages/access-router-client/test-typecheck/model-reserved-fields.ts`
  - `packages/access-router-client/test-decl-consumer/decl-consumer.strict.test.ts`
  - this task record.
- Implementation: a constructor-level wrapper Proxy sends nonreserved direct
  assignments through the existing data proxy and dirty reconciliation. Existing
  forwarders avoid rescanning the document on every ordinary assignment. Model
  methods operate on their owning target, with fluent returns remapped to the
  public wrapper. A module-private WeakMap supports detached returned-wrapper
  reconciliation without exposing a write exemption for private state. Snapshot
  rebuilding includes submitted fields removed by an in-flight reset and preserves
  actual absence for unsubmitted concurrent fields. Key preflight and structural
  traps enforce the exact policy above, including legacy Object mutation helpers.
- Before fix:
  `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.bnd07-absent-fields.unit.test.ts test/access-router-client.clc05-model-writes.unit.test.ts`
  exited 1: **42 failed, 4 passed**. Corrected BND-07 tests reproduced missing
  dirty/serialized optional data, omitted PATCH fields and stale direct reads
  after helpers. New tests also reproduced constructor/static-create shadows,
  reset/revert loss, empty queued payloads, unsafe wrapper writes and exposed
  callable `then`. After initial implementation the same command passed
  **2 files, 46 tests**. Subsequent checks added independent returned save queues,
  symbol-assign atomic rejection, legacy descriptor bypass probes, reserved-data
  save/reset ownership and server-returned `then` coverage.
- Final required V1, plus BND-12 and strict emitted-consumer runtime checks:
  `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc05-model-writes.unit.test.ts test/access-router-client.bnd06-reconciliation.unit.test.ts test/access-router-client.bnd07-absent-fields.unit.test.ts test/access-router-client.bnd08-paths.unit.test.ts test/access-router-client.model-reconciliation.unit.test.ts test/access-router-client.model.integration.test.ts test/access-router-client.model-service.integration.test.ts test/access-router-client.arc21-projection-identity.integration.test.ts test/access-router-client.bnd12-benchmark.unit.test.ts test-decl-consumer/decl-consumer.strict.test.ts`
  exited 0: **10 files, 109 tests passed**, including **41 CLC-05 cases** and all
  **7 corrected BND-07 regressions**. Both original and returned models retain
  independent pending edits, reset baselines and save queues. Draft queued saves
  create once then update the new identity; failures retain edits for queued
  retry. Reset during save works with echoed and omitted response fields. Tests
  preserve untracked nested mutation and explicit nested tracking. Real-server
  projection coverage now assigns omitted `role` directly, verifies the exact
  PATCH body/route using captured identity, reloads the persisted value and
  restores the seed. Identity-less existing projections still refuse creation.
- Final required typecheck:
  `pnpm --filter @web-ts-toolkit/access-router-client typecheck`
  exited 0, rebuilding transitive dependencies and CJS/ESM/declarations, then
  passing source, test, NodeNext-strict and Bundler-strict consumer checks.
  Inspected both emitted declaration variants: `Model.create` still returns
  `Model<T, TData> & ModelData<T, TData>`, the reserved-name exclusion is present,
  and wrapper machinery/target lookup are not exported. Source and strict emitted
  fixtures accept absent optional assignment and helper-only reserved data while
  rejecting direct `then`, method replacement and private queue assignment.
- Final changed-file lint:
  `pnpm exec eslint packages/access-router-client/src/model.ts packages/access-router-client/test/access-router-client.clc05-model-writes.unit.test.ts packages/access-router-client/test/access-router-client.bnd07-absent-fields.unit.test.ts packages/access-router-client/test/access-router-client.arc21-projection-identity.integration.test.ts packages/access-router-client/test-typecheck/model-reserved-fields.ts packages/access-router-client/test-decl-consumer/decl-consumer.strict.test.ts`
  exited 0, with no warnings. An earlier lint run identified `no-this-alias` in
  prototype-key collection and `no-wrapper-object-types` for `keyof Object`;
  corrected both, then reran the full required typecheck/tests and final lint.
- Whitespace/CHANGELOG check:
  `git diff --check -- packages/access-router-client docs/tasks/20260926-215404-access-router-client-business-contracts.md && git diff --exit-code -- CHANGELOG.md`
  exited 0. All commands ran sequentially in this fresh isolated session, with
  no nested agents or commits. Existing task/sibling work was preserved; generated
  output was rebuilt only through package scripts. Vite's existing future-native-
  config advisory was non-failing. No independent follow-up found within CLC-05.
- Acceptance: CLC-05 runtime/type criteria and required gates pass. CLC-06 owns
  the detailed public documentation/migration handoff above and the historical
  BND-07 resolution link. Broader V2/V3/V4 gates remain with CLC-06/07.

### Task CLC-06: Document the corrected business and migration contracts

Status: completed

Kind: improvement

Priority: P2 — installed consumers need actionable, accurate contracts.

Suggested agent: installed-consumer documentation specialist (fresh session)

Dependencies: CLC-01, CLC-02, CLC-03, CLC-03-F01, CLC-04, CLC-04-F01, CLC-05

Primary ownership: client README, llms.txt, high-value public JSDoc, affected
website client pages/docs compile fixtures; historical BND-07 follow-up link only.

Finding: README model guidance does not disclose the absent-field defect or its
fix, grouped config grammar lacks repeated-key semantics, and correlated docs
lack input budgets. The historical BND-07 follow-up remains unresolved in its
record unless linked to new completion evidence.

Requirements: record corrected assignment, cache identity/response parity,
grouping equality and recursive-input limits in shipped docs/migration notes;
keep examples compact and compileable. Link BND-07's historical record to CLC-05
without rewriting prior findings. Do not modify root CHANGELOG.md. Confirm
runtime/public declarations/docs agree and avoid unsupported feature claims.

Acceptance criteria: installed README explains new contracts and migration;
documentation compile, export inventory and strict consumer tests pass; generated
declarations preserve relevant public JSDoc; prior residual is clearly resolved.

Verification: V2, V3; record package test counts and packed files.

Execution: fresh isolated documentation session; all listed dependencies completed.
No nested agents; commands and V2/V3 builds/checks run serially.

Completion evidence:

- Changed shipped docs: `packages/access-router-client/README.md` and `llms.txt`.
  Added consumer migration/contract guidance for framed cache identity and
  transformed error parity, ordered URLSearchParams with generated-option
  precedence, grouped equality, exact query/default depth and expanded-work
  budgets, and absent-field assignment/reserved-name/safe-write/reset semantics.
  Included the separate capture/conversion/default budgets and their limitations;
  no byte, arbitrary-object safety, or performance guarantee is asserted.
- Changed public JSDoc only in client `src/adapter.ts`, `src/interface.ts`,
  `src/correlated-brand.ts`, `src/services/interceptors.ts`, and `src/model.ts`.
  Updated website `adapter.mdx`, `services.mdx`, `model.mdx`, and
  `typescript-and-errors.mdx` under `website/docs/packages/access-router-client/`.
  Added `test-docs-consumer/examples/optional-fields-params.ts` and its exact
  SHA-256 inventory entry in `test-docs-consumer/snippets-mapping.md`.
  The docs inventory now covers **58 TypeScript blocks with 15 compiled fixtures**
  (including the existing explicit partial/negative classifications).
- Historical resolution: appended a dated link under BND-07 in
  `docs/tasks/20260906-225058-access-router-client-boundary-review.md` to CLC-05
  runtime evidence and CLC-06 public documentation. Original investigation,
  deferral, characterization results and residual statements remain historical.
- Required V2:
  `pnpm --filter @web-ts-toolkit/access-router-client test` exited 0.
  Transitive builds and client CJS/ESM/declaration emission passed, followed by
  source/test typechecks and strict NodeNext/Bundler declaration consumers.
  Node Vitest: **40 files, 792 tests passed**. Built-ESM jsdom: **1 file,
  10 tests passed**. Total: **41 files, 802 tests**. The Node run includes
  `access-router-client.packed-consumer.test.ts` (real release transformation,
  fresh-install CJS/ESM and strict NodeNext/Bundler consumers),
  `access-router-client.docs.compile.test.ts` (inventory and packed docs fixture
  compilation), `access-router-client.exports.unit.test.ts`, docs link tests,
  strict emitted-consumer runtime tests, and all CLC regression/integration suites.
- Required V3: `npm pack --dry-run --json` from
  `packages/access-router-client` exited 0: **7 files**, **109,319 bytes packed**,
  **489,633 bytes unpacked**, no bundled dependencies. Exact contents:
  `README.md`, `llms.txt`, `package.json`, `dist/index.js`, `dist/index.mjs`,
  `dist/index.d.ts`, `dist/index.d.mts`. The V2 packed-consumer test separately
  verifies the actual publisher-transformed **8-file** release layout:
  `LICENSE`, `README.md`, `llms.txt`, `package.json`, `index.js`, `index.mjs`,
  `index.d.ts`, `index.d.mts`; manifest placeholders/workspace dependencies are
  rewritten and no source/tests/maps are packed.
- Declaration inspection: both `dist/index.d.ts` and `dist/index.d.mts` retain
  JSDoc on `Defaults`/`DataDefaults`, `Model`/`assign`/`reset`/`ModelData`,
  `CachePartitioner`, `AdapterOptions`/`createAdapter`, and
  `CorrelatedIncludeError`. Existing `Model.create`/response `ModelData` typing
  and its reserved-name exclusion agree with the new docs. Package metadata
  resolves ESM to `.mjs`/`.d.mts`, CJS to `.js`/`.d.ts`; the release transform
  preserves these conditions while flattening paths. No new public exports.
- Additional emitted runtime verification (exit 0):
  `node --input-type=module -e "import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import * as esm from './packages/access-router-client/dist/index.mjs'; const cjs = createRequire(import.meta.url)('./packages/access-router-client/dist/index.js'); const expected = ['CorrelatedIncludeError', 'CustomHeaders', 'DataService', 'MissingPersistenceIdentityError', 'Model', 'ModelService', 'Service', 'ServiceError', 'createAdapter', 'parentField', 'removeItemById', 'replaceItemById', 'wrapLazyPromise'].sort(); assert.deepEqual(Object.keys(esm).sort(), expected); assert.deepEqual(Object.keys(cjs).sort(), expected); console.log('CJS and ESM: identical 13 named runtime exports; no default or internal exports.'); console.log(expected.join(', '));"`
  confirmed exactly **13 identical named runtime exports**, no default/internal
  export leakage.
- Changed-file lint (exit 0, no warnings):
  `pnpm exec eslint packages/access-router-client/src/model.ts packages/access-router-client/src/services/interceptors.ts packages/access-router-client/src/adapter.ts packages/access-router-client/src/interface.ts packages/access-router-client/src/correlated-brand.ts packages/access-router-client/test-docs-consumer/examples/optional-fields-params.ts`.
- Whitespace/CHANGELOG check (exit 0):
  `git diff --check -- packages/access-router-client website/docs/packages/access-router-client docs/tasks/20260906-225058-access-router-client-boundary-review.md docs/tasks/20260926-215404-access-router-client-business-contracts.md && git diff --exit-code -- CHANGELOG.md`.
- Execution/result: fresh isolated session, no nested agents or commits. All
  commands ran serially. Runtime behavior and prior/sibling edits preserved;
  generated output rebuilt only by package scripts. Vite's existing future-native-
  config advisory was non-failing. No required gate failed and no new follow-up
  was discovered. CLC-06 acceptance passed; at that handoff, independent CLC-07/V4
  workspace assessment was pending. Final sign-off is recorded under CLC-07 below.

### Task CLC-07: Independently verify completion and integration

Status: completed

Kind: improvement

Priority: P1 — independent evidence catches cross-task boundary regressions.

Suggested agent: final reviewer, separate from every implementing session

Dependencies: CLC-01, CLC-02, CLC-03, CLC-03-F01, CLC-04, CLC-04-F01, CLC-05, CLC-06, CLC-07-F01

Primary ownership: this task record and minimal scoped corrections if needed.

Requirements: inspect every task's implementation/acceptance/evidence, verify
cross-identity and alternate-path behavior, model encapsulation, query bounds,
public API/docs and packed CJS/ESM consistency. Run V4 serially; reuse fresh V2/V3
only if no relevant edits occurred afterward, otherwise rerun affected gates.
Check changed-file lint and scoped diff whitespace. Preserve unrelated work.

Acceptance criteria: all preceding tasks, including CLC-03-F01 and CLC-04-F01, have valid completed evidence;
scoped checks pass; workspace gate outcomes/limitations are explicitly recorded;
no untracked new blocker or false completion remains; root CHANGELOG untouched.

Verification: V4 plus acceptance/evidence audit; coordinator reviews this task
file and final diff after this independent session returns.

Execution: fresh independent reviewer session, no implementation involvement or
subagents. All commands run serially. CLC-01 through CLC-06 and both follow-ups
are recorded completed; their evidence is being checked against current source,
diffs, tests and emitted declarations. Unrelated dirty work is preserved.

Historical blocker: the first independent review found that request-shaped
literal/exposed metadata bypassed CLC-04's structural bounds and detached-wire
contract. A separate agent completed CLC-07-F01 and refreshed V2/V3 below.
Resolution: the original reviewer independently verified the correction and both
original counterexamples. The blocker is closed; final acceptance is recorded
below. The earlier blocked review and failed global gates remain historical evidence.

Completion evidence (first review, historical blocked result; resumed audit below):

- Review scope/ownership: read the entire plan and historical resolution, all
  client source diffs (including the three new internal helpers), all seven CLC
  regression files, corrected BND-07/projection and consumer fixture diffs,
  surrounding cache lifecycle/group/default/model/correlated implementations,
  shipped/website documentation diffs, package/build metadata, packed/docs test
  harness contracts and emitted declarations. This session changed **only this
  task record**. No source correction, root CHANGELOG edit, sibling edit, commit,
  or subagent. Commands were issued one at a time.
- **CLC-01 audit:** `interceptors.ts:519-555` frames base URL, URL, method,
  params, typed body, captured partition, redacted headers and response semantics
  in independent tuple positions. Credential bypass/partition capture and
  generation checks remain in the request/settlement lifecycle. The 16-case
  CLC-01 suite tests the exact two identities in both orders, concurrent tails,
  completed hits, detached copies, falsy/typed bodies and raw/decoded secret
  redaction. The assertions distinguish actual adapter identity and dispatch
  counts; they do not merely test the new encoding's shape. Acceptance supported.
- **CLC-02 audit:** adapter rejection now defers HTTP settlement sharing until
  Axios response-error transformation (`interceptors.ts:779-790,832-846`).
  Transform wrappers reject slots at the throw site, plain transport failures
  reject at dispatch, and finalize/dispose cover detached generations. Tails
  use identity transforms and their own config/status policy. The 19-case suite
  uses raw JSON with an adapter that really rejects by source policy, both policy
  orders, object/string shapes, four strict-parse callers and retry. Existing
  BND-02/03/04 coverage addresses single transforms and lifecycle settlement.
  No additional unresolved acceptance concern found.
- **CLC-03 / CLC-03-F01 audit:** stable key-only URLSearchParams sorting retains
  repeated order; recursively tagged ordinary objects cannot mimic special
  Date/URLSearchParams records (`cache-utils.ts:121-177`). Group equality is
  checked before the rollback-capable claim loop (`adapter.ts:388-449`). The
  15-case suite measures Axios query serialization and direct execution after
  rejected grouping. `mergeServiceParams` clones ordered params, replaces/deletes
  generated keys and delegates object merging to Axios at all **11** generated
  model/data/subdocument sites. Its 26 cases cover those sites, undefined option
  precedence, false/zero, immutable inputs, custom serialization and grouped
  per-entry options. Both tasks' acceptance is supported.
- **CLC-04 audit — blocker:** iterative ancestor-path accounting correctly
  bounds ordinary plain objects/arrays, expanded DAG work and depth before the
  recursive passes; capture and conversion have aggregate budgets. Existing
  92 cases exercise exact boundaries, seven-builder behavior through accompanying
  correlated suites, supplemental conversion, metadata mutation and HTTP/claim
  ownership. However, opacity is context-free: escaped request-shaped literal
  data and exposed request-shaped metadata bypass structural checks and detaching.
  The independent built-ESM probe below confirms both cases. **CLC-04 acceptance
  is not fully met; CLC-07-F01 is required**, despite the earlier green suite.
- **CLC-04-F01 audit:** constructor normalization and every selected default
  clone preflight through the shared traversal; defaults have no request-shaped
  exemption (`shared.ts:348-394`). Adapter factories check their effective
  shallow-merged defaults. The 65 cases cover six construction routes,
  depth/node/DAG/sparse boundaries, whole/merged budgets, frozen/request-shaped
  inputs, unsupported grammar, path errors, incremental reads and detached Dates.
  This separate default-bound acceptance remains supported.
- **CLC-05 audit:** reserved keys are collected before data forwarders; writes
  enter the data proxy, methods execute on their owner, fluent results remap to
  the wrapper, and returned reconciliation uses the module-private WeakMap.
  `then` is suppressed before any document-value access. Structural traps and
  assign key preflight prevent the documented shadow/replacement routes.
  Reviewed snapshot union of submitted/data keys, absence retention, draft
  identity, queued success/failure and returned-wrapper independence. The 41-case
  suite, seven corrected BND-07 cases, real-server projected PATCH assertion and
  strict fixtures cover the required contract. An additional CJS/ESM probe
  specifically checked extracted `set.call(other, ...)` and extracted `save()`:
  owner identity, fluent return, independent returned data, private queue write
  rejection and callable-then suppression all passed (exit 0).
- **CLC-06 / installed surface audit:** root named-only exports, bundled CJS/ESM
  and `.d.ts`/`.d.mts` conditions agree. Independently imported rebuilt CJS and
  ESM: exactly the same **13 named runtime exports**, no default/internal helpers.
  Both declarations retain Model/assign/reset/ModelData, cache, group/default and
  query-limit JSDoc; `Model.create` exposes `Model & ModelData`, constructor stays
  `Model`, and internal target lookup is absent. Reviewed strict consumer
  negatives, exact optional-field docs fixture, 58-block/15-fixture inventory
  contract, actual publisher transformation and 7-file workspace / 8-file
  release layouts. Historical BND-07 resolution is additive. Documentation is
  consistent with the intended contracts, but at the first review its literal/exposed
  metadata bound/detachment claim was contradicted by CLC-07-F01 (now resolved).
- **Fresh V2/V3 reused as authorized:** CLC-06's just-passed package gate remains
  **792 Node tests / 40 files + 10 built-ESM jsdom tests / 1 file**, including
  strict source/test/NodeNext/Bundler checks, packed-consumer, docs compilation
  and export inventory. Its `npm pack --dry-run --json` passed with **7 files,
  109,319 packed / 489,633 unpacked bytes**, and the release harness verifies
  **8 files**. No relevant client source/test/docs edits were made in this
  review or observed after that handoff; only this plan changed. Those passing
  gates are existing-suite evidence, **not proof against the new counterexample**.
  They must be refreshed after the follow-up changes runtime behavior.
- **V4, serial invocation results:**
  - `pnpm build` — **exit 0**, completed workspace build including client
    CJS/ESM/declarations. Vite native-config and large-chunk advisories were
    non-failing. Full output: tool log `tool_0e16983fe001JSghb9JN2nbf7n`.
  - `pnpm test` — **exit 1**, first failing package
    `@web-ts-toolkit/access-router`; its result was **4 files failed / 55 passed;
    10 tests failed / 787 passed / 15 skipped**. Exact ownership:
    `packages/access-router/test/export-contract.test.ts` (5 failures, missing
    emitted declarations / dist inventory), `strict-consumer-types.test.ts`
    (4 failures, missing declarations with TS7016 and cascading diagnostics),
    `packed-consumer-compatibility.test.ts` (1 failure, missing declarations in
    dist inventory), and `root-router.integration.test.ts` (suite setup failed:
    MongoDB port **38578** already in use; 15 skipped). The recursive runner
    reported `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`; the client gate was not reached.
    Output includes a subsequent message-service prebuild but no completed test
    result for it. Full output: `tool_0e175e78e001zsZmAHyYGG2PP5`.
    A post-run process check confirmed another session's `pnpm test` under
    `<repo-root>/_tmp/pdec06-v4-test.log` was active (PID 2442866 and descendants).
    Concurrent rebuilding is a plausible cause of missing declarations, not a
    proven code defect. This review's commands were serial; the workspace was
    not globally quiescent. No sibling repair or global-success claim is made.
  - `pnpm lint` — **exit 1**, **23 errors / 0 warnings**, all outside client
    scope: `_tmp-air07/f2e3c844fa1a713810db7916dc0f7386/sw.js:21` has one
    `no-undef` (`self`) error (temporary workspace artifact; creator not
    established); `packages/json-frame/test-decl-consumer/inference-contract.mts`
    has 22 errors: `no-empty-object-type` at 140:86 and 195:70/87/100, and
    `no-unused-vars` at 189,191,194,197,199,212,216,224,226,232,247,250,253,351,
    361,364,366,369. Owned by the json-frame fixture lane. Files preserved.
  - `git diff --check` — **exit 0**, whole tracked worktree.
- **Changed-file lint:** **exit 0, no warnings**, all 27 changed/new client TS
  source/test/consumer files, using this exact invocation:

  ```sh
  pnpm exec eslint packages/access-router-client/src/adapter.ts packages/access-router-client/src/correlated-brand.ts packages/access-router-client/src/correlated.ts packages/access-router-client/src/helpers.ts packages/access-router-client/src/interface.ts packages/access-router-client/src/model.ts packages/access-router-client/src/bounded-traversal.ts packages/access-router-client/src/query-traversal.ts packages/access-router-client/src/services/cache-utils.ts packages/access-router-client/src/services/data-service.ts packages/access-router-client/src/services/interceptors.ts packages/access-router-client/src/services/model-service.ts packages/access-router-client/src/services/request-config.ts packages/access-router-client/src/services/shared.ts packages/access-router-client/src/services/sub-ops.ts packages/access-router-client/test-decl-consumer/decl-consumer.strict.test.ts packages/access-router-client/test-typecheck/model-reserved-fields.ts packages/access-router-client/test-docs-consumer/examples/optional-fields-params.ts packages/access-router-client/test/access-router-client.arc21-projection-identity.integration.test.ts packages/access-router-client/test/access-router-client.bnd07-absent-fields.unit.test.ts packages/access-router-client/test/access-router-client.clc01-cache-keys.unit.test.ts packages/access-router-client/test/access-router-client.clc02-error-transforms.unit.test.ts packages/access-router-client/test/access-router-client.clc03-f01-params.unit.test.ts packages/access-router-client/test/access-router-client.clc03-grouped-config.unit.test.ts packages/access-router-client/test/access-router-client.clc04-f01-default-bounds.unit.test.ts packages/access-router-client/test/access-router-client.clc04-query-bounds.unit.test.ts packages/access-router-client/test/access-router-client.clc05-model-writes.unit.test.ts
  ```

- Final scoped whitespace and root checks (all exit 0):
  `git diff --check -- packages/access-router-client website/docs/packages/access-router-client docs/tasks/20260906-225058-access-router-client-boundary-review.md docs/tasks/20260926-215404-access-router-client-business-contracts.md`;
  `git diff --no-index --check /dev/null docs/tasks/20260926-215404-access-router-client-business-contracts.md`
  (explicitly checks this untracked task file);
  `git diff --exit-code HEAD -- CHANGELOG.md`. Tool logs referenced above are
  under `<tool-output>/`.
- First-review outcome (superseded by final sign-off below): scoped lint/build
  and existing V2/V3 passed, but the scoped acceptance audit failed on CLC-07-F01.
  CLC-07 was blocked for a separate correction agent, independently of unrelated
  workspace test/lint failures. That correction and renewed review are now complete.

Final Completion evidence (resumed independent review; acceptance **passed**):

- The original independent reviewer resumed CLC-07 as `in_progress` after the
  separate correction agent completed CLC-07-F01. Reviewed its complete evidence,
  actual `query-traversal.ts`, `bounded-traversal.ts`, `lazy-promise.ts`, correlated
  clone/freeze/conversion and helper changes, all 41 new regression cases, README
  clarification and rebuilt public declarations. No runtime/test/docs correction
  was needed in this review; only this task record changed in the workspace.
- Correction reasoning: live/structural context is propagated per container;
  `$escape` descendants and exposed-wire roots use structural mode. Ordinary
  `__op`/`__query` records cannot exempt themselves there, including callable
  copies. A module-private WeakSet preserves actual wrapped-request identity.
  Clone memoization is context-specific, freeze follows the same policy, and
  child-context selection is outside child loops. The iterative ancestor-path
  traversal still counts expanded DAG occurrences, primitive leaves and sparse
  slots, with the same aggregate budgets. Defaults retain their separate policy.
- Independent verification: `node <repo-root>/_tmp/clc07-signoff.mjs` exited 0 for
  **both CJS and ESM**. The probe repeats the two original counterexamples with
  controlled-error assertions, verifies exact 64-edge/10,000-visit literal
  acceptance and one-over rejection, supplemental list/count and exposed-metadata
  rejection, shared live/literal-context detachment, caller/output mutation
  isolation and live metadata refresh. Real requests with a cyclic property and
  a throwing enumerable graph getter remain opaque and unfrozen; descriptors
  remain inert. After rejected conversion, a normal nested `listAdvanced`
  subquery converts, and inner/nested/outer requests execute directly/grouped
  (zero dispatch during preparation, exactly three afterward). Both formats
  retain exactly **13 named runtime exports**, with no new internal/default export.
  An initial probe assertion incorrectly expected nested `$$sq` expansion from
  the existing raw-filter `countAdvanced` metadata path; corrected that temporary
  fixture to the supported `listAdvanced` nested-subquery path and its list
  response envelope, then reran the complete probe successfully. No package code
  changed for the probe.
- Rebuilt `.d.ts` and `.d.mts` retain the ModelData and query/default budget
  contracts. `QueryContext`, `validateQueryWireInputs`, `isWrappedLazyRequest`
  and the WeakSet are absent from public declarations. README's literal/wire
  clarification now agrees with the independently observed runtime behavior.

Final acceptance audit — **all 10 task items completed**:

| Item       | Independent acceptance conclusion                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLC-01     | Framed typed-body/identity keys, request-time partition capture, redaction and same-identity reuse supported by the original audit and current full package gate.                                             |
| CLC-02     | HTTP error sharing occurs after Axios transformation; per-caller settlement/config, strict-parse/transport cleanup and lifecycle behavior pass.                                                               |
| CLC-03     | Repeated-param order and special-value/plain-record distinctions preserved; invalid grouping rejects before claims and direct requests remain usable.                                                         |
| CLC-03-F01 | All 11 generated-param sites preserve ordered caller values, generated precedence, false/zero and object merging; group body/options parity passes.                                                           |
| CLC-04     | Ordinary and context-sensitive query structure now obey depth/expanded-work budgets; literal semantics, lazy ownership, seven builders and conversion detachment pass. Original blocker closed by CLC-07-F01. |
| CLC-04-F01 | Whole/effective defaults and per-request clones remain bounded, detached and precedence-correct; shared traversal context extension leaves default policy intact.                                             |
| CLC-05     | Absent/projected direct writes, reset/save reconciliation, queue/returned-wrapper independence, reserved/private-state writes, owner-bound methods and thenable suppression remain supported.                 |
| CLC-06     | Shipped docs, strict consumers, declarations and CJS/ESM exports agree with corrected runtime; compiled example inventory and historical BND-07 resolution remain valid.                                      |
| CLC-07-F01 | Both original failures independently retested; structural context closes ordinary-record opacity/detachment bypasses while real lazy requests and descriptors retain intended ownership.                      |
| CLC-07     | Independent implementation/evidence audit, fresh scoped gates, changed-file lint, whitespace, CHANGELOG preservation and truthful global-outcome disclosure satisfy final acceptance.                         |

- **Fresh corrected V2/V3 reused**, per user instruction: CLC-07-F01's
  `pnpm --filter @web-ts-toolkit/access-router-client test` passed **833 Node
  tests / 41 files + 10 built-ESM jsdom tests / 1 file = 843 tests / 42 files**,
  including transitive builds, source/test/strict NodeNext/Bundler typechecks,
  packed consumers, docs compilation, exports and integration suites.
  `npm pack --dry-run --json` passed with **7 files, 110,002 packed bytes,
  492,066 unpacked bytes**, no bundled dependencies; the release consumer gate
  verifies the separate **8-file** publisher-transformed layout. No relevant
  source/test/docs changes were made or observed after that fresh handoff.
- **Current changed-file lint:** exit 0, no warnings, all **29** changed/new
  client TS source/test/consumer files. Exact invocation:

  ```sh
  pnpm exec eslint packages/access-router-client/src/{adapter,correlated-brand,correlated,helpers,interface,lazy-promise,model,bounded-traversal,query-traversal}.ts packages/access-router-client/src/services/{cache-utils,data-service,interceptors,model-service,request-config,shared,sub-ops}.ts packages/access-router-client/test-decl-consumer/decl-consumer.strict.test.ts packages/access-router-client/test-typecheck/model-reserved-fields.ts packages/access-router-client/test-docs-consumer/examples/optional-fields-params.ts packages/access-router-client/test/access-router-client.{arc21-projection-identity.integration,bnd07-absent-fields.unit,clc01-cache-keys.unit,clc02-error-transforms.unit,clc03-f01-params.unit,clc03-grouped-config.unit,clc04-f01-default-bounds.unit,clc04-query-bounds.unit,clc05-model-writes.unit,clc07-f01-query-opacity.unit}.test.ts
  ```

- **Current whitespace/root checks:** `git diff --check` and
  `git diff --exit-code HEAD -- CHANGELOG.md` both exited 0. Explicit
  `git diff --no-index --check /dev/null <file>` checks passed for all 12
  untracked client source/test/fixture files and this task record, including
  the final task update. Root CHANGELOG remains untouched.
- **V4 retained exactly as observed**, not rerun to chase unrelated failures:
  workspace build **passed (exit 0)**; workspace test **failed (exit 1)** in
  `access-router` with **10 failed / 787 passed / 15 skipped, 4 failed files**
  (missing declarations and MongoDB port 38578 collision); workspace lint
  **failed (exit 1), 23 errors** (22 in the json-frame inference fixture and
  one in `_tmp-air07/.../sw.js`). Exact ownership and concurrent-session
  limitations remain in the first-review V4 evidence above. These are historical
  workspace outcomes, not a claim that the corrected whole workspace is green.
- Final disposition: **CLC-07 completed; all 10 items completed; no open scoped
  blocker or implementation follow-up.** Scope acceptance passes under the
  plan's explicit allowance for disclosed unrelated workspace failures. Prior
  pending/blocked handoff wording is historical and superseded by this sign-off.
  Commands were sequential; no nested agents, commits or unrelated edits.

### Task CLC-07-F01: End request opacity at literal and exposed-wire boundaries

Status: completed

Execution (correction-session history): fresh isolated session, no nested agents.
Dependencies were completed. Reproduced the reviewer counterexamples, preserved
the documented bounds and ran focused checks followed by fresh V2/V3 sequentially.
At correction handoff CLC-07 awaited independent sign-off; that review is now
completed in its Final Completion evidence above.

Kind: defect

Priority: P2 — cyclic/oversized query data bypasses promised preparation bounds;
converted payloads retain mutable caller references.

Suggested agent: fresh client query-boundary implementation session (not this reviewer)

Dependencies: CLC-04, CLC-04-F01, CLC-06; prerequisite for completing CLC-07

Primary ownership:

- `packages/access-router-client/src/query-traversal.ts`
- `packages/access-router-client/src/correlated.ts`
- `packages/access-router-client/src/helpers.ts`
- focused query-bound regressions and affected shipped docs/JSDoc if needed.

Finding / independent evidence:

- `query-traversal.ts:5-6,18-19` treats every object with `__op` and `__query`
  as opaque in **all** validation contexts. `correlated.ts:80-82` likewise
  returns such values by reference in every snapshot/wire clone.
  `helpers.ts:8-12` and `correlated.ts:479-500` reuse those rules after metadata
  becomes wire data; `$escape` contents never switch to a structural-literal mode.
- The existing query-bound tests at `clc04-query-bounds.unit.test.ts:168-175`
  use only small acyclic request-shaped literals. Cases at `198-207` mutate
  ordinary metadata filters, but never make the exposed metadata itself
  request-shaped. Thus both bypasses are missed by the passing 92-case suite.
- Independently reproduced against V4-rebuilt `dist/index.mjs` via
  `node --input-type=module -e '<probe below>'` (exit 0 confirms the defect):

  ```js
  import assert from 'node:assert/strict';
  import { createAdapter, parentField } from './packages/access-router-client/dist/index.mjs';
  let calls = 0;
  const adapter = createAdapter({
    baseURL: 'http://localhost',
    adapter: async () => {
      calls++;
      throw Error('unexpected HTTP');
    },
  });
  const service = adapter.createModelService({ modelName: 'Item', basePath: 'items' });
  const cyclic = { __op: 'literal', __query: {} };
  cyclic.self = cyclic;
  const escaped = service.listAdvanced({ literal: { $escape: cyclic } }).$include('items');
  assert.equal(escaped.filter.literal.$escape, cyclic);
  assert.throws(() => JSON.stringify(escaped), TypeError);
  const sub = service.countAdvanced({ active: true });
  const outer = service.listAdvanced({ id: parentField('_id'), count: sub });
  Object.assign(sub.__query, { __op: 'literal', __query: {} });
  sub.__query.self = sub.__query;
  const wire = outer.$include('items');
  assert.equal(wire.filter.count.$$sq, sub.__query);
  assert.throws(() => JSON.stringify(wire), TypeError);
  assert.equal(calls, 0);
  adapter.disposeCache();
  ```

Implementation requirements:

1. Distinguish live-request preparation from literal structure and exposed wire
   metadata. Preserve real request opacity before conversion, but prevent
   request-shaped ordinary records from exempting literal or exposed metadata
   from cycle/depth/expanded-visit checks. Apply the distinction coherently to
   validation, detaching, and freeze ownership; do not merely suppress the error.
2. Keep `$escape` semantically literal (no marker/descriptor/subquery rewriting).
   Plain literal containers must be bounded and detached. Preserve the documented
   inert-descriptor/live-request behavior without freezing caller-owned requests
   or recursively inspecting executors/services/config graphs.
3. Exposed `$$sq` metadata, including mutations after capture and nested
   request-shaped records, must consume the conversion aggregate budget and be
   detached on every conversion. Reject unsupported cycles/oversized data
   synchronously with `CorrelatedIncludeError`, before HTTP or execution claims.
4. Preserve 64-edge / 10,000-expanded-visit limits, ordinary shared DAG support,
   service-default grammar/budgets, seven builders, and direct/grouped parity.

Acceptance criteria / verification:

- Add failing-before/fixed-after cases for the two probes, plus 65-edge and
  10,001-visit structures hidden in request-shaped escaped/exposed data, including
  nested occurrences and supplemental list/count conversion. Check zero HTTP,
  controlled error class, and no claim/freeze side effects.
- Small acyclic request-shaped literals remain literal; post-capture caller
  changes and edits to one converted payload do not change later conversions.
  Ordinary live subqueries remain lazy, opaque before exposure, and usable
  directly/grouped after rejected conversion; existing descriptor/escape tests pass.
- Run V1 query-bound, default-bound, correlated unit/integration/filter-type and
  BND-10 suites; source/test typechecks and changed-file lint. Then V2/V3 (runtime
  changed) and scoped whitespace checks. Update docs if the clarified literal/wire
  contract needs explanation, then return to a fresh CLC-07 acceptance review.
- Preserve unrelated work, root CHANGELOG, and historical evidence; no commit.

Completion evidence:

- Changed files (this correction only):
  - `packages/access-router-client/src/query-traversal.ts`
  - `packages/access-router-client/src/bounded-traversal.ts`
  - `packages/access-router-client/src/lazy-promise.ts`
  - `packages/access-router-client/src/correlated.ts`
  - `packages/access-router-client/src/helpers.ts`
  - `packages/access-router-client/test/access-router-client.clc07-f01-query-opacity.unit.test.ts` (new)
  - `packages/access-router-client/README.md`
  - this task record.
- Implementation: query preparation now carries live versus structural context.
  `$escape` switches its descendants to structural context; rewritten wire
  validation and detachment start structural. Ordinary records cannot gain an
  exemption there through `__op`/`__query`, even when they copy callable request
  properties. An internal WeakSet records actual `wrapLazyPromise` instances,
  preserving their execution identity and opaque service/config/executor graphs;
  inert descriptors retain their existing brand/ownership behavior. Legacy
  request-shaped sources still work in live subquery positions. Clone memoization
  is context-specific; freezing follows the same context and only touches owned
  snapshots. The shared iterative traversal accepts optional child context;
  service-default grammar, limits and behavior are unchanged. README clarifies
  the ordinary-record boundary without changing the documented limits.
- Before fix:
  `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc07-f01-query-opacity.unit.test.ts`
  exited 1: **35 failed, 1 passed**. Both reviewer counterexamples reproduced:
  cyclic request-shaped escaped data and post-capture request-shaped exposed
  metadata were accepted. Hidden depth/work limits, nested occurrences,
  supplemental list/count and helper paths also bypassed checks; converted
  literals/metadata retained caller references. The actual-request/descriptor
  escape preservation control passed before the correction.
- Intermediate checks, recorded rather than hidden:
  - First follow-up run after implementation: **35 passed, 1 failed**. The
    grouped-execution fixture incorrectly recognized the group URL; corrected
    it to detect the actual array request body and return the grouped envelope.
  - First combined V1 after adding boundary/DAG/callable-copy cases:
    **292 passed, 2 failed** (7 files). Existing CLC-04 wide-input cases timed
    out because clone/freeze recomputed context with `Object.keys` per child.
    Moved context selection outside the child loop; no timeout or limit was raised.
    This was a correction-local regression, not attributed to concurrent builds.
  - First source/test/lint command passed both typechecks but lint reported
    **9 no-explicit-any errors** in the new test. Replaced them with concrete
    fixture types; final checks below pass.
- Required final V1:
  `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc07-f01-query-opacity.unit.test.ts test/access-router-client.clc04-query-bounds.unit.test.ts test/access-router-client.clc04-f01-default-bounds.unit.test.ts test/access-router-client.correlated-includes.unit.test.ts test/access-router-client.correlated-includes.integration.test.ts test/access-router-client.correlated-filter-types.unit.test.ts test/access-router-client.bnd10-defaults.integration.test.ts`
  exited 0: **7 files, 294 tests passed**, including **41 follow-up cases**,
  all **92 CLC-04** cases and **65 default-bound** cases. Existing suites retain
  seven-builder, descriptor/escape, nested include and direct/grouped integration
  coverage. New cases verify exact **64-edge / 10,000-visit** acceptance and
  rejection one beyond each boundary in request-shaped literal/exposed data,
  expanded DAG accounting, aggregate effective-args work, zero HTTP, no freezing
  or claims, and direct/grouped execution after rejection. Supported live nested
  subqueries still convert; actual requests and descriptors remain inert in
  escapes. Caller edits after literal capture and edits to one converted payload
  cannot change later captured conversions; live metadata edits are revalidated
  and detached afresh, without retroactively changing prior outputs.
- Final source/test/lint and focused follow-up check (after fixture typing):

  ```sh
  pnpm --filter @web-ts-toolkit/access-router-client typecheck:source && pnpm --filter @web-ts-toolkit/access-router-client typecheck:test && pnpm exec eslint packages/access-router-client/src/bounded-traversal.ts packages/access-router-client/src/query-traversal.ts packages/access-router-client/src/lazy-promise.ts packages/access-router-client/src/correlated.ts packages/access-router-client/src/helpers.ts packages/access-router-client/test/access-router-client.clc07-f01-query-opacity.unit.test.ts && pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.clc07-f01-query-opacity.unit.test.ts
  ```

  Exited 0: both typechecks passed, lint had no warnings, **1 file / 41 tests**
  passed. Subsequent full V2 also covers the final fixture and README edits.

- **Required fresh V2**, after runtime changes:
  `pnpm --filter @web-ts-toolkit/access-router-client test` exited 0. Transitive
  builds, client CJS/ESM/declarations, source/test and strict NodeNext/Bundler
  declaration checks all passed. Node Vitest: **41 files / 833 tests**; built-ESM
  jsdom: **1 file / 10 tests**; total **42 files / 843 tests**. This includes
  packed-consumer (actual release transformation, CJS/ESM fresh-install and strict
  consumers), docs.compile, exports, docs links and all client integration suites.
- **Required fresh V3:** `npm pack --dry-run --json` from
  `packages/access-router-client` exited 0: **7 files**, **110,002 packed bytes**,
  **492,066 unpacked bytes**, no bundled dependencies. Contents: `README.md`,
  `llms.txt`, `package.json`, `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`,
  `dist/index.d.mts`. V2's publisher-transformed consumer still verifies the
  separate 8-file release layout including LICENSE.
- Inspected both rebuilt declaration variants: existing query/default limit
  JSDoc and public signatures remain; `QueryContext`, traversal functions and
  `isWrappedLazyRequest` are absent from public declarations/exports. Additional
  `node --input-type=module -e '<inline CJS/ESM probe>'` exited 0: imported both
  built variants, asserted the existing exact 13-name runtime export inventory,
  repeated both reviewer probes above with `assert.throws(...,
CorrelatedIncludeError)`, removed the metadata cycle, and checked fresh wire
  ownership and mutation isolation. Both formats passed with zero HTTP and
  unfrozen live requests. No public API exports were added.
- Scoped whitespace/root checks (all exit 0):

  ```sh
  git diff --check -- packages/access-router-client docs/tasks/20260926-215404-access-router-client-business-contracts.md && git diff --no-index --check /dev/null packages/access-router-client/src/bounded-traversal.ts && git diff --no-index --check /dev/null packages/access-router-client/src/query-traversal.ts && git diff --no-index --check /dev/null packages/access-router-client/test/access-router-client.clc07-f01-query-opacity.unit.test.ts && git diff --no-index --check /dev/null docs/tasks/20260926-215404-access-router-client-business-contracts.md && git diff --exit-code HEAD -- CHANGELOG.md
  ```

- Execution/outcome: fresh isolated session, no nested agents or commits; all
  commands issued sequentially. No sibling files changed. Generated outputs were
  rebuilt only by package scripts. No concurrent-build interference occurred in
  these required gates; Vite's existing native-config advisory was non-failing.
  **The CLC-07-F01 structural-bound/detachment blocker is resolved.** This
  follow-up is completed. At that handoff CLC-07 awaited independent reviewer
  acceptance/sign-off, not an outstanding implementation fix. The resumed
  independent review has now completed CLC-07 (see its final evidence above).
  Its earlier unrelated V4 workspace test/lint failures remain historical and
  are not represented as passing global checks. No new independent follow-up
  finding was discovered in this correction.
