# Message Service Residual Workflow Health

Created: 2026-09-26 18:53:26 (local timestamp)

## Objective and business context

Make `packages/message-service` dependable as the shared plumbing for approvals,
requests, notifications, and payment-bearing workflows. Templates own business
decisions; this package owns persistence, authorization, retries, and the
created → acted-upon → archived lifecycle. Correct committed outcomes, continued
availability of legitimate actions, and safe public representations are the
highest-value gaps in that product contract.

Scope: package source, focused regressions, public types/README/DESIGN, packed
consumers, and narrowly necessary integration changes to `apps/nodejs`.
Do not edit the root `CHANGELOG.md`, manually edit generated `dist`, or overwrite
unrelated work. Existing access-router and other worktree changes were recorded
with `git status --short` before review and belong to another session.

## Analysis coverage and baseline

An isolated research agent inspected current package source/tests, metadata,
README/DESIGN, relevant website docs, the Node host, and these completed plans:

- [Original remediation](20260823-151605-message-service-review-remediation.md)
- [Boundary follow-up](20260912-095904-message-service-boundary-health-follow-up.md)

The coordinator also inspected the transaction helper, action read/claim/release
paths, and Node startup. Findings below concern uncovered paths rather than
reopening completed findings. The research agent ran current-source, in-memory
esbuild probes against a disposable MongoDB replica set and live HTTP server:
committed payment expiration after `endSession` rejection, denied-first-action
lockout, diagnostic/token leakage in successful replays, stale action reads,
mismatched read IDs, and populated-recipient false denial all reproduced.
Those temporary probes are analysis evidence; durable regressions are required.

No current full-suite baseline was run during analysis. Historical test counts
are not current verification. Production load, provider/network process death,
the full host domain authorization model, and minimum-peer-version certification
were not evaluated. Published metadata already has conditional ESM/CJS types;
retain and verify that contract rather than inventing new exports/subpaths.

## Execution and verification

- P1: demonstrated financial, authorization, disclosure, or workflow correctness
  defect. P2: contained integration correctness or usability improvement.
- Run the tasks below **sequentially**, with a **fresh isolated sub-agent for
  every task**, including the final reviewer. Never launch nested agents.
- Shared hotspots are `message-service.ts`, public exports, README/DESIGN, and
  integration tests. Each agent sets its task `in_progress` before work and
  appends `Completion evidence` with changed files, commands, results, and
  limitations before setting `completed`.
- Build/test processes must not overlap: package scripts rebuild shared `dist`.
- Preserve historical findings. New independent necessary work gets a uniquely
  numbered follow-up with requirements, dependencies, and verification.
- Contract changes need README/DESIGN migration notes, **not root CHANGELOG edits**.

Commands run from `<repo-root>` unless specified:

- **V1** focused tests: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/<actual-file>.test.ts` after dependency build when needed.
- **V2** package: `pnpm --filter @web-ts-toolkit/message-service test` (builds dependencies; includes real MongoDB and packed ESM/CJS/strict TypeScript consumers).
- **V3** hygiene: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` and `git diff --check`.
- **V4** final integration: `pnpm lint`, `pnpm build`, `pnpm test`, sequentially. Record unrelated failures precisely; do not repair other sessions' work. If a required acceptance criterion remains unverified, use `blocked`, not `completed`. Broad unrelated failures may be recorded as integration limitations when focused acceptance passes.
- **V5** host: `pnpm --filter org-access-nodejs-example typecheck` plus a real-MongoDB host smoke test using the repository Vitest configuration; record its exact command.

Prerequisites: installed dependencies, supported Node (>=22), MongoDB memory-server
binary, and the existing packed-consumer harness prerequisites. Defect regressions
should demonstrate fail-before/pass-after where feasible, without stashing or
reverting user changes. Use real transactions for persistence semantics.

## Tasks

### Task MSGR-01: Preserve committed transaction outcomes across cleanup failures

Status: completed

Kind: defect

Priority: P1 — confirmed successful payments are expired after a cleanup error.

Suggested agent: transaction/payment reliability specialist

Dependencies: none

Primary ownership: `packages/message-service/src/persistence.ts`, transaction callers and direct archival, focused payment/action tests, relevant public options/types/docs.

Finding: `runMessageTransaction` awaits `endSession()` in `finally`; rejection
overrides confirmed transaction success. The create caller compensates every
helper rejection. The probe left a committed active message and completed
reservation while expiring its payment session. The action caller likewise
tries to mark an already archived action retryable. This contradicts the earlier
MSGF-05 guarantee after the MSGF-12 shared helper extraction.

References: `src/persistence.ts:70-80` (`runMessageTransaction`);
`src/message-service.ts:1102-1106` (`persistPreparedBatchTransaction`),
`:1411-1415` (`archiveClaimedMessage`); `test/message-service.payment-compensation.test.ts:407-439` covers ordinary commit only.

Requirements:

1. Distinguish transaction failure from post-commit cleanup failure at the shared boundary. Preserve confirmed committed results and the primary failure when rollback and cleanup both fail.
2. Make cleanup errors observable through a narrowly scoped callback/event contract; observer failures must not alter the business outcome.
3. Audit direct document archival for the same classification and keep connection ownership intact.
4. Document diagnostics, option forwarding through routes, and ambiguous commit limitations; update packed contracts for public additions.

Acceptance criteria:

- Real-MongoDB paid commit plus cleanup rejection retains its payment and replays successfully.
- Action archive plus cleanup rejection remains committed and reaches its documented notification outcome; direct archive reports committed success.
- Rollback plus cleanup rejection preserves the primary error and compensates uncommitted sessions; observer failure cannot override outcomes.

Verification: V1 regression tests, V2, V3, packed public-contract checks within V2.

Completion evidence (MSGR-01, isolated sequential implementation session):

- Changed package files: `src/persistence.ts`, `src/message-service.ts`,
  `src/schemas/message.ts`, `src/route-factory.ts`, `src/index.ts`,
  `src/types/message.ts`, new `src/types/transaction.ts`,
  new `test/message-service.transaction-cleanup.test.ts`,
  `test/support/mongodb-fixture.ts`, `test/message-service.packed-consumer.test.ts`,
  `README.md`, and `DESIGN.md` (all under `packages/message-service/`).
- Resolution: the shared boundary preserves confirmed commits and primary
  transaction/callback errors across `endSession`/abort failures. Direct archive
  uses that boundary, retaining owning-connection and borrowed-session cleanup
  ownership. The optional root-typed `onTransactionCleanupFailure` observer
  reports operation/stage/error and committed/failed outcome, without allowing
  observer throws/rejections to change the result. Routes forward it and reject
  injection conflicts; schema configuration independently covers direct archive.
- Durable real-MongoDB coverage: 13 new cases cover paid commit/replay with absent,
  throwing, and rejecting observers; successful and failed sender notification
  after committed action archival; direct committed success; duplicate-key batch
  rollback and compensation of both payments; action/direct rollback with abort
  and cleanup rejection preserving exact primary error identity; real driver
  retry with final commit success/failure; borrowed-session reuse and connection
  isolation; and live HTTP construction/observer forwarding and replay.
- Fail-before evidence: after successful
  `pnpm --filter @web-ts-toolkit/message-service... build`,
  `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.transaction-cleanup.test.ts`
  failed **5/5 initial regressions** on the original implementation: committed
  create/direct archive rejected cleanup, action archival surfaced
  `ActionConflictError`, and rollback lost its MongoDB duplicate-key error.
  Expanded-test development also corrected two fixture mistakes (notification
  callback returned null; injected commit error lacked MongoDB error labels).
