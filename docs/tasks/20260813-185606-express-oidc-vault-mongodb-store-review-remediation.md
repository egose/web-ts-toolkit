# Express OIDC Vault MongoDB Store Review Remediation

Created: 2026-08-13 18:56:06 PDT

Package: `packages/express-oidc-vault-mongodb-store`

Related task: `docs/tasks/20260813-125834-express-oidc-vault-review-remediation.md`

## Objective

Remediate confirmed rotation atomicity, expiry cleanup, replay-record lifetime, alias retention, startup-readiness, documentation, and testability gaps in `@web-ts-toolkit/express-oidc-vault-mongodb-store`. Preserve the core `OidcVaultStoreProvider` contract while making the MongoDB deployment requirements and operational guarantees observable to installed consumers.

## Scope And Working Rules

- Add a focused regression that fails on the reviewed implementation before each behavioral fix.
- Treat persisted refresh tokens, ID tokens, access tokens, session IDs, authorization state, exchange codes, and logout-token JTIs as sensitive authentication data.
- Prefer MongoDB-native atomic operations and transactions over process-local locks; the store may be used by multiple application instances.
- Do not describe a multi-write standalone fallback as atomic or conflict-safe when process, network, or concurrent logout failures can leave partial state.
- Do not silently preserve unsafe standalone rotation behavior through a compatibility alias. If standalone rotation is a required product capability, redesign the persistence model around an operation MongoDB can make atomic on standalone deployments.
- Keep the caller responsible for the supplied `MongoClient`; do not close it from the store.
- Do not manually edit generated `dist/` files. Build them from TypeScript source.
- Update source, focused tests, the package README, website docs, and emitted declarations together when the public or operational contract changes.
- Preserve unrelated worktree changes and never revert another agent's work.
- Run package tests serially. Package test scripts rebuild shared dependency outputs, so agents must not run affected package builds or tests concurrently.

## Non-Goals

- Do not replace MongoDB with another persistence backend.
- Do not redesign the core OIDC routes or duplicate fixes owned by `packages/express-oidc-vault`.
- Do not add client-side field-level encryption without a separate API and operational design decision.
- Do not add speculative indexes without query-plan or representative-cardinality evidence.
- Do not expose document types, collection handles, or internal helpers as new public package APIs solely to make tests easier.
- Do not broaden the root export surface beyond readiness or configuration types required by this plan.

## Review Baseline

Confirmed by source, test, metadata, generated declaration, package-doc, and sibling-store review on 2026-08-13:

- All persistence, document mapping, index initialization, transaction detection, rotation, expiry cleanup, and the public factory are in `packages/express-oidc-vault-mongodb-store/src/index.ts` (430 lines).
- The package creates five collections, but both package and website docs describe only authorization transaction, exchange code, and session collections.
- The package starts index creation and topology detection in the constructor. The returned public type exposes no readiness operation, so applications cannot explicitly await successful initialization before accepting traffic.
- Non-transactional rotation inserts the replacement, deletes the current session, and creates the rotated-session alias in three independent writes. Logout can run after deletion but before alias creation and report success while the replacement session remains active. Process or network failure can also leave partial state.
- Transaction support detection catches every `hello` error and permanently resolves it as `false`, causing a transient discovery or authorization failure on a transaction-capable deployment to select the unsafe fallback for the lifetime of the store.
- The current tests use `MongoMemoryServer`, which is a standalone topology. They never execute the transaction branch, inject write failures, race logout at each rotation boundary, or test topology-detection errors.
- `isExpiredAndCleanup` deletes by `_id` only. If an expired record is observed and a new record with the same ID is inserted before cleanup, cleanup can delete the replacement. `consumeAuthorizationTransaction`, `consumeExchangeCode`, and alias lookup already use `findOneAndDelete`, so their second cleanup delete is both unnecessary and capable of deleting a replacement.
- Backchannel logout JTI consumption relies on the asynchronous TTL monitor to remove expired records. Until physical cleanup occurs, a logically expired JTI still returns `false` as a replay even when the injected clock is past `expiresAt`.
- Every rotation creates an alias. Sessions and aliases without `expiresAt` receive no TTL, and logical, subject, and provider-session deletion do not remove all aliases for the deleted logical sessions. Refresh-heavy sessions can therefore produce unbounded alias collection growth and retain old session identifiers indefinitely.
- Subject and provider-session deletion can add issuer/client filters, but indexes cover only `subject` and `providerSessionId`. This is a performance investigation item until representative `explain` evidence demonstrates harmful scans.
- Session documents intentionally store refresh, ID, and access tokens in plaintext fields. The package docs do not state MongoDB TLS, least-privilege role, encryption-at-rest/backup, or log-redaction expectations.
- The package metadata, root exports, CJS/ESM entrypoints, and generated declaration paths align. The emitted declaration is discoverable but has no JSDoc for the factory, readiness behavior, collection-name constraints, ownership, or topology requirements.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passed: 1 test file and 6 tests.
- `pnpm pack --dry-run` passed and listed `README.md`, `LICENSE`, `package.json`, and the CJS, ESM, and declaration outputs under `dist/`.
- `git status --short` was clean before task-file creation and remained clean after baseline verification.

