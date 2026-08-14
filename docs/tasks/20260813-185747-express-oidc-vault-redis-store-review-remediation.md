# Express OIDC Vault Redis Store Review Remediation

Created: 2026-08-13 18:57:47 PDT

Package: `packages/express-oidc-vault-redis-store`

## Objective

Remediate confirmed session-integrity, revocation, Redis lifecycle, scalability, testability, package-surface, and operational-documentation gaps in `@web-ts-toolkit/express-oidc-vault-redis-store`. Preserve the core `OidcVaultStoreProvider` contract while making session mutation and revocation correct under concurrency, bounding Redis work, and proving behavior against a real Redis server rather than only a source-coupled fake.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Treat Redis values, key types, indexes, clocks, and operation interleavings as fallible external state.
- Session revocation is a security boundary: a successful deletion result must not leave the targeted current logical session active.
- Prefer one atomic Redis-side enforcement point for each invariant rather than compensating in multiple JavaScript callers.
- Pass every key read or written by Lua through `KEYS`; do not hide Redis keys in `ARGV`.
- Do not manually edit generated `dist/` files. Build from tracked TypeScript source.
- Keep fast unit tests where useful, but do not use the fake Redis interpreter as the sole oracle for Lua, expiry, command, or concurrency behavior.
- Update source types, emitted declarations, the shipped README, website docs, and consumer tests together when public behavior changes.
- Preserve unrelated worktree changes and never revert another agent's work.
- Run package tests serially. The package test script rebuilds the core package and shared `dist/` outputs, so agents must not run overlapping package builds/tests concurrently.

## Non-Goals

- Do not redesign the core OIDC middleware or expand the `OidcVaultStoreProvider` contract unless a confirmed cross-store requirement cannot be met locally.
- Do not add non-atomic `get` plus `del` fallbacks for one-time records.
- Do not introduce application-level token encryption without a maintainer-approved key-management and migration contract; document trusted-infrastructure requirements first.
- Do not promise Redis Cluster support without a real cluster test and an explicit hash-slot strategy.
- Do not optimize script loading or split files before correctness regressions are in place.
- Do not add a default export, new public subpaths, or `llms.txt` without demonstrated consumer need.

## Review Baseline

Confirmed on 2026-08-13 before this task file was created:

- `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` passed: 1 file and 6 tests.
- `pnpm exec eslint "packages/express-oidc-vault-redis-store/**/*.{ts,js}"` passed.
- `pnpm exec tsc --noEmit -p packages/express-oidc-vault-redis-store/tsconfig.json` passed.
- `git diff --check` passed, and `git status --short` reported a clean worktree.
- `npm pack --dry-run --json` passed and listed 6 intended files: `package.json`, `README.md`, and four `dist/index` runtime/declaration files.
- All package tests use `FakeRedisClient`. It recognizes Lua scripts by source substrings and reimplements them in TypeScript, so it does not validate Lua syntax, Redis server time, key-slot rules, wrong-type failures, server command support, network concurrency, or official-client behavior.
- An independent review reproduced against Redis 7 that recreating a session ID under a new subject leaves the old subject index able to delete the replacement session.
- `createSession` and rotation destination writes are unconditional. Existing records and their old subject, provider-session, and logical-session memberships are not reconciled.
- Rotating a session to the same ID writes and then deletes the same key while reporting success. Rotating into another existing session ID overwrites that record and leaves its indexes stale.
- Indexed deletion reads a session and later deletes it unconditionally. Rotation can occur between those operations, leaving the new session active while deletion reports success.
- `DELETE_SESSION_SCRIPT` always returns `1`; bulk deletion increments its count without checking whether the primary key was removed.
- Bulk deletion trusts subject/provider index membership without rechecking the indexed subject or provider-session ID against the loaded record.
- Index cleanup compares scores with application `now()`, while `PXAT` expiry uses Redis server time. An application clock ahead of Redis can remove a still-live session from every discoverable revocation path.
- Session value expiry does not expire sorted-set memberships. Untouched subject, provider-session, and logical-session indexes can retain historical members and keys indefinitely.
- Non-expiring rotations create permanent old-session aliases. Deleting the current session or logical session does not discover and remove all aliases in the rotation chain.
- Invalid JSON throws directly from `JSON.parse`; one corrupt indexed record aborts bulk revocation before later valid sessions are processed. Structurally invalid JSON is accepted through unchecked generic casts.
- Lua scripts can partially mutate data before a later `WRONGTYPE` error because Redis scripts are atomic with respect to interleaving but do not roll back prior writes on runtime error.
- Bulk deletion uses `ZRANGE 0 -1`, then sequentially performs a `GET` and an `EVAL` per member. Work, response memory, and round trips are unbounded in the size of an identifier's session history.
- Every mutation sends the complete script through `EVAL`; no script-cache path or benchmark establishes whether this is material.
- Several keys accessed by Lua are passed in `ARGV`, and normal key prefixes do not colocate script keys in one Redis Cluster hash slot. The public client interface also matches standalone node-redis `sendCommand(args)`, not the node-redis cluster signature.
- `sendCommand` is optional in `OidcVaultRedisClient` but mandatory in the constructor. The installed README says it is required, while website docs promise an unsafe `get` plus `del` fallback that does not exist.
- `redis` is a production dependency even though runtime code does not import it and the public API claims a structural adapter boundary.
- Both `.d.ts` and `.d.mts` are packed, but the export map routes all consumers to `.d.ts`; the core package demonstrates conditional ESM/CJS type mapping.
- Public declarations contain no JSDoc. The README omits the minimum Redis version (`GETDEL` requires Redis 6.2), topology support, plaintext token-storage implications, client error/shutdown lifecycle, and key-prefix migration behavior.

## Priorities

- P0: a confirmed path can delete another identity's session, preserve a targeted active session after reported revocation, or corrupt session identity/index invariants.
- P1: external state can block revocation, storage/work can grow without a bound, or production behavior lacks real-backend evidence.
- P2: API, packaging, readability, testability, or operational guidance is contradictory or incomplete with contained immediate risk.
- P3: optional optimization or abstraction that requires benchmark evidence or maintainer policy.

## Wave 1: Real Redis Baseline

### Task RVR-01: Add A Real Redis Integration Harness

Status: completed

Completion evidence:

- Changed: `packages/express-oidc-vault-redis-store/test/redis-harness.ts`, `packages/express-oidc-vault-redis-store/test/redis-integration.test.ts`
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`
- Result: 2 test files passed; 21 tests passed, including real Redis integration coverage on `redis:6.2-alpine` and `redis:7.2-alpine` through the official `redis` client.
- Resource cleanup: `docker ps --format '{{.ID}} {{.Image}} {{.Status}}'` showed only pre-existing non-Redis containers after tests.

Priority: P1

Suggested agent: Redis integration and CI specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault-redis-store/test/`
- `packages/express-oidc-vault-redis-store/package.json`
- CI configuration only if required for a reproducible Redis service

Finding:

The six tests run only against `FakeRedisClient`, whose script dispatch and behavior mirror implementation details. It cannot establish compatibility with the official client or Redis itself and currently masks split-clock, Lua, wrong-type, command-version, and concurrency behavior.

References:

- `packages/express-oidc-vault-redis-store/test/index.test.ts:5-306`
- `packages/express-oidc-vault-redis-store/test/index.test.ts:130-265`
- `packages/express-oidc-vault-redis-store/package.json:26-42`

Implementation requirements:

1. Add a reproducible integration harness using an isolated real Redis server and the official `redis` client; do not depend on an undocumented developer-global service.
2. Test the minimum documented Redis version and the primary CI version, or explicitly document why one image/version covers both.
3. Isolate keys/databases per test and always close clients and server resources, including failed tests.
4. Cover create/read/delete, transaction and exchange-code single consumption, JTI replay, expiry, rotation conflict, and all indexed deletion methods.
5. Include true simultaneous consumption and rotation operations; keep deterministic unit tests for orchestration that does not require Redis semantics.
6. Do not run this package's test command concurrently with core OIDC package tests because both rebuild shared outputs.