- V1 final command:
  `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.transaction-cleanup.test.ts test/message-service.payment-compensation.test.ts test/message-service.direct-archive.test.ts test/message-service.action-fencing.test.ts test/message-service.route-service-reuse.test.ts`
  — **49/49 tests, 5/5 files passed** (12.86 s).
- Builds: `pnpm --filter @web-ts-toolkit/message-service build` passed; both
  package-suite commands below rebuilt all five package/dependency projects
  successfully. Generated ESM/CJS declarations were inspected for exported
  diagnostic types, option JSDoc, and injection exclusions.
- V2 initial command: `pnpm --filter @web-ts-toolkit/message-service test`
  — **311 passed, 2 failed; 18 files passed, 2 failed** (116.38 s). Failures were
  existing 5000 ms test timeouts in `message-service.readme-contract.test.ts`
  (`exposes readonly registry views matching the freeze depth`) and
  `message-service.route-service-reuse.test.ts` (`applies auth-denial + input
validation identically on both composition paths`) during concurrent file
  execution; packed consumers passed in that run.
- V2 serialized rerun:
  `pnpm --filter @web-ts-toolkit/message-service test --no-file-parallelism`
  — **313/313 tests, 20/20 files passed** (154.39 s). This includes release-like
  tarball/manifest checks, installed ESM and CommonJS real-MongoDB cleanup flows
  for paid replay/action notification/direct archive, strict NodeNext ESM/CJS and
  Bundler declarations with `skipLibCheck: false`, observer/event narrowing and
  invalid-injection type checks, and the existing README/route packed consumers.
- V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` — passed,
  no output; `git diff --check` — passed, no output.
  `git diff --exit-code -- CHANGELOG.md` — passed, no root CHANGELOG changes.
- Execution: build/test/check commands ran sequentially; no agents spawned.
  Pre-existing and concurrently evolving unrelated work was preserved. No
  generated distribution files were edited manually. Only MSGR-01 status changed.
- Limitations/follow-up: default concurrent-file package execution hit the two
  recorded timing limits; full serialized acceptance passed without changing
  those tests or timeout policy. Ambiguous commit acknowledgements/process death
  still need host/provider reconciliation, as documented; observers are awaited
  and must be bounded. V4 workspace integration and V5 host checks belong to the
  later tasks and were not run here. No new independent implementation follow-up.

### Task MSGR-02: Release never-executed denied claims without locking action choice

Status: completed

Kind: defect

Priority: P1 — stale unauthorized requests can strand legitimate business decisions.

Suggested agent: action-state-machine/fencing specialist

Dependencies: MSGR-01

Primary ownership: `src/message-service.ts` action claim/release methods; action authorization/fencing regressions; lifecycle docs.

Finding: Authoritative authorization failure marks a first claim `retryable`
while preserving its `actionCd`. A replacement recipient cannot choose a
different action even though no handler ran; a changed template may not contain
that action at all. MSGF-02 tests only a legitimate same-action retry.

References: `src/message-service.ts:820-847` (`handleAction`), `:1232-1239`
(`claimAction`), `:1324-1331` (`markActionRetryable`);
`test/message-service.action-target-authz.test.ts:74-163`.

Requirements:

1. Distinguish a fresh claim that never executed a handler from a retry/takeover that may have prior effects.
2. Fenced release of the denied fresh claim restores action availability and clears only that claim's bookkeeping.
3. Preserve stable attempt identity and same-action restrictions for previously attempted work; never reset a newer owner's claim.
4. Update the documented release contract and existing regressions together.

Acceptance criteria:

- After stale recipient, role, condition, or template denial, a legitimate different action can commit (including a replacement template with different codes).
- Denial invokes no handler. Retry/takeover denial after earlier handler execution retains the attempt/action restriction.
- Release racing takeover cannot change replacement ownership; existing fencing and contention tests pass.

Verification: V1 real-MongoDB authorization/fencing tests, V2, V3.

Completion evidence (MSGR-02, fresh isolated sequential implementation session):

- Dependency: verified MSGR-01 is `completed`, inspected its shared transaction
  boundary and service call sites, and preserved its existing worktree changes.
  Its 13 real-MongoDB cleanup regressions pass in both focused and package runs.
- Changed: `packages/message-service/src/message-service.ts`,
  `packages/message-service/test/message-service.action-target-authz.test.ts`,
  `packages/message-service/README.md`, `packages/message-service/DESIGN.md`, and
  this task's status/evidence. All edits used `apply_patch`.
- Resolution: the successful atomic acquisition branch classifies claims as
  fresh versus retry/takeover. Authoritative pre-handler denial releases a fresh
  claim to `active`, resetting only action claim bookkeeping to `null` (with the
  normal update timestamp). The conditional update fences on message ID,
  `processing`, attempt ID, and owner token. Retry/takeover denial keeps the
  existing attempt/action restriction and uses the fenced retryable path.
  Lost ownership leaves the replacement untouched and reports the original
  authorization denial. README/DESIGN document this contract and migration;
  unknown-history older retryable/expired attempts are not automatically reset.
- Real-MongoDB acceptance: four separate stale-recipient/roles/condition/template
  regressions prove a legitimate different action commits exactly one archive
  without invoking the denied handler, including a replacement template with
  different codes. Recipient coverage checks preservation of all non-claim
  fields. Two earlier-execution cases cover retry and expired-lease takeover
  denial, same-action restriction, stable attempt reuse, and stale-worker
  failure fencing. A deterministic barrier race proves a fresh denied owner
  cannot release a replacement's processing claim; only that replacement
  executes and commits with its token and the retained attempt ID.
- Build prerequisite: `pnpm --filter @web-ts-toolkit/message-service... build`
  — passed, all five package/dependency builds.
- Fail-before command:
  `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.action-target-authz.test.ts --no-file-parallelism`
  — **3 failed, 7 passed** (9.86 s) before changing service behavior: recipient
  and template retained retryable bookkeeping; the different condition action
  raised `ActionConflictError`. At that point condition/roles shared one test,
  so the condition failure prevented the role portion; they are now separate.
  The pre-fix restriction/race preservation cases passed. Test development also
  corrected the full-record comparison to allow Mongoose's normal `updatedAt`.
- V1 final command:
  `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.action-target-authz.test.ts test/message-service.action-fencing.test.ts test/message-service.mongodb.test.ts test/message-service.transaction-cleanup.test.ts --no-file-parallelism`
  — **56/56 tests, 4/4 files passed** (55.23 s), including existing fencing,
  contention, real transactional lifecycle, and MSGR-01 cleanup coverage.
- V2 command:
  `pnpm --filter @web-ts-toolkit/message-service test --no-file-parallelism`
  — all five package/dependency builds passed; **317/317 tests, 20/20 files
  passed** (Vitest 253.67 s). Includes packed ESM/CommonJS runtime, strict
  TypeScript consumers, README contracts, and transaction-cleanup contracts.
- V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"`,
  `git diff --check`, and `git diff --exit-code -- CHANGELOG.md` — all passed,
  no output. Reviewed the scoped diff to confirm MSGR-01 additions remain intact.
- Execution: build, focused tests, full package tests, and hygiene commands ran
  serially. No agents spawned; unrelated work was preserved, with no stash,
  revert, root CHANGELOG edits, or manual generated-output edits.
- Limitations/follow-up: used serialized test files as requested for the recorded
  default-file-parallel timeout flakiness; no timing-policy changes. V4 workspace
  integration and V5 host checks belong to later tasks and were not run here.
  No new independent follow-up; MSGR-03 through MSGR-06 remain pending.

### Task MSGR-03: Define a safe public message representation

Status: completed

Kind: defect

Priority: P1 — successful responses disclose raw diagnostics and worker tokens.

