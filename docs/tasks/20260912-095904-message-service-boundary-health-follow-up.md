# Message Service Boundary And Architectural Health Follow-Up

Created: 2026-09-12 09:59:04 PDT

Package: `packages/message-service`

## Objective And Scope

Close the remaining correctness and security gaps in message creation, action ownership, archival, and HTTP responses; improve service composition, test fidelity, and installed-consumer guidance. This is an executable plan for sub-agents, not implementation evidence. All tasks below are pending.

Review source, schema behavior, template contracts, route integration, tests, emitted declarations, and release-like package consumption together. Keep trusted template/provider code distinct from authenticated user input. Preserve requester/template idempotency isolation and the documented requirement that external handlers deduplicate their effects.

Non-goals: implementing a queue/payment processor, promising exactly-once external effects, adding tenant inference, replacing offset pagination without evidence, or adding generic sanitization to trusted Handlebars templates. Do not manually edit generated `dist/` files.

## Previous Work And Deduplication

Related completed plan: [Message Service Review Remediation](20260823-151605-message-service-review-remediation.md), MSG-01 through MSG-13. A new file is appropriate because that implementation/review phase is complete. Keep its historical findings and completion evidence intact.

- MSGF-01/02/07 address remaining action and alternate-archive paths after old MSG-06/07/08.
- MSGF-03/04/09 address boundary cases not covered by old MSG-05/08/11/13.
- MSGF-05/06 address additional payment and replay failure windows after old MSG-03/04.
- MSGF-10/14 extend the bounded-wait and query work in old MSG-03/10 with specific unchecked inputs and measurements.
- MSGF-11/12 improve composition and test seams beyond old MSG-01/07.
- MSGF-08/13 address current rendering, declaration, and example defects rather than reopening the already-fixed export map or mixed-format registry behavior.
- Existing router follow-up tasks were checked for overlap; the changes here belong to message-service's boundary and lifecycle, not JsonRouter routing semantics.

## Coverage And Baseline Evidence

Inspected all package source files, package/build metadata, README/DESIGN, emitted declaration surface, all six test suites at relevant assertions, MongoDB/packed-consumer support, and `website/docs/packages/message-service.md`. Sampled the host integration in `apps/nodejs/src/messages.ts`; this was not a full application review.

Actually run from the repository root:

| Check                                                  | Result                                                                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short` before review                     | Clean worktree                                                                                                                                                                                          |
| `pnpm --filter @web-ts-toolkit/message-service test`   | Passed: 6 files, 157 tests; rebuilt the dependency closure and package; includes MongoDB replica-set and release-like packed ESM/CJS/NodeNext/Bundler consumers                                         |
| `node /tmp/opencode/message-service-review-probes.cjs` | Confirmed 13 **current faulty-behavior scenarios** against freshly built output, a disposable MongoDB replica set, and one live Express endpoint; not a passing regression suite for the proposed fixes |
| `git diff --check` after writing the plan              | Passed for tracked changes; new-file whitespace checked separately with `git diff --no-index --check /dev/null docs/tasks/20260912-095904-message-service-boundary-health-follow-up.md`                 |

The temporary probe is analysis evidence only and is not a durable dependency for these tasks. Each defect task specifies how to recreate its regression under the package's test directory. The probe verified:

1. A second-item provider failure leaves the first newly created payment session unexpired.
2. The first compensation failure prevents attempting cleanup of the second session.
3. Successful action archival causes same-scope create replay to report inconsistent state.
4. A commit between the reservation read and message read causes false inconsistent-state failure.
5. A former recipient can execute an action using an old hydrated document after the stored recipient changes.
6. An expired action worker can mark a renewed worker's claim retryable, preventing the renewed worker's archive commit.
7. Public document `archive()` leaves active and archive copies when deletion fails.
8. Creation evaluates an action condition against `{}` and throws for `message.payload.ready`.
9. Non-idempotent direct creation invokes preparation with an invalid user identity.
10. Invalid lease/wait/poll numbers pass construction unchecked; timeout consequences below follow from source arithmetic, not an intentionally infinite experiment.
11. Permission `constructor` is granted from an empty permission object through inheritance.
12. An unrelated user receives an archived notification-pending outcome.
13. An HTTP retry of a failed create includes a synthetic internal exception marker in its 409 body.

Not run during analysis: root lint/build/test, minimum-supported-Mongoose matrix, production load benchmarks, provider/network crash simulations, or release-artifact assembly. Existing package tests pass but do not cover the reproduced interleavings. Packed tests use the repository's release transformation; workspace placeholders are intentional, not a publication defect. The test run emitted a Vite config-loader compatibility warning without failures.

## Priorities, Ownership, And Execution Rules

- **P1:** confirmed authorization, financial cleanup, persistent-state, or external data-disclosure defect; fix before extending the workflows.
- **P2:** contained correctness, operational bounds, public-contract, maintainability, or measured scalability work.
- No P0 is assigned: this review did not establish an unconditional unauthenticated exploit or production incident.

Set a task `in_progress` only after its dependencies are complete. Record the assigned agent, changes, exact verification results, and remaining risk when closing it. Use `blocked` for missing decisions/prerequisites; `completed` requires acceptance evidence, not just edited code. Check existing tasks before adding independent follow-ups.

All implementation tasks own their focused regression tests and corresponding public-contract notes. Use a separate focused test file when that reduces merge conflicts. An agent must not edit shared files concurrently with another owner.

| Workstream                | Suggested allocation                               | Sequencing                                                                                              |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Action correctness        | Workflow/MongoDB agent: MSGF-01, MSGF-02           | In order; reserve service action methods and lifecycle schema fields                                    |
| Create/replay correctness | Persistence/payment agent: MSGF-05, MSGF-06        | In order; schedule after action agent if both edit `message-service.ts`                                 |
| Boundary checks           | Security agent: MSGF-03, MSGF-04, MSGF-09, MSGF-10 | Serialize service/route edits; template-only MSGF-04 work can run independently with explicit ownership |
| Archive/rendering         | Lifecycle/template agent: MSGF-07, MSGF-08         | After dependencies; no concurrent schema or service edits                                               |
| Composition               | API/testability agent: MSGF-11, MSGF-12            | After behavioral work; avoid moving code while fixes are in flight                                      |
| Documentation/types       | Package-consumer agent: MSGF-13                    | After final API shape                                                                                   |
| Performance               | Query-analysis agent: MSGF-14                      | Read-only experiments after persistence shape settles; no concurrent builds                             |
| Integration               | Independent reviewer: MSGF-15                      | Last; reviewer must not be the primary implementer                                                      |

These workstreams are ownership guidance, not permission to run overlapping changes in parallel. `message-service.ts`, `schemas/base.ts`, `src/index.ts`, README, and the existing monolithic integration test are shared hotspots. A coordinator grants one writer at a time. Package test scripts rebuild shared dependency `dist/` outputs: **never run overlapping workspace build/test commands concurrently**. Keep root `pnpm test` serialized as configured.

## Shared Verification

All commands below run from the repository root unless stated otherwise. Prerequisites: dependencies installed with `pnpm install`, a Node version satisfying package `engines` (currently Node >=22), and access to a working MongoDB binary for `mongodb-memory-server`. Packed consumers require the package manager/install prerequisites already used by the harness.

- **V1 — focused regressions:** use `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/<actual-test-file>.test.ts` after the affected dependency closure is built. The filter executes with the package as working directory. Replace the placeholder with the test file actually added/changed; do not invent a new package script. For packed tests, rebuild first with `pnpm --filter @web-ts-toolkit/message-service... build`.
- **V2 — package acceptance:** `pnpm --filter @web-ts-toolkit/message-service test`. This is the safe default and includes build, unit, MongoDB, and packed-consumer coverage.
- **V3 — lint/patch checks:** `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` and `git diff --check`.
- **V4 — final workspace integration:** `pnpm lint`, then `pnpm build`, then `pnpm test`, with no conflicting agents running builds/tests. Record exact unrelated failures instead of silently ignoring them or rewriting unrelated code.
- **V5 — published contracts:** extend `test/message-service.packed-consumer.test.ts` and its existing harness; run V2. Verify root package imports in native ESM/CJS, strict NodeNext/Bundler with `skipLibCheck: false`, and executable/compiled documentation examples. Do not substitute source imports for installed-package evidence.

For defects, show a regression failing on the original behavior and passing after the change where feasible. Use real MongoDB for claims, sessions, archive movement, and read consistency. Do not test those semantics solely with array-backed query mocks.

## Executable Tasks

### Task MSGF-01: Fence Each Action Lease Acquisition Separately From The Stable Attempt

Status: completed

Assigned agent: first isolated implementation agent (MSGF-01 only; sequential execution).

Kind: defect

Priority: P1 — a stale worker can overwrite a live replacement's state or commit using obsolete ownership.

Suggested agent: distributed-workflow/MongoDB specialist

Dependencies: none

Primary ownership: `packages/message-service/src/message-service.ts` (`claimAction`, `markActionRetryable`, `archiveClaimedMessage`); `src/schemas/base.ts`; `src/types/message.ts`; focused action concurrency tests.

Finding: Retries correctly retain `actionAttemptId` for external deduplication, but also use that same ID as the only ownership token for failure updates and archive deletion. A live handler can exceed the 30-second lease; a new caller reclaims the same attempt. The old caller can then mark the new claim retryable or delete it. The real-MongoDB probe paused both handlers, expired the first lease, and showed the old failure preventing the new worker's commit. Existing concurrency tests cover competing actions under a live first claim, not an old worker resuming after takeover.

References:

- `packages/message-service/src/message-service.ts:1137-1203` (`claimAction`, `markActionRetryable`)
- `packages/message-service/src/message-service.ts:1205-1269` (`archiveClaimedMessage`)
- `packages/message-service/test/message-service.mongodb.test.ts:1050-1139`
- `packages/message-service/src/types/template.ts:38-47` (`ActionContext.actionAttemptId`)

Requirements:

1. Keep the logical attempt key stable, and add a distinct per-acquisition owner token or fencing generation. Condition every state-changing completion/failure write on current ownership.
2. A worker that has lost ownership must return a controlled conflict and must not change the replacement's claim, archive, or notification state.
3. Define long-running handler behavior, including lease expiry and any renewal mechanism. Preserve the documented external deduplication obligation; fencing does not stop an already-running external call.
4. Document migration of existing active attempts and preserve same-action retry semantics.

Acceptance criteria:

- Real MongoDB barrier tests cover stale-worker success and failure after takeover; neither corrupts the replacement claim.
- The replacement can commit once; exactly one archive exists, and logical attempt identity remains stable across acquisitions.
- Concurrent different actions still cannot both win. Migration behavior for records without a fencing field is tested.

Verification: V1 action concurrency tests, V2, V3.

Completion evidence (MSGF-01, 2026-09-12):

- Changed files:
  - `packages/message-service/src/message-service.ts` — `ActionClaim` gains `actionOwnerToken`; `claimAction` mints a fresh token per acquisition while keeping `actionAttemptId` stable on retry/takeover; `markActionRetryable`, `archiveClaimedMessage` (ownership pre-check + conditional delete + duplicate-archive `_id` mapped to conflict + orphan cleanup on the sessionless path), and `markActionNotificationState` are all conditioned on the current token and throw `ActionConflictError` on mismatch; `handleAction` threads the token through and propagates the conflict for stale workers.
  - `packages/message-service/src/schemas/base.ts`, `src/types/message.ts` — new nullable `actionOwnerToken` field (active and archive); archive records the committing token.
  - `packages/message-service/test/message-service.action-fencing.test.ts` (new) — 4 real-MongoDB barrier regressions: stale success after takeover, stale failure after takeover, legacy token-less takeover with stable attempt id, different-action contention including post-expiry.
  - `packages/message-service/test/message-service.test.ts`, `test/schemas.test.ts` — fencing-aware unit fakes (`findOne`/`updateOne` with matched-count semantics) and updated filter assertions.
  - `packages/message-service/README.md`, `DESIGN.md` — lease/fencing behavior, no-renewal rule, external-dedup obligation, and migration notes (no changelog touched).
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.action-fencing.test.ts` → 4 passed. Against pre-fix `src/` (temporarily stashed): 3 failed / 1 passed, confirming regression coverage.
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 7 files, 161 passed (baseline 157 + 4 new), includes MongoDB replica-set and packed-consumer suites.
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean.
- Design decisions: field named `actionOwnerToken` (per-acquisition, randomUUID); attempt id remains the only external dedup key and is never exposed alongside the token in `ActionContext`; different actions still cannot take over an outstanding attempt after expiry (existing `actionCd`-pinned retry contract preserved); stale archive attempts fail before inserting (pre-check) with duplicate-`_id` mapped to conflict for the race window.
- Residual risk: fencing guards persisted state only — an already-running stale handler's external calls still execute (documented; handlers must deduplicate by attempt id); no lease renewal exists, so handlers exceeding 30 s always lose; in-flight pre-fencing claims during upgrade have no ownership protection until their first fenced takeover (drain recommended). Unrelated worktree changes (pdf-reader, moo, other task docs) were left untouched.

### Task MSGF-02: Authorize The Persisted Action Target And Protect Archived Outcomes

Status: completed

Kind: defect

Priority: P1 — stale authorization can execute business logic; archive outcomes disclose workflow metadata to unrelated users.

Suggested agent: application-security/Mongoose specialist

Dependencies: MSGF-01

Primary ownership: `packages/message-service/src/message-service.ts` (`handleAction`, `claimAction`, archive-result branches); focused service/HTTP authorization tests.

Finding: `handleAction()` validates permissions, template, party membership, and condition against the caller-supplied document, then claims by ID/state and runs the old selected action against the newly returned document without revalidation. A stored recipient change between loading and claiming does not revoke the old recipient's ability to execute. Separately, the archived-message branch returns `ActionNotificationPendingError` or `MessageArchivedError` before checking relationship/action authorization; the route's 202 includes the attempt ID. Both cases were reproduced. Existing denied-action tests use unchanged documents, and archive retry tests use the legitimate receiver.