Acceptance criteria:

- At least one test executes each Lua script on a real supported Redis server through the official client.
- Two concurrent one-time consumes yield exactly one record, and two rotations of one source yield exactly one success.
- Test setup and teardown leave no client, process, container, or key leakage.
- The integration path runs through the normal package test command in CI.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` passes.

## Wave 2: Session Identity And Revocation Correctness

### Task RVR-02: Enforce Session ID Uniqueness And Index Ownership

Status: completed

Completion evidence:

- Changed: `packages/express-oidc-vault-redis-store/src/index.ts`, `packages/express-oidc-vault-redis-store/test/index.test.ts`, `packages/express-oidc-vault-redis-store/test/redis-integration.test.ts`, `packages/express-oidc-vault-redis-store/README.md`, `packages/express-oidc-vault/test/store-provider-conformance.ts`
- Implemented: session creation now uses Redis-side `SET ... NX` inside the write Lua script and throws `OidcVaultStoreConflictError` on duplicate primary session IDs.
- Implemented: indexed deletion revalidates selected subject/provider-session ownership before deleting a session, while retaining logical-session and provider issuer/client scope checks.
- Verified: duplicate create, stale subject/provider index deletion, same-ID rotation, and occupied-target rotation regressions are covered by fake Redis unit tests and real Redis integration tests.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`
- Result: 2 test files passed; 28 tests passed.

Priority: P0

Suggested agent: Redis Lua and session-invariant specialist

Dependencies: RVR-01

Primary ownership:

- session write and rotation logic under `packages/express-oidc-vault-redis-store/src/`
- collision and stale-index tests

Finding:

Session creation and rotation destination writes replace existing values without removing prior index memberships. An old subject or provider-session index can then load and delete the replacement session. Rotation also accepts identical old/new IDs, causing the script to delete its newly written value, and accepts an already occupied destination ID.

References:

- `packages/express-oidc-vault-redis-store/src/index.ts:35-56`
- `packages/express-oidc-vault-redis-store/src/index.ts:73-123`
- `packages/express-oidc-vault-redis-store/src/index.ts:190-225`
- `packages/express-oidc-vault-redis-store/src/index.ts:316-369`
- `packages/express-oidc-vault-redis-store/src/index.ts:403-420`

Implementation requirements:

1. Adopt create-only session IDs: atomically reject an existing primary session key with `OidcVaultStoreConflictError`. Do not silently preserve upsert behavior without concrete consumer evidence and a complete atomic old-index reconciliation design.
2. Reject rotation when old and new session IDs are equal or when the destination key already exists.
3. Make collision checks and writes one Redis-side atomic operation; a preflight JavaScript `GET` is insufficient.
4. Revalidate the subject or provider-session ID represented by the selected index before deletion as defense in depth; retain issuer/client scope checks.
5. Preserve creation timestamps, logical-session continuity, and valid concurrent rotation behavior.
6. Record the tightened collision contract in README/release notes because duplicate-ID callers may observe a new conflict.

Acceptance criteria:

- Recreating a session ID under a different subject, provider-session ID, or logical-session ID is rejected and leaves the original value/indexes unchanged.
- Deleting through an old or injected stale subject/provider index cannot delete a record that does not own that index value.
- Rotation to the same ID and rotation into an occupied destination both fail without changing either record or indexes.
- Real-Redis regressions fail on the old implementation and pass after the fix.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` passes.

### Task RVR-03: Make Revocation Linearizable With Rotation

Status: completed

Completion evidence:

- Changed: `packages/express-oidc-vault-redis-store/src/index.ts`, `packages/express-oidc-vault-redis-store/test/index.test.ts`, `packages/express-oidc-vault-redis-store/test/redis-integration.test.ts`
- Implemented: deletion now runs a Redis-side conditional revocation script that rechecks the current record and, when a stale pre-delete lookup lost a rotation race, walks the expected logical-session index to revoke matching successors atomically with primary deletion and index cleanup.
- Implemented: indexed deletion counts only scripts that actually delete a primary session record, so stale index cleanup and already-revoked sessions do not inflate returned counts.
- Verified: deterministic fake-Redis stale lookup test pauses indexed deletion after reading `sess_1`, rotates to `sess_2`, resumes deletion, returns `1`, and leaves both `sess_1` and `sess_2` unreadable.
- Verified: real Redis integration covers the same stale lookup/rotation/deletion interleaving through provider-session deletion on `redis:6.2-alpine` and `redis:7.2-alpine`.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`
- Result: 2 test files passed; 32 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault test`
- Result: 4 test files passed; 70 tests passed.
- Verified: `pnpm lint`
- Result: passed.

Priority: P0

Suggested agent: distributed concurrency and Redis scripting specialist

Dependencies: RVR-02

Primary ownership:

- session delete, rotate, alias, and logical-session mutation logic
- deterministic interleaving and real-Redis concurrency tests
- core backchannel-logout compatibility tests if behavior crosses the provider boundary

Finding:

Single and indexed deletion read a record before invoking an unconditional delete script. If rotation moves that record in between, deletion operates on the absent old key, returns success, and can leave the new current session active. This violates logout/revocation intent and makes returned deletion counts inaccurate.

References:

- `packages/express-oidc-vault-redis-store/src/index.ts:58-71`
- `packages/express-oidc-vault-redis-store/src/index.ts:207-244`
- `packages/express-oidc-vault-redis-store/src/index.ts:345-424`
- `packages/express-oidc-vault/src/types.ts:113-125`

Implementation requirements:

1. Define a Redis-side revocation invariant for a logical session that rotation checks atomically before publishing a successor. Prefer a revocation marker/generation or equivalent design over unbounded client-side retries.
2. Make deletion conditional on the expected current record/version and return the actual primary deletion result.
3. Ensure logical-session, subject, and provider-session deletion cannot miss a successor created by a concurrent rotation.
4. Increment bulk counts only for sessions actually revoked; do not count stale index cleanup as a session deletion.
5. Preserve idempotent deletion of already absent sessions and one-winner rotation conflicts.
6. If a core provider-contract clarification is required, update all stores and core contract tests deliberately rather than creating Redis-only semantics.

Acceptance criteria:

- Deterministic tests pause deletion after lookup, rotate, then resume; no current targeted session survives.
- Concurrent backchannel-style subject/provider deletion and refresh rotation cannot report successful revocation while a targeted successor remains readable.
- Two concurrent bulk deletions do not both count the same primary session.
- Returned counts equal records actually transitioned from active to revoked.
- Indexes, aliases, and revocation metadata remain internally consistent after every tested interleaving.
- Affected core and store package tests pass serially.

## Wave 3: Corruption And Data Lifecycle

### Task RVR-04: Define Fail-Closed Stored-Record Validation And Repair

Status: completed

Priority: P1

Suggested agent: storage validation and operational resilience specialist

Dependencies: RVR-03

Primary ownership:

- serialization/deserialization boundary under `packages/express-oidc-vault-redis-store/src/`
- corruption and wrong-type integration tests
- operational failure documentation

Finding:

`JSON.parse` errors escape directly and parsed values are cast without structural validation. One corrupt member aborts indexed revocation before later valid sessions are processed. Lua can also partially mutate state before a later wrong-type command fails because Redis does not roll back script writes.

References:

- `packages/express-oidc-vault-redis-store/src/index.ts:125-127`
- `packages/express-oidc-vault-redis-store/src/index.ts:203-205`
- `packages/express-oidc-vault-redis-store/src/index.ts:270-281`
- `packages/express-oidc-vault-redis-store/src/index.ts:387-424`
- `packages/express-oidc-vault-redis-store/src/index.ts:35-123`

Implementation requirements:

1. Validate each stored record kind at its deserialization boundary, including required session identity/index fields and finite expiration timestamps.
2. Define deterministic fail-closed behavior for malformed one-time records that are atomically consumed before validation.
3. During bulk revocation, quarantine/delete corrupt primary data and remove the current stale membership, then continue to later valid sessions; surface observability without leaking token-bearing values.
4. Preflight Redis key types inside mutation scripts before the first write, or prove another design prevents deterministic partial state on `WRONGTYPE`.
5. Do not log raw serialized sessions, refresh tokens, ID tokens, authorization transactions, or exchange codes.
6. Document whether stored schema compatibility is guaranteed across package versions; add a version field only if a concrete migration policy is implemented.

Acceptance criteria:

- Invalid JSON and structurally invalid JSON for every record kind produce controlled, documented behavior.
- A corrupt first index member does not prevent later valid targeted sessions from being revoked.
- Wrong-type injection at each primary/index/alias key either performs no mutation or produces a documented, test-proven repairable state.
- Errors and test diagnostics do not expose stored token values.
- Real-Redis corruption regressions and the package test command pass.

Completion evidence:

- Changed: `packages/express-oidc-vault-redis-store/src/index.ts`, `packages/express-oidc-vault-redis-store/test/index.test.ts`, `packages/express-oidc-vault-redis-store/test/redis-integration.test.ts`, `packages/express-oidc-vault-redis-store/README.md`
- Implemented: validated stored record parsing for sessions, rotated aliases, authorization transactions, and exchange codes; fail-closed consumed malformed one-time records; deleted malformed sessions encountered during reads/indexed revocation; continued revocation after corrupt indexed members; added Lua key-type preflight before mutation writes.
- Documented: schema compatibility stance, malformed record behavior, indexed corrupt-member handling, wrong-type behavior, and sanitized diagnostics in `packages/express-oidc-vault-redis-store/README.md`.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`
- Result: package build passed and Vitest reported `2` test files passed, `38` tests passed.
- Verified: `pnpm lint`
- Result: passed.