Suggested agent: HTTP serialization/public-contract specialist

Dependencies: MSGR-02

Primary ownership: new package response DTO/serializer, `src/route-factory.ts`, public exports, host `apps/nodejs/src/messages.ts` list adapter, HTTP/packed tests, docs.

Finding: Create routes and host lists return hydrated documents directly.
Completed replays can contain raw handler/notification diagnostics and
`actionOwnerToken`. Live HTTP probes reproduced both synthetic secret markers
in 200 responses. MSGF-09 protected failure responses, not these success paths.

References: `src/route-factory.ts:387-398`; `src/message-service.ts:1328-1329`,
`:1432-1434`; `src/schemas/base.ts:43-53`; `src/schemas/message-archive.ts:30-41`;
`apps/nodejs/src/messages.ts:449-459`.

Requirements:

1. Introduce an explicit public representation and reusable serializer at HTTP boundaries, including fresh/replayed create and host listing.
2. Exclude raw diagnostics, ownership tokens, internal leases/request bookkeeping, and arbitrary populated-user internals. Define the allowed fields explicitly; preserve necessary message content, attachments, parties, and documented business payment fields. Arbitrary host payload/content remains host-controlled business data, not automatically sanitized.
3. Preserve direct-service hydrated records and internal diagnostics for operations. Keep intentional authorized attempt-ID/error-result contracts coherent.
4. Add root-exported types/helper documentation and packed consumer assertions; document changed HTTP representation.

Acceptance criteria:

- Fresh, active-retryable, and archived-notification-failed HTTP responses contain useful public content/identifiers but no synthetic diagnostic/token markers.
- Serializer/list integration handles populated parties without disclosing user secrets; tests verify internal records retain diagnostics.
- Runtime, DTO declarations, README examples, and installed imports agree.

Verification: V1 HTTP/serializer regressions, V2, V3; host typing via V5.

Completion evidence (MSGR-03, fresh isolated sequential implementation session):

- Dependency: verified MSGR-01 and MSGR-02 are `completed`; preserved their
  transaction, claim-release, route-option, documentation and regression changes.
  Set only MSGR-03 `in_progress` before implementation. No agents spawned.
- Changed: new `packages/message-service/src/public-message.ts`; package
  `src/index.ts`, `src/route-factory.ts`, `README.md`, `DESIGN.md`,
  `test/message-service.packed-consumer.test.ts`; new package tests
  `test/message-service.public-message.test.ts` and
  `test/message-service.host-public-list.test.ts`; `apps/nodejs/src/messages.ts`;
  and this task's status/evidence. All edits used `apply_patch`.
- Resolution: root-exported `serializePublicMessage`, `PublicMessageDto`,
  `PublicMessageParty`, and `PublicMessageSource` define an explicit allowlist
  shared by fresh/replayed create HTTP responses and the shipped host list.
  Content, attachments, parties/roles, payload/display, paymentCd/paymentSession,
  business lifecycle fields and intentional attempt IDs remain available. IDs
  become strings and timestamps ISO strings. Archives add terminal metadata and
  notification state. Diagnostics, worker tokens, claim/lease/request bookkeeping,
  notification attempt timestamps, version keys and arbitrary extensions do not
  cross the boundary. Populated parties retain only ID and string displayName/email;
  attachments/archivedBy reduce to IDs. Host population now explicitly supplies
  `UserModel`, required because the package's base references are generic.
- Five new real-MongoDB regressions cover live fresh/replayed creation, failed
  handler → active retryable replay with stable attempt ID, committed archive →
  failed sender notification replay with the existing 202 attempt-ID contract,
  broadly populated party secrets/plain-record extensions, and the actual shipped
  Node host list router. Assertions verify useful business content/payment fields,
  attachment IDs, absence of synthetic diagnostic/token/user-secret markers and
  bookkeeping, and retention of hydrated direct-service methods and stored raw
  diagnostics. The serializer does not mutate operational records.
- Packed consumers check root runtime imports in ESM/CommonJS, populated/archive
  serialization, retained hydrated records, root DTO/source/party declarations in
  strict NodeNext ESM/CommonJS and Bundler with `skipLibCheck: false`, and negative
  type checks for private fields. The actual README `publicInbox` example is
  extracted and compiled. Generated `.d.ts`/`.d.mts` exports/JSDoc were inspected;
  release-like tarball/manifest checks pass. README/DESIGN document migration,
  the complete allowlist and host-controlled payload/display/text/action results.
- Build prerequisite: `pnpm --filter @web-ts-toolkit/message-service... build`
  passed all five package/dependency builds. Initial focused run: 9 passed,
  5 failed (120.09 s): two population configuration failures fixed as above and
  three packed failures from missing staged declarations while other sessions'
  root builds/tests were rewriting shared `dist`. Observed those processes and
  waited for them to exit without terminating or modifying their work.
- V1 final command:
  `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.public-message.test.ts test/message-service.host-public-list.test.ts test/message-service.packed-consumer.test.ts --no-file-parallelism`
  — **14/14 tests, 3/3 files passed** (258.12 s). This includes the real-MongoDB
  host-list smoke test. An intermediate run passed 13/14 but exceeded the packed
  strict-consumer test's 60-second limit (70.31 s, no compiler errors).
- V2 requested command:
  `pnpm --filter @web-ts-toolkit/message-service test --no-file-parallelism`
  ran twice: each **321 passed, 1 failed; 21 files passed, 1 failed**. First
  (437.20 s) exceeded the same packed compiler timeout (66.41 s); that expanded
  integration test now has a bounded 120-second timeout, matching adjacent packed
  integration tests. Second (469.98 s) passed packed checks but hit the existing
  5-second `replay-coherence` test limit (`replays with some batch items archived
without rerunning preparation`, 5.13 s).
- V2 final command:
  `pnpm --filter @web-ts-toolkit/message-service test --no-file-parallelism --testTimeout=15000`
  — all dependency/package builds passed; **322/322 tests, 22/22 files passed**
  (447.65 s). The command-line default timeout accommodates the observed runtime
  contention; no assertions were weakened or unrelated replay-test source edited.
  Includes MSGR-01/02 regressions and all installed-consumer checks.
- V3/V5: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"`,
  `pnpm --filter org-access-nodejs-example typecheck`, `git diff --check`,
  `git diff --exit-code -- CHANGELOG.md`, and
  `pnpm exec eslint apps/nodejs/src/messages.ts` — all passed. Commands launched
  by this session ran sequentially. No stash/revert, root CHANGELOG edit or manual
  generated-output edit; unrelated work remains preserved.
- Limitations/follow-up: no new independent implementation follow-up. MSGR-06
  should retain the recorded standard-timeout/shared-build contention evidence
  when running integrated checks. MSGR-04/05/06 remain pending; this host smoke
  covers listing, while transactional host startup/create/action belongs to
  MSGR-05. V4 full-workspace verification belongs to MSGR-06.

### Task MSGR-04: Authorize action reads and archived outcomes from persisted identities

Status: completed

Kind: defect

Priority: P1 — stale supplied documents disclose actions or archived outcomes after persisted authorization changes.

Suggested agent: authoritative-read/Mongoose relationship specialist

Dependencies: MSGR-03

Primary ownership: `getActions`, archived `handleAction` branch, relationship helpers, focused read authorization tests and affected existing tests/docs.

Finding: `getActions` trusts `options.message` without checking its identity or
freshness; an unrelated requested ID still returns that copy's actions. The
direct archived mutation branch also authorizes the supplied archive. Separately,
relationship methods stringify populated documents, denying legitimate parties.
MSGF-02 repaired active mutation claims, not these read paths.

