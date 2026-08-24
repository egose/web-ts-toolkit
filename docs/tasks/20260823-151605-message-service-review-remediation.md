# Message Service Review Remediation

Created: 2026-08-23 15:16:05 PDT

Package: `packages/message-service`

## Objective

Remediate confirmed authorization, idempotency, concurrency, persistence-consistency, model-ownership, public API, packaging, and documentation gaps in `@web-ts-toolkit/message-service`. Preserve its template-driven Mongoose and Express role while making request ownership explicit, side-effect workflows recoverable, connection boundaries consistent, and behavior verifiable against a real MongoDB instance and an installed package artifact.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Treat route parameters, request bodies, `clientRequestId`, user objects, roles, template data, and pagination values as caller-controlled input.
- Treat template handlers, payment providers, and email notifiers as external side-effect boundaries that can fail, time out, or be retried.
- Enforce authorization and idempotency at `MessageService`, not only in the route adapter, because the service is public and documented for direct use.
- Prefer one explicit lifecycle state machine over independent create, archive, notification, and reservation checks spread across hooks and routes.
- Do not claim exactly-once external side effects. Require idempotent handler/provider contracts and durable attempt identifiers where retries are possible.
- Do not edit generated `dist/` files manually. Rebuild from TypeScript source.
- Update source, declarations, README, design notes, and packed-consumer tests together when a public contract changes.
- Preserve unrelated worktree changes and never revert another agent's work.
- Run package tests serially. The package test rebuilds its dependency closure, so agents must not run overlapping workspace builds or tests concurrently.

## Non-Goals

- Do not turn the package into a queue, payment processor, tenant resolver, or full workflow engine.
- Do not infer tenant identity from roles, request headers, or message recipients. Tenant scoping requires an explicit host-provided value if supported.
- Do not preserve mutating `GET` routes through an unsafe compatibility alias unless a maintainer explicitly accepts the CSRF, crawler, and prefetch risk.
- Do not promise exactly-once payment, handler, email, or notification delivery without an idempotent provider and durable persistence protocol.
- Do not add arbitrary Handlebars cache, template-size, or pagination policies without documented limits and tests.
- Do not replace readable domain types with broad `unknown` or `any` casts merely to satisfy Mongoose typing.
- Do not optimize query paths without representative `explain()` evidence after indexes are proposed.

## Review Baseline

Confirmed on 2026-08-23 before this task file was created:

- `pnpm --filter @web-ts-toolkit/message-service test`: passed, 4 files and 77 tests. The command rebuilt the package and its dependency closure successfully.
- `pnpm exec eslint "packages/message-service/**/*.{ts,js}"`: passed with no findings.
- `git diff --check`: passed.
- `pnpm pack --dry-run --json` from `packages/message-service`: passed and listed `README.md`, `LICENSE`, `package.json`, and four `dist/index` runtime/declaration files.
- Existing tests import source modules and use in-memory Mongoose-shaped mocks. They do not execute MongoDB transactions, real unique indexes, connection-local model lookup, archive races, or installed-package resolution.
- `clientRequestId` is queried and uniquely reserved globally. It is not scoped by requester, template, or tenant, so a second caller can receive another caller's messages before template preparation or authorization runs.
- Batch items are inserted sequentially. Any visible item is treated as a complete duplicate result even while the reservation is pending or `itemCount` says more items are expected.
- An abandoned pending reservation causes repeated polling cycles without a global deadline or takeover lease.
- Action handlers execute before any atomic claim. Concurrent callers can both perform the business side effect, and archive plus sender notification are separate non-atomic operations afterward.
- The action route accepts both `GET` and `POST`; routes also substitute `{ _id: '' }` when authentication yields no user.
- Payment sessions are created before message persistence and are not expired when persistence or a later batch item fails.
- Schema methods and hooks use global `mongoose.model(...)`, while `MessageService` accepts an injected `getModel`; custom connections therefore are not consistently supported.
- No material CPU regression was reproduced. The confirmed performance concern is query scalability: visibility filters sort through three `$or` branches without branch-aligned compound indexes, and offset pagination degrades for deep pages.
- The package emits separate ESM and CJS module graphs containing separate `defaultRegistry`, schema instances, and error constructors. Conditional exports also always select `index.d.ts`, leaving `index.d.mts` unused for ESM typing.
- The README quick start mounts `router` instead of `router.original`, states an MIT license while the repository is Apache-2.0, and documents stronger idempotency guarantees than the implementation provides.

## Priorities

- P0: cross-user data exposure, unauthenticated mutation, unsafe HTTP mutation, duplicate business side effects, or persistent partial-batch corruption.
- P1: inconsistent persistence or provider state, fail-open service authorization, connection breakage, or an installed-package contract likely to fail consumers.
- P2: bounded input, typing, test isolation, readability, query scalability, or documentation gaps with contained impact.
- P3: optional optimization or API expansion requiring measurements or maintainer policy.

## Wave 0: Deterministic Persistence Baseline

### Task MSG-01: Add Real MongoDB And Packed-Consumer Test Harnesses

Status: completed

Priority: P1

Suggested agent: Mongoose integration and package-consumer test specialist

Dependencies: none

Primary ownership:

- new focused integration fixtures under `packages/message-service/test/support/`
- new MongoDB integration tests under `packages/message-service/test/`
- new packed-consumer tests under `packages/message-service/test/`
- `packages/message-service/package.json` test script only as required

Finding:

The current suite models Mongoose with arrays and chain-shaped mocks. Its `$in` behavior differs from MongoDB, its sort helper does not honor production ordering, concurrency barriers do not prove exact interleavings, and no test loads the built package through its export map. Security and lifecycle fixes cannot be trusted without real indexes, sessions, hydrated methods, connection-local models, and package-name imports.

References:

- `packages/message-service/test/message-service.test.ts:54-204`
- `packages/message-service/test/message-service.test.ts:459-543`
- `packages/message-service/test/schemas.test.ts:7-124`
- `packages/message-service/package.json:16-30`
- root `package.json:43-45`

Implementation requirements:

1. Use the existing root `mongodb-memory-server` dependency and a replica-set fixture when transaction behavior is under test.
2. Provide isolated model names, databases, registries, and cleanup per test; do not rely on `defaultRegistry` or global model state across cases.
3. Add explicit deferred-promise barriers that expose milestones such as reservation acquired, first item committed, action claimed, and archive committed.
4. Add a release-like packed-package harness using the repository's publish transformation, package-name imports, and fresh consumer directories.
5. Cover native ESM, CommonJS, strict NodeNext ESM/CommonJS, and Bundler declaration resolution with `skipLibCheck: false`.
6. Keep fast unit tests for pure template logic; use integration tests only where MongoDB or package resolution semantics matter.
7. Await Express server shutdown in route tests so tests do not leak handles.