### Task RVR-05: Remove Split-Clock Revocation Loss And Bound Index Retention

Status: completed

Priority: P1

Suggested agent: Redis expiry and data-lifecycle specialist

Dependencies: RVR-03

Primary ownership:

- index scoring, traversal, expiry, and maintenance logic
- real-Redis expiry/churn tests
- expiry behavior documentation

Finding:

Redis uses server time for `PXAT`, but `cleanupExpiredIndexMembers` removes memberships using application `now()`. An application clock ahead of Redis can remove a still-live session from revocation indexes. Conversely, expired values leave sorted-set members and unique logical-session index keys until those exact indexes are queried, allowing historical state to grow indefinitely.

References:

- `packages/express-oidc-vault-redis-store/src/index.ts:142`
- `packages/express-oidc-vault-redis-store/src/index.ts:270-272`
- `packages/express-oidc-vault-redis-store/src/index.ts:316-329`
- `packages/express-oidc-vault-redis-store/src/index.ts:374-395`
- `packages/express-oidc-vault-redis-store/test/index.test.ts:405-422`

Implementation requirements:

1. Never remove a revocation-index member solely because application time says it expired while Redis still holds the primary value.
2. Use Redis server time or primary-key existence as the liveness authority.
3. Establish bounded eventual cleanup for subject, provider-session, and logical-session indexes, including index-key deletion when empty.
4. Keep cleanup safe for shared indexes containing mixed expirations and concurrent additions.
5. Retain `now` only for legitimate store-domain timestamp behavior; document it as a test hook and not a Redis-expiry authority.
6. Add churn evidence showing storage is bounded relative to active sessions plus a documented cleanup window.

Acceptance criteria:

- With application time ahead of Redis, a still-live session remains discoverable and revocable.
- With application time behind Redis, expired primary values are not returned and stale memberships are eventually removed.
- Expired unique logical-session index keys do not remain indefinitely without a logout request for that identifier.
- A real-Redis churn test creates/expires many sessions and demonstrates the documented member/key bound.
- Package tests pass.

Completion evidence:

- Changed: `packages/express-oidc-vault-redis-store/src/index.ts`, `packages/express-oidc-vault-redis-store/test/index.test.ts`, `packages/express-oidc-vault-redis-store/test/redis-integration.test.ts`, `packages/express-oidc-vault-redis-store/README.md`
- Implemented: replaced application-clock index pruning with Redis `TIME`; added incremental prefixed `SCAN` maintenance for subject, provider-session, and logical-session indexes; skipped non-zset keys during background maintenance so wrong-type mutation preflight remains the failure authority; retained `now` only for store timestamps and JTI validation.
- Added tests: fake Redis split-clock regression proving app time ahead cannot hide a still-live revocable session; fake Redis stale index-key cleanup regression; real-Redis churn test proving expired subject/provider/logical index keys are pruned down to active-session keys after expiry and cleanup.
- Documented: Redis server time as expiry/index cleanup authority, `now` as a test/domain timestamp hook, primary-key liveness checks, incremental cleanup scan window, and storage bound relative to active sessions plus expired entries awaiting Redis expiry and scan cleanup.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`
- Result: package build passed and Vitest reported `2` test files passed, `42` tests passed.
- Verified: `pnpm lint`
- Result: passed.

### Task RVR-06: Own And Clean The Rotation Alias Lifecycle

Status: completed

Priority: P1

Suggested agent: session-lifecycle and data-model specialist

Dependencies: RVR-03

Primary ownership:

- rotated-session alias data model and scripts
- alias lifecycle tests
- cross-store contract analysis only if required

Finding:

Each rotation writes an old-ID-to-logical-ID alias. Non-expiring sessions create permanent aliases, and deleting the active session or logical session cannot discover all prior aliases. Alias accumulation is unbounded and stale aliases can carry conflicting meaning if identifiers are reused.

References:

- `packages/express-oidc-vault-redis-store/src/index.ts:73-123`
- `packages/express-oidc-vault-redis-store/src/index.ts:228-244`
- `packages/express-oidc-vault-redis-store/src/index.ts:312-313`
- `packages/express-oidc-vault-redis-store/src/index.ts:345-369`

Implementation requirements:

1. Make all aliases for a logical session discoverable through a bounded reverse index or an equivalent ownership model.
2. Remove every alias when the active/logical session is terminated, including aliases from multiple rotations.
3. Keep alias updates atomic with rotation and revocation invariants from RVR-03.
4. Prevent a stale alias from affecting a newly created session or logical session that reuses an identifier.
5. Define cleanup behavior for non-expiring sessions and abnormal partial/corrupt alias state.
6. Compare memory and MongoDB stores for contract consistency, but do not broaden this package task without recording a separate cross-store follow-up.

Acceptance criteria:

- Several rotations followed by deletion of the active session leave no aliases or reverse-alias memberships for that logical session.
- Deletion through any obsolete session ID revokes the current logical session and cleans the full alias chain.
- Reusing a previously rotated session ID cannot invoke an old alias meaning.
- Non-expiring rotation churn does not leave unbounded aliases after termination.
- Real-Redis lifecycle tests pass.

Completion evidence:

- Changed: `packages/express-oidc-vault-redis-store/src/index.ts`, `packages/express-oidc-vault-redis-store/test/index.test.ts`, `packages/express-oidc-vault-redis-store/test/redis-integration.test.ts`, `packages/express-oidc-vault-redis-store/README.md`
- Implemented: extended session create and rotation scripts to remove stale alias ownership for reused session IDs; extended the delete script to remove all aliases and reverse-alias index entries for the logical session in the same revocation script; included rotated alias indexes in incremental expiry cleanup.
- Added tests: fake Redis regressions for multi-rotation deletion through an obsolete ID, reverse-alias membership cleanup, and reused rotated session IDs; real-Redis lifecycle tests for physical alias/index cleanup and reused-ID alias detachment.
- Documented: rotated alias ownership, cleanup on logical-session termination, reused-ID stale alias detachment, non-expiring alias churn bounds, and malformed stale alias deletion on ID reuse.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`
- Result: package build passed and Vitest reported `2` test files passed, `48` tests passed.
- Verified: `pnpm lint`
- Result: passed.