References: `src/message-service.ts:715-755`, `:787-800`;
`src/schemas/methods.ts:19-25`; `test/message-service.rendering-separation.test.ts:147-191`;
`test/message-service.test.ts:453-538`.

Requirements:

1. Read authoritative stored state for user-facing action listings and archived outcomes. Remove or deprecate/redefine supplied-document shortcuts without treating ID equality as freshness.
2. Bind queries to the requested ID and configured owning connection; preserve principal-before-effects checks.
3. Authorize canonical stored identities before presentation population, or consistently normalize supported populated identities. Missing populated references must not create grants.
4. Keep trusted find APIs explicit and document snapshot-time guarantees, option migration, and action condition population semantics.

Acceptance criteria:

- Stale recipient/roles/template/condition/archive copies and mismatched IDs cannot reveal actions/outcomes authorized only by the copy.
- Legitimate populated sender/receiver cases work; deleted/missing users fail closed as appropriate.
- Admin/archive listings skip predicates; active mutations retain atomic claim authorization and fencing.

Verification: V1 real-MongoDB negative/positive read and archive regressions, V2, V3, packed checks for changed public signatures.

Completion evidence (MSGR-04, fresh isolated sequential implementation session):

- Dependencies: verified MSGR-01/02/03 are `completed`, read their evidence and
  inspected the current transaction, claim/release, relationship and public
  contracts. Preserved those implementations; their regressions pass in V2.
  Set only MSGR-04 `in_progress` before implementation; no agents spawned.
- Changed under `packages/message-service/`: `src/message-service.ts`,
  `src/schemas/methods.ts`, `src/types/message.ts` (relationship JSDoc), new
  `test/message-service.authoritative-reads.test.ts`, affected
  `test/message-service.rendering-separation.test.ts`,
  `test/message-service.test.ts`, `test/message-service.packed-consumer.test.ts`,
  `README.md`, and `DESIGN.md`. Task-file edits affect only this status/evidence.
- Resolution: `getActions` always reads the requested ID through the configured
  store; the deprecated `message` option remains type-compatible but is ignored.
  Canonical stored parties/roles authorize before optional presentation
  population. Eligible active conditions receive the populated read snapshot;
  admin/archive listings skip population and predicates. Archived `handleAction`
  re-reads the archive by ID on its owning connection, preserving resolver/source
  consistency checks. Direct and claim-fallback outcomes share the authoritative
  relationship gate and current attempt/notification result. Missing direct
  archives throw `MessageNotFoundError`. Principal-before-effects and atomic
  mutation authorization, denied-claim release and owner fencing are preserved.
- Real-MongoDB coverage: 14 new cases exercise changed recipient/sender/roles,
  template and condition payload; unrelated/missing IDs and foreign-connection
  supplied copies; current template/label rendering; stale active/archive copies;
  admin/archive predicate skipping; stale archived party/role denial without
  attempt disclosure; changed notification/attempt outcomes without a template;
  archive deletion; populated sender/receiver identity and successful mutation;
  missing/deleted/projected-away references; explicit role grants; authorization
  before population; populated pre-check followed by unpopulated atomic-claim
  denial; connection isolation; and invalid principals before reads/effects.
- Contract: relationship helpers normalize string/ObjectId and populated `_id`
  without arbitrary object stringification or missing-reference matches. Stored
  IDs remain authoritative independently of presentation account lookup; host
  authentication/revocation owns account liveness. README/DESIGN document this,
  snapshot-time guarantees, trusted find APIs, option migration, missing archive
  errors, and condition population versus unpopulated mutation semantics.
- Build prerequisite: `pnpm --filter @web-ts-toolkit/message-service... build`
  passed all five dependency/package builds.
- Fail-before/pass-after command:
  `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.authoritative-reads.test.ts --no-file-parallelism --testTimeout=15000`
  — **14/14 failed** before implementation (21.24 s), **14/14 passed** after
  implementation (30.95 s). Subsequent assertions added archive-list and
  projected-away-ID checks, covered by the final focused and full runs.
- V1 command:
  `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.authoritative-reads.test.ts test/message-service.action-target-authz.test.ts test/message-service.action-fencing.test.ts test/message-service.rendering-separation.test.ts test/message-service.principal-validation.test.ts test/message-service.test.ts --no-file-parallelism --testTimeout=15000`
  — initial **134 passed, 1 failed** (55.20 s): an existing archived unit test
  supplied no stored archive. Updated its lookup fixture for the new contract;
  final **135/135 tests, 6/6 files passed** (61.36 s).
- V2 command (three sequential runs):
  `pnpm --filter @web-ts-toolkit/message-service test --no-file-parallelism --testTimeout=15000`
  — all dependency/package builds passed each time. First: **335 passed,
  1 failed** (471.80 s), duplicate `InterpolatedAction`/`UiTemplate` imports in
  the expanded Bundler consumer fixture; fixed with import aliases. Second:
  **335 passed, 1 failed** (354.21 s), MongoDB startup port `37922` already in use
  in the existing README create/action test; no implementation/test-policy change.
  Final: **336/336 tests, 23/23 files passed** (289.08 s).
- Packed acceptance within V2: release-like manifest/tarball checks, installed
  ESM/CommonJS real-MongoDB stale-read/archive/identity checks, retained cleanup
  and public-DTO flows, strict NodeNext ESM/CommonJS and Bundler consumers with
  `skipLibCheck: false`, and README consumers pass. Both emitted declaration
  formats retain deprecation, relationship and population JSDoc (inspected and
  asserted in the packed manifest test).
- V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"`,
  `git diff --check`, and `git diff --exit-code -- CHANGELOG.md` — all passed,
  no output. Reviewed source/test/docs diffs for preservation of prior work.
  Final whitespace checks also passed for the untracked regression/task files:
  `git diff --check && git diff --no-index --check -- /dev/null packages/message-service/test/message-service.authoritative-reads.test.ts && git diff --no-index --check -- /dev/null docs/tasks/20260926-185326-message-service-residual-workflow-health.md`.
  All build/test/check commands ran serially; all edits used `apply_patch`.
  No stash/revert, root CHANGELOG edits, or manual generated-output edits.
- Limitations/follow-up: no new independent implementation follow-up. MSGR-05
  host lifecycle and MSGR-06 workspace integration remain pending. Retain the
  recorded transient MongoDB port collision and existing environment-load timing
  evidence for MSGR-06; this session used the requested 15-second default timeout
  without changing package timeout policy. V4/V5 were not separately run here.

### Task MSGR-05: Make the shipped host support the documented lifecycle

Status: completed

Kind: defect

Priority: P2 — demo endpoints cannot fulfill transactional action/idempotency contracts.

Suggested agent: Node host integration specialist

Dependencies: MSGR-04

Primary ownership: `apps/nodejs/src/index.ts`, message model registration, focused host lifecycle smoke tests, minimal host docs.

Finding: The example starts standalone `MongoMemoryServer` and registers only
active/archive models. Successful action handlers run before required archival
transactions fail; `clientRequestId` cannot resolve MessageRequest. The package
README correctly documents prerequisites that this host does not supply.

References: `apps/nodejs/src/index.ts:2,10-11`; `apps/nodejs/src/messages.ts:403-411,430-435`;
`src/message-service.ts:869-875,1752-1763`; `README.md:105-107,298-310`.

Requirements:

1. Start the example on a replica set; preserve orderly startup/shutdown cleanup.
2. Register MessageRequest using package constants/factories alongside active/archive models.
3. Add an actual host registration/router smoke test with real MongoDB, exercising authenticated create/replay/action and public list serialization.
4. Keep host domain redesign and unrelated access-router work out of this task.