References:

- `packages/message-service/src/message-service.ts:797-849`, `1137-1183`
- `packages/message-service/src/route-factory.ts:287-308`
- `packages/message-service/test/message-service.test.ts:521-538`, `623-642`, `1280-1295`
- `packages/message-service/test/message-service.mongodb.test.ts:1142-1186`

Requirements:

1. Bind authorization and handler/template selection to authoritative persisted state using an atomic/version-checked protocol. Validate the claimed target before template effects; a claim denied after acquisition must be released safely with MSGF-01's fencing.
2. Cover changed `templateCd`, recipient, roles, and condition-relevant data. A fresh-document check alone must not silently promise protection against unrestricted concurrent host writes; state the supported update protocol.
3. Apply a documented relationship/permission policy before disclosing archived or claim-fallback outcomes. Keep authorized archived retries available even when a template has been removed, using an explicit policy rather than accidental ordering.

Acceptance criteria:

- A stored recipient/template/condition change after initial load cannot execute a handler authorized only by the stale copy.
- Unrelated users receive a stable denied/not-found response without attempt IDs or notification state on both direct and HTTP paths.
- A denied claim does not strand the message; legitimate retries still work, including archived pending notifications.

Verification: V1 service/route tests plus MongoDB barriers, V2, V3.

Completion evidence (MSGF-02, 2026-09-12):

- Changed files:
  - `packages/message-service/src/message-service.ts` — `handleAction` keeps fast-fail pre-checks but binds the authoritative decision to the atomic claim via new `authorizeClaimedAction` (persisted `templateCd`, template/action lookup, `isActionAllowed` on claimed doc); denied claims are released with MSGF-01 fenced `markActionRetryable` (ownership-conflict swallowed, denial rethrown) so messages land `retryable`, not stranded; new `authorizeArchivedOutcome` relationship gate (sender/receiver) applied to the direct archived branch and the `claimAction` claim-fallback archive branch before any attempt ID/notification disclosure; authorized archived retries work even with the template unregistered.
  - `packages/message-service/test/message-service.action-target-authz.test.ts` (new) — 7 real-MongoDB + live-HTTP regressions: stale recipient, stored templateCd change, condition + roles changes, unrelated archived pending/terminal direct denial vs authorized retry (including after `registry.unregister`), claim-fallback denial with stub active copy, HTTP 403-without-attemptId vs 202-with-attemptId and terminal 403.
  - `packages/message-service/README.md`, `DESIGN.md` — claim-bound authz/handler selection, fenced denied-claim release, archived relationship policy with template-removal tolerance, and supported-update-protocol note (guarantee covers state as of atomic claim only; no promise against post-claim concurrent host writes). No route-factory code change required (service enforcement covers HTTP); no changelog touched.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.action-target-authz.test.ts` → 7 passed. Against pre-fix `src/message-service.ts` (temporarily stashed): 7 failed (including HTTP 202 instead of 403 for unrelated pending), confirming regression coverage.
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 8 files, 168 passed (baseline 161 + 7 new), includes MongoDB replica-set and packed-consumer suites.
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean.
- Design decisions: archived policy is relationship-only (sender/receiver) so template removal cannot break authorized pending retries; unrelated archived (pending/failed/none, direct + claim-fallback + HTTP) maps to `ActionNotAllowedError`/403 without `actionAttemptId`; active stale `templateCd` maps to `ActionTemplateMismatchError` without executing; condition/recipient/roles map to `ActionNotAllowedError` after fenced release.
- Residual risk: guarantee is claim-time only — host writes committing after the atomic claim (during handler execution) still race; hosts must coordinate mutations of `templateCd`/`toUser`/`toRoles`/`fromUser`/condition payload with in-flight actions; registry re-registration between post-claim check and handler run is trusted-code only. Unrelated worktree changes (pdf-reader, moo, other task docs) left untouched.

### Task MSGF-03: Validate Principals Before Every User-Facing Service Operation

Status: completed

Assigned agent: service-boundary security specialist (MSGF-03 only; sequential execution).

Kind: defect

Priority: P1 — invalid direct callers can reach preparation/payment effects before identity validation.

Suggested agent: service-boundary security specialist

Dependencies: none

Primary ownership: `packages/message-service/src/message-service.ts` (identity validation and create/getActions entry points); `src/route-factory.ts` (`requireUser`); focused negative-path tests.

Finding: Only idempotent creation calls `requireUserId()` through scope construction. Creation without `clientRequestId` goes directly to `prepareMessage()`. The probe showed `{ _id: null }` reaching preparation successfully when it returns `null`. Route `requireUser()` accepts any nonempty `String(_id)`, including numbers/plain objects rejected by the service's stricter helper. `getActions()` also loads the message before requiring a user. Existing route tests cover absent users, not malformed ID shapes; direct tests validate action-list identities but not both creation branches.

References:

- `packages/message-service/src/message-service.ts:513-567`, `628-639`, `749-763`, `1388-1414`
- `packages/message-service/src/route-factory.ts:105-111`, `234-258`
- `packages/message-service/test/route-factory.test.ts:122-162`
- `packages/message-service/test/message-service.test.ts:419-430`

Requirements:

1. Share one principal-validation contract across routes and user-facing service entry points; enforce it before template/provider/model operations where promised.
2. Preserve valid string/ObjectId identities and define normalization consistently in scope, query, relationship, and provider contexts. Distinguish custom string-ID schemas from the bundled ObjectId fields.
3. Keep trusted `findMessage`/`createNotification` APIs explicitly documented as host-level operations rather than retrofitting an invented authentication model.

Acceptance criteria:

- Missing, null, empty, numeric, array, and plain-object IDs are rejected before effects in creation with and without a request ID and through custom route extractors.
- Positive valid-ID flows remain covered; `getActions` rejects invalid users before model lookup.
- Error/status behavior and direct-service identity requirements agree with declarations and documentation.

Verification: V1 service/route tests, V2, V3.

Completion evidence (MSGF-03, 2026-09-12):

- Changed files:
  - `packages/message-service/src/message-service.ts` — new exported shared contract `isValidMessageUserId`/`requireMessageUserId` (non-empty trimmed string or `ObjectId` only; missing/null/empty/numeric/array/plain-object rejected with `InvalidMessageUserError`); private `requireUserId` delegates to it; `createMessage` validates `user` and `payerUser` (when provided) before `clientRequestId` normalization and any template/provider/model effect (covers both branches); `getActions` validates before model lookup (including supplied-message path); `findMessage`/`findMessageOrThrow`/`createNotification` documented as trusted host-level ops with no principal; `createMessage`/`getActions` JSDoc states validation-before-effects and type preservation.
  - `packages/message-service/src/route-factory.ts` — `requireUser` now delegates to `requireMessageUserId` (same contract; 401 on any invalid shape), covering default and custom `getUser` extractors before service/template/payment/model/action effects; `getUser`/route JSDoc updated.
  - `packages/message-service/src/index.ts` — re-exports `isValidMessageUserId`, `requireMessageUserId` so declarations agree.
  - `packages/message-service/test/message-service.principal-validation.test.ts` (new) — 46 negative/positive-path regressions (service create ±requestId, payerUser, getActions pre-lookup, route custom extractors, valid string/ObjectId preservation).
  - `packages/message-service/README.md`, `DESIGN.md` — principal contract (string/ObjectId only, 401/`InvalidMessageUserError` before effects), trusted host-op distinction, storage vs scope/query normalization note. No changelog touched; MSGF-01 fencing (`actionOwnerToken`) and MSGF-02 claim-bound authz untouched.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.principal-validation.test.ts` → 46 passed. Against pre-fix `src/` (temporarily stashed): 28 failed / 18 passed, confirming regression coverage.
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 9 files, 214 passed (baseline 168 + 46 new), includes MongoDB replica-set and packed-consumer suites.
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean. Rebuilt `dist/index.d.ts`/`index.mjs` contain both new exports.
- Design decisions: single contract lives in `message-service.ts` and is imported by routes (no duplicate predicate); original `_id` type preserved for storage (`fromUser`/payment keep `ObjectId`), trimmed/hex string used only for scope/query keys and authz comparisons; `payerUser` validated when provided since it reaches the payment provider.
- Residual risk: `instanceof ObjectId` follows the existing service check and may miss cross-realm ObjectIds; hosts using custom string-ID schemas should keep string ids (documented distinction from bundled ObjectId fields). Unrelated worktree changes (pdf-reader, moo, other task docs) left untouched.

### Task MSGF-04: Require Explicit Own Boolean Permission Grants

Status: completed

Assigned agent: authorization/template specialist (MSGF-04 only; sequential execution).

Kind: defect

Priority: P1 — an inherited object property satisfies a permission gate for matching configured permission names.

Suggested agent: authorization/template specialist

Dependencies: none

Primary ownership: `packages/message-service/src/template-engine.ts` (`filterActions`, `isActionAllowed`); `src/route-factory.ts` (admin permission lookup); permission regression tests.

Finding: Permission checks use truthy property access on ordinary objects. A trusted action configured with permission `constructor` is allowed by `permissions: {}` because it inherits `Object.prototype.constructor`; UI filtering and execution both reproduce this. The route's configurable admin permission lookup has the same pattern. This does not establish remote prototype pollution: the confirmed gap is fail-open evaluation of accepted permission names/objects. Tests only exercise an ordinary missing key and explicit true grant.

References:

- `packages/message-service/src/template-engine.ts:54-59`, `87-98`
- `packages/message-service/src/route-factory.ts:272-277`
- `packages/message-service/test/template-engine.test.ts:314-339`, `536-555`

Requirements:

1. Use one explicit permission predicate requiring an own property with value `true` at UI, action execution, and admin-read boundaries.
2. Preserve normal and null-prototype permission maps; inherited grants and truthy non-booleans are denied.
3. Document the tightening for custom extractors that previously relied on inherited/truthy values.

Acceptance criteria:

- `constructor`, `toString`, `__proto__`, inherited custom keys, false, absent, and non-boolean values are covered in UI and execution tests.
- Own `true` grants work; admin read-only behavior uses the same predicate and cannot be enabled by inheritance.

Verification: V1 template/route tests, V2, V3.

Completion evidence (MSGF-04, 2026-09-12):

- Changed files:
  - `packages/message-service/src/template-engine.ts` — new exported `hasExplicitPermissionGrant(permissions, key)` (own property via `Object.prototype.hasOwnProperty.call` with value `=== true`; rejects inherited keys, truthy non-booleans, `false`/absent, non-object containers, arrays, empty keys; null-prototype and JSON-parsed own-`__proto__` maps work); `filterActions` and `isActionAllowed` both delegate to it, keeping UI and execution in agreement. JSDoc documents the tightening for custom extractors.
  - `packages/message-service/src/route-factory.ts` — admin read-only lookup now uses the same predicate (`hasExplicitPermissionGrant(permissions, adminPermissionKey)`); `getPermissions`/`adminPermissionKey` JSDoc documents the own-boolean-`true` contract and the denial of inherited/truthy values.
  - `packages/message-service/src/index.ts` — re-exports `hasExplicitPermissionGrant` so declarations agree.
  - `packages/message-service/test/message-service.permission-grants.test.ts` (new) — 19 regressions: predicate unit matrix, `constructor`/`toString`/`__proto__` denial in `filterActions` and `isActionAllowed` on `{}`, inherited-custom/false/absent/non-boolean denial, own-`true` grants on normal + null-prototype maps, same predicate through `interpolateTemplate`, live-HTTP admin read-only (`constructor` key on `{}`, inherited/truthy-`1`/`'true'`/`false`/absent `is.admin` → `isAdmin: false`; own `true` normal + null-prototype → `isAdmin: true`).
  - `packages/message-service/test/message-service.packed-consumer.test.ts` — `hasExplicitPermissionGrant` added to `publicRuntimeExports` and the strict NodeNext/Bundler consumer fixture (import + runtime use). No changelog touched; MSGF-01 fencing, MSGF-02 claim-bound authz, and MSGF-03 principal validation untouched.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.permission-grants.test.ts` → 19 passed. Against pre-fix `src/` (temporarily stashed): 16 failed / 3 passed (only the own-`true` positives pass pre-fix), confirming regression coverage.
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 10 files, 233 passed (baseline 214 + 19 new), includes MongoDB replica-set and packed-consumer suites.
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` exit 0; `git diff --check` exit 0; new-file whitespace check shows no whitespace errors (empty output, standard --no-index diff-exists exit, same as MSGF-01 baseline). Rebuilt `dist/index.d.ts`/`index.d.mts`/`index.mjs`/`index.js` contain the new export with JSDoc.
- Design decisions: single predicate lives in `template-engine.ts` and is imported by routes (no duplicate predicate); key-agnostic (an _own_ `__proto__: true`, e.g. via `JSON.parse`, grants — only inheritance is denied); arrays and non-object containers never grant; route `getActions` spy assertions prove the HTTP admin path uses the predicate without needing a DB.
- Residual risk: extractors returning prototype-chained or truthy non-boolean maps that previously granted access will now deny (intended tightening; documented in JSDoc); hosts relying on that behavior must return own boolean `true` properties. Unrelated worktree changes (pdf-reader, moo, other task docs) left untouched.

### Task MSGF-05: Compensate All Known Uncommitted Payment Sessions Across Failure Stages

Status: completed

Kind: defect

Priority: P1 — external sessions can remain live without a committed message despite the advertised cleanup contract.

Suggested agent: payment-saga/failure-recovery specialist

Dependencies: none

Primary ownership: `packages/message-service/src/message-service.ts` (prepared-batch construction, transaction setup, compensation); `src/providers/payment.ts`; payment regression tests.

Finding: The idempotent preparation loop accumulates documents before entering the transaction method. If item two's provider/rendering fails, item one's session is never compensated. Model resolution and `startSession()` failures also occur outside the transaction method's cleanup catch. Finally, `compensatePaymentSessions()` stops at the first thrown cleanup error. The first and last cases were reproduced. Existing tests exercise persistence failure after both documents are built and a single-session compensation failure, leaving these stages uncovered.