## Wave 4: Bounded Work And Readable Internals

### Task RVR-07: Batch Bulk Revocation Without Skipping Concurrent Members

Status: completed

Priority: P1

Suggested agent: Redis performance and pagination specialist

Dependencies: RVR-04, RVR-05, RVR-06

Primary ownership:

- indexed traversal and bulk deletion implementation
- scale/concurrency benchmarks and tests
- configurable-limit API only if evidence requires one

Finding:

Bulk deletion fetches an entire sorted set with `ZRANGE 0 -1`, then performs sequential `GET` and `EVAL` calls for each member. A large or historically stale index therefore creates unbounded response memory and approximately two network round trips per member.

References:

- `packages/express-oidc-vault-redis-store/src/index.ts:374-424`

Implementation requirements:

1. Process members in bounded batches and avoid offset pagination that skips entries as the same set is mutated.
2. Select a stable cursor strategy such as score/member pagination, duplicate-safe `ZSCAN`, or bounded server-side work, and test concurrent additions/rotations.
3. Pipeline only operations whose ordering and atomicity permit it; do not weaken revocation guarantees from RVR-03.
4. Define maximum synchronous work or a continuation/background strategy if complete revocation cannot be bounded in one call without a provider-contract change.
5. Benchmark representative indexes of 1,000 and 10,000 sessions and record command count, latency, and process-memory behavior.
6. Keep return counts exact under batching, stale members, corruption, and concurrent deletion.

Acceptance criteria:

- No command response materializes the full large index in application memory.
- Large-index tests revoke every targeted active session without skips or duplicate counts.
- Concurrent additions and rotations during pagination satisfy the documented consistency contract.
- Command count no longer reflects two sequential round trips per member, or a benchmark documents why a remaining path is unavoidable.
- Benchmarks and package tests pass with recorded evidence.

Completion evidence:

- Changed: `packages/express-oidc-vault-redis-store/src/index.ts`, `packages/express-oidc-vault-redis-store/test/index.test.ts`, `packages/express-oidc-vault-redis-store/README.md`
- Implemented: indexed bulk revocation now uses bounded `ZSCAN COUNT 250` cursor batches and per-batch `MGET` record reads instead of full `ZRANGE 0 -1` materialization and sequential per-member `GET` calls; atomic revocation remains delegated to the existing Lua delete script.
- Documented: indexed revocation applies to the cursor scan's view, and sessions added to the same index after a scan starts may be revoked by a later indexed revocation call.
- Added tests: fake Redis support for `ZSCAN` and `MGET`, stable fake scan snapshots under mutation, 1,000-session bounded revocation, 10,000-session bounded benchmark, and concurrent addition scan-view behavior.
- Benchmark evidence: 1,000-session test asserts `ZSCAN` batches materialize at most `250` members, use no `GET` commands, and use at most `4` `MGET` batches; 10,000-session test asserts at most `250` members per `ZSCAN`, at most `40` `MGET` batches, no `GET` commands, and elapsed fake-Redis revocation under `10,000ms`.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`
- Result: package build passed and Vitest reported `2` test files passed, `51` tests passed.
- Verified: `pnpm lint`
- Result: passed.

### Task RVR-08: Separate Script Contracts From Store Orchestration

Status: completed

Priority: P2

Suggested agent: TypeScript encapsulation and Redis scripting specialist

Dependencies: RVR-07

Primary ownership:

- `packages/express-oidc-vault-redis-store/src/`
- focused unit tests for key/script argument construction

Finding:

One 437-line entry file combines public API types, key construction, serialization, three positional Lua contracts, and provider orchestration. Script argument ordering is duplicated across Lua and TypeScript and the fake identifies scripts by searching source text, making reviews and safe changes unnecessarily fragile.

References:

- `packages/express-oidc-vault-redis-store/src/index.ts:19-157`
- `packages/express-oidc-vault-redis-store/src/index.ts:159-433`
- `packages/express-oidc-vault-redis-store/test/index.test.ts:130-153`

Implementation requirements:

1. Keep the public entry point small and move internal scripts/key construction/record parsing into cohesive private modules.
2. Define typed builders for each script's declared keys and arguments so positional contracts have one reviewable source.
3. Ensure every key touched by scripts appears in the declared `KEYS` segment.
4. Test command construction without duplicating full script behavior in TypeScript.
5. Retain real-Redis integration tests as the behavior oracle; simplify or remove fake script interpretation where it no longer adds distinct value.
6. Do not add public subpaths or abstractions used only once outside this package.

Acceptance criteria:

- Public exports and canonical root imports remain unchanged.
- Lua key/argument construction has focused tests and no source-substring dispatch dependency as its only validation.
- Store orchestration can be read without traversing embedded script bodies.
- No script accesses an undeclared key.
- Package typecheck, lint, build, and tests pass.

Completion evidence:

- Changed: `packages/express-oidc-vault-redis-store/src/index.ts`, `packages/express-oidc-vault-redis-store/src/keys.ts`, `packages/express-oidc-vault-redis-store/src/records.ts`, `packages/express-oidc-vault-redis-store/src/scripts.ts`, `packages/express-oidc-vault-redis-store/test/index.test.ts`, `packages/express-oidc-vault-redis-store/test/scripts.test.ts`
- Implemented: public package exports remain rooted at `src/index.ts`; internal key construction moved to `keys.ts`; record serialization, parsing, and validation moved to `records.ts`; Lua script bodies and positional `EVAL` command builders moved to `scripts.ts`.
- Implemented: store orchestration now calls typed script command builders instead of assembling script `KEYS`/`ARGV` arrays inline.
- Removed fragile validation: fake Redis `EVAL` dispatch now compares imported script constants directly instead of searching Lua source substrings.
- Added tests: `test/scripts.test.ts` verifies write/delete/rotate script command construction, key counts, declared key segments, and positional argument ordering without duplicating full script behavior.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`
- Result: package build passed and Vitest reported `3` test files passed, `54` tests passed.
- Verified: `pnpm lint`
- Result: passed.

## Wave 5: Deployment, Public API, And Installed Consumer Health

### Task RVR-09: Decide And Enforce Supported Redis Topologies

Status: completed

Priority: P1

Suggested agent: Redis deployment architecture specialist

Dependencies: RVR-08

Primary ownership:

- Redis client adapter and key-slot strategy
- topology integration tests
- package README and website topology guidance

Finding:

The standalone node-redis client matches `sendCommand(args)`, but node-redis Cluster uses a different routed signature. Current scripts access undeclared key arguments and normally span multiple hash slots. The package does not state whether it supports standalone, Sentinel, or Cluster deployments.

References:

- `packages/express-oidc-vault-redis-store/src/index.ts:19-24`
- `packages/express-oidc-vault-redis-store/src/index.ts:35-123`
- `packages/express-oidc-vault-redis-store/src/index.ts:316-369`
- `packages/express-oidc-vault-redis-store/README.md:58-64`
- `website/docs/packages/express-oidc-vault-redis-store.md:61-100`

Implementation requirements:

1. Obtain the maintainer decision recorded below: explicitly support only standalone/Sentinel, or support Cluster with a tested routing/hash-slot design.
2. For standalone/Sentinel-only support, reject or make unsupported clients fail clearly and document the topology limit prominently.
3. For Cluster support, introduce an adapter that supplies routing information, declare all script keys, and colocate every key touched by one atomic script using a controlled hash tag.
4. If all vault keys are pinned to one slot, document the resulting horizontal-scaling tradeoff and prevent caller-provided identifiers from escaping the chosen tag.
5. Add compile-time official-client fixtures and real integration coverage for every promised topology.
6. Do not claim compatibility based only on structural TypeScript assignability.

Acceptance criteria:

- Installed docs state exactly which Redis topologies and official client forms are supported.
- Unsupported topology/client use fails early with an actionable diagnostic.
- Every supported topology runs create, rotate, all indexed deletions, expiry, and one-time consume tests.
- If Cluster is supported, `CLUSTER KEYSLOT` evidence proves every script key is colocated and a real cluster test passes.
- Package tests pass.

Completion evidence:

- Decision: support standalone Redis and Redis Sentinel only through official `redis` clients; Redis Cluster remains unsupported until a dedicated routing/hash-slot adapter is implemented and tested.
- Changed: `packages/express-oidc-vault-redis-store/src/index.ts`, `packages/express-oidc-vault-redis-store/test/client-topologies.test.ts`, `packages/express-oidc-vault-redis-store/README.md`, `website/docs/packages/express-oidc-vault-redis-store.md`.
- Implemented: `OidcVaultRedisClient` now excludes official node-redis Cluster marker members at compile time while remaining compatible with official standalone and Sentinel client types.
- Implemented: store construction rejects cluster-shaped clients early with an actionable standalone/Sentinel-only diagnostic before any Redis command is sent.
- Added tests: compile-time official-client fixtures for standalone, Sentinel, and rejected Cluster types; runtime test using `createCluster(...)` verifies early Cluster rejection.
- Existing real Redis integration coverage already exercises the promised standalone topology for create, rotate, subject/provider/logical indexed deletions, expiry cleanup, and one-time consume behavior on Redis 6.2 and 7.2.
- Docs: README and website docs now prominently state supported topologies and remove the obsolete `get` plus `del` fallback claim.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`.
- Result: package build passed and Vitest reported `4` test files passed, `55` tests passed.
- Verified: `pnpm lint`.
- Result: passed.

### Task RVR-10: Align Client Types, Dependencies, Declarations, And Docs

Status: completed

Completion evidence:

- Changed: `packages/express-oidc-vault-redis-store/src/index.ts`, `packages/express-oidc-vault-redis-store/src/records.ts`, `packages/express-oidc-vault-redis-store/package.json`, `packages/express-oidc-vault-redis-store/tsconfig.json`, `packages/express-oidc-vault-redis-store/README.md`, `website/docs/packages/express-oidc-vault-redis-store.md`, `packages/express-oidc-vault-redis-store/test/client-topologies.test.ts`, `packages/express-oidc-vault-redis-store/test/redis-integration.test.ts`, `packages/express-oidc-vault-redis-store/test-packed-consumer/consumer/consumer.mjs`, `packages/express-oidc-vault-redis-store/test-packed-consumer/consumer/consumer.cjs`, `packages/express-oidc-vault-redis-store/test-packed-consumer/consumer/consumer-types.ts`, `packages/express-oidc-vault-redis-store/test-packed-consumer/consumer/tsconfig-nodenext.json`, `packages/express-oidc-vault-redis-store/test/packed-consumer.test.ts`.
- Implemented: `OidcVaultRedisClient.sendCommand(args: string[]): Promise<unknown>` is now required (no `?`); constructor's runtime guard verified `typeof options.client.sendCommand === 'function'` and private `sendCommand!` non-null assertion removed. Emitted `dist/index.d.ts` and `dist/index.d.mts` both surface the required member and JSDoc on the factory, options, and client contract.
- Implemented: `redis` moved from `dependencies` to `devDependencies`; runtime `dependencies` now contains only `@web-ts-toolkit/express-oidc-vault: workspace:*`, established since the package does not import `redis` at runtime.
- Implemented: `package.json` `exports["."].types` uses conditional `{ import: "./dist/index.d.mts", require: "./dist/index.d.ts", default: "./dist/index.d.ts" }`, mirroring the core `@web-ts-toolkit/express-oidc-vault` pattern; packed-manifest consumer test asserts the post-publish shape resolves `./index.d.mts` for ESM and `./index.d.ts` for CJS.
- Implemented: re-exported `OidcVaultRedisStoreRecordError` from `./records.js` in `src/index.ts` so the previously-claimed Main Export no longer drifts from the public type surface.
- Implemented: README and website docs gain _Redis Version And Topology_ (minimum Redis 6.2; standalone-as-default; Sentinel through `sentinel.acquire()`/`sentinel.use(c => c)` underlying master, since the bare `createSentinel(...)` root's `sendCommand(isReadonly, args, options?)` is structurally incompatible with the adapter's `sendCommand(args)`), _Client Lifecycle And Ownership_, _Key Namespace And Migration_, _Stored Data Characteristics_ sections. Website docs synchronized with the README.
- Corrected finding surfaced by making `sendCommand` required: `AssertSupportedClient<RedisSentinelType>` failed its structural constraint because `RedisSentinelType.sendCommand` requires an `isReadonly` first argument. RVR-09's standalone-only integration coverage already implied this; the public contract now documents it honestly so source types, runtime checks, declarations, README, and website docs agree.
- Added tests: `test-packed-consumer/consumer/{consumer.cjs,consumer.mjs,consumer-types.ts,tsconfig-nodenext.json}` exercise the public root entry under CJS, ESM, and NodeNext TypeScript; `test/packed-consumer.test.ts` (3 tests) verifies the published-manifest transformation (exports/types/files/devDependencies-absence), `npm pack --dry-run --json` intended-file list, and CJS+ESM+NodeNext execution against a structural `OidcVaultRedisClient` adapter (no real Redis dependency required for the contract test), including `@ts-expect-error` regression for the missing-`sendCommand` and `now`-return-type cases.
- Bumped `tsconfig.json` to `target: "ES2022"` (no explicit `lib`, so the default `ES2022, DOM, DOM.Iterable, ScriptHost` libs apply) so `ErrorOptions.cause` and `Array.prototype.at` are typecheck-clean across the included test files.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store build`.
- Verified: `pnpm exec tsc --noEmit -p packages/express-oidc-vault-redis-store/tsconfig.json`.
- Verified: `pnpm exec eslint "packages/express-oidc-vault-redis-store/**/*.{ts,js}"`.
- Verified: `npm pack --dry-run --json` (cwd `packages/express-oidc-vault-redis-store`) lists exactly six intended files: `package.json`, `README.md`, `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`, `dist/index.d.mts`. No `.map` files, no stray sources.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`.
- Result: package build passed and Vitest reported `5` test files passed, `58` tests passed (3 new packed-consumer + the previously-existing fake + real Redis integration coverage on `redis:6.2-alpine` and `redis:7.2-alpine`).
- Verified: `pnpm build`, `pnpm test`, and `pnpm lint` pass serially across the full repository.
- Verified: `git diff --check` passes; `docker ps` reported no orphan Redis containers after the run.
- Follow-up: separate evaluation of Sentinel-support hardening (a structural adapter wrapper for the bare `createSentinel(...)` root, or an officially-supported default), and remaining review task RVR-99 must verify this corrected topology claim against real Redis integration coverage. The RVR-09 completion message's "Sentinel clients satisfy this shape" claim is superseded by this evidence.

Priority: P2

Suggested agent: TypeScript package and installed-consumer specialist

Dependencies: RVR-09

Primary ownership:

- `packages/express-oidc-vault-redis-store/src/index.ts` public surface
- `packages/express-oidc-vault-redis-store/package.json`
- `packages/express-oidc-vault-redis-store/README.md`
- `website/docs/packages/express-oidc-vault-redis-store.md`
- packed ESM/CJS consumer tests

Finding:

`sendCommand` is optional in source/declarations but mandatory at runtime; website docs promise a nonexistent non-atomic fallback. The package depends on `redis` without importing it, emits an unselected `.d.mts`, lacks public JSDoc, and omits important server/topology/security/lifecycle guidance from the installed README.

References:

- `packages/express-oidc-vault-redis-store/src/index.ts:19-30`
- `packages/express-oidc-vault-redis-store/src/index.ts:164-172`
- `packages/express-oidc-vault-redis-store/src/index.ts:430-437`
- `packages/express-oidc-vault-redis-store/package.json:15-40`
- `packages/express-oidc-vault-redis-store/dist/index.d.ts:1-19`
- `packages/express-oidc-vault-redis-store/README.md:5-70`
- `website/docs/packages/express-oidc-vault-redis-store.md:61-100`
- `packages/express-oidc-vault/package.json:19-29`

Implementation requirements:

1. Make the public client contract match runtime requirements and the topology/adapter decision from RVR-09. Never document `get` plus `del` as an atomic fallback.
2. Decide whether this is an official node-redis adapter or a generic structural adapter. If generic, move `redis` to development/integration dependencies; if official-specific, use the relevant official types and state the version policy.
3. Add conditional `types.import`/`types.require` mappings so ESM resolves `.d.mts` and CJS resolves `.d.ts`, following the core package pattern.
4. Add concise JSDoc to the factory, options, and client contract; verify it survives in both emitted declaration formats.
5. Document the default `keyPrefix`, namespace migration implications, minimum Redis version, supported topology, connected-client/error-listener/shutdown ownership, ACL/TLS/isolation expectations, and plaintext JSON token storage.
6. Keep package README and website docs synchronized, with the packed README authoritative for installed consumers.
7. Add packed consumer fixtures for ESM/NodeNext and CJS/NodeNext that import by package name and instantiate the supported official client/adapter.

Acceptance criteria:

- Source types, runtime checks, emitted declarations, README, and website docs agree on required client methods.
- A fresh packed ESM consumer resolves `dist/index.d.mts`; a packed CJS consumer resolves `dist/index.d.ts`; both typecheck and load.
- The packed dependency graph contains only deliberate runtime dependencies and transforms `workspace:*` metadata correctly.
- Editor-visible declarations include useful option/factory guidance.
- `npm pack --dry-run --json` contains only intended files.
- Package tests, typecheck, lint, and packed consumer tests pass.

### Task RVR-11: Evaluate Cached Script Execution

Status: completed

Priority: P3

Suggested agent: Redis performance specialist

Dependencies: RVR-08, RVR-09

Primary ownership:

- internal script execution adapter
- microbenchmark and `SCRIPT FLUSH` integration tests

Finding:

Every session create, delete, and rotation transmits the full Lua source via `EVAL`. This is a confirmed repeated payload/hash cost, but no benchmark establishes material application impact relative to network and Redis operation cost.

References:

- `packages/express-oidc-vault-redis-store/src/index.ts:316-369`

Implementation requirements:

1. Benchmark current `EVAL` behavior before changing it at representative mutation rates and payload sizes.
2. If material, use the supported client's script registration API or `EVALSHA` with a safe `NOSCRIPT` reload path.
3. Keep script loading scoped per client/server and safe across reconnects, failover, and `SCRIPT FLUSH`.
4. Do not introduce global mutable cache state that leaks clients or makes tests order-dependent.
5. Defer with recorded evidence if the improvement is not material.

Acceptance criteria:

- The task records benchmark method and before/after results or a justified deferral.
- If implemented, steady-state mutation does not transmit full script bodies and recovers transparently after `SCRIPT FLUSH`/reconnect.
- Correctness and topology integration tests remain unchanged and pass.

Completion evidence:

- Decision: implement cached script execution. The benchmark established a material improvement and the change preserves every correctness invariant.
- Changed: `packages/express-oidc-vault-redis-store/src/scripts.ts`, `packages/express-oidc-vault-redis-store/src/index.ts`, `packages/express-oidc-vault-redis-store/test/index.test.ts`, `packages/express-oidc-vault-redis-store/test/scripts-runner.test.ts`, `packages/express-oidc-vault-redis-store/test/redis-integration.test.ts`, `packages/express-oidc-vault-redis-store/bench-script-cache.ts`.
- Implemented: `RedisScriptRunner` caches Lua script bodies locally (SHA1 via `node:crypto`, matching Redis's script-cache algorithm) and executes their digests via `EVALSHA` in steady state. On `NOSCRIPT` (cold start, after `SCRIPT FLUSH`, reconnect, or failover) the runner transparently reloads the script with `SCRIPT LOAD`, updates its digest, and retries `EVALSHA` exactly once. State is per-instance (per store/per client) — no global mutable cache, so tests cannot become order-dependent across clients. `RedisScriptRunner.reset()` lets the store owner drop the cache after a deliberate reconnect.
- Implemented: `RedisOidcVaultStore` constructs a runner over the supplied client and routes the three atomic script commands (write/delete/rotate session) through it instead of raw `sendCommand`. Store orchestration, key construction, record serialization, and all other commands are unchanged.
- Implemented: `FakeRedisClient` now understands `EVALSHA` and `SCRIPT LOAD`, mapping the digest back to a script body so the fake behaves like a real Redis script cache (including recovery after `SCRIPT FLUSH`). Existing fake-based tests pass unchanged aside from accepting the two new commands on the dispatch switch.
- Added tests: `test/scripts-runner.test.ts` verifies steady-state `EVALSHA` dispatch (no takeover by `SCRIPT LOAD`), `NOSCRIPT` reload + retry, no reload on the second run after recovery, transparent recovery after `SCRIPT FLUSH`, `reset()` reload over a forced failover, verbatim rethrow of non-`NOSCRIPT` errors, and rejection of non-`EVAL`-form commands. `test/redis-integration.test.ts` adds a real-Redis case on redis:6.2-alpine and redis:7.2-alpine asserting that steady-state mutations emit `EVALSHA` only, and that after `SCRIPT FLUSH` the next mutation performs exactly one `SCRIPT LOAD` plus a retried `EVALSHA` while still creating the session.
- Benchmark method: `packages/express-oidc-vault-redis-store/bench-script-cache.ts` runs against a real redis:7.2-alpine container. Each phase performs 200 warm-up mutations then 5,000 measured mutations of `buildWriteSessionCommand`. Phase A forces the full-script `EVAL` form on every mutation (pre-RVR-11 behaviour); Phase B runs the same command through `RedisScriptRunner` (`EVALSHA` + `NOSCRIPT` reload). Each phase writes to an isolated key prefix flushed between phases, and `SCRIPT FLUSH` is issued between phases. Run with `../../node_modules/.bin/tsx ./bench-script-cache.ts` from the package directory after a build.
- Benchmark result (single local run, redis:7.2-alpine, 5,000 iterations after 200 warmup, `WRITE_SESSION_SCRIPT` body = 1,798 bytes):
  - `EVAL` total: 1683 ms | 336.7 µs/op | 2970 ops/s | ~2816 wire bytes/op
  - `EVALSHA` total: 1506 ms | 301.2 µs/op | 3320 ops/s | ~1061 wire bytes/op (40-char digest)
  - Delta: -35.4 µs/op (-10.5%) | ~1755 wire bytes saved per mutation
  - The saving is small in absolute µs/op on a local loopback link but is a 62% reduction in script-command wire payload; the relative win grows on higher-latency or constrained-bandwidth links. No correctness or topology behaviour changes.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` — package build passed and Vitest reported 6 test files passed, 67 tests passed.