Acceptance criteria:

- The default development database supports transactions.
- Host creation with one scoped request ID replays one batch; POST action commits exactly one archive and removes the active record.
- Public listing uses MSGR-03 representation; host typecheck and focused smoke tests pass.

Verification: V5; V2 only if package implementation changes; lint touched host files and `git diff --check`.

Completion evidence (MSGR-05, fresh isolated sequential implementation session):

- Dependencies/context: read the shared objective, verification rules and
  MSGR-01..04 completion evidence; confirmed MSGR-04 is `completed`. Inspected
  MSGR-03's `message-service.host-public-list.test.ts`, host registration/router,
  login/session flow, public request schema/constants, and HTTP runtime cleanup
  contract. Set only MSGR-05 `in_progress` before implementation; no agents spawned.
- Changed: `apps/nodejs/src/index.ts`, new `apps/nodejs/src/server.ts`,
  `apps/nodejs/src/messages.ts`, new `apps/nodejs/test/message-lifecycle.test.ts`,
  `apps/nodejs/README.md`, and this task's status/evidence. All edits used
  `apply_patch`; MSGR-03's existing list serializer/population edits are retained.
- Resolution: the shipped entry point calls the tested `startExampleServer`,
  which starts a one-member WiredTiger `MongoMemoryReplSet`, connects Mongoose,
  registers/seeds the actual host and awaits HTTP readiness. Graceful shutdown
  drains HTTP before disconnecting Mongoose and stopping the replica set, with
  memoized resource cleanup and `finally` ensuring replica-set stop is attempted
  after disconnect rejection. Startup/listen failures explicitly clean up;
  combined startup/cleanup failures retain both errors. The entry point reports
  startup rejection and sets a failing exit code after cleanup.
- Registration: `registerMessageModels` now includes
  `MESSAGE_REQUEST_MODEL_NAME` / `buildMessageRequestSchema` from the public
  package alongside active/archive factories; repeat registration retains the
  compiled model. Host README documents database ownership, authentication,
  scoped first-payload replay, public lists, terminal actions, and the exact smoke
  command. Host domain permissions/workflow design were not changed.
- Real-host acceptance: the new test starts the shipped server and seeded app,
  confirms MongoDB replica-set identity, logs in through `/api/auth/login`, and
  verifies real session resolution. Missing/invalid sessions cannot create a
  reservation. Authenticated creation/replay keeps one active record and one
  completed reservation with the public schema's unique scope index. The same
  key under a different user/template creates distinct batches; an announcement
  fans out to multiple messages and replays exactly the same batch. Anonymous
  and unrelated-user actions fail; the receiver action commits one archive,
  removes the active record and preserves the handler's `read: true` mutation.
  Repeated action returns the existing HTTP 410 contract without changing the
  archive; creation replay returns that archive. Live lists preserve populated
  public parties/content while excluding synthetic diagnostic, token, request
  and user-secret markers; stored diagnostics/user secrets remain intact.
- Lifecycle regressions additionally use real replica sets to prove an occupied
  HTTP port rejects with `EADDRINUSE` and stops/disconnects owned resources, and
  shutdown closes HTTP before disconnect, stops the replica set even when real
  disconnect is followed by an injected rejection, and runs cleanup only once
  across repeated shutdown calls. MSGR-03's original host-list test also passes.
- V5: `pnpm --filter org-access-nodejs-example typecheck` — passed (initial and
  final runs). Exact smoke command:
  `pnpm exec vitest run --config vitest.config.ts apps/nodejs/test/message-lifecycle.test.ts packages/message-service/test/message-service.host-public-list.test.ts --no-file-parallelism --testTimeout=15000`
  — final **4/4 tests, 2/2 files passed** (20.41 s). An earlier passing run took
  17.67 s. Two development runs each had 3 passed/1 failed: assertions incorrectly
  expected a wrapped create result and HTTP 200 for a repeated archived action;
  corrected to the existing bare-array/HTTP 410 contracts. These were test
  fixture expectations, not fail-before implementation evidence.
- Hygiene: `pnpm exec eslint apps/nodejs/src/index.ts apps/nodejs/src/server.ts apps/nodejs/src/messages.ts apps/nodejs/test/message-lifecycle.test.ts`
  — passed after adding the caught cleanup error as the aggregate's `cause` to
  satisfy `preserve-caught-error`. `git diff --check`,
  `git diff --exit-code -- CHANGELOG.md`,
  `git diff --no-index --check -- /dev/null apps/nodejs/src/server.ts`, and
  `git diff --no-index --check -- /dev/null apps/nodejs/test/message-lifecycle.test.ts`
  — passed. Scoped diff review confirms preservation of MSGR-03 list changes.
- Execution/limitations: commands ran sequentially against available built
  workspace dependencies. No package code changed, so V2 was not rerun (MSGR-04
  records the last 336-test serialized/15-second run). Vitest emits the existing
  future-native-config warning for root `vitest.config.ts`; tests pass. No stash,
  revert, root CHANGELOG edit, or manual distribution edit; MSGR-01..04 and
  unrelated access-router/other work remain preserved. No new independent
  implementation follow-up. MSGR-06 remains pending for independent integration
  review and V4 workspace verification.

### Task MSGR-06: Independently verify integrated contracts and task completion

Status: completed

Kind: investigation

Priority: P1 — independent acceptance review of financial and authorization fixes.

Suggested agent: fresh integration reviewer (not any implementation session)

Dependencies: MSGR-01, MSGR-02, MSGR-03, MSGR-04, MSGR-05

Primary ownership: this task file, focused acceptance review, minimal corrections discovered by review (record additions explicitly).

Finding: Shared service, serialization, type, and host changes require integrated
review beyond individual passing tests.

References: all MSGR-01 through MSGR-05 acceptance criteria and changed files.

Requirements:

1. Review each acceptance criterion against code and runtime/packed evidence; ensure docs, public types, and implementation agree.
2. Inspect alternate archived/direct/HTTP paths, populated identities, transaction cleanup, and ownership release races.
3. Run V2/V3 and V4 sequentially, plus host acceptance as necessary. Record exact failures and distinguish pre-existing unrelated work from this scope. Avoid repeating checks already current unless review changes justify it.
4. Verify the root CHANGELOG was not changed, every implementation task has completion evidence, and deferrals retain rationale. Add bounded follow-up items for material new defects instead of hiding scope in a completion note.

Acceptance criteria:

- Every implementation task's requirements are supported by passing focused evidence; no scope-owned integration regression remains.
- Packed ESM/CJS/strict consumers and the actual host workflow pass.
- Full-workspace checks have recorded outcomes and any unrelated failures are explicit; all task statuses truthfully reflect the results.

Verification: V2, V3, V4, V5/evidence review as above.

Completion evidence (MSGR-06, fresh independent review session):

- Ownership/context: read this entire plan, every MSGR-01..05 completion record,
  the requested `the task-as-you-go skill`,
  and the workspace `ai-friendly-ts-package` skill. Confirmed all dependencies
  completed and set MSGR-06 `in_progress` before review. Inspected the original
  MSG-07 connection-ownership requirements and relevant boundary-plan history
  when checking compatibility. No agents spawned.
- Review outcome: **scope acceptance passes; no material new independent defect
  found and no implementation correction required.** Compared all MSGR-01..05
  requirements/criteria with scoped diffs, current source, durable regression
  assertions, README/DESIGN, host documentation, and emitted declarations.
  Historical fail-before evidence remains attributed to the implementation
  sessions; this reviewer independently ran the current acceptance below.