References:

- `packages/message-service/src/message-service.ts:648-656`, `966-1013`, `1016-1117`
- `packages/message-service/src/providers/payment.ts:9-15`
- `packages/message-service/test/message-service.mongodb.test.ts:618-664`
- `packages/message-service/test/message-service.test.ts:891-1026`

Requirements:

1. Track every known newly created session from preparation through confirmed commit. Cleanup must cover later preparation, model/session setup, and persistence failures.
2. Attempt cleanup for every affected session even when one expiration or observer fails; preserve original and all cleanup failures in a useful error/event contract.
3. Distinguish committed work from uncommitted/uncertain outcomes. Do not expire a successfully committed session because post-commit housekeeping failed; document unresolved ambiguous-commit reconciliation.
4. Preserve bound provider methods and avoid expiring sessions belonging to already committed items in non-idempotent sequential creation. Do not silently change that path to all-or-nothing without a documented contract decision.

Acceptance criteria:

- Regressions cover second-item provider/null/render failure, resolver/startSession failure, first cleanup failure with later cleanup still attempted, observer failure, rollback, and committed replay.
- All known uncommitted sessions are attempted; committed sessions are retained; the primary error remains diagnosable.
- Public provider/docs claims match the tested guarantees and limitations.

Verification: V1 payment tests with real transaction cases, V2, V3.

Completion evidence (MSGF-05, 2026-09-12):

- Changed files:
  - `packages/message-service/src/message-service.ts` — idempotent preparation loop now compensates all previously built docs when a later item's provider/null/render step fails; `persistPreparedBatchTransaction` resolves models and calls `startSession()` inside compensated regions (transaction-support errors wrapped as `MessageTransactionRequiredError` before compensation); compensation runs only on pre-commit failure, never after `withTransaction` resolves (committed sessions retained even if `endSession()` housekeeping throws); `compensatePaymentSessions` attempts every known session even when an earlier expiration or the `onPaymentCompensationFailure` observer fails, invoking the hook once per failed session; a lone session keeps the legacy single-session `PaymentSessionCompensationError` shape, multi-session batches throw new `PaymentSessionCompensationAggregateError` (extends the base so existing `instanceof` checks pass; `failures` carries every `{ sessionId, compensationError, hookError }` with the triggering error as `originalError`). Non-idempotent sequential `persistItem` semantics preserved (only the failing item compensated; committed items retained, bound provider methods kept via constructor `.bind`).
  - `packages/message-service/src/providers/payment.ts`, `README.md`, `DESIGN.md` — guarantees documented: tracked-from-preparation-through-commit coverage (later prep, model/session setup, persistence/rollback), attempt-every-session aggregation contract, committed-vs-uncommitted distinction with out-of-band reconciliation for ambiguous crash/commit outcomes, sequential per-item semantics, bound methods, idempotent-expire obligation. README error table + import list cover the new aggregate error.
  - `packages/message-service/src/index.ts` — exports `PaymentSessionCompensationAggregateError` and `PaymentSessionCompensationFailure` type.
  - `packages/message-service/test/message-service.payment-compensation.test.ts` (new) — 14 real-MongoDB regressions: 2nd-item provider-throw/null/render failure, resolver failure, `startSession()` failure (+ transaction-unsupported wrapping), first-cleanup-fails-still-attempts-rest (aggregate, original preserved, hook once), both-cleanups-fail aggregation, observer-hook failure (both attempted, `hookError` per failure), rollback via unique-index violation (both expired, stable `ClientRequestFailedError` replay without new provider work), committed replay (no expire, no new sessions), non-idempotent sequential retention (only failing item expired), bound-method verification, single-session legacy shape.
  - `packages/message-service/test/message-service.packed-consumer.test.ts` — new exports added to `publicRuntimeExports` and the strict NodeNext/Bundler consumer fixture (import + runtime + declared-type use). No changelog touched; MSGF-01 fencing, MSGF-02 claim-bound authz, MSGF-03 principal validation, MSGF-04 permission predicate untouched.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.payment-compensation.test.ts` → 14 passed. Against pre-fix `src/message-service.ts` (temporarily stashed): 10 failed / 4 passed, confirming regression coverage (the 4 passes are already-correct rollback/replay/sequential/single-shape behaviors).
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 11 files, 247 passed (baseline 233 + 14 new), includes MongoDB replica-set and packed-consumer suites.
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean. Rebuilt `dist/index.d.ts`/`index.mjs`/`index.js` contain the new exports.
- Design decisions: aggregate extends the base error (backwards-compatible `instanceof`; `sessionId`/`compensationError`/`hookError` mirror the first failure); single-session path rethrows the original single error object unchanged; preparation-failure compensation covers prior docs while the failing item's own session is handled by `buildMessageDocument`'s existing self-compensation (both attempted in the render-failure test); `endSession()` stays in `finally` outside compensation so post-commit housekeeping failures never expire committed sessions.
- Residual risk: process death before a returned session is recorded, or any ambiguous provider/commit outcome unobservable in-process, still requires out-of-band provider reconciliation (documented; a durable session-idempotency-key protocol is a separately scoped investigation per the plan's deferrals); providers that do not implement idempotent `expireSession` may double-expire on retries (documented obligation). Unrelated worktree changes (pdf-reader, moo, other task docs) left untouched.

### Task MSGF-06: Keep Idempotent Replay Valid Across Commits And Archival

Status: completed

Assigned agent: persistence/idempotency specialist (MSGF-06 only; sequential execution).

Replay-contract decision (recorded 2026-09-12 before coding, per Requirements §1):

- Chosen contract: **current active/archive records** — a completed same-scope replay returns the live
  batch merged from the active and archive collections (`Array<IMessage | IMessageArchive>`), sorted by
  exact `clientRequestItemIndex`, without rerunning preparation/payment.
- Rejected alternatives:
  - _Immutable creation response_ (frozen snapshot stored at commit) would require a new snapshot store
    and retention story; out of scope and unnecessary since active+archive already hold the full batch.
  - _Explicit completed-operation result_ (new wrapper type) would force every caller/route to adopt a new
    shape; the union return preserves the existing array contract with the smallest migration surface.
- No fabrication: archive entries are returned as `IMessageArchive` as persisted. The service does NOT
  attach active-only methods (e.g. `archive()`) or cast archives to `IMessage`. Callers narrow with
  `'archivedAt' in doc` (or the existing `isArchivedMessage` shape); `@ts-expect-error archive.archive()`
  remains the packed-consumer proof.
- Migration implications: `createMessage()` (and its idempotent internals) widens from `Promise<IMessage[]>`
  to `Promise<Array<IMessage | IMessageArchive>>`. Fresh creates still resolve active documents only;
  replays may resolve a mix. Callers that assumed every element exposes `IMessageMethods.archive()` must
  narrow first. No request-schema change; one evidence-backed archive index is added (see below).
- Read protocol: active-then-archive (service archival does create-then-delete, so a moving item is always
  visible in at least one snapshot — no miss); deduplicate by `_id` string to survive the commit window
  where both snapshots hold the item (no double-count); single bounded re-read of both collections before
  declaring corruption; reservation re-read before declaring "messages exist without a reservation" so a
  commit landing between the reservation read and the message reads cannot false-corrupt.
- Retention implications: reservations are never deleted by the service; archive documents must be retained
  for the idempotency-replay window. Archive TTL/deletion turns later replays into
  `ClientRequestInconsistentStateError` (distinguishable true-missing, not a silent partial replay).
  Documented in README/DESIGN alongside the contract.

Kind: defect

Priority: P1 — normal lifecycle transitions turn successful operations into corruption errors.

Suggested agent: MongoDB consistency/idempotency specialist

Dependencies: MSGF-05

Primary ownership: `packages/message-service/src/message-service.ts` (replay reads); request/archive schema fields or indexes only as required by the chosen replay contract; focused replay integration tests.

Finding: Replay reads only the active collection even though actions move items into the archive. A completed one-item request fails replay immediately after a successful action. Separately, reservation and message reads are independent: reading no reservation, then observing another caller's newly committed messages, raises “messages exist without a reservation.” Both were reproduced. Current tests cover active replay and intentionally corrupted reservations, not lifecycle movement or a commit between the two reads.

References:

- `packages/message-service/src/message-service.ts:580-586`, `1416-1474`
- `packages/message-service/src/message-service.ts:1224-1246`
- `packages/message-service/src/schemas/message-archive.ts:28-44`
- `packages/message-service/test/message-service.mongodb.test.ts:423-447`, `722-795`

Requirements:

1. Define whether replay returns an immutable creation result, current active/archive records, or an explicit completed-operation result. Choose and document the public return-type/migration implications before coding; do not fabricate active methods on archive documents.
2. Read a coherent completed result despite concurrent reservation completion or archive movement. A naive pair of active/archive queries can also double-count or miss a moving item; test the chosen snapshot/reconciliation protocol.
3. Preserve exact distinct item-index validation, zero-item replay, scope isolation, and stable failure semantics. True missing-item corruption must still be distinguishable from ordinary transitions.
4. Never rerun preparation/payment merely because a completed item was archived. Define retention/deletion implications and evidence-backed indexes for any new lookup.

Acceptance criteria:

- Replay succeeds with some/all batch items archived and during concurrent archive movement, under the chosen documented contract.
- A commit between reservation and message reads cannot produce a false corruption error.
- Cross-owner/template and genuinely corrupt-state regressions still pass; concurrent retries produce one committed batch.

Verification: V1 MongoDB replay/interleaving tests, V2, V3, V5 for return-type changes.

Completion evidence (MSGF-06, 2026-09-12):

- Changed files:
  - `packages/message-service/src/message-service.ts` — `createMessage`/`createMessageWithReservation`/
    `createPreparedMessageBatch`/`persistPreparedBatchTransaction` widen to `Promise<Array<IMessage |
IMessageArchive>>` with the current-records contract in JSDoc; new `findArchivedByClientRequestScope`
    plus `mergeReplayBatch` (active-then-archive snapshots, `_id`-string dedup keeping the active copy,
    exact distinct-index validation, index-then-`_id` sort) and `buildCompletedReplay` (zero-item checks both
    collections; one bounded active+archive re-read before declaring corruption, preserving the exact
    `expects item indexes 0..N-1` error shape); `findCompletedClientRequestReplay` re-reads a missing
    reservation before declaring orphan messages, and reuses the already-fetched snapshots. No prep/payment
    rerun on any replay path; archive docs returned unmodified (no fabricated `archive()`).
  - `packages/message-service/src/schemas/message-archive.ts` — two scoped indexes mirroring the active
    collection (`{owner,template,requestId,createdAt,_id}` and unique `{owner,template,requestId,itemIndex}`,
    same `$type`-partial filters); no request-schema change.
  - `packages/message-service/test/message-service.replay-coherence.test.ts` (new) — 10 real-MongoDB
    regressions: some-archived replay (mixed, no method fabrication, prep once), all-archived paid replay
    (2 sessions then 0 new, 0 expirations), commit-between-reads via getModel-layer interleaving (first
    reservation read null, commit, message reads + re-read succeed), deterministic active+archive `_id`
    duplicate dedup, concurrent archive-movement + concurrent-retry single batch (prep once, total 2),
    concurrent-retries one batch, cross-owner/template isolation, 4 genuinely-corrupt states still throwing
    (missing index, split duplicate index, zero-item with messages, orphan messages), zero-item replay, and
    archive index evidence (listIndexes shapes + hint-forced IXSCAN without COLLSCAN + 11000 uniqueness).
  - `packages/message-service/test/message-service.test.ts` — `mockArchiveModel` gains `find` (array-backed
    scope filtering) so pre-existing unit replays exercise the archive branch; no assertion changes.
  - `packages/message-service/test/message-service.packed-consumer.test.ts` (V5) — strict NodeNext/Bundler
    fixtures assert `createMessage` return `Extract`s `IMessageArchive` (compile-fails on revert) plus
    `'archivedAt' in doc` narrowing to a typed `IMessageArchive`.
  - `packages/message-service/README.md`, `DESIGN.md` — current-records contract, read protocol
    (active-then-archive/create-then-delete ⇒ no miss; dedup ⇒ no double-count; bounded reconciliation),
    retention rule (reservations never deleted; archive TTL/deletion ⇒ later `InconsistentState`, not partial
    replay), and archive index note. No changelog touched; MSGF-01..05 code untouched.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.replay-coherence.test.ts` → 10 passed. Against pre-fix `src/message-service.ts` (temporarily stashed): 4 failed / 6 passed — the 4 failures are the defect repros (some-archived, all-archived, commit-between-reads, concurrent movement); the 6 passes are preserved behaviors.
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 12 files, 257 passed (baseline 247 + 10 new), includes MongoDB replica-set and packed-consumer suites (covers the V5 return-type change; rebuilt `dist/index.d.ts` contains `Promise<Array<IMessage | IMessageArchive>>`).
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean.
- Design decisions: active snapshot kept on `_id` collision (creation state is the stable replay view);
  error message text for index mismatches unchanged for stable failure semantics; archive planner note
  documented honestly (this server version COLLSCANs plain-equality queries against `$type`-partial indexes
  on active too — verified — so evidence is listIndexes + hint-served shape + uniqueness, not auto-select).
- Residual risk: replay reads are non-transactional snapshots, so a batch archived and then retention-deleted
  mid-replay reconciles once and then correctly reports corruption; hosts needing replay beyond archive
  retention must extend retention, not rely on partial results. Unrelated worktree changes (pdf-reader, moo,
  other task docs, MSGF-01..05 sections) left untouched.

### Task MSGF-07: Remove The Non-Atomic Public Archive Path

Status: completed

Assigned agent: lifecycle/API specialist (MSGF-07 only; sequential execution).

Retain-vs-remove decision (recorded 2026-09-12 before coding, per Requirements §1):