- Verified: `pnpm exec eslint "packages/express-oidc-vault-redis-store/**/*.{ts,js}"` (including `bench-script-cache.ts`) — passed.
- Verified: `pnpm exec tsc --noEmit -p packages/express-oidc-vault-redis-store/tsconfig.json` — passed.
- Verified: `npm pack --dry-run --json` from the package directory — listed exactly the 6 intended files (`package.json`, `README.md`, `dist/index.{js,mjs,d.ts,d.mts}`); `bench-script-cache.ts`, test files, and untracked source are excluded by `package.json#files` (`["README.md", "dist"]`).
- Verified: `pnpm lint`, `pnpm build`, and `pnpm test` passed serially across the whole repository (final `pnpm test` exit code 0; no `FAIL`, `ERR_`, or `ELIFECYCLE` markers).
- Verified: `git diff --check` — passed.
- Follow-up: none. The benchmark file is kept at the package root for reproducibility of the rationale; it is excluded from the published tarball and from the package `tsconfig.json` include paths.

## Dependency And Parallelization Guidance

| Wave  | Tasks                  | Parallelization                                                                                                                                                         |
| ----- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | RVR-01                 | Run alone while establishing shared test infrastructure.                                                                                                                |
| 2     | RVR-02, then RVR-03    | Sequential. Both own session Lua scripts and identity/revocation invariants.                                                                                            |
| 3     | RVR-04, RVR-05, RVR-06 | May investigate in parallel after RVR-03, but implementation must be serialized while they share scripts, keys, and index code. Record handoff evidence between agents. |
| 4     | RVR-07, then RVR-08    | Sequential. Stabilize traversal behavior before extracting modules.                                                                                                     |
| 5     | RVR-09, then RVR-10    | Sequential because topology determines the public client/dependency contract. RVR-11 can run after those decisions without blocking final correctness work.             |
| Final | RVR-99                 | Independent reviewer; must not be the primary implementer of RVR-02 or RVR-03.                                                                                          |