- MSGR-01 requirements 1–4 / all criteria: inspected `runMessageTransaction`,
  both service callers and direct schema archival. Confirmed transaction success
  is classified before owned-session cleanup, primary callback errors survive
  abort/cleanup rejection, callback-error tracking resets on driver retry, and
  observers cannot replace outcomes. Direct archival borrows attached sessions
  without ending them and retains owning-connection transactions. The 13 real-
  MongoDB cleanup regressions exercise paid commit/replay without expiration,
  both notification outcomes, direct commit, actual rollback/compensation,
  primary-error identity, throwing/rejecting observers, retries, borrowed-session
  reuse, and route forwarding/conflict rejection. All pass in current V2.
  Public observer/event types, independent schema/service configuration, awaited
  observer limitations and ambiguous-commit caveats agree with implementation.
- MSGR-02 requirements 1–4 / all criteria: checked fresh classification against
  the successful atomic acquisition branch, not the supplied snapshot. Fresh
  denied release clears only claim bookkeeping; retry/takeover denial preserves
  stable attempt/action identity. Both updates fence on ID, processing state,
  attempt and owner. Inspected deterministic takeover barriers and assertions
  that the denied owner leaves replacement ownership unchanged. Recipient,
  roles, condition and replacement-template cases prove a different legitimate
  action commits with no denied handler execution; earlier-effect retry/takeover
  cases retain restrictions. These and existing fencing/contention tests pass
  in V2. README/DESIGN accurately retain conservative handling of legacy attempts.
- MSGR-03 requirements 1–4 / all criteria: traced fresh and replayed create routes
  and the actual host list through `serializePublicMessage`. Reviewed every DTO
  field against active/archive schemas: content, attachment/party identifiers,
  payment fields, attempt correlation, ISO timestamps and archive-only metadata
  are retained; diagnostics, owner tokens, request/lease bookkeeping, populated
  user secrets and arbitrary extensions are excluded. HTTP and populated/plain
  record assertions also verify hydrated methods and internal diagnostics remain
  intact. V2 includes all five new serializer/host-list cases and packed runtime/
  strict-type checks. Host-controlled payload/display/text/action results remain
  explicitly outside recursive sanitization; archive terminal detection uses
  `archivedAt`, as documented.
- MSGR-04 requirements 1–4 / all criteria: traced `getActions` through requested-
  ID configured-store reads and authorization before population; the deprecated
  supplied copy is ignored. Reviewed direct archived and stale-active claim-
  fallback outcomes, canonical/populated identity normalization, role grants,
  missing references, principal-before-effects and predicate skipping. The 14
  real-MongoDB authoritative-read cases and packed ESM/CJS cases pass in V2,
  including foreign copies, stale party/role/template/condition/archive state,
  deleted archives and current notification/attempt results. Document-originated
  operations retain the original MSG-07 document-owning-connection precedence;
  explicit resolver/source disagreement rejects. This is distinct from
  `getActions`, whose ignored supplied copy cannot redirect its configured read.
  Snapshot-time and populated-list/unpopulated-mutation condition contracts match
  source, README/DESIGN and both declaration formats.
- MSGR-05 requirements 1–4 / all criteria: inspected actual entry point,
  `startExampleServer`, model registration, session/router integration and
  `express-runtime` readiness/shutdown implementation. Real host smoke confirms
  replica-set identity, MessageRequest registration/index, authentication,
  scoped single/batch replay, exactly one terminal archive with active removal,
  repeated-action 410 and serialized public listing. Real listen-failure and
  shutdown tests verify resource cleanup, HTTP-before-database ordering,
  replica-set stop after disconnect rejection and memoized repeated shutdown.
  Host docs accurately explain terminal actions and first-payload replay.
- Installed-consumer review: package root named exports and bundled ESM/CJS
  build entries align with conditional `.d.mts`/`.d.ts` resolution. Inspected
  emitted DTO/source/party declarations, cleanup diagnostic discriminant/JSDoc,
  getActions deprecation/population JSDoc and injection exclusions. V2 verifies
  release-transformed tarball files/metadata, installed module-name imports,
  strict NodeNext ESM/CommonJS and Bundler (`skipLibCheck: false`), actual README
  examples and real installed runtime flows. Secondary website docs were checked
  for contradictory guidance; they are less detailed than the shipped README
  and do not replace its migration contract. No export/type discovery blocker.
- V2, independently executed:
  `pnpm --filter @web-ts-toolkit/message-service test --no-file-parallelism --testTimeout=15000`
  — all five dependency/package builds passed; **336/336 tests, 23/23 files
  passed**, Vitest **290.31 s** (21:02:29 start). This retains the previously
  recorded serialization/15-second timeout accommodation without weakening
  assertions or changing package policy.