Acceptance criteria:

- A test proves actual MongoDB role-array `$in` behavior and hydrated `isSender`/`isReceiver` methods.
- A test proves unique and partial indexes are enforced by MongoDB rather than only inspecting schema metadata.
- Concurrency tests can pause independently after the first batch item and after an action claim.
- ESM and CJS package-name imports load from a freshly installed release-like tarball.
- Strict NodeNext and Bundler consumers compile against emitted declarations.
- `pnpm --filter @web-ts-toolkit/message-service test` passes.

Completion evidence:

- Added isolated MongoDB replica-set fixtures, connection-local models, per-test registries/databases, and reusable deferred barriers under `packages/message-service/test/support/`.
- Added real MongoDB tests proving role-array `$in` visibility, hydrated `isSender`/`isReceiver`, MongoDB-enforced unique/partial indexes, and independent reservation/first-item/action/archive pause points.
- Added release-transformed packed-consumer tests proving package-name ESM/CJS runtime loading, strict NodeNext ESM/CommonJS compilation, and strict Bundler declaration compilation with `skipLibCheck: false`.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 test files and 84 tests.

## Wave 1: Idempotency And Creation Integrity

### Task MSG-02: Scope Idempotency To The Request Owner And Template

Status: completed

Priority: P0

Suggested agent: application-security and data-model specialist

Dependencies: MSG-01

Primary ownership:

- `packages/message-service/src/message-service.ts`
- `packages/message-service/src/schemas/message-request.ts`
- `packages/message-service/src/schemas/base.ts`
- focused idempotency integration tests
- contract and migration notes

Finding:

`createMessageWithReservation()`, `findByClientRequestId()`, and `MessageRequest` uniqueness use only the caller-controlled `clientRequestId`. Existing messages are returned before template lookup or ownership validation. User B can therefore submit User A's request ID and receive A's payload, recipients, documents, payment session, and rendered content. The same ID also collides across unrelated templates.

References:

- `packages/message-service/src/message-service.ts:182-221`
- `packages/message-service/src/message-service.ts:236-260`
- `packages/message-service/src/message-service.ts:564-625`
- `packages/message-service/src/schemas/message-request.ts:3-16`
- `packages/message-service/src/schemas/message.ts:173-184`
- `packages/message-service/README.md:170-176`

Implementation requirements:

1. Define one immutable idempotency scope used by reservation acquisition, message writes, duplicate lookup, completion, release, and indexes.
2. Include at least requester identity and `templateCd`; include an explicit tenant/scope identifier only if the host supplies one rather than inferring it.
3. Store the same scope on reservation records and persisted messages so replay lookup cannot broaden after reservation completion.
4. Validate `clientRequestId` as a non-empty, bounded string at the service boundary. Define whitespace and case behavior explicitly.
5. Never return an existing message batch until every scope component matches the current request.
6. Add a migration/release note for changed unique indexes and any new persisted fields; do not leave obsolete global indexes in deployment instructions.
7. Preserve valid same-owner, same-template replay behavior.

Acceptance criteria:

- Reusing one ID across two users never returns the first user's data or suppresses the second user's operation.
- Reusing one ID across two templates never returns the wrong template's batch.
- Same-scope concurrent retries resolve to the same complete result.
- Empty, whitespace-only, non-string, and oversized route IDs receive a documented client error rather than silently disabling idempotency.
- Database indexes enforce the selected compound scope.
- A failing-before integration regression covers cross-user and cross-template reuse.
- Package tests pass.

Completion evidence:

- Scoped idempotent creation to the trimmed, case-preserved `clientRequestId`, requester identity (`String(user._id)`), and `templateCd` in service reservation acquisition, duplicate lookup, completion, release, and persisted message writes.
- Added `clientRequestOwnerId` fields and compound scoped indexes to `Message` and `MessageRequest` schemas; removed the old message-level global `clientRequestId` index from schema declarations.
- Added service/route validation for non-string, empty, whitespace-only, and oversized `clientRequestId` values, plus docs defining trim and case-sensitive behavior.
- Added MongoDB integration regressions proving cross-user and cross-template `clientRequestId` reuse creates separate batches, and same-owner same-template replay is preserved.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 92 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

### Task MSG-03: Make Batch Reservations Complete, Recoverable, And Bounded

Status: completed

Priority: P0

Suggested agent: MongoDB concurrency and state-machine specialist

Dependencies: MSG-02

Primary ownership:

- `packages/message-service/src/message-service.ts`
- `packages/message-service/src/schemas/message-request.ts`
- reservation and batch integration tests
- lifecycle documentation

Finding:

Batch items are persisted sequentially, but duplicate lookup returns as soon as any document exists. It does not require reservation state `completed` or compare documents with `itemCount`. If item two fails, item one remains and the reservation is deleted; later retries return that partial result as success. If a producer dies while pending, waiters loop forever in repeated 200 ms polling cycles because no lease or global deadline exists.

References:

- `packages/message-service/src/message-service.ts:247-270`
- `packages/message-service/src/message-service.ts:300-310`
- `packages/message-service/src/message-service.ts:564-625`
- `packages/message-service/src/schemas/message-request.ts:6-16`
- `packages/message-service/test/message-service.test.ts:428-499`

Implementation requirements:

1. Model reservation states and transitions explicitly, including terminal success and terminal failure or safe cleanup semantics.
2. Return a replay only after a completed reservation has exactly the expected distinct item indexes; preserve completed zero-item results.
3. Persist a batch and its reservation transition atomically with a MongoDB session/transaction, or document and test an equivalent compensating protocol.
4. Add an expiring lease or bounded wait deadline with atomic takeover. A crashed owner must not block retries indefinitely.
5. Surface inconsistent states such as completed-with-missing-items as controlled errors; do not return partial arrays or an ambiguous empty result.
6. Inject or configure polling/lease timing so tests do not use real sleeps.
7. Define transaction requirements for standalone MongoDB deployments and fail clearly if the selected correctness contract requires a replica set.

Acceptance criteria:

- A retry paused after item one of a two-item batch remains pending and never observes one item as complete.
- Failure on item two leaves no successful partial replay; a retry either recreates the full batch or returns a stable recorded failure.
- Failure while marking completion has deterministic recovery behavior.
- A stale reservation can be safely reclaimed by one caller, while a live reservation cannot be stolen.
- Waiting ends with a documented retryable result after the configured bound.
- Empty-result replay remains supported and distinguishable from corruption.
- Real MongoDB concurrency tests and package tests pass.