## Priorities

- P0: a confirmed authentication-state race can leave a session active after successful-looking revocation, fork state, or otherwise violate the store's security boundary.
- P1: a confirmed data-integrity, replay-lifetime, initialization, or resource-retention defect can cause incorrect production behavior.
- P2: architecture, readability, testability, installed-consumer, documentation, or measured performance work with contained immediate security impact.
- P3: optional hardening or optimization that requires policy or workload evidence.

## Wave 1: Topology And Failure Test Foundation

### Task MDB-01: Add Standalone And Replica-Set Integration Harnesses

Status: pending

Priority: P1

Suggested agent: MongoDB integration and concurrency test specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/test/index.test.ts`
- new test helpers under `packages/express-oidc-vault-mongodb-store/test/`
- test-only package configuration if required

Finding:

All six tests use one `MongoMemoryServer` standalone instance. This means the transactional branch and replica-set behavior are untested, while current concurrency coverage cannot pause rotation between its three standalone writes or inject command failures.

References:

- `packages/express-oidc-vault-mongodb-store/test/index.test.ts:7-22`
- `packages/express-oidc-vault-mongodb-store/test/index.test.ts:91-171`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:228-276`

Implementation requirements:

1. Add a reusable test lifecycle for both `MongoMemoryServer` and `MongoMemoryReplSet` without running their build-producing package commands concurrently.
2. Add an observable replica-set rotation test that proves the replacement is committed, the previous session is absent, and stale rotation conflicts are normalized.
3. Provide a deterministic test technique for command failure and operation-boundary coordination, such as MongoDB failpoints where supported or narrowly scoped test instrumentation that does not enter the public API.
4. Ensure all clients, sessions, and memory servers stop in failure paths so Vitest does not retain open handles.
5. Keep topology setup in test helpers rather than duplicating lifecycle code across each test.

Acceptance criteria:

- The test suite demonstrably runs supported cases against both standalone and replica-set deployments.
- A replica-set test reaches the transactional rotation path and passes on the reviewed implementation.
- A test can deterministically inject or pause at least one MongoDB write boundary for later regression tasks.
- Repeated package test runs do not leak MongoDB processes or open handles.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passes.

## Wave 2: Correctness And Security Boundaries

### Task MDB-02: Require Atomic Session Rotation

Status: pending

Priority: P0

Suggested agent: distributed session concurrency specialist

Dependencies: MDB-01

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/src/index.ts`
- focused standalone, replica-set, concurrent refresh, and logout tests
- package README and MongoDB store website docs

Finding:

Standalone rotation performs replacement insert, current-session delete, and alias creation as separate writes. Logout between delete and alias creation finds neither current session nor alias, while the new session remains valid. Failures after insert can also leave duplicate or untracked state. The README's `conflict-safe rollback` statement covers only an observed missing-old-session result and overstates the actual guarantee.

References:

- `packages/express-oidc-vault-mongodb-store/src/index.ts:228-276`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:278-292`
- `packages/express-oidc-vault-mongodb-store/README.md:56-61`
- `website/docs/packages/express-oidc-vault-mongodb-store.md:60-67`
- `docs/tasks/20260813-125834-express-oidc-vault-review-remediation.md:674-682`