- Chosen: **retain a clearly trusted host-level archival primitive** (`IMessage.archive()`),
  hardened to the same transactional/claim rules as the service path. Removing/deprecating
  the method would be a breaking major removal of a supported document method with no
  replacement host workflow; the defect is the non-atomic bypass, not the existence of a
  host-level archive entry point. The service path (`archiveClaimedMessage`) remains the only
  user-authorized action-commit path; the document method is a trusted host operation
  (like `findMessage`/`createNotification`) and must never be exposed to untrusted callers.
- Rejected alternative: _remove/deprecate `archive()` in favor of the service only_.
  No service equivalent exists for host-driven archival outside an action claim
  (e.g. admin retention flows using the owning connection directly), so removal would force
  hosts to reimplement create-then-delete themselves — recreating the same split-state bug.
- Release implications: behavior tightening, not a silent patch. Invalid action/user and
  repeat calls that previously resolved `undefined` as silent success now throw typed errors
  (`TemplateNotFoundError`/`ActionNotFoundError`, `InvalidMessageUserError`,
  `MessageArchivedError`/`MessageNotFoundError`); in-flight live claims now throw
  `ActionConflictError`; standalone (non-replica-set) deployments without transaction
  support now throw `MessageTransactionRequiredError` instead of risking dual copies.
  No signature change (`archive(actionCd, archivedBy, registry): Promise<void>` retained)
  and no new exports; hosts relying on silent no-op success or on transaction-free
  standalone archival must adopt replica-set transactions and handle the new errors.
  Documented in README/DESIGN alongside the contract; no CHANGELOG touched per task scope.

Kind: defect

Priority: P1 — a supported document method bypasses the service's transactional lifecycle guarantees.

Suggested agent: Mongoose lifecycle/API specialist

Dependencies: MSGF-01, MSGF-02, MSGF-06

Primary ownership: `packages/message-service/src/schemas/message.ts` (`createArchiveMethod`); `src/types/message.ts`; shared archive persistence seam if introduced; direct-document archive tests.

Finding: Public `IMessage.archive()` only checks that an action code exists and `archivedBy` is truthy, then inserts an archive and separately deletes the active document. It has no transaction, lease guard, or coordination with an in-flight service action. The probe forced deletion failure and found both copies persisted. This is a persistence defect in a host-level API, not proof that untrusted callers can invoke arbitrary schema methods. Existing schema tests assert method presence, not its failure behavior.

References:

- `packages/message-service/src/schemas/message.ts:109-130`, `315-317`
- `packages/message-service/src/types/message.ts:49-50`
- `packages/message-service/test/schemas.test.ts:39-44`
- `packages/message-service/README.md:203-205`

Requirements:

1. Decide whether to retain a clearly trusted archival primitive backed by the same transactional/claim rules or remove/deprecate the method in favor of the service. Record that decision and release implications first.
2. If retained, make movement atomic on the owning connection and prevent it from stealing an in-flight action; do not introduce a second incompatible lifecycle.
3. Define invalid action/user and repeat-call outcomes explicitly instead of silently resolving a no-op as success.

Acceptance criteria:

- Delete/archive failure leaves one coherent original state, and concurrent direct archive versus service action cannot commit conflicting outcomes.
- Custom connections work. Tests cover invalid action/user, repeated calls, and transaction-unavailable behavior.
- Public types, packed consumers, and migration notes match the selected API outcome.

Verification: V1 real MongoDB document-method tests, V2, V3, V5.

Completion evidence (MSGF-07, 2026-09-12):

- Changed files:
  - `packages/message-service/src/schemas/message.ts` — `createArchiveMethod` rewritten as a
    trusted atomic primitive on the owning connection: fail-closed validation (empty/unknown
    `actionCd` → `ActionNotFoundError`, missing template → `TemplateNotFoundError`, invalid
    `archivedBy` via shared `isValidMessageUserId` → `InvalidMessageUserError` — never silent
    no-op success); fresh in-transaction active re-read; live `processing` claims refused with
    `ActionConflictError` (only explicitly-expired leases may move; unparsable-lease
    `processing` fails closed); archive insert + conditional active delete in one
    `withTransaction` (duplicate archive `_id` → `MessageArchivedError`, delete-matched-0 →
    `ActionConflictError`, transaction-support failures → `MessageTransactionRequiredError`);
    archive payload strips transient claim fields, preserves stored attempt/owner identity, and
    stores terminal `actionNotificationState: 'none'` (no second lifecycle; service path remains
    the only user-authorized commit route). Reuses an existing document session when present.
  - `packages/message-service/src/types/message.ts` — `IMessageMethods.archive()` JSDoc documents
    the trusted host-only contract, typed failure outcomes, fencing, and transaction requirement.
    No signature change; no new exports; no shared seam file needed.
  - `packages/message-service/test/message-service.direct-archive.test.ts` (new) — 10 real-MongoDB
    regressions: atomic move with archive-field assertions; invalid action/template/empty-code;
    invalid user matrix (null/undefined/empty/whitespace/numeric/array/object); repeat
    → `MessageArchivedError` with single archive; missing-both → `MessageNotFoundError`; live
    service claim → `ActionConflictError` with no orphan archive then service commits exactly
    once; service-wins-first → direct reports `MessageArchivedError` with single archive;
    forced archive-insert failure leaves active-only state; custom owning connection archival;
    transaction-unavailable (`startSession` replica-set error → `MessageTransactionRequiredError`
    with no state change, then success after restore).
  - `packages/message-service/README.md`, `DESIGN.md` — trusted direct-archive contract, fencing,
    failure outcomes, owning-connection/transaction requirement, and migration note (silent
    no-op/transaction-free callers must adopt replica-set transactions + new errors).
    No changelog touched; MSGF-01 fencing, MSGF-02 claim-bound authz, MSGF-03 principal contract,
    MSGF-04 permission predicate, MSGF-05 compensation, MSGF-06 replay contract untouched.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.direct-archive.test.ts` → 10 passed. Against pre-fix `src/schemas/message.ts` + `src/types/message.ts` (temporarily stashed): 7 failed / 3 passed, confirming regression coverage.
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 13 files, 267 passed (baseline 257 + 10 new), includes MongoDB replica-set and packed-consumer suites (covers the retained-signature V5 contract; rebuilt `dist/index.d.ts`/`index.d.mts` carry the new `archive()` JSDoc).
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean.
- Design decisions: retain (not remove) — removal would strand host-driven archival with no service equivalent and force reimplemented split-state moves; direct path mints no owner token and runs no authorization/notification, so it cannot replace `handleAction`; processing-without-explicitly-expired-lease fails closed to `ActionConflictError`.
- Residual risk: direct `archive()` performs no sender/receiver/permission/condition authorization by design (trusted host operation — never expose to untrusted callers); hosts must authorize first. Guarantee is transaction-scoped; process death mid-`withTransaction` resolves via MongoDB abort/commit semantics, not in-process compensation. Unrelated worktree changes (pdf-reader, moo, other task docs) left untouched.

### Task MSGF-08: Separate Content Rendering From Action Evaluation

Status: completed

Kind: defect

Priority: P2 — legitimate action conditions can make message creation fail, and read-only views execute unnecessary condition code.

Suggested agent: template-engine/API specialist

Dependencies: MSGF-02, MSGF-04, MSGF-05

Primary ownership: `packages/message-service/src/template-engine.ts`; create/getActions rendering call sites in `src/message-service.ts`; focused rendering regressions.

Finding: `buildMessageDocument()` calls the combined `interpolateTemplate()` solely to obtain content, but that helper also filters actions with its default `message = {}`. A valid typed condition accessing `message.payload.ready` throws during creation. `getActions()` evaluates all actions before returning an empty list for admin/archived views. Separately, content uses `PrepareResult.templateData`, while action labels use persisted `message.payload`; the latter is explicitly tested and must not be silently replaced while refactoring.

References:

- `packages/message-service/src/message-service.ts:780-787`, `989-1003`
- `packages/message-service/src/template-engine.ts:43-79`, `105-130`
- `packages/message-service/test/template-engine.test.ts:342-368`
- `packages/message-service/test/message-service.test.ts:1308-1331`

Requirements:

1. Provide an internal content-only rendering path for creation. Evaluate action predicates only with the documented message context when actions are actually requested/executed.
2. Read-only/admin/archive action listings must not invoke conditions merely to discard their results.
3. Preserve the payload-based action-label contract; document its difference from content `templateData`, with a regression using distinct values. Any unified interpolation-data feature is a separate approved change.
4. Preserve the existing public combined helper or document a deliberate API change; keep escaping/trusted-template semantics unchanged.

Acceptance criteria:

- Creation with a condition accessing real message fields succeeds without evaluating that condition.
- Eligible active action listing/execution still evaluates conditions correctly; read-only/archived views do not.
- Content, action labels, and confirmation rendering use their documented data sources, including missing-value cases.

Verification: V1 engine/service tests, V2, V3, V5 if public signatures change.

Completion evidence (MSGF-08, 2026-09-12):

- Changed files:
  - `packages/message-service/src/template-engine.ts` — new exported `interpolateMessageContent(template, data)` (content-only, never evaluates `condition`) and exported `resolveUiTemplate(uiTemplate, usertype)`; `interpolateTemplate` preserved as the public combined helper (now delegates to both plus `filterActions`) with unchanged `noEscape: true` plain-text/trusted-template semantics; JSDoc documents the distinct data sources (content from `templateData` at creation, action labels/confirmations from persisted `message.payload` at listing, missing values render empty, no unified interpolation-data feature).
  - `packages/message-service/src/message-service.ts` — `buildMessageDocument` uses `interpolateMessageContent(m.templateData)` (no `{}` action-predicate eval); `getActions` returns admin/archived views via `resolveUiTemplate` + empty actions before any `filterActions` call; eligible active listings still evaluate via `interpolateTemplate` with persisted message + payload data. `handleAction` execution path (`isActionAllowed` on claimed doc) untouched.
  - `packages/message-service/src/index.ts` — re-exports `interpolateMessageContent`, `resolveUiTemplate` so declarations agree.
  - `packages/message-service/test/message-service.rendering-separation.test.ts` (new) — 6 regressions: creation with `message.payload.ready` condition succeeds unevaluated with content from `templateData`; content-only vs combined-helper behavior (combined with `{}` still throws); eligible listing evaluates (ready true lists with payload label/confirmation, false filters) while admin/archived skip (spy 0, correct object-uiTemplate, empty actions); `isActionAllowed` execution evaluation; distinct-values content-vs-label/confirmation + missing-value cases; markup escaping + `resolveUiTemplate` shapes.
  - `packages/message-service/test/message-service.packed-consumer.test.ts` (V5) — new exports added to `publicRuntimeExports` and strict Bundler consumer fixture (import + runtime use).
  - `packages/message-service/README.md`, `DESIGN.md` — rendering/action separation contract, data-source difference, admin/archived skip, preserved combined helper + escaping semantics. No changelog touched; MSGF-01..07 code untouched.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.rendering-separation.test.ts` → 6 passed. Against pre-fix `src/` (temporarily stashed): 5 failed / 1 passed, confirming regression coverage.
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 14 files, 273 passed (baseline 267 + 6 new), includes MongoDB replica-set and packed-consumer suites (covers the additive V5 export change; rebuilt `dist/index.d.ts`/`index.mjs` contain both new exports).
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean.
- Design decisions: additive exports only (no breaking API change); active snapshot for labels keeps persisted-payload contract; admin/archived early return placed after template lookup so unknown templates still return null; creation discards actions entirely rather than filtering with a fake message.
- Residual risk: callers importing `interpolateTemplate` for creation-time previews still evaluate conditions with whatever `message` they pass — they should migrate to `interpolateMessageContent`; direct `filterActions` callers must pass real message context. Unrelated worktree changes (pdf-reader, moo, other task docs) left untouched.

### Task MSGF-09: Keep Recorded Internal Failures Out Of HTTP Replay Errors

Status: completed

Assigned agent: HTTP error-boundary/security specialist (MSGF-09 only; sequential execution).

Kind: defect

Priority: P1 — a client retry can disclose provider, database, or template diagnostic text.

Suggested agent: HTTP error-boundary/security specialist

Dependencies: MSGF-05

Primary ownership: `packages/message-service/src/route-factory.ts` (`mapServiceError`); failure error types/serialization in `src/message-service.ts` only as needed; live HTTP regression tests.

Finding: Reservation failure persists raw exception text. `ClientRequestFailedError` interpolates it into `.message`, and the route forwards that message as a 409 client error. A synthetic internal marker thrown by preparation was returned to the client on retry. Existing failure tests assert stored text but do not check HTTP confidentiality. This is a confirmed diagnostic-disclosure path; actual secret content depends on host/provider errors.

References:

- `packages/message-service/src/message-service.ts:315-324`, `1433-1435`, `1551-1566`
- `packages/message-service/src/route-factory.ts:145-147`
- `packages/message-service/test/message-service.test.ts:920-949`, `1121-1139`

Requirements:

1. Return a stable public failure code/message for failed replay without serializing recorded cause text. Retain useful diagnostic context in internal records/errors/observer channels.
2. Audit the package's other mapped lifecycle errors for the same internal-to-public crossing; preserve necessary public request/attempt identifiers only after authorization.
3. Document the HTTP response change and test it with the actual response handler. Do not “fix” disclosure by deleting all internal failure evidence.

Acceptance criteria:

- Provider/template/database synthetic diagnostic markers never appear in failed-create HTTP retry bodies.
- Internal diagnostics remain observable; the response still provides a stable status and actionable safe outcome.
- Authorized pending/conflict/archive response behavior remains covered.

Verification: V1 live route tests, V2, V3.

Completion evidence (MSGF-09, 2026-09-12):