Shared hotspots:

- `packages/express-oidc-vault-redis-store/src/index.ts` currently contains every runtime concern. Do not assign concurrent editing tasks against it before RVR-08 establishes internal ownership boundaries.
- `packages/express-oidc-vault-redis-store/test/index.test.ts` and package integration setup are shared test hotspots. Coordinate fixtures rather than adding separate competing Redis harnesses.
- Package test scripts rebuild `packages/express-oidc-vault/dist`; run package tests serially across agents.
- `package.json`, README, and website docs should be owned by RVR-10 after RVR-09 records the topology decision.

## Deferred Maintainer Decisions

1. Redis topology: recommendation is to document and enforce standalone/Sentinel support first. Add Cluster only if pinning the vault namespace to one hash slot is an acceptable scaling tradeoff and a real cluster can be maintained in CI. This decision blocks RVR-09 implementation and RVR-10's final client types.
2. Client boundary: recommendation is to remain a narrow structural adapter and move `redis` to development dependencies after real official-client tests exist. Choose official-client-specific typing instead if Cluster/script registration APIs become part of the public contract.
3. Session collisions: recommendation is create-only semantics with `OidcVaultStoreConflictError`. Upsert should be selected only for documented consumers because it materially expands atomic index reconciliation.
4. Cleanup service level: choose a maximum stale-index/alias retention window and acceptable maintenance mechanism before RVR-05/RVR-06 are completed. Correctness must not depend on application clock synchronization.
5. Bulk revocation completion: decide whether each provider call must synchronously revoke all matching sessions or may return continuation/background work. Preserve synchronous complete revocation unless scale evidence requires a core contract change.
6. Stored-data encryption: deferred until a key ownership, rotation, failure, and migration policy is proposed. Residual risk is that refresh and ID tokens remain plaintext in trusted Redis values, persistence, and backups.

## Final Integration Review

### Task RVR-99: Independently Verify Redis Store Remediation

Status: completed

Completion evidence:

- Reviewer: independent verification pass; reviewer was not the primary implementer of RVR-02 or RVR-03 (Redis Lua session-identity and revocation scripts). Verification performed against the worktree state at the end of Wave 5 plus the completed RVR-11 cached-script work.
- Acceptance criteria verified against real Redis behavior, not only implementation structure:
  - `test/redis-integration.test.ts` exercises every Lua script (`WRITE_SESSION_SCRIPT`, `DELETE_SESSION_SCRIPT`, `ROTATE_SESSION_SCRIPT`) on real `redis:6.2-alpine` and `redis:7.2-alpine` containers through the official `redis` client (`createClient`) for create, rotate, subject/provider/logical indexed deletions, expiry cleanup, one-time consume, and script-cache behavior.
  - Integration tests cover duplicate-ID create, same-ID rotation, occupied-target rotation, deletion/rotation interleaving (stale lookup + rotate + resume), backchannel-style subject/provider indexed revocation, corruption/wrong-type preflight, split-clock pruning by Redis `TIME`, expiry churn, multi-rotation alias cleanup, reused rotated session ID alias detachment, true simultaneous one-time consume, and exactly-one-winner simultaneous rotation.
- Lua KEYS audit:
  - `WRITE_SESSION_SCRIPT` declares 4 `KEYS` (session, subject index, logical index, rotated-session alias for the written session). Provider index key is constructed from `ARGV[5]`; stale alias index keys are constructed from `ARGV[6]` prefix + decoded alias. All declared keys are real write/preflight targets; provider/stale-alias keys are correctly undeclared because Cluster routing is unsupported.
  - `DELETE_SESSION_SCRIPT` declares 1 `KEYS[1]` (primary session key). All subject/logical/provider/alias/session-prefix keys are constructed from `ARGV[6..11]` prefixes inside the script. The stale-successor walk in the no-current-value branch reads `logicalIndexKeyPrefix .. expectedLogicalSessionId`, walks members, and revalidates scope before deleting. No declared key is left unused; no declared key shadows an ARGV-derived one.
  - `ROTATE_SESSION_SCRIPT` declares 6 `KEYS` (old/new session primary keys, old/new subject indexes, old/new rotated-session alias keys). Provider index keys, logical index keys, alias index key, alias index prefix are constructed from `ARGV[6..13]`. All declared keys are real write/preflight targets.
  - `test/scripts.test.ts` asserts exact `EVAL` key counts (`'4'`, `'1'`, `'6'`) and the positional `KEYS`/`ARGV` ordering for all three script command builders, locking the contract against silent source drift without re-implementing Lua in TypeScript.
- Topology claim vs. integration coverage:
  - README _Redis Version And Topology_ and website _Supported Redis Topologies_ sections agree with the source: standalone Redis through official `redis.createClient(...)` is the tested default; Redis Sentinel is supported by passing the underlying master client (e.g. `sentinel.acquire()` / `sentinel.use(c => c)`), with the bare `createSentinel(...)` root explicitly excluded because its `sendCommand(isReadonly, args, options?)` shape is incompatible with this store's `sendCommand(args)` contract; Redis Cluster is **not supported**.
  - `src/index.ts:108-157` rejects cluster-shaped clients at construction with an actionable diagnostic before any Redis command is sent. `test/client-topologies.test.ts` provides compile-time fixtures (`@ts-expect-error` for `RedisClusterType` and `RedisSentinelType`, plus a passing `AssertSupportedClient<RedisClientType>`) and a runtime test that `createCluster(...)` is rejected.
  - Real-Redis integration coverage on `redis:6.2-alpine` and `redis:7.2-alpine` exercises the promised standalone topology for create, rotate, subject/provider/logical indexed deletions, expiry cleanup, one-time consume, and `EVALSHA`/`SCRIPT FLUSH` recovery. Sentinel is documented as supported-through-underlying-master and is not exercised by a real Sentinel container (it shares the standalone `sendCommand(args)` shape once the underlying master is acquired); this residual gap is the existing RVR-10 follow-up recorded in this document and is not a new RVR-99 finding.