- V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` and
  `git diff --check` — passed. Host lint:
  `pnpm exec eslint apps/nodejs/src/index.ts apps/nodejs/src/server.ts apps/nodejs/src/messages.ts apps/nodejs/test/message-lifecycle.test.ts`
  — passed. `git diff --exit-code HEAD -- CHANGELOG.md` — passed (checks staged
  and unstaged changes against HEAD); root CHANGELOG remains untouched.
- V5: `pnpm --filter org-access-nodejs-example typecheck` — passed. Exact smoke:
  `pnpm exec vitest run --config vitest.config.ts apps/nodejs/test/message-lifecycle.test.ts packages/message-service/test/message-service.host-public-list.test.ts --no-file-parallelism --testTimeout=15000`
  — **4/4 tests, 2/2 files passed**, **15.86 s**. Existing Vite future-native-
  config warnings appeared in test runs; no test failures.
- V4 was actually attempted in the required order, with each command finishing
  before the next: **`pnpm lint` passed; `pnpm build` passed; `pnpm test` failed
  with exit status 1.** Root build completed through Node host, runtime example
  and React/Vite app; warnings concerned starter dependency metadata and Vite
  native-config/chunk-size guidance. Full local build output:
  `<tool-output>/tool_0e10fcc88001D59UvCiVlX8suO`.
- Exact root test failure: `@web-ts-toolkit/access-router` finished with **3
  failed suites / 56 passed suites; 791 passed tests / 21 skipped tests**
  (59 files, 812 tests; **192.34 s**, 21:28:23 start). All three suite failures
  were MongoMemoryServer startup `Port already in use` errors:
  - `test/advanced-mutation-bodies.integration.test.ts`: port **39268**, 6 skipped;
  - `test/filter-denial.integration.test.ts`: port **39086**, 10 skipped;
  - `test/model-router.routes.integration.test.ts`: port **37946**, 5 skipped.
    Root pnpm reported `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` / `ELIFECYCLE`.
    The captured output subsequently contains a queued message-service dependency
    build finishing, **but no message-service Vitest result**; it is not counted as
    another package pass. Later workspace test scripts have no completed results
    in this run. The separate 336-test V2 result above is the package acceptance.
    Full local root-test output:
    `<tool-output>/tool_0e11e53fa0014CgjcqPHOPo5P6`.
- Root test progress before that failure: asset-inliner 566 passed/1 todo;
  create-access-router-mongo-starter 335; express-oidc-vault 260;
  express-runtime 341; json-frame 418; mongoose-rxdb 526; pdf-reader 205 Node +
  32 browser; utils 120; OIDC memory/MongoDB/Redis stores 37/44/90; http-errors
  72; moo 153; express-response-handler 215; express-json-router 44 passed.
  These are observed per-package counts, **not a full-workspace pass**.
- Integration limitation/remaining work: the access-router fixture-port failures
  are outside this package/host change and no message-service assertion failed.
  The workspace coordinator owns obtaining a green root test run after resolving
  environment/fixture port contention; this reviewer did not repair or rerun
  unrelated suites. Under the plan's explicit broad-failure policy, this limits
  workspace verification without blocking passing package/host acceptance.
- Execution/preservation: an already-running root test process in this workspace
  was observed and allowed to exit before starting V2; a second observed root
  test process belonged to `<repo-root>/_tmp/arc04-20260926-193734/workspace`.
  This session launched no overlapping build/test commands. Unrelated concurrent
  access-router/json-frame/mongoose-rxdb/pdf-reader and other work was preserved.
  Only this task file was edited, using `apply_patch`; no source/test changes,
  stashing/reverting, generated-output edits or root CHANGELOG edits. All five
  implementation tasks retain their historical evidence/status. MSGR-06 is now
  completed; no new follow-up execution task is necessary. Existing consequential
  deferrals retain their rationale and residual limits; the coordinator's final
  whole-plan check remains required by the definition of done.

## Consequential feature deferrals (not execution tasks)

- **Sender-notification reconciliation:** useful for transient failure recovery;
  previously deferred in MSGF-15. A safe API needs durable resolved intent,
  notification deduplication, concurrent recovery, and legacy/request-dependent
  callback policy. Current best-effort post-commit delivery remains a documented
  limitation; adding an unguarded resend would create duplicate notifications.
- **Nonterminal actions:** the host's acknowledge/complete workflow suggests a
  need, but all successful actions currently archive. Supporting multiple actions
  requires an attempt/history protocol and explicit lifecycle contract, not an
  `archive: false` shortcut. Hosts should model separate message steps meanwhile.
- **Payload/payer fingerprint conflicts on replay:** current tests deliberately
  replay the first payload when a key is reused. Changing that requires canonical
  input/size rules and legacy reservation migration; it is not a current defect.
- **Cursor pagination, polling jitter, batch/cache caps:** MSGF-14 already measured
  linear offset cost and retained finite trusted templates/host-owned fan-out.
  No new workload evidence justifies index or cache changes here; deep offset
  cost and unbounded host-generated batches remain documented scalability risks.
- Durable transactional email, payment crash reconciliation, explicit tenant
  namespaces, retention policies, and broad peer certification remain the
  previous plan's bounded product decisions rather than invented requirements.
- Host payload validation/domain permissions warrant a separate app review;
  the current scope validates the package integration, not all example business rules.

## Definition of done

All six execution tasks complete with evidence, acceptance regressions and
installed/host contracts pass, independent review finishes, workspace-check
limitations are recorded accurately, and the coordinator checks the entire task
file once more. Root `CHANGELOG.md` remains untouched.

## Coordinator final check

- Re-read the complete task file after the independent reviewer finished:
  **MSGR-01 through MSGR-06 are completed**, each with requirements, acceptance
  results, and `Completion evidence`. Five distinct implementation sessions and
  one distinct review session ran sequentially; none launched nested agents.
- Checked final scoped diff summaries, the public serializer and authoritative
  action-read paths, and verified all six statuses/evidence sections. No new
  required execution item was found. Feature deferrals remain explicit above.
- Final coordinator `git diff --check` and `git diff --exit-code -- CHANGELOG.md`
  passed; unrelated concurrently evolving work remains outside this objective.
- Accepted the independent **336-test package**, **4-test host**, packed-consumer,
  typecheck, lint, and build evidence. No implementation changed after that
  review. Root `pnpm test` remains **failed due to the three unrelated
  access-router MongoDB fixture port collisions** detailed in MSGR-06; this
  document does not claim a green full-workspace test run.
- This closes the scoped implementation and final-review objective, with that
  workspace verification limitation recorded for the host workspace owner.

## Continuation: outstanding workspace verification

The user requested continuation after the scoped completion above. Historical
results remain unchanged; the next task addresses the remaining root-test
limitation, without promoting deferred product features into implementation.

### Task MSGR-07: Recheck workspace tests and diagnose remaining fixture failures

Status: completed

Kind: investigation

Priority: P2 — root test verification was interrupted by fixture-port collisions.

Suggested agent: fresh isolated workspace-verification specialist

Dependencies: MSGR-06

Primary ownership: this continuation record and test execution; no unrelated
production implementation changes without a separately specified follow-up.

Finding: MSGR-06 passed package/host acceptance, lint, and build, but root
`pnpm test` stopped at three access-router MongoMemoryServer startup failures.
Other sessions have been testing the workspace and isolated copies concurrently.

References: MSGR-06 V4 completion evidence above; root `package.json:9`;
`AGENTS.md` serialized-test requirement.

Requirements:

1. Identify active build/test processes and their working directories; avoid
   sharing build outputs with another active runner and never kill others' work.
2. Run root `pnpm test` from the actual workspace and record its exit status and
   per-package outcome. If fixture failures recur, inspect their cause and use
   a bounded focused experiment to distinguish contention from a code defect.
3. Preserve all unrelated work and root CHANGELOG. Record any needed fixture/code
   fix as an explicit follow-up for a separate sequential implementation agent.
4. Preserve prior evidence and state clearly whether the unmodified root command
   passed or whether a diagnostic run required different execution settings.

Acceptance criteria:

- Root test verification has a current observed outcome, including packages that
  did not finish in the previous run.
- Any remaining failure has concrete diagnostic evidence and an actionable
  recommendation; no test assertion is weakened to manufacture a pass.
- Completion evidence records exact commands, results, environment limitations,
  and preservation checks. A successful investigation can complete with a
  bounded follow-up, but must not claim failed workspace acceptance passed.

Verification: root `pnpm test`; focused repository-backed commands as warranted;
`git diff --check` and `git diff --exit-code HEAD -- CHANGELOG.md`.

Execution note (MSGR-07): this fresh sequential investigation session read the
shared rules, MSGR-06 evidence, and the requested task-as-you-go skill. `pwdx`
confirmed PID 1985520 and its pnpm/shell descendants run in
`<repo-root>/_tmp/arc04-20260926-193734/workspace` (package descendants in that
copy's `packages/access-router-runtime`), not the actual workspace. Initial
process inspection found no active build/test runner using this workspace's
outputs. No other session was stopped; unrelated edits are preserved.

Interim evidence: first actual root run (`set -o pipefail && pnpm test 2>&1 |
tee <repo-root>/_tmp/msgr07-root-test-20260926.log`) reached express-json-router
typechecking after 3,633 passed tests / 1 todo. Its typecheck exited 2 with
TS2307/TS2882 missing express-response-handler declarations, despite successful
dependency emission immediately beforehand. A newly started external root build
(PID 2167547, 21:50:00; recursive PID 2167689) was confirmed by `pwdx` in this
actual workspace, with Node host dependency rebuilding descendants. This differs
from the initial isolated-copy runner. After waiting for it to exit,
`pnpm --filter @web-ts-toolkit/express-json-router typecheck` passed unchanged.
The dependency config has `clean: true`; this is concrete shared-output race
evidence rather than a reason to change declaration contracts. A single root
retry is justified by the now-finished external build; capture its numeric root
exit explicitly. The first log prints package exit 2 but no numeric root exit.

Completion evidence (MSGR-07, fresh sequential investigation session):

- **Investigation complete; actual root acceptance still FAILED.** Both runs
  executed in `<repo-root>`, using Node **v26.7.0**, pnpm
  **11.18.0**, Vitest **4.1.11**. No isolated-copy test result was substituted.
  Initial `ps -eo pid,ppid,lstart,args` plus
  `pwdx 1985520 1985918 1986164 1986165 2105915 2105918 2106236`
  identified the older isolated runner (the last PID had already exited).
- First root invocation and exact log are recorded above. It failed before
  express-json-router Vitest, with package typecheck exit **2**, pnpm
  `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` / `ELIFECYCLE`. Its terminal capture did not
  print the numeric top-level exit; do not infer that number from the package
  exit. Completed tests: **3,633 passed / 1 todo**, across **14 packages** (PDF
  reader has two test projects). No MongoDB collision occurred in this run.
- Bounded diagnosis of that failure: `pwdx 2167547 2167614 2167689` confirmed a
  different session's newly started root build in the actual workspace at
  **21:50:00**, overlapping the first test command. Its Node host descendants
  rebuilt message-service dependencies, including express-response-handler.
  `packages/express-response-handler/tsup.config.ts:18-20` cleans `dist` before
  regenerating the referenced relative declarations. The failed root log shows
  successful declaration emission followed by missing-file TS2307/TS2882 errors;
  the directory contained those files again on inspection. After the external
  build exited, the **unchanged** focused command
  `pnpm --filter @web-ts-toolkit/express-json-router typecheck` passed both strict
  configs. This supports a shared-output rebuild race, not a declaration-contract
  repair. Waited using `sleep 60` and rechecked processes; terminated no sessions.
- One root retry was justified by removal of that observed contention. Exact
  invocation (3600000 ms tool timeout, same workspace cwd):

  ```sh
  set -o pipefail && python3 -c 'import datetime,subprocess,sys,time; start=time.monotonic(); print("MSGR07 ROOT START",datetime.datetime.now().isoformat(),"cwd=<repo-root> command=pnpm test",flush=True); result=subprocess.run(["pnpm","test"]); print("MSGR07 ROOT EXIT",result.returncode,"elapsed_seconds",round(time.monotonic()-start,2),"end",datetime.datetime.now().isoformat(),flush=True); sys.exit(result.returncode)' 2>&1 | tee <repo-root>/_tmp/msgr07-root-retry-20260926.log
  ```

  The wrapper ran the real, **unmodified `pnpm test`**, recording numeric root
  **exit 1**, **1167.18 s**, start **2026-09-26 21:53:47.605408**, end
  **22:13:13.754620**. Complete stdout/stderr is in that log and the tool archive
  `<tool-output>/tool_0e14160520017MMrvKEfIXtNUH`.
  No timeout terminated the run. No environment variables, worker settings,
  MongoDB configuration, dependency versions, or test timeouts were changed for
  either root invocation or the focused typecheck. Logging was the only wrapper.

- Per-package observed results (tests passed unless explicitly marked):

  | Package (`@web-ts-toolkit/` omitted) | First root run                   | Root retry                                                                            |
  | ------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------- |
  | asset-inliner                        | 566 + 1 todo                     | 581 + 1 todo                                                                          |
  | create-access-router-mongo-starter   | 335                              | 335                                                                                   |
  | express-oidc-vault                   | 260                              | 384                                                                                   |
  | express-runtime                      | 341                              | 341                                                                                   |
  | json-frame                           | 531                              | 531                                                                                   |
  | mongoose-rxdb                        | 632                              | 632                                                                                   |
  | pdf-reader                           | 205 Node + 32 browser            | 205 Node + 32 browser                                                                 |
  | utils                                | 120                              | 120                                                                                   |
  | express-oidc-vault-memory-store      | 37                               | 37                                                                                    |
  | express-oidc-vault-mongodb-store     | 44                               | 44                                                                                    |
  | express-oidc-vault-redis-store       | 90                               | 90                                                                                    |
  | http-errors                          | 72                               | 72                                                                                    |
  | moo                                  | 153                              | 153                                                                                   |
  | express-response-handler             | 215                              | 215                                                                                   |
  | express-json-router                  | typecheck failed, Vitest not run | 44                                                                                    |
  | access-router                        | not reached                      | 812 (59 files, 162.71 s)                                                              |
  | message-service                      | not reached                      | 336 (23 files, 102.80 s)                                                              |
  | access-router-client                 | not reached                      | **598 passed / 85 failed**, 37 passed files / 1 failed file; browser phase not run    |
  | access-router-deco                   | not reached                      | queued dependency/package build completed after root exit; no typecheck/Vitest result |
  | access-router-runtime                | not reached                      | not reached                                                                           |
  | access-router-react                  | not reached                      | not reached                                                                           |

  Retry aggregate: **5,562 passed / 85 failed / 1 todo**, **319 passed test files /
  1 failed file**, **17 packages fully passed**, client Node phase failed. Counts
  are observed at execution time: unrelated source/tests changed during this live
  workspace verification (notably asset-inliner and OIDC), so these are not a
  frozen-source certification. Later packages are explicitly unverified, not
  silently counted from their builds. The host's separate four-test acceptance
  remains MSGR-06 evidence; its package has no root `test` script.

- MongoDB conclusion: **no startup port collision recurred**. The previously
  failing access-router suites are included in its **812/812** passing retry;
  message-service also passed **336/336** with the root's default file parallelism
  and timeouts. No fixture/dependency-code experiment was warranted by this run,
  and the historical intermittent collision's underlying cause is not claimed
  resolved. No fixture fix is proposed on this evidence alone.
- Remaining failure diagnosis is concrete and separately owned: all **85** retry
  failures are in the newly added
  `packages/access-router-client/test/access-router-client.clc04-query-bounds.unit.test.ts`
  (90 tests, 5 passed). At `controlled:48-52`, cycles/deep inputs produced
  `RangeError`, oversized inputs produced no controlled error, and the escaped
  literal case reached the descriptor rejection in `src/helpers.ts:22` in the
  version executed by Vitest. These are query-preparation assertions, not MongoDB
  or missing-output errors. Inspected its source imports, assertions, and the
  existing [client plan](20260926-215404-access-router-client-business-contracts.md)
  **CLC-04 (`in_progress`)**, whose finding, limits, ownership and acceptance
  exactly cover those failures. The helper had already gained traversal
  validation by post-run inspection, confirming ongoing implementation; that
  evolving code is not independently certified here.
- Follow-up deduplication/handoff to coordinator: retain **CLC-04** with its
  current query-boundary implementation owner; it must finish its controlled
  bounds/escape regressions and focused verification. Existing **CLC-07
  (`pending`, dependent on CLC-01..06 including CLC-03-F01)** already owns the
  later independent package and root checks. Its coordinator should arrange an
  exclusive actual-workspace build/test window after the active implementations
  settle, capture a fresh numeric root exit, and account for client browser,
  deco/runtime/react results. No duplicate MSGR implementation task was added:
  both the defect and final verification already have explicit executable tasks.
  No third expensive root retry was justified during active CLC-04 changes.
- Preservation/verification: this session edited **only this task document**,
  using `apply_patch`. Other sessions' evolving source/test/docs work was
  preserved; no agents spawned, no process killed, no manual `dist` edits, and
  no root CHANGELOG edits. `git diff --check` and
  `git diff --exit-code HEAD -- CHANGELOG.md` passed; the final untracked-document
  whitespace check, `git diff --no-index --check -- /dev/null docs/tasks/20260926-185326-message-service-residual-workflow-health.md`, also passed. Prior root lint/build and
  separate host acceptance were not repeated. This completed investigation
  supersedes the outstanding root-failure diagnosis, not the historical evidence
  or the still-failing full-workspace gate.

Coordinator continuation check: reviewed MSGR-07's complete evidence and confirmed
the linked client plan still marks CLC-04 `in_progress` and CLC-07 `pending`.
MSGR-01..07 are complete; workspace acceptance remains failed for the separately
owned client work. The standard root run now provides 336/336 message-service and
812/812 access-router results without special test settings. Coordinator
whitespace checks and the HEAD-to-worktree root CHANGELOG check passed. No
message-service implementation change or duplicate client task was warranted.