- Changed files:
  - `packages/message-service/src/message-service.ts` — `ClientRequestFailedError` now carries a stable public message (`clientRequestId "…" previously failed; retry with a new clientRequestId`) with the recorded diagnostic retained on new `clientRequestId`/`failureReason` fields plus `cause`; `failClientRequestReservation` still persists raw `failureMessage` for internal observers. No change to first-failure throw (original error still surfaces) or to MSGF-05 compensation/MSGF-06 replay semantics.
  - `packages/message-service/src/route-factory.ts` — `mapServiceError` splits pending/failed: pending still forwards its stable caller-id message as 409; failed builds the 409 from `error.clientRequestId` only, never forwarding `error.message` verbatim (defense against old interpolated records). In-code audit note: other mapped lifecycle errors forward only caller-supplied/authorized ids (conflict/retryable message+attempt ids post-authz, archived gated by the MSGF-02 relationship policy, template/action codes are route-supplied); retryable/notification causes stay on `cause`, which HTTP serializers do not emit.
  - `packages/message-service/test/message-service.failed-replay-boundary.test.ts` (new) — 3 live-HTTP (real Express `router.original` + real MongoDB replica set) regressions: provider-marker e2e (record + `failureReason` retain marker, direct message + HTTP 409 body stable without it), template + DB markers (DB first-failure 500 already sanitized generic, both retries 409 stable), authorized pending (409 pending)/conflict (409)/archive-commit-then-410 lifecycle over HTTP.
  - `packages/message-service/README.md`, `DESIGN.md` — documented stable 409 failed-replay message, retained `failureMessage`/`failureReason` diagnostics, and the mapped-error audit. No changelog touched; MSGF-01..08 code untouched.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.failed-replay-boundary.test.ts` → 3 passed. Against pre-fix `src/` (temporarily stashed): 2 failed / 1 passed (the 2 disclosure tests fail pre-fix; lifecycle test passes as preserved behavior).
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 15 files, 276 passed (baseline 273 + 3 new), includes MongoDB replica-set and packed-consumer suites.
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean.
- Design decisions: stable message keeps the caller-supplied scoped `clientRequestId` (safe: scope is per owner/template) plus an actionable outcome (`retry with a new clientRequestId`); route layer reconstructs the message from `clientRequestId` rather than trusting `error.message` so old interpolated errors can never leak; unmapped server errors (`InconsistentState`, transaction/model/compensation) intentionally unchanged — generic 500s are already sanitized by the handler.
- Residual risk: first-failure (non-replay) provider errors still propagate as sanitized generic 500s (verified for the DB path); hosts needing the first-failure diagnostic must read server logs/records, not the HTTP body. Unrelated worktree changes (pdf-reader, moo, other task docs) left untouched.

### Task MSGF-10: Validate Lease, Wait, And Poll Configuration

Status: completed

Assigned agent: operational-bounds/testability specialist (MSGF-10 only; sequential execution).

Completion evidence (MSGF-10, 2026-09-12):

- Changed files:
  - `packages/message-service/src/message-service.ts` — centralized `validateDurationOption` (finite safe integers; lease/poll `[1, 2147483647]`, wait `[0, 2147483647]`; `NaN`/infinite/fractional/negative/zero-lease-poll/overflow/non-number throw `InvalidMessageServiceOptionError`); new `MAX_MESSAGE_SERVICE_TIMEOUT_MS = 2_147_483_647` (`2^31-1` Node `setTimeout` ceiling) and `InvalidMessageServiceOptionError`; consistent clock seam `clientRequestNow` (default `Date.now`) driving the duplicate-wait deadline, `leaseExpiresAt` persistence (`new Date(now())`), and the stale-takeover filter (no independent `new Date()`); wait loop documents that the deadline bounds polling only and never cancels a hung DB/provider read.
  - `packages/message-service/src/index.ts` — exports `InvalidMessageServiceOptionError`, `MAX_MESSAGE_SERVICE_TIMEOUT_MS`.
  - `packages/message-service/test/message-service.timing-validation.test.ts` (new) — 6 deterministic tests: construction matrix (NaN/±Infinity/fractional/negative/overflow/non-number + zero lease/poll reject; boundaries 1/0/1 and max accept); zero-wait immediate `ClientRequestPendingError` with 0 delays; pending duplicate exits at bound with controlled cadence `[30,30,30,10]` via fake clock; hung reservation read awaited past the deadline (not cancelled); real-MongoDB stale takeover (one racer commits, other replays) + live-lease protection.
  - `packages/message-service/test/message-service.packed-consumer.test.ts` — new exports in `publicRuntimeExports` + strict Bundler fixture.
  - `packages/message-service/test/support/mongodb-fixture.ts` — `clientRequestNow` added to allowed `serviceOptions` pick.
  - `packages/message-service/README.md`, `DESIGN.md` — timing ranges, timer ceiling, zero-wait contract, deadline-does-not-cancel-hung-ops note, clock/delay seams. No changelog touched; MSGF-01..09 code untouched.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.timing-validation.test.ts` → 6 passed. Against pre-fix `src/` (temporarily stashed): 3 failed / 3 passed, confirming regression coverage (construction validation + controlled cadence fail pre-fix).
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 16 files, 282 passed (baseline 276 + 6 new), includes MongoDB replica-set and packed-consumer suites. Rebuilt `dist/index.d.ts`/`index.mjs` contain the new exports.
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean.
- Design decisions: new `InvalidMessageServiceOptionError` (not pagination error) for clear timing errors; max bound is the platform timer limit so delays never silently misfire; `clientRequestNow` exposed as a test hook parallel to `clientRequestDelay`, production uses real wall clock.
- Residual risk: hosts passing previously-accepted invalid values (e.g. fractional/overflow) now fail fast at construction (intended tightening); fake clocks in tests must stay wall-clock-coherent with persisted leases (documented). Unrelated worktree changes (pdf-reader, moo, other task docs) left untouched.

Kind: defect

Priority: P2 — malformed configuration defeats bounded waits or causes invalid leases/aggressive polling.

Suggested agent: operational-bounds/testability specialist

Dependencies: none

Primary ownership: `packages/message-service/src/message-service.ts` (constructor, time arithmetic, wait loop); focused timing tests.

Finding: Pagination configuration is validated, but `clientRequestLeaseMs`, `clientRequestWaitMs`, and `clientRequestPollMs` are assigned unchecked. The probe confirmed acceptance of `NaN`, a negative lease, and infinite polling. `Date.now() >= NaN` is always false; with a live reservation, a NaN wait has no effective deadline. Zero/negative poll and timer-overflow values can also defeat the intended cadence. Tests intentionally use `clientRequestWaitMs: 0`, so zero wait must remain a supported immediate-check contract.

References:

- `packages/message-service/src/message-service.ts:462-466`, `1476-1495`, `1505-1538`
- `packages/message-service/test/message-service.mongodb.test.ts:539-580`, `666-719`

Requirements:

1. Require finite safe duration values with documented ranges: positive lease/poll, nonnegative wait, including the supported zero-wait case. Handle the platform timer range explicitly.
2. Centralize validation with clear errors. If a clock seam is introduced, use it consistently for deadlines/lease timestamps and distinguish wall-clock persistence from elapsed-time waits.
3. Make boundary tests deterministic without relying on actual long sleeps or a permanently pending loop. State that a wait deadline alone does not cancel a hung database/provider operation.

Acceptance criteria:

- NaN/infinite/fractional/negative/overflow inputs fail construction as documented; zero wait remains tested.
- A pending duplicate exits at the configured bound with controlled poll cadence.
- Stale takeover and live-lease protection still pass real MongoDB tests.

Verification: V1 timing tests, V2, V3.

### Task MSGF-11: Allow Routes To Reuse A Configured Service

Status: completed

Assigned agent: API composition/Express specialist (MSGF-11 only; sequential execution).

Composition decision (recorded 2026-09-12 before coding, per Decisions §3):

- Chosen: **discriminated-union injection/construction contract** — `MessageRoutesOptions =
MessageRoutesConstructionOptions | MessageRoutesInjectionOptions`. Construction forwards the
  full `MessageServiceOptions` set verbatim (no hand-picked subset); injection reuses the exact
  supplied `MessageService` with every service construction key typed `never` and rejected at
  runtime via `InvalidMessageServiceOptionError`. Route-only behavior options
  (`authMiddleware`, `getUser`, `getPermissions`, `getIdentity`, `adminPermissionKey`) apply on
  both paths.
- Rejected alternatives:
  - _Silently combining a supplied service with construction options_ (e.g. merging/overriding)
    would hide which configuration wins; conflicts now throw instead of being ignored.
  - _Per-method service callbacks_ would duplicate the service API and drift from it; routes call
    the service API directly, so auth/validation/error mapping is identical on both paths.

Kind: improvement

Priority: P2 — route construction duplicates a restricted subset of service configuration, limiting reuse and honest testing.

Suggested agent: API composition/Express specialist

Dependencies: MSGF-02, MSGF-03, MSGF-04, MSGF-09, MSGF-10

Primary ownership: `packages/message-service/src/route-factory.ts` and route/packed-consumer tests.

Finding: The factory always constructs its own service with a hand-picked option subset. It cannot accept the direct service's custom `modelNames`, connection configuration, or timing policies. Existing route tests work around the closed construction boundary by replacing returned service methods; the compensation-option test reads a private member rather than verifying behavior. The prior remediation already missed forwarding one service option once.

References:

- `packages/message-service/src/route-factory.ts:158-199`, `214-232`
- `packages/message-service/src/message-service.ts:25-60`
- `packages/message-service/test/route-factory.test.ts:33-43`, `78-97`, `109-119`
- `docs/tasks/20260823-151605-message-service-review-remediation.md:811-812`

Requirements:

1. Add an explicit, typed composition path for an existing configured service, retaining a convenient construction path. Define mutually exclusive/conflicting options rather than silently ignoring them.
2. Ensure route authentication/validation/error mapping still applies when a service is injected. Avoid adding arbitrary per-method callbacks that duplicate the service API.
3. Replace private-member inspection with observable tests demonstrating custom models/timing/provider behavior through the router.

Acceptance criteria:

- Routes use the exact supplied service and work with custom model names; no hidden second service/global registry is created.
- Strict installed consumers can express supported configurations and reject ambiguous ones.
- Auth-denial, input validation, and error-mapping regressions pass for injected and convenience-construction paths.

Verification: V1 route tests, V2, V3, V5.

Completion evidence (MSGF-11, 2026-09-12):