Implementation requirements:

1. Make transaction-capable MongoDB topology the default requirement for session rotation and fail closed rather than invoking the current multi-write fallback.
2. Do not treat an arbitrary `hello` failure as evidence that transactions are unsupported. Propagate transient, authorization, and network failures with actionable server-side errors.
3. Use a positively established topology capability or a transaction attempt with correctly classified unsupported-topology errors. Do not cache a transient detection failure as `false` for the store lifetime.
4. Normalize stale-current-session and colliding-next-session outcomes to `OidcVaultStoreConflictError` where they represent the core rotation conflict contract; preserve unrelated MongoDB errors.
5. If maintainers require standalone rotation, stop this implementation path and record a design for a single-document or otherwise standalone-atomic state model. Do not retain the current fallback under an `unsafe` compatibility flag by default.
6. Update package and website docs and release notes to state the topology requirement and contract tightening.

Acceptance criteria:

- On a replica set, rotation commits the new session, deletion of the old session, and alias creation atomically.
- A logout coordinated against every rotation boundary cannot report success while the same logical session remains active.
- A standalone deployment cannot silently execute the reviewed multi-write rotation fallback.
- A transient or unauthorized `hello` failure is surfaced and never permanently reclassified as standalone capability.
- Concurrent stale rotation and duplicate replacement-ID cases return the documented conflict type when appropriate.
- Failure injection before commit leaves no partial replacement session or alias.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passes.

### Task MDB-03: Make Expired-Record Cleanup Version-Safe

Status: pending

Priority: P1

Suggested agent: MongoDB atomic-operation specialist

Dependencies: MDB-02

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/src/index.ts`
- focused expiry and replacement-race tests

Finding:

`isExpiredAndCleanup` deletes only by `_id`. A fresh record inserted under the same ID after an expired read can be deleted by the stale cleanup. One-time consume and alias paths have already removed the observed record through `findOneAndDelete`, making their follow-up cleanup delete unnecessary and dangerous.

References:

- `packages/express-oidc-vault-mongodb-store/src/index.ts:176-184`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:192-200`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:217-225`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:287-291`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:415-425`
- `packages/express-oidc-vault-mongodb-store/test/index.test.ts:173-219`

Implementation requirements:

1. Never clean up an expired record by `_id` alone after a separate read.
2. For `findOneAndDelete` consume paths, evaluate the returned document's expiry without issuing a second delete.
3. For non-consuming reads, condition cleanup on the observed expiry value or an equivalent compare-and-delete predicate that cannot match a fresh replacement.
4. Preserve the current contract that logically expired records return `null` without waiting for MongoDB's TTL monitor.
5. Cover authorization transactions, exchange codes, sessions, and aliases according to their consuming versus non-consuming behavior.

Acceptance criteria:

- Replacing an expired session with a fresh session of the same ID during cleanup does not delete the fresh session.
- Reusing an authorization state or exchange code after the old value was atomically consumed cannot be deleted by stale cleanup.
- Expired records still return `null` immediately before TTL monitor cleanup.
- Tests assert no unnecessary second delete occurs after `findOneAndDelete` paths.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passes.

### Task MDB-04: Enforce Logical JTI Expiry Before TTL Cleanup

Status: pending

Priority: P1

Suggested agent: replay-cache correctness specialist

Dependencies: MDB-03

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/src/index.ts`
- focused backchannel logout JTI tests

Finding:

`consumeBackchannelLogoutTokenJti` attempts only a unique insert. A document whose `expiresAt` is in the past remains a duplicate until MongoDB's asynchronous TTL monitor physically removes it, so logical replay-cache behavior depends on monitor timing despite the broad documentation claim.

References:

- `packages/express-oidc-vault-mongodb-store/src/index.ts:301-317`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:353-359`
- `packages/express-oidc-vault-mongodb-store/test/index.test.ts:221-227`
- `packages/express-oidc-vault-mongodb-store/README.md:60`

Implementation requirements:

1. Atomically or race-safely make a logically expired JTI replaceable before attempting the unique consume operation.
2. Use the injected `now` clock consistently so the test and runtime expiry boundary are identical.
3. Preserve single-winner behavior when multiple processes concurrently consume the same JTI after an expired record is eligible for replacement.
4. Preserve immediate replay rejection for a non-expired JTI.
5. Do not rely on polling or waiting for the TTL monitor in tests.

Acceptance criteria:

- A previously consumed JTI is rejected at all times prior to its expiry boundary.
- After the existing record's `expiresAt`, exactly one concurrent consumer succeeds even when the TTL monitor has not run.
- Immediate duplicate consumption still returns `false`.
- The behavior is covered without sleeps tied to MongoDB's TTL monitor interval.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passes.

### Task MDB-05: Bound And Clean Rotated-Session Aliases

Status: pending

Priority: P1

Suggested agent: session lifecycle and data-retention specialist

Dependencies: MDB-02, MDB-04

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/src/index.ts`
- `packages/express-oidc-vault-mongodb-store/README.md`
- `website/docs/packages/express-oidc-vault-mongodb-store.md`
- focused alias lifecycle tests

Finding:

Every rotation creates an alias, but aliases inherit only optional session expiry. Sessions without `expiresAt` therefore create aliases with no TTL. Logical, subject, and provider-session deletion remove sessions but not all aliases associated with those logical sessions. The collection can grow without bound and retain old session identifiers indefinitely.

References:

- `packages/express-oidc-vault-mongodb-store/src/index.ts:35-47`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:278-350`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:353-389`
- `packages/express-oidc-vault/src/index.ts:628-640`

Implementation requirements:

1. Define and document a bounded alias-retention policy for sessions without explicit expiry. The value must cover the intended in-flight refresh/logout race window without becoming indefinite retention.
2. Add an index that supports alias cleanup by `logicalSessionId` if cleanup queries require it.
3. Remove all aliases for a logical session when that logical session is revoked.
4. Ensure subject- and provider-session-based revocation eventually removes aliases associated with the deleted logical sessions without making revocation miss a concurrently rotated session.
5. Keep alias cleanup and session mutation transactionally consistent where security semantics require it.
6. Add collection-level tests that inspect alias count after repeated rotations, expiry, and every deletion API.

Acceptance criteria:

- Repeated rotation of a session without `expiresAt` does not create permanent aliases.
- Deleting by current ID, stale ID, logical session ID, subject, or provider session removes the intended active session and its aliases according to the documented policy.
- Alias cleanup cannot make the tested refresh/logout race leave an active logical session behind.
- TTL and logical cleanup use supporting indexes.
- Package and website docs state the retention guarantee.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passes.

## Wave 3: Initialization, Performance, And Architecture

### Task MDB-06: Expose Explicit Store Readiness

Status: pending

Priority: P1

Suggested agent: TypeScript API and service-lifecycle specialist

Dependencies: MDB-02, MDB-05

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/src/index.ts`
- public declaration and export tests
- package README and website docs

Finding:

Index creation and transaction detection begin in the constructor, but the factory returns only `OidcVaultStoreProvider`. Consumers cannot await initialization before declaring the service healthy. An early index rejection can surface before a store operation observes it, and otherwise the first authentication request discovers configuration or privilege failures.

References:

- `packages/express-oidc-vault-mongodb-store/src/index.ts:136-167`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:169-170`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:353-373`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:428-430`
- `packages/express-oidc-vault-mongodb-store/dist/index.d.ts:4-13`

Implementation requirements:

1. Return a public subtype of `OidcVaultStoreProvider` with an explicit readiness operation or provide an async factory while preserving the shortest safe usage path.
2. Readiness must cover collection-name validation, required indexes, and topology/transaction capability needed by MDB-02.
3. Attach rejection handling immediately so initialization failure cannot become an unhandled promise rejection while preserving the same rejection for callers.
4. Keep every store operation gated on the same initialization result; do not allow use after failed readiness.
5. Validate that the five configured collection roles use acceptable, non-empty names and do not accidentally collapse into incompatible shared collections unless such sharing is deliberately supported and tested.
6. Document startup ordering: connect client, create store, await readiness, then accept traffic. Document that the application owns client shutdown.