Completion evidence:

- Added explicit reservation states `pending`, `completed`, and `failed`, plus lease ownership/expiry and completion/failure timestamps to `MessageRequest`.
- Changed idempotent replay to require a `completed` reservation with exactly the expected distinct `clientRequestItemIndex` values; completed zero-item reservations still replay as `[]`, while missing/extra item states raise `ClientRequestInconsistentStateError`.
- Persisted idempotent batches and the reservation completion transition in one MongoDB session transaction, with `MessageTransactionRequiredError` for deployments without transaction support and documented replica-set/sharded-cluster requirements.
- Added bounded duplicate waiting and stale lease takeover via configurable `clientRequestLeaseMs`, `clientRequestWaitMs`, `clientRequestPollMs`, and `clientRequestDelay` options; live reservations raise retryable `ClientRequestPendingError`, and failed reservations replay as `ClientRequestFailedError`.
- Added focused MongoDB integration coverage for uncommitted batch invisibility, bounded live-reservation waits, rollback on second-item failure, stale lease single-winner reclaim, completed-with-missing-index corruption, completed zero-item replay, and transaction-backed batch completion.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 102 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

### Task MSG-04: Compensate Payment Sessions When Message Creation Fails

Status: completed

Priority: P1

Suggested agent: payment workflow and failure-recovery specialist

Dependencies: MSG-03

Primary ownership:

- `packages/message-service/src/message-service.ts:472-513`
- `packages/message-service/src/providers/payment.ts`
- focused payment and batch integration tests
- provider contract documentation

Finding:

`persistItem()` creates a payment session before `Message.create()`. A validation, duplicate-key, connectivity, transaction, or later batch failure leaves a live external session with no usable message. Retrying can create additional sessions. The current successful duplicate test does not cover provider or persistence failure.

References:

- `packages/message-service/src/message-service.ts:303-308`
- `packages/message-service/src/message-service.ts:479-512`
- `packages/message-service/src/providers/payment.ts:13-31`
- `packages/message-service/test/message-service.test.ts:501-543`

Implementation requirements:

1. Define a durable payment creation state or compensating saga compatible with the batch transaction selected in MSG-03.
2. Expire every newly created session whose message or batch does not commit.
3. Make compensation retries observable and idempotent; do not hide failed cleanup without a hook, logger, or durable retry record.
4. Ensure duplicate same-scope retries do not create additional sessions after a committed result.
5. Preserve provider method binding and payer selection behavior.
6. Document that provider compensation methods must be idempotent and define what happens when compensation itself fails.

Acceptance criteria:

- Session success followed by message persistence failure invokes compensation exactly as specified.
- Failure on a later batch item compensates all uncommitted sessions and leaves no replayable partial message batch.
- Concurrent duplicate requests create at most one committed session per payment-bearing item.
- Provider failure releases or records the reservation according to MSG-03's state machine.
- Regression tests cover `null`, thrown, persistence-failure, batch-failure, and compensation-failure branches.
- Package tests pass.

Completion evidence:

- Added payment compensation to message creation: newly created uncommitted sessions are expired when single-message persistence or idempotent batch transaction persistence fails, including transaction-support failures.
- Added observable cleanup failure contract through `onPaymentCompensationFailure`, exported `PaymentCompensationFailureEvent`, and exported `PaymentSessionCompensationError` while preserving bound `expireSession`/`refundPayment` methods and existing payer selection.
- Documented provider idempotency and compensation failure semantics in `PaymentProvider`, README, and DESIGN notes.
- Added focused regressions for payment-session `null`, provider throw, persistence failure, real MongoDB later-batch-item failure, compensation failure, and committed duplicate replay without additional session creation.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 107 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

## Wave 2: HTTP And Action Security

### Task MSG-05: Require Authentication And Remove Mutating GET Routes

Status: completed

Priority: P0

Suggested agent: Express security boundary specialist

Dependencies: MSG-02

Primary ownership:

- `packages/message-service/src/route-factory.ts`
- `packages/message-service/test/route-factory.test.ts`
- route sections in `packages/message-service/README.md`
- release notes for HTTP contract changes

Finding:

The route factory defaults to no authentication middleware and manufactures `{ _id: '' }` when `getUser()` returns no user. Creation can therefore run template, database, and payment side effects for an unauthenticated request. Action execution is registered for `GET`, allowing crawlers, prefetchers, link scanners, caches, and cross-site navigation to trigger state changes.

References:

- `packages/message-service/src/route-factory.ts:76-80`
- `packages/message-service/src/route-factory.ts:95-104`
- `packages/message-service/src/route-factory.ts:114-146`
- `packages/message-service/src/route-factory.ts:152-190`
- `packages/message-service/README.md:82-103`

Implementation requirements:

1. Reject a missing or invalid user before any service, template, payment, or database call on all user-facing routes.
2. If anonymous creation is a real requirement, expose it as an explicit narrowly documented opt-in rather than an empty-ID fallback.
3. Remove the mutating GET action route. Use POST or another non-safe method and return 404 or 405 for GET according to the router contract.
4. Validate `templateCd`, `actionCd`, message IDs, usertype, and `clientRequestId` with documented length and character bounds before database access.
5. Map malformed Mongoose IDs to controlled 400 or 404 responses rather than leaking `CastError` as a server failure.
6. Verify authentication middleware ordering and custom extractor behavior through successful and denied HTTP requests.
7. Document host responsibilities for authentication, CSRF protection, and permission population without weakening service-level checks.

Acceptance criteria:

- Requests without a resolved user return 401 and perform no template, payment, model, or action side effect.
- `GET /:id/action/:actionCd` cannot execute an action; POST remains the sole documented action mutation path.
- Malformed and overlong route values receive stable client responses before Mongoose or template lookup.
- Successful route tests verify the complete request-to-service argument mapping.
- README and route JSDoc no longer advertise mutating GET.
- Route and package tests pass.

Completion evidence:

- Route handlers now require a resolved user with a non-empty `_id` before extracting permissions/identity or invoking service/model/template/payment/action paths.
- Removed GET action execution; `POST /:id/action/:actionCd` is the only registered action mutation route and route docs/README document it as POST-only.
- Added route-level validation for `templateCd`, `actionCd`, message `id`, `usertype`, JSON body shape, and `clientRequestId`; route lookup CastErrors now map to controlled 400 responses.
- Added route tests proving unauthenticated create/actions/action requests return 401 with no service/model side effects, malformed/overlong route values are rejected before lookups, custom extractors still drive successful service argument mapping, and GET action requests do not execute handlers.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 116 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