- Changed files (scope-limited; no CHANGELOG, no other MSGF):
  - `packages/message-service/src/route-factory.ts` — `MessageRoutesOptions` is now a
    discriminated union (`MessageRoutesConstructionOptions` with full `MessageServiceOptions` +
    `service?: undefined` + required `getModel`, vs `MessageRoutesInjectionOptions` with
    `service: MessageService` and all 14 service construction keys `never`); runtime rejects any
    `service` + construction-option combination with `InvalidMessageServiceOptionError` (explicit
    `undefined` is not a conflict); convenience path forwards all service knobs
    (`getModel`/`connection`/`modelNames`/payment/hook/`adminRoles`/`registry`/list
    limits/all `clientRequest*` timing/test hooks) to `new MessageService(...)`; injection path
    reuses the exact instance (`returned.service === supplied`), creates no second service, and
    adds no per-method callbacks. Route auth/validation/error mapping untouched, so both paths
    share it.
  - `packages/message-service/src/index.ts` — exports `MessageRoutesBehaviorOptions`,
    `MessageRoutesConstructionOptions`, `MessageRoutesInjectionOptions` alongside
    `MessageRoutesOptions` (declarations verified in rebuilt `dist/index.d.ts`/`index.d.mts`).
  - `packages/message-service/test/route-factory.test.ts` — removed the private-member
    `onPaymentCompensationFailure` inspection; replaced with observable `toBe(supplied)` reuse
    identity plus conflict-matrix tests (`getModel`/`paymentProvider`/`clientRequestWaitMs`
    throw, explicit `undefined` registry allowed).
  - `packages/message-service/test/message-service.route-service-reuse.test.ts` (new) — 7
    real-MongoDB + live-Express regressions with ObjectId principals and custom model names:
    exact injected service + custom collections + same-registry late registration + global-registry
    isolation; convenience `modelNames` forwarding; provider + compensation-hook forwarding
    (success spies + forced-persistence-failure hook assertion, no private reads); injected
    `clientRequestWaitMs: 0` immediate-409 with zero delays + provider flow; all-14-key conflict
    rejection + route-only options allowed; auth-denial/validation and error-mapping
    (404/403-no-attemptId/200-then-410) parity on both paths.
  - `packages/message-service/test/message-service.packed-consumer.test.ts` (V5) — strict
    Bundler fixture expresses valid construction/injection/behavior options and
    `@ts-expect-error` ambiguous configs; new `route-service-reuse.mjs` installed-package
    runtime asserts exact reuse, `InvalidMessageServiceOptionError` on conflict, and 401/200
    auth mapping on both paths; new `reuses an injected service…` test runs it.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.route-service-reuse.test.ts` → 7 passed. Against pre-fix `src/route-factory.ts` + `src/index.ts` (temporarily stashed): 7 failed, confirming regression coverage.
  - V1 route file: `... test/route-factory.test.ts` → 19 passed.
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 17 files, 291 passed (baseline 282 + 7 new + 1 route-file net + 1 packed-consumer net), includes MongoDB replica-set and packed-consumer suites.
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean.
  - V5: `... test/message-service.packed-consumer.test.ts` → 7 passed (baseline 6 + 1 new), includes strict NodeNext/Bundler `skipLibCheck: false` compiles and installed-tarball runtime.
- Design decisions: conflict error reuses branded `InvalidMessageServiceOptionError` (already a
  public runtime export, cross-format `instanceof`-safe); `null` counts as a conflict (only
  `undefined` means absent) so `paymentProvider: null` alongside `service` throws; convenience
  keeps `getModel` required for backwards compatibility while also forwarding `connection` and
  all other knobs.
- Residual risk: hosts passing a service plus construction options (previously silently ignored)
  now fail fast (intended tightening); `getModel`-vs-`connection` precedence inside
  `MessageService` is unchanged. Unrelated worktree changes (pdf-reader, moo, other task docs)
  left untouched; MSGF-01..10 sections untouched.

### Task MSGF-12: Isolate Persistence Seams And Remove Transaction-Bypassing Test Behavior

Status: completed

Kind: improvement

Priority: P2 — production and test execution paths diverge, obscuring lifecycle correctness and making the large service harder to maintain.

Suggested agent: TypeScript architecture/testability specialist

Dependencies: MSGF-01 through MSGF-11

Primary ownership: `packages/message-service/src/message-service.ts`; narrowly scoped internal persistence/error modules if useful; `test/message-service.test.ts`; `test/support/mongodb-fixture.ts`; `src/index.ts` only for unchanged re-exports.

Finding: The service combines error definitions, model resolution, payment compensation, reservations, actions, rendering orchestration, and query construction in one 1,620-line file. Both transaction helpers silently execute without a transaction if the supplied model lacks `db.startSession`, accommodating unit fakes rather than the documented Mongoose contract. The unit query matcher also returns early for `$or`, ignoring sibling predicates such as `_id`; its sort ignores requested direction. The MongoDB harness exists, so these fakes need not be treated as persistence evidence.

References:

- `packages/message-service/src/message-service.ts:139-404`, `874-947`, `1049-1059`, `1249-1255`
- `packages/message-service/test/message-service.test.ts:22-44`, `117-149`, `152-224`
- `packages/message-service/test/support/mongodb-fixture.ts:94-175`

Requirements:

1. Establish a small internal transaction/model-resolution seam with typed lifecycle inputs and explicit failure when required transaction capability is absent. Preserve owning-connection checks; do not publish a general repository framework.
2. Move persistence/interleaving assertions to real MongoDB or an explicit, faithful seam. Remove the production sessionless fallback once its test callers are migrated.
3. Separate typed errors and cohesive persistence helpers where that reduces the service's responsibilities, preserving root exports and cross-format error branding. Avoid broad cosmetic rewrites or introducing a class per helper.
4. Rename/document fixture barriers according to their actual milestone: `create()` returning within a transaction is not the transaction commit. Use explicit committed-state observations for commit assertions.

Acceptance criteria:

- Missing session capability cannot silently succeed in a workflow documented as atomic.
- Multiple-message and compound `_id`/`$or` cases are checked against MongoDB rather than a matcher that ignores predicates.
- Service orchestration, persistence policy, and errors have clear internal boundaries; no dependency cycle or unintended public export is introduced.
- All pre-refactor behavior regressions and packed consumers pass without private-field assertions.

Verification: V1 relevant unit/MongoDB tests, V2, V3, V5.

Completion evidence (MSGF-12, 2026-09-12):

- Changed files:
  - `packages/message-service/src/persistence.ts` (new, internal) — `runMessageTransaction(activeModel, operation)` starts a session on the active model's owning connection and runs the unit of work inside `withTransaction`; missing `db.startSession` capability and transaction-unsupported failures both throw `MessageTransactionRequiredError` (fail closed, no sessionless fallback). Only the two documented-atomic call sites use it (idempotent batch commit, action-claim archival). Not a public subpath export; no repository framework.
  - `packages/message-service/src/errors.ts` (new, internal) — all service errors moved verbatim with cross-format branding (`Symbol.hasInstance` + `markRuntimeError`) preserved; `message-service.ts` re-exports every symbol so `src/index.ts`, routes, and schema imports are unchanged.
  - `packages/message-service/test/message-service.test.ts` — unit matcher now ANDs `$or` branches with sibling predicates (pre-fix returned early on `$or`, ignoring `_id`); `buildQuery.sort` honors the requested direction (pre-fix ignored it); array-backed doubles gained an explicit, documented pass-through session seam (`db.startSession` runs the unit of work with no isolation — orchestration only, not persistence evidence); archive-movement assertions migrated to the session-carrying calls (`create([...], {session, ordered:true})`, `deleteOne(..., {session})`); new fail-closed test for absent `startSession` capability plus the existing transaction-unsupported test (teardown now restores the seam instead of deleting it).
  - `packages/message-service/test/support/deferred.ts`, `test/support/mongodb-fixture.ts` — barriers renamed to their actual milestone: `firstBatchItemCommitted` → `firstBatchItemCreated`, `archiveCommitted` → `archiveCreated` (both fire on `create()`-return inside a still-uncommitted transaction, documented as such); commit is asserted only through committed-state observations after the service promise resolves.
  - `packages/message-service/test/message-service.mongodb.test.ts` — barrier renames, retitled interleaving test, invisibility-vs-commit comments at each milestone.
  - `packages/message-service/test/message-service.action-fencing.test.ts` — barrier renames with milestone comments; new real-MongoDB compound `_id`/`$or` claim-isolation test (two-message batch, claim one, sibling stays actionable and claimable).
  - `src/index.ts` untouched by this task (root re-exports already preserved by the `message-service.ts` re-export layer); no CHANGELOG, pdf-reader/moo/docs, or `dist/` edits.
- Verified commands (repo root, serial):
  - Failing-before: `... exec vitest run --config ../../vitest.config.ts test/message-service.test.ts` → 14 failed / 38 passed with the fallback removed and callers unmigrated (all `MessageTransactionRequiredError` from the seam-less fakes), confirming the production/test divergence the task targets.
  - V1: same file → 53 passed; `test/message-service.mongodb.test.ts test/message-service.action-fencing.test.ts` → 32 passed (incl. the new compound-claim test).
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 17 files, 293 passed (build + unit + MongoDB replica-set + packed-consumer suites).
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean.
  - V5: no public-export change in this task; packed ESM/CJS/NodeNext/Bundler consumer suites pass inside V2 (293 total).
- Design decisions: unit fakes keep exercising orchestration via an explicitly non-faithful session seam rather than migrating dozens of scoping/replay unit tests to MongoDB; multi-message and compound-predicate lifecycle truth lives in the MongoDB suites. Barrier renames are outright (no aliases) across the 3 consuming test files; no other suite referenced the old names (verified by search).
- Residual risk: the unit seam provides no isolation/rollback semantics — interleaving regressions must stay in the MongoDB barrier suites; standalone (non-replica-set) deployments now fail closed with `MessageTransactionRequiredError` on idempotent/archival writes by design (documented replica-set prerequisite). Unrelated worktree changes (pdf-reader, moo, other task docs) and MSGF-01..11 sections left untouched.

### Task MSGF-13: Align Published Types And Examples With Runtime Contracts

Status: completed

Kind: defect

Priority: P2 — declarations permit calls that fail at runtime, and primary examples still teach incorrect usage.

Suggested agent: installed-package TypeScript/documentation specialist

Dependencies: MSGF-01 through MSGF-12

Primary ownership: `packages/message-service/src/types/`; public JSDoc/signatures; `src/template-registry.ts`; `src/index.ts`; README/DESIGN; packed-consumer fixtures; `website/docs/packages/message-service.md`.

Finding:

- `getActions()` makes `user` and the whole options argument optional even though runtime requires identity; README's method summary omits `user` too.
- Registry `find()`/`getAll()` return mutable `MessageTemplate` types for frozen action/content structures. Supported TypeScript assignments can throw at runtime.
- README's quick start interpolates `{{name}}` but preparation only returns `payload`, not `templateData`; it renders empty names. The payment provider example has implicit-any method parameters under strict TypeScript. Schema JSDoc still describes global/pre-save lookup after the connection-local post-save implementation changed.
- The website quick start uses nonexistent `prepare`, incomplete template fields, a pass-through auth placeholder, and mounts `router` instead of `router.original`; it still lists mutating GET and uses invalid notification field shapes.
- Packed tests compile only the README quick start and run a different mocked runtime example, so they do not validate its rendered create result or all primary snippets.

References:

- `packages/message-service/src/message-service.ts:749-759`; `packages/message-service/README.md:68-79`, `177`, `343-369`
- `packages/message-service/src/template-registry.ts:63-81`, `120-143`
- `packages/message-service/src/schemas/message.ts:24-56`
- `packages/message-service/dist/index.d.ts` (`TemplateRegistry`, `MessageService.getActions`, generated declarations; rebuild, do not edit)
- `packages/message-service/test/message-service.packed-consumer.test.ts:291-349`, `501-515`
- `website/docs/packages/message-service.md:65-110`, `133-138`, `217-227`

Requirements:

1. Make normal action-list identity required in declarations, and expose readonly registry views matching the actual shallow freeze depth. Preserve author-friendly mutable registration inputs where practical.
2. Document concrete output types and trust levels; distinguish unrestricted lookup/notification APIs from user-authorized operations. Reconcile any lifecycle/return-type changes from earlier tasks with release notes.
3. Correct primary README examples, typed provider parameters, Node/transaction prerequisites for demonstrated operations, interpolation data, and stale JSDoc. Update website examples to the same contract.
4. Compile primary standalone snippets against the packed package with explicit fixtures for host-provided functions. Execute a representative README create/action flow against real persistence and assert rendered values, not merely that an unrelated route returns 200.
5. Inspect rebuilt declarations for retained useful JSDoc and root-reachable public types. Keep working conditional exports/release transformations intact.

Acceptance criteria:

- Strict consumers reject missing action-list users and writes to frozen registry structure; valid common usage compiles.
- The documented name renders from the supplied input; provider examples have no implicit-any errors.
- README/website examples use `prepareMessage`, valid message shapes, `router.original`, real authentication requirements, and POST-only action mutation.
- Generated declarations, shipped README, implementation, and packed tests agree on the final lifecycle/error contracts.

Verification: V2, V3, V5; review documentation examples against the named runtime tests.

Completion evidence (MSGF-13, 2026-09-12):

- Changed files (scope-limited; no CHANGELOG, no other MSGF, no unrelated):
  - `packages/message-service/src/types/template.ts` — new `RegisteredUiTemplate`, `RegisteredMessageAction`, `RegisteredMessageTemplate` readonly views matching the freeze depth (top snapshot, content objects, object uiTemplates, action array, each action + confirmation/payload); `MessageTemplate` stays mutable for author-friendly `register()` inputs.
  - `packages/message-service/src/template-registry.ts` — `find()`/`getAll()` return `RegisteredMessageTemplate`; `register()`/`registerAll()` still take mutable `MessageTemplate`; JSDoc documents the readonly contract.
  - `packages/message-service/src/template-engine.ts` — `interpolateMessageContent`/`interpolateTemplate` accept mutable or registered templates; `filterActions` takes `readonly (MessageAction | RegisteredMessageAction)[]`; `isActionAllowed` accepts both action shapes; `resolveUiTemplate` accepts both uiTemplate shapes.
  - `packages/message-service/src/message-service.ts` — `getActions(messageId, usertype, options: { user: MessageUser; ... })` now requires identity in declarations (runtime still fails closed with `InvalidMessageUserError` when JS omits it); expanded JSDoc with concrete `{ uiTemplate, actions } | null` output, admin/archived skip, payload-vs-templateData rule, and user-facing vs trusted (`findMessage`/`findMessageOrThrow`/`createNotification`) trust notes; `handleAction`/`listMessages`/`countMessages`/`buildVisibilityFilter` trust JSDoc; internal template params accept registered views.
  - `packages/message-service/src/schemas/message.ts` — `MessageSchemaConfig` JSDoc now describes the connection-local post-save email hook (owning-connection model resolution, session-bound skip) instead of stale global/pre-save wording.
  - `packages/message-service/src/index.ts` — exports `RegisteredMessageTemplate`, `RegisteredMessageAction`, `RegisteredUiTemplate` (declarations verified in rebuilt `dist/index.d.ts`/`index.d.mts`).
  - `packages/message-service/README.md`, `DESIGN.md` — quick start `prepareMessage` returns `templateData: { name }` so `{{name}}` renders; new create/action snippet with `Array<IMessage | IMessageArchive>` narrowing and rendered-title assertions (`Review Ada`); `getActions` signature includes required `user`; registry section uses `RegisteredMessageTemplate`; typed payment provider (`UserId`, `Record<string, unknown>`); `NoopPaymentProvider` service example; Node `>=22`/replica-set transaction prerequisites with real 401 auth; POST-only already documented; supported-exports list plus conditional-exports note.
  - `website/docs/packages/message-service.md` — quick start uses `prepareMessage` + complete template fields + `templateData` + real 401 auth + `router.original` + replica-set prerequisites; POST-only routes (mutating GET removed); custom-extractor example validates identity; `getActions` documents required `user`; notification/action examples use valid shapes (`UserId` strings, `{ title, long, short }`, `welcome.request`/`approve`); registry snippet uses readonly views; typed payment provider.
  - `packages/message-service/test/message-service.packed-consumer.test.ts` + `test/support/packed-consumer-harness.ts` (V5) — `isValidMessageUserId`/`requireMessageUserId` added to `publicRuntimeExports`; strict NodeNext/Bundler fixtures reject missing action-list users and frozen-registry writes (`@ts-expect-error`) while valid usage compiles; `tsconfig-readme.json` now compiles `readme-quick-start.ts` + `readme-providers.ts` + `readme-create-action.ts` with `strict`/`skipLibCheck: false`; README blocks asserted to contain `prepareMessage`/`templateData`/`router.original` and not `prepare: async`; new `readme-create-action-runtime.mjs` executes the README template (packed imports only) against a real `mongodb-memory-server` replica set asserting `Review Ada`/`Welcome Ada`, approve listing, handler `actionAttemptId`, and archived state; consumer harness adds `mongodb-memory-server` with `allowBuilds: mongodb-memory-server: false`.
  - `packages/message-service/test/message-service.readme-contract.test.ts` (new) — 2 real-MongoDB regressions: README create/action renders documented names from `templateData` and runs approve to archive; registry views are frozen at every level with runtime write rejection.
- Verified commands (repo root, serial):
  - V1 new file: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.readme-contract.test.ts` → 2 passed.
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 18 files, 296 passed (baseline 293 + 2 new + 1 new packed), includes MongoDB replica-set and packed-consumer suites.
  - V3: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` clean; `git diff --check` clean.
  - V5: `... test/message-service.packed-consumer.test.ts` → 8 passed (baseline 7 + 1 new README create/action), includes strict NodeNext/Bundler `skipLibCheck: false` compiles, ESM/CJS runtime, and packed README execution vs real persistence. Rebuilt `dist/index.d.ts` carries required `user: MessageUser`, `Registered*` types, and retained JSDoc (`Get available actions`, `Trusted host-level`); `package.json` conditional exports unchanged (`import ./dist/index.mjs` + `./dist/index.d.mts`, `require ./dist/index.js` + `./dist/index.d.ts`); `tsup.config.ts` untouched (bundle intact).
- Design decisions: options object itself is required in types but the implementation tolerates an omitted JS object and still throws `InvalidMessageUserError` (preserves the existing negative-path unit test at runtime); mutable-to-readonly assignability lets existing engine callers pass either shape without overloads; `UiTemplate` string form passes through unfrozen by design (matches runtime `Object.freeze` behavior).
- Residual risk: string `_id` principals are valid at the service boundary but the bundled schemas store `ObjectId` `fromUser`/`toUser` — README persistence examples use `ObjectId` explicitly; hosts with custom string-ID schemas must keep string ids (existing documented distinction). Pre-existing unit test calling `getActions(id, usertype)` without options now fails strict type checking by design (runtime still throws the same error); packed `@ts-expect-error` fixtures lock this. Unrelated worktree changes (pdf-reader, moo, other task docs) and MSGF-01..12 sections left untouched; no CHANGELOG touched per scope.

### Task MSGF-14: Measure Replay And Inbox Resource Costs Before Adding Limits Or Indexes

Status: completed

Assigned agent: query-analysis agent (MSGF-14 only; read-only experiments, no production edits).

Kind: investigation

Priority: P2 — unbounded batch/replay work and incomplete query measurements need evidence before policy changes.

Suggested agent: MongoDB performance/resource-boundary analyst

Dependencies: MSGF-06, MSGF-10, MSGF-12

Primary ownership: bounded benchmark/integration experiments under `packages/message-service/test/`; measurement and recommendation notes in this task file. Production performance edits require a separately accepted follow-up.

Finding: Completed/pending replay currently hydrates all scoped active messages with `limit(Number.MAX_SAFE_INTEGER)` and performs the message query even before examining reservation state. Every wait cycle also retries reservation insertion. Prepared batches have no service-level count bound, although templates are trusted and host code controls how input expands. Existing index evidence uses a small fixture and separate visibility branches, not the complete `$or` query under multiple roles and deeper offsets. These observations identify measurement targets, not a proven production slowdown or universally correct maximum.

References:

- `packages/message-service/src/message-service.ts:648-665`, `705-742`, `1416-1438`, `1476-1503`
- `packages/message-service/src/schemas/message.ts:281-313`
- `packages/message-service/test/message-service.mongodb.test.ts:250-290`
- `packages/message-service/README.md:181-183`
- `docs/tasks/20260823-151605-message-service-review-remediation.md:634-643`

Requirements:

1. Measure the final replay protocol after MSGF-06: query count/bytes/hydration and bounded completion time for representative batch sizes and duplicate callers. Examine completed, live-pending, failed, and archived replay paths.
2. Capture `explain('executionStats')` for the actual three-branch visibility query with multiple roles, equal timestamps, representative selectivity, and increasing offsets. Record dataset shape, database version, indexes, keys/docs examined, and blocking sorts.
3. Answer whether state-first reads, narrower projections, polling backoff/jitter, batch caps, or a documented host limit are justified. Consider index write/storage costs; do not add every candidate index.
4. Bound the experiment: local synthetic fixtures only, no external providers, no broad benchmark framework. Recommend implement/defer/no action with evidence and separately scoped follow-up tasks when needed.

Acceptance criteria:

- Reproducible measurements answer which paths need limits/optimization and where host-controlled template expansion is a sufficient contract.
- Proposed limits include compatibility/operational rationale; performance claims include before/after or baseline evidence.
- No cursor API or retention TTL is introduced merely to complete this investigation; destructive retention must account for idempotent replay.

Verification: run and record the exact V1 experiment command/file; V2/V3 if test infrastructure changes; independent review of measurements and recommendations.

Completion evidence (MSGF-14, 2026-09-12):

- Changed files (investigation only; no `src/`, README/DESIGN, index, or MSGF-01..13 edits):
  - `packages/message-service/test/message-service.resource-costs.test.ts` (new) — 3 bounded local-synthetic experiments, no external providers, no benchmark framework: (1) completed-replay cost for batch sizes 1/5/20; (2) duplicate callers + archived + failed + live-pending paths with model-layer query counters; (3) `explain('executionStats')` for the actual 3-branch visibility query with multiple roles, equal timestamps, selectivity, and increasing offsets.
- Verified commands (repo root, serial):
  - V1 experiment: `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts test/message-service.resource-costs.test.ts --reporter=verbose` → 3 passed. Console captures `MSGF14_REPLAY_BATCH_ROWS`, `MSGF14_DUP_CALLERS`, `MSGF14_ARCHIVED_REPLAY`, `MSGF14_FAILED_REPLAY`, `MSGF14_LIVE_PENDING`, `MSGF14_VISIBILITY` (values below).
  - V2: `pnpm --filter @web-ts-toolkit/message-service test` → 19 files, 299 passed (baseline 296 + 3 new), includes MongoDB replica-set and packed-consumer suites.
  - V3: `pnpm exec eslint "packages/message-service/test/message-service.resource-costs.test.ts"` clean; `git diff --check` clean.
- Replay protocol measurements (final MSGF-06 code; `findCompletedClientRequestReplay` is reservation-first; `limit(Number.MAX_SAFE_INTEGER)` scoped by owner/template/requestId):
  - Completed active-only replay by batch size (each: 1 reservation `findOne` + 1 active `find` + 1 archive `find` = 3 reads, `prepareMessage` ×1, no reconciliation re-read):
    - size 1: 6.54 ms, 900 B total (900 B/doc)
    - size 5: 7.44 ms, 4496 B total (899 B/doc)
    - size 20: 5.64 ms, 18041 B total (902 B/doc)
    - Conclusion: constant query count, flat time, linear bytes (~0.9 KB/doc with 120-char pad payload). No superlinear blowup at 20 items.
  - Duplicate callers on completed scope (3 concurrent replays, batch 5): 9.72 ms total, 3/3/3 reads per path, `prepareMessage` ×1 — one committed batch, per-caller cost equals one completed replay.
  - All-archived replay (2-item batch, both action-committed): 4.85 ms, 2331 B, 1/1/1 reads, `prepareMessage` ×1, both docs narrow via `'archivedAt' in doc`. No prep/payment rerun.
  - Failed replay: 1 reservation `findOne` only, 0 active/archive finds — state-first confirmed.
  - Live-pending duplicate with `clientRequestWaitMs: 0`: 7.58 ms immediate `ClientRequestPendingError`; 2 reservation `findOne` (initial state-first check + one wait-cycle recheck, both pending→null before any message read) + 1 duplicate-key `create` attempt + 1 failed `findOneAndUpdate` takeover, 0 active/archive finds — bounded single cycle, no polling loop.
  - Correction to the task Finding: the "message query before reservation state" observation is stale after MSGF-06 — failed and live-pending paths perform zero message reads; completed paths read messages only after observing a completed reservation (or a stable second-miss with visible messages before declaring corruption).
- Visibility query measurements (actual `buildVisibilityFilter(user)` + `.sort({ createdAt: -1, _id: -1 }).skip().limit(20)`):
  - Dataset: 240 docs (40 fromUser + 40 toUser + 40 toRoles `editor` + 20 toRoles `reviewer` = 140 visible ≈58% selectivity; 100 invisible noise; first 60 share one `createdAt` for `_id` tie-break; 2 roles on the querying user).
  - Versions: MongoDB server 8.2.6 (`mongodb-memory-server`), Mongoose 9.9.2.
  - Indexes present: `_id_`, `fromUser_1_createdAt_-1__id_-1`, `toUser_1_createdAt_-1__id_-1`, `toRoles_1_createdAt_-1__id_-1`, `actionState_1_actionLeaseExpiresAt_1`, `actionAttemptId_1`, both MSGF-06 scoped client-request indexes.
  - executionStats (all `nReturned: 20`, `pageLength: 20`, `executionTimeMillis: 0`):
    - skip 0: keys 23, docs 20
    - skip 40: keys 62, docs 20
    - skip 100: keys 120, docs 20
  - Plan: `SUBPLAN` with per-branch `IXSCAN` on all three `*_1_createdAt_-1__id_-1` indexes + `SORT_MERGE` (+ `SKIP`/`LIMIT`/`FETCH`); `hasBlockingSort: false`, `hasCollscan: false` at every offset. Keys examined grow with skip (expected merge-skip cost); docs examined stay flat at the page size. Equal-timestamp tie-break pages correctly via `_id`.
- Answers:
  - State-first reads: already satisfied — no change justified. Failed/live-pending duplicates never touch message collections; completed replays touch each collection exactly once (plus one bounded reconciliation only on true transit mismatch, not exercised here).
  - Narrower projections: not justified now (no-action). Replay must hydrate full union docs (`IMessage | IMessageArchive`) for the documented current-records contract; ~0.9 KB/doc linear growth shows no hydration cliff at representative sizes. A projection/lean variant would fork the return contract for badge/count paths only — separately scoped if large-doc evidence ever appears.
  - Polling backoff/jitter: not justified now (defer). Zero-wait duplicates exit in one cycle (~7.6 ms, 4 reservation ops, 0 message reads); nonzero waits stay bounded by `clientRequestWaitMs` (MSGF-10). Jitter/backoff only matters under sustained duplicate storms — no such contention was established.
  - Batch caps / host limit: no service hard cap (no-action on enforcement). Cost is linear in the host-controlled `prepareMessage` array length and flat in query count; templates are trusted and hosts control fan-out, so a service-side maximum would silently truncate legitimate batches (breaking compatibility) without evidence of abuse. Host-template-expansion is the sufficient contract: the host that builds the array owns its bound. A docs-only "choose your batch bound" guidance note is the most that is justified — proposed as follow-up (a), not imposed here.
  - Index cost: no new index justified. The three existing visibility compounds jointly serve the full `$or` + sort via index-per-branch merge with no blocking sort and no COLLSCAN; adding a covering/`$or`-specific index would pay write/storage on every message write for zero measured plan gain. MSGF-06 scoped replay indexes are retained on evidence; no further replay index proposed.
- Recommendations (implement/defer/no-action):
  - No-action: state-first protocol (already landed), replay projections, service batch hard cap, new visibility/replay indexes, cursor API, retention TTL. No cursor/retention was introduced by this investigation.
  - Defer with scoped follow-ups (each needs its own accepted task; none started here):
    - (a) Docs-only host batch-size guidance (README/DESIGN note: bound `prepareMessage` fan-out per use case; large fan-outs pay ~0.9 KB/doc hydration + transaction write cost) — non-breaking, no code.
    - (b) Polling jitter/backoff under proven duplicate contention — requires a contention workload first; current fixed cadence + deadline is sufficient.
    - (c) Lean/projection read for count/badge-style paths if large-payload profiles ever show a cliff — must not change the `createMessage` union return contract.
- Residual risk: measurements are local-synthetic (`mongodb-memory-server` 8.2.6, ≤240 visibility docs, ≤20-item batches, 120-char pad payloads) — not production load evidence. Larger documents, bigger batches, or hotter duplicate contention could shift polling/projection trade-offs; revisit via follow-ups (a)–(c) with workload-specific numbers rather than speculative limits. Unrelated worktree changes (pdf-reader, moo, other task docs) and MSGF-01..13 sections left untouched.

### Task MSGF-15: Independently Verify Cross-Boundary Outcomes

Status: completed (independent reviewer — did not implement MSGF-01..14; review-only, no implementation changes made)

Kind: improvement

Priority: P1 — distributed lifecycle fixes require combined runtime and consumer verification.

Suggested agent: independent security/persistence/package reviewer

Dependencies: MSGF-01 through MSGF-14

Primary ownership: review evidence and completion/deferred notes in this file; review all changed code and tests without broad implementation ownership.

Finding: Passing the existing 157-test suite did not prevent the 13 probe observations recorded above. The previous completed plan also claimed stronger cross-path guarantees than some public paths delivered. Verification must test composed behavior rather than rely on task completion labels.

References:

- Baseline/probe evidence and all acceptance criteria in this document
- `packages/message-service/test/message-service.mongodb.test.ts`
- `packages/message-service/test/message-service.packed-consumer.test.ts`
- `docs/tasks/20260823-151605-message-service-review-remediation.md:809-823`

Requirements:

1. Review every acceptance criterion against source, real MongoDB behavior, public declarations, HTTP payloads, and package examples.
2. Exercise combined paths: payment cleanup after preparation/session failures; action takeover with stale completion; authorized archive replay during concurrent movement; direct archive versus service actions; denied archived results; failed-create HTTP retries.
3. Verify internal diagnostics stay internal, public identifiers require authorization, model/session ownership remains consistent, and no transaction-free fallback weakens documented guarantees.
4. Run V2/V3/V4/V5 serially as required. Record exact pre-existing/unrelated blockers and any unverified acceptance criteria; do not mark blocked verification completed.
5. Review investigation conclusions and deferred features for explicit residual risk. Create bounded new tasks for independent findings instead of quietly growing scope.

Acceptance criteria:

- Every implemented task has reproducible regression/consumer evidence; confirmed defects no longer reproduce under their stated assumptions.
- Source, types, README, website, and shipped artifacts agree; index/schema/API changes have migration/release notes.
- Required checks pass, or blocked tasks name the prerequisite/owner and remaining unverified criteria.
- No unexplained code churn, generated-file edits, or unrelated changes are included.

Verification: V2, V3, V4, V5 and independent acceptance-evidence review.

Completion evidence (MSGF-15, 2026-09-12, independent reviewer):

- Method: review-only. No `src/`, test, README/DESIGN, website, or config edits were made by
  this reviewer. The only files touched are this task file (MSGF-15 status/evidence). A
  temporary probe script was executed from inside the package directory for module resolution
  and then deleted; the retained copy lives outside the repo at
  `/tmp/opencode/msgf15-probe.mjs` (not committed). `git status` confirms no reviewer churn;
  remaining worktree changes belong to parallel workstreams (moo, pdf-reader, other task docs)
  and were left untouched. No CHANGELOG touched. No `dist/` edits committed (`git status --