Acceptance criteria:

- A consumer can await store readiness before calling `app.listen()`.
- Missing index privileges, incompatible existing indexes, invalid collection configuration, and unsupported required topology reject readiness with actionable errors.
- Initialization rejection does not emit an unhandled rejection before the consumer awaits readiness.
- Existing store methods still satisfy `OidcVaultStoreProvider` and remain gated on initialization.
- Generated declarations expose useful JSDoc for the readiness and ownership contract.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passes.

### Task MDB-07: Measure Scoped-Deletion Index Plans

Status: pending

Priority: P2

Suggested agent: MongoDB query-performance specialist

Dependencies: MDB-05, MDB-06

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/src/index.ts` only if evidence requires index changes
- focused query-plan or representative-cardinality tests
- operational index documentation

Finding:

Deletion may filter by `subject` or `providerSessionId` plus optional `provider.issuer` and `provider.clientId`, while current indexes cover only the leading identity field. Large multi-tenant collections with repeated `sub` or `sid` values may examine many documents, but the review has no representative production cardinality or `explain` evidence.

References:

- `packages/express-oidc-vault-mongodb-store/src/index.ts:319-363`

Implementation requirements:

1. Build representative datasets with repeated subjects/provider session IDs across issuer and client scopes.
2. Capture `explain('executionStats')` or equivalent evidence for the actual deletion filters supported by the public contract.
3. Add compound indexes only when evidence shows a meaningful reduction in examined documents for expected workloads.
4. Account for every supported optional-filter combination and index write/storage cost; do not add one index per permutation without justification.
5. Give any new index stable names and include startup compatibility behavior in readiness tests.

Acceptance criteria:

- Query-plan evidence and dataset assumptions are recorded in the task completion evidence or package operational docs.
- If indexes change, representative scoped deletion avoids collection scans and has a justified document-examination bound.
- If no change is justified, the task is completed with measured evidence and residual workload assumptions rather than speculative code.
- Existing deletion semantics and counts remain unchanged.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passes if code or tests change.

### Task MDB-08: Separate Persistence Mapping From Store Orchestration

Status: pending

Priority: P2

Suggested agent: TypeScript architecture and testability specialist

Dependencies: MDB-03, MDB-04, MDB-05, MDB-06, MDB-07

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/src/index.ts`
- new internal files under `packages/express-oidc-vault-mongodb-store/src/`
- focused internal unit tests

Finding:

One file owns public options, private BSON document types, bidirectional mapping, filters, topology detection, index definitions, lifecycle, and all store operations. Pure conversion rules and topology/index decisions can only be exercised indirectly through a live MongoDB integration test, which obscures ownership and makes security fixes collide in one hotspot.

References:

- `packages/express-oidc-vault-mongodb-store/src/index.ts:20-135`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:136-426`

Implementation requirements:

1. Keep `src/index.ts` as the small public export/composition boundary.
2. Extract only cohesive internal modules that now have stable ownership, such as document types/mappers, topology/index initialization, and the store implementation.
3. Add direct tests for date conversion, optional expiry, logical-session normalization, and topology classification where integration tests are unnecessarily indirect.
4. Keep MongoDB collection details private and avoid new public subpath exports.
5. Preserve emitted root exports and prevent circular imports.
6. Do not abstract simple one-use operations into generic repositories; retain MongoDB-specific code where it improves clarity.

Acceptance criteria:

- Public root imports remain source-compatible except for the deliberate readiness return-type refinement in MDB-06.
- Pure mapping and topology decisions have focused tests that do not start MongoDB.
- The store implementation has clear ownership boundaries without generic repository indirection.
- Runtime and type export allowlists show that no internal helper or document type became public.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store build` passes.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passes.

## Wave 4: Installed-Consumer And Operational Contract

### Task MDB-09: Document And Verify The Published Store Contract

Status: pending

Priority: P2

Suggested agent: TypeScript package and security documentation specialist