### Task MSG-06: Add A Durable, Concurrency-Safe Action Lifecycle

Status: completed

Priority: P0

Suggested agent: distributed workflow and MongoDB transaction specialist

Dependencies: MSG-01, MSG-05

Primary ownership:

- `packages/message-service/src/message-service.ts:433-465`
- `packages/message-service/src/schemas/message.ts:48-77`
- active/archive lifecycle schema fields
- focused action concurrency and recovery tests
- action/provider contract documentation

Finding:

`handleAction()` authorizes and runs arbitrary business logic against a previously loaded document before any atomic claim. Two requests can both run the handler. Archive insertion, active deletion, and sender notification then occur as separate operations, creating failure windows where effects repeat, the same ID exists in both collections, or the API reports failure after the action was committed.

References:

- `packages/message-service/src/message-service.ts:437-465`
- `packages/message-service/src/message-service.ts:530-561`
- `packages/message-service/src/schemas/message.ts:56-77`
- `packages/message-service/test/message-service.test.ts:342-361`

Implementation requirements:

1. Define an explicit active, processing, completed/archived, and failed/retryable lifecycle with atomic conditional claims.
2. Ensure only one concurrent request can claim a message, including requests for different actions.
3. Supply a stable action-attempt/idempotency key to handlers and document that external effects must deduplicate it; do not claim database locking makes arbitrary external calls exactly once.
4. Make archive insertion and active-message removal atomic in one MongoDB transaction and one connection/session.
5. Persist sender-notification intent with the committed action or explicitly separate post-commit notification failure from action failure.
6. Define recovery for process death before the handler, after the handler, during archive commit, and after commit before notification delivery.
7. Return stable conflict, archived, committed-with-notification-pending, and retryable failure outcomes through service errors and route mappings.
8. Preserve action permission, sender/receiver, and condition checks at the service boundary.

Acceptance criteria:

- Two concurrent action requests invoke the business handler at most once for one message/action attempt.
- Competing different actions cannot both win.
- Archive insertion and active deletion commit together or roll back together.
- A notification failure cannot cause a committed business action to be reported as wholly uncommitted or rerun on retry.
- Every crash boundary has a documented and tested recovery outcome.
- Real MongoDB concurrency tests prove claim and transaction behavior.
- Package tests pass.

Completion evidence:

- Added active action lifecycle fields (`active`, `processing`, `retryable`) and archive notification/attempt fields, including a unique active `actionAttemptId` index and archive notification state fields.
- Moved action execution to a durable service lifecycle: service-level permission/sender/receiver/condition checks remain before handler execution; the active message is atomically claimed with `findOneAndUpdate`; handlers receive stable `ctx.actionAttemptId`; same/different concurrent actions cannot both win while a live claim exists.
- Replaced post-handler document `archive()` usage with service-owned archive insertion plus active deletion in one MongoDB session transaction. Transaction rollback leaves no archive-only or duplicate active/archive success state.
- Added post-commit sender notification semantics: archives persist notification intent/state, notification failure updates archive state to `failed`, service throws `ActionNotificationPendingError`, and retries against the archived message do not rerun the handler.
- Added service and route errors/mappings: `ActionConflictError` -> 409, `MessageArchivedError` -> 410, `ActionNotificationPendingError` -> 202, and `ActionRetryableError` -> 409.
- Added focused real MongoDB tests for competing action claims across different actions, archive/delete transaction rollback, notification failure recovery without handler rerun, and updated barrier support for action claim/archive commit points.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 124 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

## Wave 3: Encapsulation, Types, And Side Effects

### Task MSG-07: Unify Mongoose Connection And Model Ownership

Status: completed

Priority: P1

Suggested agent: Mongoose connection architecture specialist

Dependencies: MSG-06

Primary ownership:

- `packages/message-service/src/message-service.ts`
- `packages/message-service/src/schemas/message.ts`
- schema factory configuration types
- custom-connection integration tests

Finding:

`MessageService` accepts an injected `getModel`, but archive methods, email hooks, and registration checks use global `mongoose.model()` and `mongoose.modelNames()`. A schema compiled on `mongoose.createConnection()` can query the wrong database or throw `MissingSchemaError`. A custom `archiveModelName` also affects the schema method while service lookup remains hard-coded to `MessageArchive`.

References:

- `packages/message-service/src/message-service.ts:23-27`
- `packages/message-service/src/message-service.ts:146-161`
- `packages/message-service/src/schemas/message.ts:31-45`
- `packages/message-service/src/schemas/message.ts:67-75`
- `packages/message-service/src/schemas/message.ts:101-103`
- `packages/message-service/src/schemas/message.ts:128-166`

Implementation requirements:

1. Select one connection/model resolver abstraction and use it consistently in service operations, schema methods, hooks, registration checks, and transactions.
2. Prefer the hydrated document model's connection where an operation originates from a document.
3. Add configurable active, archive, request, and user model names only where concrete customization is supported end to end.
4. Ensure `findMessage()` searches the same archive model used by `archive()`.
5. Avoid hidden fallback to global Mongoose when a custom resolver or connection was supplied.
6. Improve schema factory generic return types so fields and methods are represented without promising nonexistent methods.

Acceptance criteria:

- All creation, lookup, archive, reservation, and email behavior works using only a non-default Mongoose connection.
- Custom archive model configuration remains findable through `MessageService`.
- A missing model error identifies the selected connection and model role clearly.
- No tested custom-connection path consults the global model registry.
- Generated declarations expose accurate schema/document methods.
- Package tests pass.

Completion evidence:

- Added service-level configurable `modelNames` plus `connection` support and a role-based model resolver used by creation, lookup, reservation, action, archive, notification, and transaction paths; `findMessage()` now uses the configured archive model.
- Changed document-originated schema archive/email behavior to resolve sibling models from the hydrated document's owning connection instead of global Mongoose, with connection-aware registration checks for configured user models.
- Added `MessageModelResolutionError` for clear selected role/model/source failures and exported it with the new model-name options.
- Improved schema factory/document method typings so active documents expose `archive()` and archive documents expose only relationship methods.
- Added MongoDB integration coverage proving custom connection-local active/archive/request names work without global registry access, document-connection email lookup works without global registry access, and missing archive models report the configured role/name/connection.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 127 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

### Task MSG-08: Close Fail-Open Service Authorization And Type Gaps

Status: completed

Priority: P1

Suggested agent: TypeScript API and authorization specialist

Dependencies: MSG-06, MSG-07

Primary ownership:

- `packages/message-service/src/message-service.ts`
- `packages/message-service/src/types/message.ts`
- `packages/message-service/src/schemas/methods.ts`
- `packages/message-service/src/index.ts`
- focused runtime and strict consumer tests

Finding:

`getActions()` skips sender/receiver authorization when `user` is omitted, even though the public direct-service API makes it optional. `handleAction()` accepts a separate `templateCd` and does not verify it matches the message, allowing a direct caller to select another template's handler. Relationship methods stringify nulls, so a string ID of `"null"` can match a missing party. `IMessageArchive` advertises `archive()` although archive documents do not install it, and public signatures use `UserId` without exporting it.

References:

- `packages/message-service/src/message-service.ts:391-430`
- `packages/message-service/src/message-service.ts:437-455`
- `packages/message-service/src/schemas/methods.ts:3-9`
- `packages/message-service/src/types/message.ts:26-44`
- `packages/message-service/src/types/message.ts:75-89`
- `packages/message-service/src/index.ts:8-16`
- `packages/message-service/README.md:121-131`

Implementation requirements:

1. Require a valid user for ordinary `getActions()` calls. Expose any trusted inspection mode through a separate explicit API or capability.
2. Derive the action template from `message.templateCd`; remove the duplicate method argument or reject every mismatch before handler lookup.
3. Return no executable actions for archived messages, consistent with `handleAction()`.
4. Reject null, empty, or invalid user identity before sender/receiver comparisons; never equate null fields with stringified sentinel IDs.
5. Split shared relationship methods from active-only archive methods in document types.
6. Export `UserId` if it remains in public provider and service signatures.
7. Add strict installed-consumer assertions for active/archive methods and canonical exported types.

Acceptance criteria:

- Omitting or supplying an unrelated user cannot reveal actions through the normal public method.
- A foreign template handler cannot execute against a message from another template.
- Archived messages do not advertise executable actions.
- Null parties do not match users with sentinel-like string IDs.
- TypeScript rejects `archive.archive(...)`, while hydrated active documents retain their supported lifecycle API.
- `UserId` is importable from the package root if used publicly.
- Runtime, declaration, route, and package tests pass.

Completion evidence:

- Normal `MessageService.getActions()` now requires a valid user identity before sender/receiver authorization; route calls still provide the authenticated user, and invalid service users map to authentication failure at the route boundary.
- `handleAction()` validates the acting user, rejects mismatched direct-service `templateCd` values before handler lookup, and resolves handlers from the message's own `templateCd`.
- `getActions()` returns no executable actions for archived messages while preserving read-only/admin and notification behavior.
- Relationship methods no longer stringify null or empty parties into comparable sentinel IDs; null/empty message parties do not match users such as `_id: 'null'`.
- Public types keep active-only `archive()` off `IMessageArchive`, export `UserId` from the package root, and packed strict consumers assert active/archive method separation plus canonical type imports.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 132 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

### Task MSG-09: Make Email Delivery Post-Commit And Observable

Status: completed

Priority: P1

Suggested agent: notification reliability specialist

Dependencies: MSG-06, MSG-07

Primary ownership:

- `packages/message-service/src/schemas/message.ts:80-199`
- notification/outbox integration selected by MSG-06
- focused email integration tests
- email contract documentation

Finding:

The email notifier runs in a pre-save hook, so email can be sent before validation, uniqueness, transaction, or persistence failure. All lookup and notifier errors are swallowed, preventing monitoring or retries. Configured exclusions are lowercased but not trimmed despite documentation claiming trimmed normalization.

References:

- `packages/message-service/src/schemas/message.ts:14-38`
- `packages/message-service/src/schemas/message.ts:90-116`
- `packages/message-service/src/schemas/message.ts:144-150`
- `packages/message-service/src/schemas/message.ts:190-198`

Implementation requirements:

1. Do not invoke external email before the message transaction commits.
2. Prefer a durable outbox when reliable delivery is claimed; otherwise document best-effort post-commit semantics precisely.
3. Expose delivery failures to a logger, callback, metric hook, or durable retry state while preserving the selected message-creation failure contract.
4. Normalize both configured exclusions and rendered titles with the same trim and case rule.
5. Define whether updates resend email; avoid accidental notification on every save unless explicitly supported.
6. Resolve recipient models through the connection abstraction from MSG-07.

Acceptance criteria:

- A failed or rolled-back message write sends no email.
- A committed new message sends according to the documented delivery policy.
- Notifier and recipient lookup failures are observable and do not create ambiguous message state.
- Exclusions with surrounding whitespace and case differences behave as documented.
- Updating an existing message follows an explicit tested resend policy.
- Real MongoDB hook/outbox tests and package tests pass.

Completion evidence:

- Replaced external pre-save email delivery with best-effort post-save delivery for newly created, non-transactional messages only; session-bound writes are skipped so external email is not sent before a surrounding MongoDB transaction commits.
- Added observable `onEmailDeliveryFailure` events for recipient lookup and notifier failures, exported the event/stage types, and preserved committed message saves when delivery or observation fails.
- Normalized configured exclusions and rendered-title matching with the same trim + lowercase comparison while passing a trimmed, case-preserved title to the notifier.
- Defined and tested the update policy: existing message saves do not resend email.
- Added focused real MongoDB tests for rollback/no email, committed send, observable lookup/notifier failures, exclusion normalization, update no-resend policy, and connection-local recipient resolution.
- Documented best-effort email semantics, absence of a durable outbox/retry worker, transaction skip behavior, observability hook, exclusion normalization, and no-resend update policy in `packages/message-service/README.md` and `packages/message-service/DESIGN.md`.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 137 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

## Wave 4: Query, Template, And Package Health

### Task MSG-10: Validate Pagination And Index Visibility Queries

Status: completed

Priority: P2

Suggested agent: MongoDB query performance specialist

Dependencies: MSG-01, MSG-07

Primary ownership:

- `packages/message-service/src/message-service.ts:338-385`
- `packages/message-service/src/schemas/message.ts:169-184`
- list/count integration tests
- benchmark or `explain()` evidence in this task document

Finding:

Pagination arithmetic accepts `NaN`, infinities, and fractions, while invalid constructor values such as `maxListLimit: 0` can turn Mongoose `limit(0)` into an unbounded query. Visibility uses `$or` branches for sender, direct recipient, and roles and sorts by `createdAt`, but only a standalone ascending timestamp index exists. Deep `skip` pagination also becomes progressively more expensive and unstable under writes.

References:

- `packages/message-service/src/message-service.ts:127-136`
- `packages/message-service/src/message-service.ts:342-375`
- `packages/message-service/src/schemas/message.ts:173-184`
- `packages/message-service/test/message-service.test.ts:573-619`