packages/message-service/dist/` empty; dist is build output).
- V2 — package acceptance: `pnpm --filter @web-ts-toolkit/message-service test` → **19 files,
  299 passed** (final run 12:55 UTC; identical result 12:35 UTC), includes build, unit,
  real-MongoDB replica-set, and packed-consumer suites.
- V3 — lint/patch: `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` exit 0;
  `git diff --check` exit 0.
- V4 — workspace integration (serial, from repo root):
  - `pnpm lint` → fails ONLY outside message-service: 8 errors in `pdf-reader`
    (`PDFReader.ts:878` unsafe-Function, `PDFReader.test.ts:2286/2300` unused vars,
    `pdf-reader.browser.ts:394` useless assignment, benchmark file) plus moo and one
    access-router-client warning set; **zero message-service findings** (message-service is
    V3-clean). Unrelated pre-existing blocker, not edited per scope.
  - `pnpm build` → exit 0 (all workspace packages including apps).
  - `pnpm test` (serial) → 12 packages fully green (e.g. 32/566, 18/335, 11/341, 35/279);
    the serial run halts at unrelated failures: `@web-ts-toolkit/moo` (7 failures in
    `test/moo.packed-consumer.test.ts` MOO-09 harness) and, on an earlier pass,
    `create-access-router-mongo-starter` (`integrity-transaction` 201-vs-409 assertion +
    packed-consumer). Verified `packages/moo/package.json` and
    `packages/message-service/package.json` have **no dependency edge in either direction**,
    so these cannot be caused by MSGF changes. message-service's workspace portion is the
    identical package script already proven by V2 (299 passed); no message-service failure
    was observed in any run.
- V5 — published contracts: `pnpm --filter @web-ts-toolkit/message-service exec vitest run
--config ../../vitest.config.ts test/message-service.packed-consumer.test.ts` (after
  `pnpm --filter @web-ts-toolkit/message-service... build`) → **8 passed**, covering strict
  NodeNext/Bundler `skipLibCheck: false` compiles, installed-tarball ESM/CJS runtime, and
  packed README create/action execution vs real persistence. Rebuilt `dist/index.js` +
  `index.mjs` export identical key sets (incl. `interpolateMessageContent`,
  `hasExplicitPermissionGrant`, `requireMessageUserId`, `isValidMessageUserId`,
  `PaymentSessionCompensationAggregateError`, `InvalidMessageServiceOptionError`,
  `MessageTransactionRequiredError`, `MAX_MESSAGE_SERVICE_TIMEOUT_MS`); `dist/index.d.ts`
  carries `Registered*` readonly views, required `getActions(..., { user: MessageUser })`,
  and retained JSDoc. `package.json` conditional exports unchanged (single root entry).
- Independent combined-path probe (built `dist/index.mjs` + real `mongodb-memory-server`
  replica set + live Express via injected-service route path): **27/27 passed**:
  - A payment cleanup after 2nd-item prep failure: 2nd `createSession` throws
    `SYNTH-PROVIDER-A-boom` → first session `sess-A1` expired, zero active docs persisted.
  - F direct failed-create replay: `ClientRequestFailedError` with stable message (marker
    hidden), `clientRequestId` retained for the safe retry outcome.
  - B action takeover + stale completion: first claim expired via DB lease update, takeover
    commits `ok`, stale worker throws `ActionConflictError`, exactly 1 archive, active gone.
  - C authorized archive replay during movement: 2-item paid batch, 1 item action-archived,
    same-scope replay returns 2 docs (arch + active), 0 new sessions, 0 expirations.
  - D direct archive vs service: live service claim blocks `doc.archive()` with
    `ActionConflictError`, service then commits once; uncontended direct `archive()` moves
    atomically (active 0 / archive 1).
  - E denied archived: stranger `handleAction` on hydrated archive → `ActionNotAllowedError`
    with no attempt ID in the message. (Probe note: lean/plain archive objects lack
    `isSender`/`isReceiver` document methods by declared contract — hydrated docs required;
    not a defect, no task created.)
  - HTTP failed-create retry (injected service): first POST 500, retry same `clientRequestId`
    → 409 `{"message":"clientRequestId \"req-HTTP\" previously failed; retry with a new
clientRequestId"}` with marker absent. HTTP archived stranger action → 403
    `{"message":"not allowed"}` with attempt ID absent. (Probe note: the route
    construction path builds its own service without host providers by MSGF-11 design, so
    provider-behavior HTTP assertions must use the injection path — done here.)
- Per-task acceptance verdicts (each vs source, tests, declarations, payloads, examples):
  - MSGF-01 fencing: PASS — `actionOwnerToken` minted per acquisition, stable
    `actionAttemptId`; completion/failure/archive/notification writes conditioned on token
    (`message-service.ts:1219-1430`); stale paths throw `ActionConflictError`; 4 barrier
    regressions incl. legacy token-less takeover (`action-fencing.test.ts:228`).
  - MSGF-02 claim-bound authz: PASS — `authorizeClaimedAction` on the claimed doc,
    fenced denied-claim release, `authorizeArchivedOutcome` relationship gate before any
    attempt-ID disclosure on direct + claim-fallback + HTTP paths; 7 regressions.
  - MSGF-03 principals: PASS — shared `requireMessageUserId` in service entry points
    (both create branches, `getActions` pre-lookup) and route `requireUser` incl. custom
    extractors; 46 regressions; trusted host ops documented.
  - MSGF-04 permissions: PASS — single `hasExplicitPermissionGrant` (own + `=== true`)
    in engine + admin route lookup; 19 regressions incl. `constructor`/`__proto__`.
  - MSGF-05 compensation: PASS — later-prep/model/`startSession` coverage, attempt-every
    session with `PaymentSessionCompensationAggregateError`, committed sessions retained
    post-`withTransaction`, sequential per-item semantics kept; 14 real-MongoDB regressions.
  - MSGF-06 replay: PASS — current-records union contract, active-then-archive + `_id`
    dedup + bounded reconciliation, scoped archive indexes in `schemas/message-archive.ts`,
    no prep/payment rerun; 10 regressions; V5 return-type fixtures.
  - MSGF-07 direct archive: PASS — retained trusted primitive is transactional on the
    owning connection, refuses live claims (`ActionConflictError`), typed invalid/repeat
    outcomes, `MessageTransactionRequiredError` without txn support; 10 regressions.
  - MSGF-08 rendering: PASS — `interpolateMessageContent` at creation, admin/archived
    listings skip `filterActions`, payload-vs-`templateData` contract with distinct-value
    regression; additive exports only; 6 regressions.
  - MSGF-09 HTTP boundary: PASS — `mapServiceError` rebuilds failed-replay 409 from
    `clientRequestId` only (route-factory.ts:150-158 + audit note); first-failure and
    pending/conflict/archive behaviors preserved; 3 live-HTTP regressions.
  - MSGF-10 timing: PASS — `validateDurationOption` ranges, `MAX_MESSAGE_SERVICE_TIMEOUT_MS
= 2147483647`, `clientRequestNow` seam used consistently, zero-wait contract; 6 tests.
  - MSGF-11 composition: PASS — discriminated-union injection/construction, all service
    keys conflict-rejected with `InvalidMessageServiceOptionError`, exact-instance reuse,
    observable custom-model/provider/timing tests; 7 regressions + packed runtime/typing.
  - MSGF-12 seams: PASS — `persistence.ts:runMessageTransaction` fails closed (no
    sessionless fallback; only 2 documented-atomic call sites use it), `errors.ts`
    extraction preserves branding/re-exports, unit matcher `$or`/sort fixed, barriers
    renamed to create-milestones; compound `_id`/`$or` claim isolation on real MongoDB.
    `src/index.ts` export surface unchanged by this task; single-root exports map intact.
  - MSGF-13 types/examples: PASS — readonly `Registered*` registry views, required action
    user, README + website use `prepareMessage`/`templateData`/`router.original`/real 401
    auth, POST-only mutation (`router.post('/:id/action/:actionCd')`; the one remaining
    action GET is the read-only listing), 2 readme-contract regressions + 8 packed tests.
  - MSGF-14 investigation: PASS (read-only honored — no `src/`/README/DESIGN/index edits;
    only `test/message-service.resource-costs.test.ts` added). Measurements reviewed:
    replay cost linear (~0.9 KB/doc, constant 3 reads), failed/pending paths zero message
    reads (finding corrected post-MSGF-06), visibility `$or` served per-branch IXSCAN +
    SORT_MERGE with no blocking sort/COLLSCAN at skips 0/40/100 on 240 docs. No-action
    verdicts (projections, batch caps, new indexes, cursor/TTL) and defers (a docs batch
    guidance, b jitter/backoff, c lean reads) are evidence-proportionate; residual risk
    honestly bounded to local-synthetic fixtures (8.2.6, ≤240 docs, ≤20-item batches).
    No separately-scoped perf task started here per the plan; none needed from review.
- No-txn-fallback check: `grep startSession|withTransaction` shows all atomic writes via
  `runMessageTransaction` (fail-closed) or owning-connection `withTransaction` in
  `schemas/message.ts`; unit fakes use an explicitly documented non-isolating seam, and
  lifecycle truth lives in MongoDB barrier suites. PASS.
- Diagnostics-internal / IDs-authorized / ownership checks: failed-replay bodies carry only
  caller-supplied scoped `clientRequestId`; archived/pending/conflict disclosures gated by
  MSGF-02 relationship policy + claim authz; `resolveModel` keeps owning-connection
  mismatch errors (`message-service.ts:921-926`); trusted vs user-facing APIs documented.
  PASS.
- Blockers / unverified criteria: **none for message-service**. V4 workspace-wide green is
  blocked by unrelated pre-existing failures (moo MOO-09 packed-consumer ×7;
  create-access-router-mongo-starter integrity/packed ×2 sighted once; pdf-reader lint
  errors) — recorded above with file/test names; no message-service criterion depends on
  them. No new bounded tasks created: the probe surfaced zero source defects (the two
  probe-side mistakes — lean-doc methods, construction-vs-injection provider scope — are
  documented above as contract clarifications, not findings).
- Residual risks carried forward (explicit, unchanged from task evidence): fencing guards
  persisted state only (in-flight external calls still need handler dedup); claim-time
  authz guarantee (post-claim host writes race); out-of-band reconciliation for ambiguous
  provider/commit outcomes and non-idempotent `expireSession` providers; archive
  retention-deletion turns later replays into `InconsistentState`; construction-time
  fail-fast on previously-accepted invalid timing/permission/service-mix configs;
  MSGF-14 numbers are local-synthetic, not production load evidence. Deferrals in
  Decisions section (outbox, notification reconciliation, payment crash recovery, cursors,
  template cache/sanitization, peer-version matrix) remain separately scoped by maintainer
  request; none was silently started or closed here.

## Decisions And Consequential Deferrals

No decision blocks starting MSGF-01, MSGF-03, MSGF-04, MSGF-05, or MSGF-10. Resolve these before the affected public-contract implementation:

1. **MSGF-06 replay result:** immutable creation response versus current active/archive state versus explicit operation result. The persistence/API owner must record a choice and migration implications; returning archives as `IMessage` is not acceptable.
2. **MSGF-07 public archive:** retain a trusted atomic primitive or deprecate/remove it. The API owner must determine release compatibility before changing supported document methods.
3. **MSGF-11 composition:** choose one unambiguous injection/construction contract; avoid silently combining a supplied service with conflicting service options.
4. **MSGF-14 resource limits:** batch/poll/offset policy requires measurements and a host workload assumption. Timing validation in MSGF-10 can proceed without those policy decisions.

Retain these deliberate deferrals from the earlier plan unless a maintainer requests a separate feature phase:

- **Durable email outbox/retry worker:** session-bound creates currently skip schema email entirely, including idempotent creation. Best-effort non-transactional delivery is documented; reliable transactional email remains a missing opt-in capability, not a promised feature. A future transactional outbox needs an explicit service/session extension point and must not run external mail inside a retryable transaction callback.
- **Sender-notification reconciliation API:** pending/failed archive flags exist, but there is no package retry worker/API or durable rendered notification intent. Hosts currently reconcile; crashes can leave notifications pending. A future design must deduplicate notification creation and preserve enough actor/content context without rerunning the business handler.
- **Payment crash/ambiguous-provider recovery:** the provider interface has no explicit durable create-session idempotency key, and process death before recording a returned session cannot be fixed by in-process compensation alone. MSGF-05 covers known sessions on observed failures, not exactly-once provider behavior. A separately scoped provider-protocol investigation is needed before claiming crash-safe session creation.
- **Tenant/application namespace, read receipts, history APIs, retention, and first-class cursors:** useful possible features, but not required to close the reproduced defects. Existing scoped idempotency and host-owned visibility/cursor queries remain the supported boundary; retention can invalidate replay and needs its own policy.
- **Dynamic template cache, HTML sanitation, and arbitrary plugin code:** keep the documented trusted-static-template/plain-text contract. This review did not demonstrate an HTML exploit or a CPU regression in that supported mode.
- **Broad peer-version certification:** packed consumers passed with the installed dependency set. The declared Mongoose >=8 range was not matrix-tested here; add a bounded compatibility investigation if releases rely on that full range.

## Definition Of Done

- Confirmed defects have failing-before/passing-after regressions for their stated failure scenarios, including alternate direct-service/document and HTTP paths.
- Stable logical action identity is separate from worker ownership; replay remains coherent through normal archival; known uncommitted sessions receive complete cleanup attempts.
- Public auth/error boundaries fail closed without discarding useful internal diagnostics.
- Composition and persistence seams improve reuse/test fidelity without weakening connection/transaction contracts.
- Public types and copy-paste examples match runtime and installed artifacts; performance changes follow measurements.
- Every task has a final status with evidence. Use `deferred` only with rationale/residual risk, `cancelled` only with an explanation, and `blocked` when required verification/decisions are missing.
- The independent reviewer records final integration evidence. This plan is not complete merely because its file exists.