Dependencies: MDB-02, MDB-05, MDB-06, MDB-08

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/src/index.ts`
- `packages/express-oidc-vault-mongodb-store/package.json`
- `packages/express-oidc-vault-mongodb-store/README.md`
- `website/docs/packages/express-oidc-vault-mongodb-store.md`
- packed-consumer and export-contract tests

Finding:

Metadata and entrypoints align, but installed declarations provide no usage JSDoc and docs omit two collection roles, explicit startup readiness, client ownership, exact topology guarantees, alias retention, and sensitive-token storage controls. The package is only dry-run packed; no package-local test compiles and loads the installed artifact in a clean consumer.

References:

- `packages/express-oidc-vault-mongodb-store/package.json:15-39`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:20-28`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:428-430`
- `packages/express-oidc-vault-mongodb-store/dist/index.d.ts:1-15`
- `packages/express-oidc-vault-mongodb-store/README.md:5-66`
- `website/docs/packages/express-oidc-vault-mongodb-store.md:47-97`

Implementation requirements:

1. Add concise JSDoc to the public options, readiness surface, and factory so emitted declarations explain topology, initialization, `Db` ownership, custom collections, and test-only clock behavior.
2. Correct docs to describe all five collections and all collection-name options.
3. Show the safe startup sequence that awaits connection and store readiness before listening, plus graceful caller-owned `MongoClient` shutdown.
4. Document that session records contain bearer-equivalent secrets and require TLS, least-privilege database roles, encryption at rest and in backups, restricted observability, and an explicit retention policy. Do not claim application-level field encryption that is not implemented.
5. Document transaction/topology guarantees and standalone limitations exactly as implemented by MDB-02.
6. Add a packed-consumer test that verifies manifest transformation or release-like metadata, packed contents, CJS loading, ESM loading, and NodeNext TypeScript compilation from package-name imports without workspace source aliases.
7. Keep package README as the primary installed-consumer source; make website docs consistent rather than more authoritative.

Acceptance criteria:

- An installed consumer can determine the canonical import, required dependencies, startup sequence, topology requirement, collection behavior, ownership, and security assumptions from `README.md` and editor hover.
- Generated declarations retain the high-value JSDoc.
- Package and website docs no longer claim all logical expiry is independent of TTL unless every relevant record type satisfies that claim.
- Packed CJS and ESM consumers load the root factory, and a strict NodeNext consumer compiles the supported public types without deep imports.
- Packed contents include only the intended runtime, declarations, package metadata, license, and README.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passes.
- `pnpm pack --dry-run` lists the expected files.

## Dependency And Parallelization Guidance

| Wave | Task   | Primary owner                | Parallel guidance                                                               |
| ---- | ------ | ---------------------------- | ------------------------------------------------------------------------------- |
| 1    | MDB-01 | MongoDB test specialist      | Run first; establishes both topology harnesses.                                 |
| 2    | MDB-02 | Concurrency specialist       | Run after MDB-01; owns the main rotation and topology hotspot.                  |
| 2    | MDB-03 | Atomic-operation specialist  | Run after MDB-02; do not overlap edits to `src/index.ts`.                       |
| 2    | MDB-04 | Replay-cache specialist      | Run after MDB-03; do not overlap edits to `src/index.ts`.                       |
| 2    | MDB-05 | Lifecycle specialist         | Run after MDB-02 and MDB-04; owns alias schema/index changes.                   |
| 3    | MDB-06 | API lifecycle specialist     | Run after topology and alias behavior stabilize.                                |
| 3    | MDB-07 | Query-performance specialist | Gather data after final index set from MDB-05/MDB-06.                           |
| 3    | MDB-08 | Architecture specialist      | Run after behavioral and index edits to avoid merge-heavy refactors.            |
| 4    | MDB-09 | Package/docs specialist      | Can draft security text earlier, but finalize after public behavior stabilizes. |
| 5    | MDB-99 | Independent reviewer         | Must be performed by an agent who was not the primary implementer.              |

`packages/express-oidc-vault-mongodb-store/src/index.ts` and `test/index.test.ts` are shared hotspots. Assign Wave 2 tasks sequentially. Agents may research docs or query plans in parallel, but must not run package test scripts concurrently because those scripts rebuild shared `dist/` outputs.

## Deferred Decisions Requiring Maintainer Input

1. Standalone topology support: the recommended secure contract is to require transaction-capable MongoDB for rotation and fail closed on standalone deployments. If standalone refresh is a hard product requirement, MDB-02 needs a persistence-model design task before implementation; the reviewed multi-write fallback is not an acceptable atomicity guarantee.
2. Alias retention: maintainers must choose a bounded duration based on the maximum supported overlap for refresh/logout requests and operational retry behavior. MDB-05 must record the rationale and residual race window rather than select an arbitrary silent default.
3. Client-side field-level encryption: the plan documents infrastructure controls only. A field-encryption API would affect queryability, key management, migrations, and consumer configuration and should be a separate task if required.

The first two decisions affect implementation details but do not block MDB-01 or MDB-03/MDB-04 regression design. If maintainers accept the recommended transaction-required contract, MDB-02 can proceed without further design approval.

## Wave 5: Final Integration Review

### Task MDB-99: Independently Verify MongoDB Store Remediation

Status: pending

Priority: P1

Suggested agent: independent MongoDB security and package reviewer

Dependencies: MDB-01 through MDB-09

Primary ownership:

- review-only coverage across the package, core contract, docs, tests, and packed artifact
- task-file status and completion evidence

Finding:

Rotation, revocation, expiry, aliases, initialization, indexes, declarations, and docs form one security-sensitive persistence contract. Independent integration review is required to catch alternate-path and topology drift after multiple agents edit the shared store.

References:

- all findings and acceptance criteria in this task file
- `packages/express-oidc-vault/src/types.ts:80-125`
- `docs/tasks/20260813-125834-express-oidc-vault-review-remediation.md:631-682`

Implementation requirements:

1. Verify every acceptance criterion against runtime behavior, not only task completion notes.
2. Re-run standalone and replica-set tests, command-failure tests, concurrent refresh/rotation/logout tests, expiry replacement races, JTI expiry races, and alias retention tests.
3. Confirm unsupported or indeterminate topology cannot silently select non-atomic rotation.
4. Confirm public types, emitted declarations, package README, website docs, and runtime exports agree.
5. Inspect persisted and externally returned data to ensure sensitive token fields do not cross unintended boundaries or enter error messages.
6. Inspect all indexes and query plans for stable names, startup compatibility, TTL semantics, and justified write/storage cost.
7. Verify no internal document type, collection, or test seam became public.
8. Record deferred decisions with owner, rationale, and residual risk; do not mark blocked criteria complete.

Acceptance criteria:

- Every task has completion evidence or an explicit blocker/deferment with residual risk.
- Transaction-capable rotation is atomic under success, conflict, retry, and injected failure.
- Standalone and topology-detection behavior matches the documented fail-closed contract.
- Expiry cleanup cannot delete a replacement record, and JTI behavior does not depend on TTL monitor timing.
- Alias growth is bounded and every revocation path has observable cleanup semantics.
- Package root exports and packed declarations match the documented API in CJS, ESM, and NodeNext consumers.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passes.
- If core contract files changed, affected core, memory-store, Redis-store, and MongoDB-store tests pass serially.
- `pnpm lint`, `pnpm build`, and `pnpm test` pass, or unrelated baseline failures are recorded with command output and ownership.
- `pnpm pack --dry-run` lists only the intended package contents.

## Definition Of Done

- Confirmed rotation, expiry-cleanup, JTI-lifetime, alias-retention, and readiness defects have failing-before/passing-after regressions.
- Rotation cannot silently use the reviewed non-atomic fallback, and deployment requirements are explicit.
- Startup can be awaited before traffic, fails with actionable errors, and never leaks an unhandled initialization rejection.
- Expired cleanup is tied to the observed record version, and logical replay expiry is independent of TTL monitor timing.
- Rotated aliases have a documented bound, supporting indexes, and cleanup across every revocation path.
- Performance indexes are evidence-based rather than speculative.
- Internal modules improve ownership and direct testability without widening the public API.
- Installed README, generated declarations, website docs, runtime exports, and packed artifact agree.
- MongoDB secret-storage and client-lifecycle responsibilities are documented without overstating implemented encryption.
- Required package, affected dependency, repository, and packed-consumer verification is recorded.
- MDB-99 is completed by an independent reviewer.