Implementation requirements:

1. Validate constructor limits and request values as finite integers with `maxListLimit >= 1` and a default not exceeding the maximum.
2. Define reject-versus-normalize behavior for zero, negative, fractional, `NaN`, and infinite values.
3. Add stable secondary ordering by `_id` for equal timestamps.
4. Evaluate branch-aligned compound indexes for `fromUser`, `toUser`, and `toRoles` with descending creation/order fields.
5. Record representative MongoDB `explain()` plans before and after index changes; do not add redundant indexes without evidence.
6. Investigate cursor pagination for large inboxes. Keep offset pagination if compatibility is required, but document its cost and bound the skip if needed.

Acceptance criteria:

- Invalid configuration fails during service construction with actionable messages.
- List calls never accidentally issue an unbounded query through invalid numeric values.
- Equal-timestamp pages are deterministic.
- Role, sender, and direct-recipient visibility are verified against real MongoDB without duplicates.
- Index changes include explain-plan evidence for representative branch and sort queries.
- Existing list/count behavior remains compatible unless a documented contract change is approved.
- Package tests pass.

Completion evidence:

- Added `InvalidPaginationValueError` and constructor validation requiring finite integer `defaultListLimit`/`maxListLimit`, `maxListLimit >= 1`, and `defaultListLimit <= maxListLimit`.
- Defined request pagination behavior: `limit`/`skip` must be finite integers; fractional, `NaN`, and infinite values are rejected; `limit <= 0` normalizes to 1; high limits clamp to `maxListLimit`; negative `skip` normalizes to 0.
- Changed list ordering to `{ createdAt: -1, _id: -1 }` and added deterministic equal-timestamp MongoDB pagination coverage.
- Replaced the timestamp-only active-message index with branch-aligned visibility indexes `{ fromUser: 1, createdAt: -1, _id: -1 }`, `{ toUser: 1, createdAt: -1, _id: -1 }`, and `{ toRoles: 1, createdAt: -1, _id: -1 }`; schema tests assert these declarations.
- Added real MongoDB list/count/visibility tests proving sender, direct-recipient, and role visibility without duplicate results, plus explain assertions that representative branch sort queries use the expected compound indexes and avoid `COLLSCAN`.
- Representative explain evidence from a 30-document MongoDB replica-set fixture comparing old `{ createdAt: 1 }` indexing to the new branch indexes for `.sort({ createdAt: -1, _id: -1 }).limit(5)`: `fromUser` before `SORT,COLLSCAN`, 0 keys/30 docs examined; after `IXSCAN` on `fromUser_1_createdAt_-1__id_-1`, 5 keys/5 docs examined. `toUser` before `SORT,COLLSCAN`, 0 keys/30 docs examined; after `IXSCAN` on `toUser_1_createdAt_-1__id_-1`, 5 keys/5 docs examined. `toRoles` before `SORT,COLLSCAN`, 0 keys/30 docs examined; after `IXSCAN` on `toRoles_1_createdAt_-1__id_-1`, 5 keys/5 docs examined.
- Documented offset pagination cost, request bounds, and cursor-pagination guidance in `packages/message-service/README.md` and `packages/message-service/DESIGN.md`.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 144 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

### Task MSG-11: Harden Template And Registry Resource Boundaries

Status: completed

Priority: P2

Suggested agent: template-engine security and encapsulation specialist

Dependencies: MSG-08

Primary ownership:

- `packages/message-service/src/template-engine.ts`
- `packages/message-service/src/template-registry.ts`
- template-engine and registry tests
- trust-boundary documentation

Finding:

Handlebars compiles with `noEscape: true`, which is safe only while every downstream consumer treats output as plain text. The process-global compilation cache is unbounded if templates are dynamically generated. The registry stores and returns mutable template objects, allowing callers to mutate authorization conditions or handlers after registration. These are hardening risks, not demonstrated exploits under a static trusted-template model.

References:

- `packages/message-service/src/template-engine.ts:14-27`
- `packages/message-service/src/template-engine.ts:37-73`
- `packages/message-service/src/template-registry.ts:11-55`
- `packages/message-service/src/template-registry.ts:73-86`

Implementation requirements:

1. Document templates as trusted code and rendered values as plain text that must be escaped by any HTML renderer.
2. Add hostile interpolation tests for markup, prototype-like property names, malformed templates, nested missing values, and non-string values.
3. Define template registration validation for duplicate action codes and other ambiguous action metadata.
4. Prevent accidental post-registration mutation of authorization-critical template structure through readonly contracts, snapshots, or freezing compatible with function fields.
5. Measure or establish a concrete dynamic-template use case before adding cache eviction. If needed, use a configurable bounded cache and test eviction deterministically.
6. Do not add broad recursive cloning or sanitization that breaks handler/function identity.

Acceptance criteria:

- Documentation makes the plain-text/HTML escaping boundary explicit.
- Registered authorization/action structure cannot be accidentally mutated through a returned registry reference under the selected ownership contract.
- Duplicate or malformed action definitions have deterministic behavior.
- Hostile interpolation behavior is explicit and tested without claiming unprovided HTML sanitization.
- Cache policy is either bounded with evidence or deliberately documented as appropriate only for a finite static template set.
- Package tests pass.

Completion evidence:

- Documented templates as trusted application code, rendered values as plain text requiring output-boundary HTML escaping, and the finite-static compiled-template cache policy in README, DESIGN notes, and template-engine JSDoc.
- Added deterministic registry validation for duplicate action codes, actions unavailable to both sender and receiver, and multiple default actions for the same usertype.
- Changed the registry to store frozen shallow snapshots of content/action-critical structure while preserving function identity for `prepareMessage`, conditions, handlers, and notification callbacks.
- Added hostile interpolation and registry hardening tests covering markup output, prototype-like property paths, malformed templates, nested missing values, non-string values, duplicate/ambiguous action metadata, and post-registration mutation attempts.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 154 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

### Task MSG-12: Repair Installed Package And Documentation Contracts

Status: completed

Priority: P1

Suggested agent: Node package-resolution and API documentation specialist

Dependencies: MSG-02 through MSG-11

Primary ownership:

- `packages/message-service/package.json`
- `packages/message-service/README.md`
- `packages/message-service/DESIGN.md`
- public JSDoc and packed-consumer fixtures
- website package documentation if present or newly added

Finding:

The README mounts the returned `JsonRouter` wrapper instead of `router.original`, omits or misstates exported errors and options, promises unsafe idempotency behavior, and declares MIT while repository metadata is Apache-2.0. ESM and CJS use separate stateful module graphs, so `defaultRegistry`, schemas, and error constructors can differ in one process. The export map always selects CJS-flavored `index.d.ts` even though `index.d.mts` is emitted.

References:

- `packages/message-service/README.md:28-64`
- `packages/message-service/README.md:121-189`
- `packages/message-service/README.md:244-246`
- `packages/message-service/DESIGN.md:65-82`
- `packages/message-service/package.json:16-25`
- `packages/message-service/tsup.config.ts:3-12`
- `packages/message-service/src/index.ts:7-72`

Implementation requirements:

1. Make the quick start compile and mount `router.original`; use an authentication example that actually rejects unauthenticated requests.
2. Document final idempotency scope, lease/failure semantics, transaction prerequisites, action idempotency, POST-only mutation, and provider compensation contracts.
3. Document all exported service errors and exact route status mappings, including archived and validation/pending/conflict outcomes added by earlier tasks.
4. Correct the license statement to Apache-2.0 and replace the inaccurate “event-sourced” archive claim with audit/history or state-transition terminology.
5. Add condition-specific `types.import` and `types.require` entries and verify them through MSG-01's strict consumers.
6. Resolve dual-package state for mutable singleton exports and `instanceof`-sensitive errors through one canonical runtime, removal of public singleton dependence, or another tested design. Documentation alone is insufficient for hidden split state.
7. Reconcile the package-root export surface: document supported exports or stop exposing internals, and retain `UserId` according to MSG-08.
8. Compile primary README examples against the packed artifact and assert runtime/declaration export parity.

Acceptance criteria:

- The exact README quick start compiles and handles a successful authenticated request using the packed package.
- ESM and CJS consumers resolve compatible declarations and do not observe divergent documented registry behavior in one process.
- README, DESIGN, source JSDoc, declarations, routes, and runtime describe the same lifecycle and error contracts.
- Packed metadata, README, and included license all identify Apache-2.0.
- The tarball contains only intentional files and transformed metadata contains no `PLACEHOLDER` or `workspace:` values.
- Native ESM, CommonJS, NodeNext, Bundler, and package tests pass.

Completion evidence:

- Corrected the installed package export map to provide condition-specific declarations via `types.import` (`index.d.mts`) and `types.require` (`index.d.ts`) after release-path rewriting, and set package metadata license to Apache-2.0.
- Added a small runtime contract that shares `defaultRegistry` through `globalThis` across mixed ESM/CommonJS loads and brands exported errors so cross-format `instanceof` checks work for service and registry errors.
- Updated the README quick start to be compileable, mount `router.original`, and show real authentication rejection before the message router; documented package-root exports, ESM/CJS singleton behavior, final idempotency/lease/failure/transaction semantics, POST-only action mutation, provider compensation, exported errors, and route status mappings. DESIGN already describes the archive as audit/history rather than event sourcing.
- Extended packed-consumer coverage to compile the exact README quick start against an installed tarball, exercise auth rejection plus an authenticated route through the packed package, assert ESM/CJS singleton and error identity behavior, verify conditional export metadata, check documented runtime exports, and compile strict NodeNext/Bundler declaration consumers with `skipLibCheck: false`.
- Verification: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 156 tests; `pnpm exec eslint "packages/message-service/**/*.{ts,js}"` passed; `git diff --check` passed.

## Wave 5: Independent Integration Review

### Task MSG-13: Perform Independent Security And Lifecycle Review

Status: completed

Priority: P1

Suggested agent: independent application-security, Mongoose, and package-contract reviewer

Dependencies: MSG-01 through MSG-12

Primary ownership:

- review and verification only across all changed files
- this task document's completion evidence and residual-risk notes

Finding:

Idempotency, payments, actions, archive movement, notifications, route authorization, and package loading cross multiple persistence and process boundaries. Passing isolated unit tests does not prove that alternate entry paths enforce the same ownership scope or that failures cannot expose data, duplicate effects, or strand state.

References:

- all findings and acceptance criteria in MSG-01 through MSG-12
- `packages/message-service/src/message-service.ts`
- `packages/message-service/src/route-factory.ts`
- `packages/message-service/src/schemas/`
- `packages/message-service/package.json`

Implementation requirements:

1. Re-read every original finding and verify each acceptance criterion against runtime behavior, real MongoDB state, public types, docs, and packed output.
2. Exercise idempotency across different users, templates, tenants if supported, empty batches, partial failures, stale leases, and concurrent retries.
3. Exercise action authorization and recovery across route and direct-service entry paths, different actions, process-failure boundaries, payment methods, archive commits, and notification delivery.
4. Confirm no internal message, payment, identity, or error data crosses to another request scope or leaks through route error payloads.
5. Confirm request-controlled strings, collections, pagination, polling, and cache behavior have documented bounds or explicit trusted-input assumptions.
6. Verify default and custom Mongoose connections use only their own models and sessions.
7. Run targeted package tests, affected dependency/consumer tests, root lint/build/test, and release-like packed checks serially where required.
8. Record exact commands, results, deferred decisions, and residual risks in this document.

Acceptance criteria:

- Every non-deferred task has completion evidence tied to observable acceptance criteria.
- All alternate entry paths enforce the same requester, template, and tenant scope where applicable.
- Concurrent and failure-injection tests do not expose partial batches or duplicate action effects under the documented provider assumptions.
- Public runtime, declarations, README, design notes, and packed artifact agree.
- `pnpm --filter @web-ts-toolkit/message-service test` passes.
- `pnpm lint`, `pnpm build`, and `pnpm test` pass, or exact unrelated/pre-existing blockers are recorded.
- `git diff --check` passes and generated files were not manually edited.

Completion evidence:

- Re-read MSG-01 through MSG-12 findings, requirements, acceptance criteria, and completion evidence; reviewed the message-service runtime (`MessageService`, route factory, schemas, template registry/engine), public types/barrel, README/DESIGN contracts, package metadata, and packed-consumer coverage against those criteria.
- Found one blocking public-contract mismatch during review: README documented `createMessageRoutes({ onPaymentCompensationFailure })`, but `MessageRoutesOptions` did not expose or forward the hook. Fixed narrowly in `packages/message-service/src/route-factory.ts` and added focused route coverage in `packages/message-service/test/route-factory.test.ts`; no CHANGELOG edit and no broad implementation changes.
- Verified targeted package behavior and release-like packed checks exposed by the package suite: `pnpm --filter @web-ts-toolkit/message-service test` passed with 6 files and 157 tests, including real MongoDB coverage and packed ESM/CJS/NodeNext/Bundler/README consumer checks.
- Verified workspace lint/build/test serially: `pnpm lint` passed; `pnpm build` passed with only existing Vite/chunk-size warnings; first `pnpm test` attempt was terminated by the 600000 ms tool timeout while building `@web-ts-toolkit/access-router-runtime`, then retry with a larger timeout completed successfully. The successful retry included `@web-ts-toolkit/message-service` passing with 6 files and 157 tests and the remaining workspace package suites passing; access-router-react React 18 negative-path tests emitted expected jsdom uncaught-error logs while their test files still passed.
- Verified whitespace and patch hygiene: `git diff --check` passed. Generated `dist/` files were rebuilt by package/workspace commands, not edited manually.