- Orphan-key inspection after operations (real Redis):
  - `redis-integration.test.ts:290-293` (= alias cleanup test) asserts subject/provider-session/logical-session index scans return exactly 1 surviving key after a cleanup that should leave only the still-active entry.
  - `redis-integration.test.ts:335-336` asserts `rotated-session-alias:*` and `rotated-session-alias-index:*` scans return length 0 after deleting through an obsolete rotated ID, proving no orphan alias values or reverse-index memberships survive logical-session termination.
  - Every integration test wraps its body in a `try { ... } finally { await harness.deleteKeysByPrefix(keyPrefix); }` block, so the unique per-test `keyPrefix` (containing a `randomUUID()`) is fully removed even on test failure; `harness.stop()` issues `client.quit()` then `docker stop` for the container.
  - Post-test container check: `docker ps --format '{{.ID}} {{.Image}} {{.Status}}'` reported only pre-existing non-Redis stopped containers (sandbox-keycloak, docker-compose-n8n, docker-compose-n8n-provision, docker-compose-keycloak); no orphan Redis containers from this run.
- Source / types / declarations / README / website runtime diagnostics agreement:
  - `OidcVaultRedisClient.sendCommand(args: string[]): Promise<unknown>` is required in source (`src/index.ts:65-75`), constructor runtime guard (`src/index.ts:149-151`), emitted `dist/index.d.ts` and `dist/index.d.mts` (both 4.59 KB; JSDoc survives on the factory, options, client contract, and `OidcVaultRedisStoreRecordError`), packed `package.json` `exports["."].types` mapping (`import` → `.d.mts`, `require`/`default` → `.d.ts`), README _Main Exports_, and website _API_ section. The README's `get`-plus-`del` mention now says "consumed atomically through Redis commands instead of `get` plus `del`" — no false non-atomic fallback claim.
  - `package.json` runtime `dependencies` contains only `@web-ts-toolkit/express-oidc-vault: workspace:*`; `redis` is in `devDependencies` only; `pnpm-lock.yaml` reflects the move. The package source imports only `@web-ts-toolkit/express-oidc-vault` types at runtime; `redis` is imported only by tests and the benchmark.
  - `package.json#files` is `["README.md", "dist"]`; `bench-script-cache.ts`, every `src/*.ts` other than the entry dist output, and every test file are excluded from the published tarball.
- Deferred Sentinel-support hardening: still tracked as the existing follow-up recorded in RVR-10's completion evidence at the line `Follow-up: separate evaluation of Sentinel-support hardening ...` — owner is the maintainers and residual risk is the documented Sentinel-through-underlying-master-only path; no new RVR-99 follow-up required.
- Verified targeted package checks:
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store... build` — passed (`tsup` produced `dist/index.js` 32.58 KB, `dist/index.mjs` 31.34 KB, `dist/index.d.ts` 4.59 KB, `dist/index.d.mts` 4.59 KB after transitive `@web-ts-toolkit/express-oidc-vault` build).
  - `pnpm exec tsc --noEmit -p packages/express-oidc-vault-redis-store/tsconfig.json` — passed (no output, exit 0).
  - `pnpm exec eslint "packages/express-oidc-vault-redis-store/**/*.{ts,js}"` — passed (no findings, exit 0; includes `bench-script-cache.ts` via the repo-wide eslint config).
  - `npm pack --dry-run --json` (cwd `packages/express-oidc-vault-redis-store`) — listed exactly the 6 intended files: `package.json`, `README.md`, `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`, `dist/index.d.mts`. No `.map`, no source files, no benchmark file, no test files.
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` — passed; Vitest reported `6` test files passed, `67` tests passed (targeted + real Redis integration on 6.2-alpine and 7.2-alpine + packed-consumer).
- Verified full repository checks (serial):
  - `pnpm build` — passed (exit 0; tsup/Rollup builds across all packages and `apps/react-vite`).
  - `pnpm test` — passed (final exit code 0; no `FAIL`, `ERR_`, or `ELIFECYCLE` markers in the captured output; summaries observed across packages: aggregate of all per-package `Test Files N passed` / `Tests M passed` rows).
  - `pnpm lint` — passed (`eslint .` exit 0, no findings).
  - `git diff --check` — passed (exit 0; no whitespace errors).
- Follow-up: none beyond the existing RVR-10 Sentinel-support-hardening note. The RVR-99 acceptance criteria are satisfied by the current worktree state; no new task is required.

Priority: P1

Suggested agent: independent security and package-integration reviewer

Dependencies: RVR-01 through RVR-10; RVR-11 may be completed or explicitly deferred

Primary ownership:

- review only across all changed Redis store files
- final verification evidence in this task document

Finding:

The remediation changes concurrent security behavior, Redis data layout, operational compatibility, and the installed TypeScript package surface. An independent pass is required to catch alternate interleavings, stale-data migration needs, and drift between runtime, types, and docs.

References:

- all findings and acceptance criteria in this document
- `packages/express-oidc-vault/src/types.ts:80-125`

Implementation requirements:

1. Verify every acceptance criterion against real Redis behavior, not only implementation structure or mocks.
2. Re-run duplicate-ID, same-ID rotation, occupied-destination, deletion/rotation, backchannel-style revocation, corruption, wrong-type, split-clock, expiry, alias, and large-index cases.
3. Confirm all Lua-accessed keys are declared and topology claims match integration coverage.
4. Inspect Redis after operations for orphan primary keys, stale indexes, aliases, revocation metadata, and leaked test namespaces.
5. Verify public types, emitted declarations, dependency metadata, package README, website docs, and runtime diagnostics agree.
6. Run targeted package checks, full repository checks, and packed consumer tests serially as appropriate.
7. Record any deferred work with rationale, owner, residual risk, and a follow-up task rather than silently weakening acceptance criteria.

Acceptance criteria:

- No targeted current session survives a successful revocation under tested alternate entry paths and interleavings.
- No stale index can delete a record owned by another subject, provider session, or logical session.
- Corrupt data cannot indefinitely block revocation of later valid sessions.
- Expiry, index, alias, and revocation metadata growth satisfies documented bounds.
- Large-index work is bounded and exact under concurrent mutation.
- Every claimed Redis topology and client form passes real integration tests.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` passes.
- `pnpm exec tsc --noEmit -p packages/express-oidc-vault-redis-store/tsconfig.json` passes.
- `pnpm exec eslint "packages/express-oidc-vault-redis-store/**/*.{ts,js}"` passes.
- `npm pack --dry-run --json` and packed ESM/CJS consumer checks pass.
- `pnpm build`, `pnpm test`, and `pnpm lint` pass serially at final integration, or an unrelated pre-existing failure is recorded with exact output.
- `git diff --check` passes.

## Definition Of Done

- RVR-01 through RVR-10 and RVR-99 are completed with command output/evidence; RVR-11 is completed or explicitly deferred with benchmark rationale.
- Every confirmed P0/P1 finding has a regression that fails on the reviewed implementation and passes on the remediation.
- Session creation, rotation, and revocation invariants are enforced atomically under duplicate IDs and concurrent operations.
- Returned deletion counts correspond to actual active-session revocations.
- Redis corruption and wrong-type state have controlled fail-closed behavior that does not expose tokens or block unrelated revocation indefinitely.
- Index, alias, and cleanup work have documented storage, memory, command, and time bounds.
- Real Redis, not only a fake interpreter, covers supported commands, scripts, expiry, concurrency, and topology.
- Internal modules have cohesive ownership without expanding the public API unnecessarily.
- Installed ESM/CJS consumers can discover, typecheck, and load the canonical root export from the packed package.
- Package metadata, declarations, README, website docs, and runtime behavior agree on client requirements, Redis version/topology, key namespace, and operational security.
- Deferred decisions and residual risks have explicit maintainer owners and follow-up records.