Residual risk notes:

- Tenant/application namespace is not implemented in idempotency scope. Current accepted scope is trimmed `clientRequestId`, requester identity, and `templateCd`; hosts needing tenant isolation must add an explicit future contract and must not infer tenant from roles, headers, or recipients.
- External side effects remain at-least-once under the documented provider assumptions. Action handlers, payment providers, and notification senders must deduplicate using durable attempt/session identifiers; the service does not provide exactly-once external effects.
- Email delivery remains best-effort post-save for non-transactional creates only. There is no durable email outbox/retry worker in this package; hosts requiring reliable transactional email must provide one.
- Offset pagination remains compatible but can be expensive at large `skip` values. The service bounds limits and documents cursor-pagination guidance; it does not add a cursor API in this remediation.
- Template rendering assumes trusted application templates and plain-text output. HTML escaping and dynamic-template cache bounds remain host responsibilities at the output/template-management boundary.

## Dependency And Parallelization Guidance

| Task   | Suggested owner              | Can start                   | Shared hotspots                                |
| ------ | ---------------------------- | --------------------------- | ---------------------------------------------- |
| MSG-01 | Integration harness agent    | Immediately                 | test infrastructure and package script         |
| MSG-02 | Idempotency security agent   | After MSG-01                | service create path, request/message schemas   |
| MSG-03 | Reservation state agent      | After MSG-02                | service create path, request schema            |
| MSG-04 | Payment recovery agent       | After MSG-03                | `persistItem`, reservation outcomes            |
| MSG-05 | HTTP security agent          | After MSG-02                | route factory, route tests, README routes      |
| MSG-06 | Action lifecycle agent       | After MSG-01 and MSG-05     | service action path, active/archive schemas    |
| MSG-07 | Connection ownership agent   | After MSG-06                | service model access and schema methods/hooks  |
| MSG-08 | API/type authorization agent | After MSG-06 and MSG-07     | service methods, message types, public barrel  |
| MSG-09 | Email reliability agent      | After MSG-06 and MSG-07     | schema hooks and notification/outbox design    |
| MSG-10 | Query performance agent      | After MSG-01 and MSG-07     | service list path and message indexes          |
| MSG-11 | Template hardening agent     | After MSG-08                | template engine and registry                   |
| MSG-12 | Packaging/docs agent         | After MSG-02 through MSG-11 | package metadata, README, DESIGN, public JSDoc |
| MSG-13 | Independent reviewer         | Last                        | review-only except task evidence               |

- MSG-05 can run in parallel with MSG-03 after MSG-02 if it does not edit service idempotency code.
- MSG-04 and MSG-06 both alter side-effect semantics in `message-service.ts`; sequence them or allocate non-overlapping focused files and coordinate lifecycle decisions.
- MSG-08 and MSG-09 can run in parallel after MSG-07 if MSG-08 owns service/types and MSG-09 owns email/outbox implementation.
- MSG-10 and MSG-11 can run in parallel because their implementation ownership does not overlap.
- MSG-12 starts only after behavioral contracts settle; otherwise documentation and consumer fixtures will churn.
- Agents must not run package tests or builds concurrently because dependency closures write shared `dist/` outputs.

## Deferred Maintainer Decisions

No decision blocks MSG-01. Before the dependent implementation starts, maintainers should resolve:

1. MSG-02: whether idempotency scope is requester plus template only, or also includes an explicit tenant/application namespace. Recommendation: require an optional host-supplied namespace now if multi-tenant reuse is expected; never infer it.
2. MSG-03: whether MongoDB replica-set transactions are an operational requirement. Recommendation: require transactions for multi-item batches and document this clearly rather than presenting a weaker protocol as atomic.
3. MSG-05: whether anonymous message creation is a supported product feature. Recommendation: secure by default, with a separate explicit anonymous route/service contract only if a concrete use case exists.
4. MSG-06: whether the package owns a durable outbox/action worker or only provides claim and attempt records for host workers. Recommendation: keep transport external but own durable state and stable attempt IDs at the service boundary.
5. MSG-06: the recovery policy for a process crash after an external handler effect but before archival commit. Recommendation: require handler deduplication by attempt ID and allow lease-based recovery; do not promise exactly once.
6. MSG-09: whether email is best-effort post-commit or reliably queued. Recommendation: use the same outbox abstraction selected for sender notifications if reliable delivery is advertised.
7. MSG-10: whether cursor pagination can replace or supplement offset pagination. Recommendation: add cursor pagination for large datasets while retaining a bounded offset API only if compatibility requires it.
8. MSG-12: whether dual ESM/CJS support is required. Recommendation: preserve both only with tested single-state semantics; otherwise choose one canonical runtime contract and publish a documented breaking change.

## Definition Of Done

- Every task is `completed`, `deferred` with rationale and residual risk, or `cancelled` with explanation.
- Cross-user and cross-template idempotency leakage has failing-before and passing-after regressions.
- A completed idempotent replay can never expose a partial or mismatched batch.
- Pending reservations have bounded waits and safe recovery.
- Unauthenticated and GET requests cannot trigger message or action mutations.
- Concurrent actions have one durable winner and external handlers receive stable deduplication identity.
- Archive movement is atomic, and notification/payment failure semantics are explicit and recoverable.
- Custom Mongoose connections do not fall back to global models.
- Service authorization is fail-closed and active/archive TypeScript types match hydrated runtime methods.
- Pagination values are bounded, visibility queries are deterministic, and index decisions have explain-plan evidence.
- Template trust, mutability, escaping, and cache policies are documented and tested.
- Installed ESM/CJS runtime behavior, strict NodeNext/Bundler declarations, transformed metadata, and README examples pass against a release-like tarball.
- Package docs, design notes, declarations, and runtime agree on lifecycle, security, provider, and error contracts.
- Targeted and full repository verification passes, or exact unrelated blockers are recorded.
- An independent reviewer completes MSG-13 and records final evidence here.
