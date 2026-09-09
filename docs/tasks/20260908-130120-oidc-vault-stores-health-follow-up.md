# OIDC Vault Stores Health Follow-Up

Created: 2026-09-08 13:01:20 (local timestamp)

## Objective And Scope

Prepare executable, evidence-based sub-agent work for the memory, MongoDB, and Redis OIDC vault stores. Improve correctness, security-related revocation behavior, resource bounds, public-contract accuracy, and testability without rewriting the providers. This is a review and task-planning deliverable; no production fixes are implemented here.

Scope: `packages/express-oidc-vault-memory-store`, `packages/express-oidc-vault-mongodb-store`, `packages/express-oidc-vault-redis-store`, and the shared `OidcVaultStoreProvider` contract/conformance tests where provider behavior must agree. Non-goals: new OAuth endpoints, Redis Cluster support, a new storage abstraction, mandatory application-level encryption, or implementing core browser-binding/refresh-reservation proposals from another backlog.

Use repository-relative paths in this document and completion evidence. Generic temporary fixtures may use `/tmp`. Do not manually edit generated `dist/` files or revert concurrent work.

## Coverage And Baseline

- Inspected all three store implementations, MongoDB document mapping/options/topology, Redis record validation and Lua scripts, shared provider types/conformance cases, package manifests/build configuration, shipped READMEs, selected regression tests, integration harnesses, and relevant previous task sections.
- Worktree was clean at review start. Delegated analysis was attempted but unavailable due to the sub-agent usage limit; this review was completed directly, not independently verified by three agents.
- Ran from `packages/express-oidc-vault-memory-store`: `pnpm exec vitest run --config ../../vitest.config.ts test/index.test.ts`. Result: 1 file, 27 tests passed.
- Ran from `packages/express-oidc-vault-redis-store`: `pnpm exec vitest run --config ../../vitest.config.ts test/index.test.ts test/scripts.test.ts test/scripts-runner.test.ts test/client-topologies.test.ts`. Result: 4 files, 38 tests passed.
- Ran from `packages/express-oidc-vault-mongodb-store`: `pnpm exec vitest run --config ../../vitest.config.ts test/internals.test.ts`. Result: 1 file, 6 tests passed.
- All focused runs emitted the Vite native-config-loader compatibility warning. They deliberately did not rebuild dependencies or execute packed-consumer tests; passing results rely on available workspace outputs.
- Ran a non-mutating Node source-import experiment against the memory store. Instrumenting `authorizationTransactions.entries()` with 1,024 live entries and cursor `999` showed 1,064 iterator visits for one missing-state consume, despite the 64-entry sweep batch. A second experiment rotated A to B with expiry 200, then B to C with expiry 400, advanced the clock to 250, and deleted A: C remained live. Source import emitted Node's module-type warning. These experiments created no repository files.
- Live MongoDB replica-set tests, Docker Redis tests, real Sentinel failover, new race reproductions, fresh declarations/builds, packed installations, minimum-Node tests, full repository checks, and release artifacts were not run. This is not a fresh deployment or comprehensive corruption audit. Unreproduced concurrency concerns remain investigations rather than asserted exploits.
- No throughput/latency improvement is claimed. The iterator experiment measures actual work, not production latency.

## Prior Work

The three earlier provider plans mark their remediation tasks completed. This consolidated post-remediation objective preserves those historical records and targets narrower residuals:

- `docs/tasks/20260813-185552-express-oidc-vault-memory-store-review-remediation.md`: MEM-02/04/05 cover aliases, conformance, and opportunistic sweeps. SVH-04 examines cursor traversal cost left behind by MEM-05; SVH-05/06 examine remaining contract differences.
- `docs/tasks/20260813-185606-express-oidc-vault-mongodb-store-review-remediation.md`: MDB-02/03/05/07/08 cover transactions, conditional expiry cleanup, alias retention, query indexes, and mapping extraction. SVH-01/08 concern transaction resource/snapshot boundaries, not restoring the removed non-transactional fallback. SVH-07 concerns result-set size rather than index selection.
- `docs/tasks/20260813-185747-express-oidc-vault-redis-store-review-remediation.md`: RVR-02/03/04/06/07 cover uniqueness, atomic revocation, malformed records, aliases, and batching. SVH-02/03 concern orchestration outside the atomic scripts. SVH-07 checks remaining full-lineage Lua work and real-server scan bounds; it does not repeat the completed application-level ZSCAN conversion.
- `docs/tasks/20260908-070811-express-oidc-vault-boundary-review.md`: BOV-01 now composes replay reservation with catch-up revocation. BOV-02-FU1 and BOV-03-FU1/FU2 propose browser binding and refresh coordination; retain their ownership there. Before shared contract edits, inspect their current status and coordinate with their owners. Core refresh currently preserves `currentSession.expiresAt` at `packages/express-oidc-vault/src/index.ts:730-750`, limiting the direct middleware impact of expiry-extension findings.

## Priorities And Coordination

- P1: production authentication availability or session/revocation consistency risk. No confirmed P0 exploit was established.
- P2: contained correctness, resource efficiency, documentation accuracy, or bounded investigation.
- `defect` identifies observable code/contract behavior; `investigation` requires evidence and a decision, not speculative implementation; `improvement` is optional strengthening.
- All tasks begin `pending`. An investigation can finish with an evidence-backed decision and scoped follow-up. An implementation task cannot finish until its acceptance checks pass; unavailable prerequisites mean `blocked`, not completed.
- Source-only work for SVH-01 (MongoDB), SVH-02 (Redis), and SVH-04 (memory) can proceed in parallel. SVH-03 follows SVH-02 because both own Redis orchestration. SVH-08 follows SVH-01 because both own MongoDB rotation.
- SVH-05 and SVH-06 share core types/conformance/docs and are sequential. Their agents must not implement provider-wide changes while provider owners are editing the same files. Record design decisions first, then assign non-overlapping follow-ups.
- One coordinator owns all builds/tests: package scripts rebuild shared transitive `dist/` outputs. Never run conflicting package scripts concurrently. Serialize shared README, website, `CHANGELOG.md`, and core-contract edits.
- Keep fixes and regression tests together. Prefer the smallest enforcement point, no new public helpers merely for tests, and no broad refactoring without measured benefit.

## Shared Verification

Commands run from repository root unless another working directory is stated. Prerequisites: installed dependencies, repository-supported pnpm, and Node satisfying the affected package engines (currently Node >=22). Run `pnpm install` if needed.

- V1: focused commands listed in the baseline, adding new test filenames explicitly. MongoDB runtime fixes also require its real harness, not only `internals.test.ts`.
- V2: run `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test`, then `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test`, then `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`, serially. During a single task, run its affected package; at integration, all three.
- MongoDB prerequisites: `test/mongo-memory.ts` uses `mongodb-memory-server` with standalone and single-node replica-set processes; a usable MongoDB binary or download access and local process/port permissions are needed.
- Redis prerequisites: `test/redis-harness.ts` launches Docker containers with ephemeral loopback ports. Require a working Docker daemon and the integration suite's Redis images. Inspect test results for skips; skipped live-server cases do not verify Lua/concurrency behavior.
- V3: when core contracts change, also run `pnpm --filter @web-ts-toolkit/express-oidc-vault test`. Reuse `packages/express-oidc-vault/test/store-provider-conformance.ts`; do not create a second competing suite.
- V4: final checks, serially: `pnpm lint`, `pnpm build`, `pnpm test`. Record unrelated failures with evidence instead of changing unrelated packages.
- V5: V2 includes existing packed-consumer tests. For public API/declaration changes, inspect fresh output and run packed CJS/ESM plus strict NodeNext consumers. MongoDB's inspected fixture compiles a single `.ts` consumer (`test/packed-consumer.test.ts:254-304`); explicitly exercise `.mts` and `.cts` before claiming both declaration branches work. A manifest difference alone is not a proven broken export. Use `npm pack --dry-run --json` in each affected package as a file-list check, not a replacement for release-like manifest transformation and installation. If release assembly changes, run `pnpm build-artifact -- --version <ver>` and `pnpm verify-artifact -- --version <ver>` using an agreed test version.

## Executable Tasks

### Task SVH-01: Close MongoDB Sessions On Pre-Transaction Failures

Status: completed

Kind: defect

Priority: P2; routine stale rotations and read failures leak driver-owned client-session lifecycle state.

Suggested agent: MongoDB lifecycle specialist

Dependencies: none

Primary ownership: `packages/express-oidc-vault-mongodb-store/src/store.ts` transaction resource boundary and focused tests in that package.

Finding and references: `rotateSessionWithTransaction` allocates `db.client.startSession()` at `src/store.ts:304-306`, then awaits `normalizeRotatedSession` before entering `try/finally` at `:308-324`. Missing/expired sources and database read failures therefore bypass `endSession()`. The existing stale-rotation test at `test/index.test.ts:362` asserts conflict behavior, not resource closure. This is a cleanup defect even though the exact long-running driver-memory impact has not been measured.

Requirements:

1. Put all fallible work after allocation inside a cleanup boundary, or delay allocation until needed. Preserve conflict types and transaction rollback behavior.
2. Count allocation/closure in tests without exporting store internals as public API. Do not replace the caller-owned MongoClient lifecycle.

Acceptance criteria:

- Missing source, expired source, source-read rejection, transaction rejection, and success each close every allocated ClientSession exactly once.
- Repeated failed rotations leave no accumulating unclosed sessions in the test instrumentation; no replacement or alias is committed on failure.

Verification: V1 focused lifecycle regression and V2 MongoDB.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault-mongodb-store/src/store.ts`: `rotateSessionWithTransaction` now awaits `normalizeRotatedSession` before `db.client.startSession()`, so missing/expired sources and source-read rejections allocate zero sessions; transaction paths still close via existing `try/finally { endSession() }`. Conflict types and rollback behavior preserved; caller-owned `MongoClient` lifecycle untouched.
  - `packages/express-oidc-vault-mongodb-store/test/index.test.ts`: added `createDbWithSessionLifecycleSpy` (counts `startSession`/`endSession` via `Db.client` proxy, no new public API) plus two regression tests covering success, missing source, expired source, source-read rejection, transaction-write rejection, repeated failures, and no-commit-on-failure (replacement null, alias count zero).
  - `docs/tasks/20260908-130120-oidc-vault-stores-health-follow-up.md`: SVH-01 status only.
- Commands/results:
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store... build`: pass (tsup CJS/ESM/DTS).
  - V1 focused (from `packages/express-oidc-vault-mongodb-store`): `pnpm exec vitest run --config ../../vitest.config.ts test/index.test.ts -t "allocated"`: 1 file, 2 passed / 29 skipped (both new lifecycle tests).
  - V1 baseline: `pnpm exec vitest run --config ../../vitest.config.ts test/internals.test.ts`: 1 file, 6 passed.
  - V2: `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test`: 3 files, 40 passed.
  - `pnpm exec eslint packages/express-oidc-vault-mongodb-store/src/store.ts packages/express-oidc-vault-mongodb-store/test/index.test.ts`: clean, no output.
- Residuals: long-running driver-memory impact still unmeasured (as in original finding); out-of-transaction source-read snapshot semantics intentionally unchanged (owned by SVH-08).

### Task SVH-02: Separate Redis Mutation Success From Housekeeping Failure

Status: completed

Kind: defect

Priority: P1; a successful refresh rotation can be reported as failure after its original credential has already been consumed.

Suggested agent: Redis failure-ordering specialist

Dependencies: none

Primary ownership: `packages/express-oidc-vault-redis-store/src/index.ts` create/rotate and incremental index maintenance; corresponding unit/live-server tests and operational docs.

Finding and references: `createSession` commits via `writeSessionRecord` and then awaits `cleanupStaleIndexKeys` (`src/index.ts:185-202`); rotation does the same after the atomic source/target transition (`:209-233`). Cleanup uses independent `SCAN`, `TYPE`, `TIME`, and pruning calls (`:364-425`) and can throw. Thus an unrelated maintenance failure rejects the method after the session mutation is committed. Current wrong-type tests (`test/redis-integration.test.ts:237-271`) concern script preflight, not a post-commit scan failure. This is separate from unavoidable transport uncertainty during the mutation command itself.

Requirements:

1. Establish an explicit result policy in which optional post-commit maintenance cannot masquerade as failed session persistence. Preserve eventual cleanup and meaningful sanitized operational evidence; do not silently suppress every Redis error.
2. Keep mutation-command failures distinct. Do not retry a non-idempotent rotation merely because housekeeping failed, and do not promise exactly-once behavior for an ambiguous lost Redis reply.

Acceptance criteria:

- Inject failures in each maintenance command after a confirmed successful create/rotate. The caller can still identify the committed session according to the documented policy; successful rotation is not rejected solely for maintenance failure.
- Later maintenance recovers and removes stale entries; no tokens or complete stored records appear in diagnostics.
- Existing conflict, revocation, and atomic-index tests remain valid.

Verification: V1 Redis fault-injection tests and V2 Redis, including real scripts.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault-redis-store/src/index.ts`: `createSession`/`rotateSession` now commit via the atomic scripts first and run `cleanupStaleIndexKeys` through `runPostCommitIndexMaintenance`, which catches any `SCAN`/`TYPE`/`TIME`/`ZREMRANGEBYSCORE` failure, emits one sanitized `console.warn` (operation + error name/message truncated to 200 chars; no session IDs, keys, or token material via `sanitizeMaintenanceCause`), and resolves with the committed session. Mutation-script failures still throw; committed rotations are never retried. Documented result policy in JSDoc.
  - `packages/express-oidc-vault-redis-store/test/index-maintenance-failure.test.ts`: new fault-injection suite (10 tests) with a script-handshake fake covering each maintenance command (`SCAN`, `TYPE`, `TIME`, `ZREMRANGEBYSCORE`) failing after successful create and after successful rotate, warn sanitization (no refresh/ID tokens or session IDs), single-attempt rotation counting, later-maintenance recovery/pruning, and mutation-failure distinction.
  - `packages/express-oidc-vault-redis-store/README.md`: documented best-effort post-commit maintenance policy (resolve on commit, sanitized warn, retry on later write, no rotation retry).
  - `docs/tasks/20260908-130120-oidc-vault-stores-health-follow-up.md`: SVH-02 status only.
- Commands/results:
  - V1 focused (from `packages/express-oidc-vault-redis-store`): `pnpm exec vitest run --config ../../vitest.config.ts test/index-maintenance-failure.test.ts`: 1 file, 10 passed.
  - V2: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`: 7 files, 77 passed, 0 skipped/failed (includes live Docker Redis integration; `docker info` OK, 14.96s run).
  - `pnpm exec eslint src/index.ts test/index-maintenance-failure.test.ts` (from package dir): clean.
- Residuals: live-server fault injection is emulated at the `sendCommand` boundary via the fake client, not by breaking a real Redis server mid-`SCAN`; real-server post-commit failure recovery still unmeasured. No exactly-once promise for ambiguous lost mutation replies (documented as out of scope).

### Task SVH-03: Make Redis Corruption Cleanup Compare-And-Delete

Status: completed

Kind: defect

Priority: P2; stale repair reads can delete a subsequently created valid record under the same key.

Suggested agent: Redis concurrency specialist

Dependencies: SVH-02

Primary ownership: `packages/express-oidc-vault-redis-store/src/index.ts` read/repair paths, minimal script support in `src/scripts.ts`, and focused race tests.

Finding and references: malformed session/alias repair executes a separate unconditional `DEL` after `GET` (`src/index.ts:295-307`) or batched `MGET` (`:457-475`). The missing-session deletion branch also ends with unconditional deletion (`:236-253`). Between the read and delete, another reader can remove corruption and `createSession` can successfully create a fresh same-ID record. The stale operation then deletes that fresh value. Explicit ID reuse is supported by `README.md:73` and tested at `test/redis-integration.test.ts:360`. Existing corruption tests at `:208-235` are sequential. No attacker-controlled Redis-write capability is assumed.

Requirements:

1. Remove only the observed malformed value, atomically, or use an equivalent generation-safe boundary. Audit the missing-session branch for the same stale-delete pattern.
2. Preserve fail-closed reads and indexed revocation progress; avoid deleting unrelated indexes or weakening deliberate live-lineage revocation.
3. Distinguish a stale read from genuine concurrent logout semantics in the tests and documentation.

Acceptance criteria:

- Barrier-controlled tests pause after a corrupt/missing read, clean/replace the key through another client, then resume: the replacement is not destroyed by stale repair.
- The original malformed record is removed when unchanged; reads never return malformed credentials, and later valid members are still revoked.
- Verify both single-key and MGET paths with real Redis, not only the script emulator.

Verification: V1 Redis and V2 Redis.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault-redis-store/src/scripts.ts`: added `COMPARE_AND_DELETE_SCRIPT` (Lua `GET`/`DEL` guarded by server-side value equality; missing keys compare unequal and are never deleted) plus `buildCompareAndDeleteCommand`, executed through the existing `RedisScriptRunner` `EVALSHA`/`SCRIPT LOAD` handshake so steady-state repairs stay cached.
  - `packages/express-oidc-vault-redis-store/src/index.ts`: `getJson` (single-key path) and `getSessionRecords` (batched MGET path) now capture the observed raw payload and repair via `deleteMalformedValueIfUnchanged` instead of unconditional `DEL`; the missing-session branch of `deleteSession` replaces its trailing unconditional `del(sessionKey)` with `deleteSessionKeyIfMalformed`, which re-reads and removes the key only when it still holds malformed data (missing keys need no cleanup; fresh valid same-ID replacements are preserved). Reads still fail closed to `null`; indexed revocation still prunes the stale membership and revokes later valid members.
  - `packages/express-oidc-vault-redis-store/test/index-corruption-race.test.ts`: new barrier-controlled suite (5 emulator + 3 real-Redis scenarios x2 images): unchanged malformed removal, single-key stale-read vs replacement, MGET stale-snapshot vs replacement with later-valid-member revocation, missing-session-branch ID reuse with old-lineage revocation, and genuine live-logout deletion (documents stale-repair-preserve vs concurrent-logout-delete).
  - `packages/express-oidc-vault-redis-store/test/index.test.ts`, `test/index-maintenance-failure.test.ts`: emulator fakes implement the compare-and-delete script (keyed by body digest / key count 1).
  - `packages/express-oidc-vault-redis-store/test/scripts.test.ts`: builder-contract test for `buildCompareAndDeleteCommand`.
  - `packages/express-oidc-vault-redis-store/README.md`: corruption-handling notes now state the compare-and-delete guarantee and the stale-repair vs genuine-logout distinction.
- Commands/results:
  - Negative control (from package dir, `src/index.ts` stashed): `pnpm exec vitest run --config ../../vitest.config.ts test/index-corruption-race.test.ts -t "single-key"`: 3 failed / 8 skipped — old unconditional `DEL` destroys the fresh replacement on emulator, redis:6.2-alpine, and redis:7.2-alpine. Fix restored, all pass.
  - V1 focused (from package dir): `pnpm exec vitest run --config ../../vitest.config.ts test/index-corruption-race.test.ts test/scripts.test.ts`: 2 files, 15 passed (includes real-Redis races on both images; `docker --version` 29.7.2 OK).
  - V1 verbose race file: 11 passed (5 emulator + 6 real-Redis), 0 skipped.
  - V2: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`: 8 files, 89 passed, 0 skipped/failed (rebuilds transitive dist, includes live Docker Redis integration).
  - `pnpm exec eslint src/index.ts src/scripts.ts test/index.test.ts test/index-corruption-race.test.ts test/scripts.test.ts test/index-maintenance-failure.test.ts` (from package dir): clean.
- Residuals: `deleteRotatedSessionAliasesByLogicalSessionId` still deletes alias keys/index by listing (unchanged best-effort cleanup after the atomic delete script already removed them; concurrent alias creation in the same lineage during that window is owned by SVH-07 scale/continuation work). Wrong-type session keys remain fail-closed throws on read (unchanged); the missing-branch final cleanup swallows a concurrent `GET` failure as best-effort rather than failing the already-completed alias revocation. Did not update CHANGELOG.md or dist/.

### Task SVH-04: Bound Actual Memory Sweep Traversal

Status: completed

Kind: defect

Priority: P2; same-kind consume/write latency grows with map position despite documented bounded cleanup.

Suggested agent: Node data-structure specialist

Dependencies: none

Primary ownership: `packages/express-oidc-vault-memory-store/src/index.ts` sweep internals and `test/index.test.ts`; related README claims.

Finding and references: `pruneMapBatch` and `pruneSessionsBatch` count yielded entries (`src/index.ts:365-409`), but `entriesAfterCursor` starts a fresh map iterator and walks the entire prefix before yielding (`:412-435`). One nominal 64-entry sweep visited 1,064 entries in the recorded 1,024-record experiment. Cleanup of expired logical IDs additionally scans sessions and aliases (`:438-465`), so changing only the cursor is not evidence that total session cleanup work is bounded. The existing 70-entry test at `test/index.test.ts:680-725` checks reclamation, not traversal work. MEM-05's old completion note calls same-map sweeps capped; this residual disproves that interpretation, not the successful removal of unrelated-map scans.

Requirements:

1. Use a minimal incremental traversal that does not repeatedly search from the start. Account for mutation, deleted cursors, wraparound, empty-string keys, and eventual reclamation.
2. Measure nested alias/lineage cleanup separately. Bound or explicitly document remaining work; do not claim a constant-time operation merely because yielded entries are capped.
3. Avoid background timers, arbitrary capacity policies, or a complex heap without measured justification.

Acceptance criteria:

- Instrument iterator visits for large same-kind maps and late cursors; a nominal sweep no longer visits the map prefix proportional to cursor position.
- Tests cover deletion of the cursor, alternating live/expired entries, and repeated lifecycle operations eventually reclaiming expired records.
- Record same-kind workloads at two substantially different sizes with work counts and timings; preserve clone ownership, exact-boundary expiry, and no unrelated-map scans.

Verification: V1 memory, reproducible measurement, and V2 memory.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault-memory-store/src/index.ts`: replaced the `entriesAfterCursor` generator (fresh iterator + full prefix walk per sweep) with positional per-map sweep state (`{ keys, position }` snapshot + index). Each sweep visits at most 64 snapshot slots via live `map.get` (deleted keys skipped as stale, re-inserted keys still checked, empty-string keys handled positionally, deleted cursors impossible by construction). The snapshot rebuilds once per pass at sweep start, plus at most a mid-sweep continuation rebuild when the map grew past the snapshot (preserves old wraparound throughput: 2 post-expiry creates still cover 128 slots over a 70-key map). No background timers, no capacity caps, no heap. Added aggregate `sweepWork` counters (`inspectedKeys`, `staleSnapshotSlots`, `snapshotRebuilds` for same-map traversal; `aliasSessionVisits`, `aliasEntryVisits` for nested cleanup) readable via the existing test-internals cast; no new public API. Nested alias/lineage cleanup semantics unchanged and explicitly documented as NOT batch-bounded (per expired lineage: full sessions liveness scan with early-out + full alias scan) in code comments and README.
  - `packages/express-oidc-vault-memory-store/test/index.test.ts`: new `describe` block (6 tests) with work-count instrumentation: late-cursor bound at two sizes, alternating live/expired + wraparound + exact-boundary expiry, deleted-keys-around-cursor + snapshot reclamation, 3-cycle lifecycle without snapshot growth, empty-string keys, and separate nested-cleanup measurement.
  - `packages/express-oidc-vault-memory-store/README.md`: cleanup claim now states the honest bounds (64 slots/op/positional cursor/amortized once-per-pass rebuild; nested lineage cleanup lineage-proportional, not constant-time).
  - `docs/tasks/20260908-130120-oidc-vault-stores-health-follow-up.md`: SVH-04 status only.
- Commands/results:
  - V1 focused (from `packages/express-oidc-vault-memory-store`): `pnpm exec vitest run --config ../../vitest.config.ts test/index.test.ts`: 1 file, 33 passed (27 pre-existing incl. clone-ownership conformance, exact-boundary, no-unrelated-map-scans + 6 new).
  - V2: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test`: 2 files, 36 passed (rebuilds transitive dist; includes packed-consumer).
  - `pnpm exec eslint src/index.ts test/index.test.ts` (from package dir): clean.
  - Intermediate failure fixed honestly: first snapshot version (stop at snapshot end, no mid-sweep continuation) failed pre-existing 70-entry reclamation (`state_69` never visited); added grow-triggered mid-sweep continuation, all green.
- Measurement table (recorded via test `console.log`, timings informational only):
  - Late-cursor nominal sweep (forced cursor to last snapshot slot, then one missing-state consume): size=1024 visited=64 inspected=64 stale=0 rebuilds=1 elapsedMs=0.21; size=5120 visited=64 inspected=64 stale=0 rebuilds=1 elapsedMs=0.11. Baseline old code: 1,064 visits for 1,024 records. Work is now size-independent, not cursor-proportional.
  - Nested cleanup, one expired lineage via `getSession`: aliasSessionVisits=1 aliasEntryVisits=2 inspectedKeys=0 (fully separate accounting).
  - Session-sweep trigger over 10 simultaneously-expired distinct lineages: inspectedKeys=12 aliasSessionVisits=10 aliasEntryVisits=10 rebuilds=2 (nested cost lineage-proportional, documented as residual).
  - Lifecycle snapshot sizes after each of 3 drains: 0, 0, 0 (snapshot array itself reclaimed when its map empties).
- Residuals: per-operation worst case is one O(map.size) snapshot rebuild (amortized O(64) over a pass; bulk sequential creates rebuild often, O(n^2) total for n uninterrupted creates, same order as before); nested alias/lineage cleanup remains per-lineage sessions+aliases scans (bounded only by lineage populations) — a lineage-to-alias index was deferred as unjustified complexity. Did not update CHANGELOG.md or dist/ (dist regenerated by the package build script only).

### Task SVH-05: Decide A Portable Rotation-Alias Lifetime Contract

Status: completed

Kind: investigation

Priority: P2; stale-ID revocation guarantees disagree with expiry extension and provider-specific retention.

Suggested agent: session-contract reviewer

Dependencies: none; analysis only until provider edit ownership is coordinated

Primary ownership: `packages/express-oidc-vault/src/types.ts:142-150`, shared conformance specification, and decision evidence in this task. Provider runtime changes require scoped follow-ups.

Finding and references: the interface promises old IDs remain aliases while the lineage is live. Memory records an alias's expiry once (`packages/express-oidc-vault-memory-store/src/index.ts:225-228`); Redis similarly uses the immediate successor expiry (`packages/express-oidc-vault-redis-store/src/scripts.ts:460-466,544-546`); MongoDB assigns immediate successor expiry or a finite fallback window (`packages/express-oidc-vault-mongodb-store/src/store.ts:327-346,385-388`). Earlier aliases are not extended on later rotation. MongoDB intentionally expires aliases of non-expiring sessions after five minutes by default. Memory/Redis non-expiring aliases accumulate until lineage termination. The baseline memory experiment shows a still-live C surviving deletion through expired A. Shared conformance at `packages/express-oidc-vault/test/store-provider-conformance.ts:247-260` tests immediate deletion, not lifetime boundaries.

Requirements:

1. Establish whether the portable guarantee is a finite in-flight-request bridge or whole-lineage revocation. Distinguish generic provider callers from core refresh, which currently preserves expiry.
2. Compare fixed expiry, extended expiry, no expiry, changed logical ID, and ID reuse across all three providers. Identify whether old aliases should follow explicitly changed lineage at all.
3. Record the maintainer-approved policy and retention/resource implications. Do not implement indefinite retention or a new option by assumption.

Acceptance criteria:

- Reproducible matrix records when old IDs revoke and when they intentionally stop working, including MongoDB fallback retention.
- Decision explains security/revocation and storage tradeoffs, with matching proposed JSDoc/README wording.
- Any behavioral change has a separately owned implementation follow-up with migration/release notes and tests; an evidence-backed documentation-only resolution is permitted.

Verification: V1-compatible experiments plus real Redis/MongoDB expiry evidence under V2 prerequisites. Maintainer owns the policy decision; unresolved policy blocks implementation, not investigation.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/src/types.ts`: `rotateSession` JSDoc now states the decided finite in-flight-request bridge contract (each alias expires with its immediate successor's `expiresAt`, never extended by later rotations; explicitly changed logical ID moves the alias to the new lineage; non-expiring retention is provider-specific — memory/Redis persist until lineage termination, MongoDB applies its finite `rotatedSessionAliasRetentionMs` fallback; generic callers treat expired aliases as a hint; core refresh rotates the live session and preserves `expiresAt`). Comment-only; no runtime behavior changed. BOV-01/02/03 are all `completed` in `docs/tasks/20260908-070811-express-oidc-vault-boundary-review.md`, and the edit touches only `rotateSession` docs (BOV-01 owns `consumeBackchannelLogoutTokenJti` docs; BOV-03-FU1/FU2 are proposed-only), so no coordination conflict.
  - `docs/tasks/20260908-130120-oidc-vault-stores-health-follow-up.md`: SVH-05 status and this evidence only. No other SVH sections touched. No `CHANGELOG.md`, no `dist/`.
  - Investigation fixtures (`/tmp/opencode/svh05-matrix.mjs`, `packages/express-oidc-vault-redis-store/test/svh05-tmp-matrix.test.ts`, `packages/express-oidc-vault-mongodb-store/test/svh05-tmp-matrix.test.ts`) were temporary and deleted after recording results below; no provider runtime code changed.
- Reproducible matrix (all assertions passed at run time; temp fixtures deleted):
  - Memory (`dist/index.mjs`, fake clock, Node v26.7.0): M1 single-rotation alias `deleteSession(A)` revokes live B (PASS); M2 baseline A->B(exp200)->C(exp400), clock 250, `deleteSession(A)` is a no-op and C stays live, then `deleteSession(B)` revokes C (PASS/PASS); M3 non-expiring A->B->C still revocable via A at clock 10,000,000 (PASS — accumulates until termination); M4 reuse-after-termination: stale alias does not kill reused ID (PASS); M5 rotation with explicitly changed logical ID moves the alias to the new lineage and revokes it (PASS); M5b earlier alias keeps the OLD lineage, so lineage-changed C survives `deleteSession(A)` (PASS); M6 static check that core refresh preserves `currentSession.expiresAt` (`packages/express-oidc-vault/src/index.ts:739`) (PASS). 8/8.
  - Redis (real server `redis:7.2-alpine` via Docker, `test/redis-harness.ts`; server time is PXAT authority so expiries used real wall-clock): R1 alias revokes live lineage (PASS); R2 A->B(+1500ms)->C(+60s), after 2.1s `deleteSession(A)` no-op with C live, `deleteSession(B)` revokes C (PASS/PASS); R3 non-expiring alias key `PTTL` is `-1` (persistent, accumulates) and revokes via alias (PASS/PASS).
  - MongoDB (real single-node replica set via `mongodb-memory-server`, cached `mongod` binary): G1 alias revokes live lineage (PASS); G2 A->B(exp200)->C(exp400) at clock 250, `deleteSession(A)` no-op with C live, `deleteSession(B)` revokes C (PASS/PASS); G3 non-expiring alias: past default 5-min fallback (`now = 100 + 300001`) `deleteSession(N1)` is a no-op with N2 live, at clock 100 it revokes (PASS/PASS — fallback retention confirmed); G4 ID-reuse-while-live (`createSession('A3')` after A3->B3, then `deleteSession('A3')`): B3 LIVE (matches memory end state; mechanism differs — Mongo keeps the stale alias row until the session-branch delete clears the lineage's aliases, while memory/Redis clear the stale target alias at create; see FU-SVH-05b).
  - Cross-provider ID-reuse note: MongoDB `createSession` (upsert) does NOT clear a live rotated alias for the reused ID, unlike memory (`src/index.ts:200` `rotatedSessionAliases.delete`) and Redis (stale-target alias cleanup `src/scripts.ts:452-458`). End state matches in the tested sequence (G4/memory-G4 both LIVE) because the session-branch delete drops the lineage's aliases, but a delete racing between reuse and cleanup resolves through different branches per provider. Owned by FU-SVH-05b (overlaps SVH-06 create-contract work; no runtime change made here).
- Decision (finite in-flight bridge, not whole-lineage revocation):
  - The portable guarantee is a finite bridge for in-flight requests holding a just-rotated ID: `deleteSession(oldId)` revokes the lineage only while that specific alias is unexpired. All three providers already implement this (alias expiry = immediate successor `expiresAt`, never extended), so the old JSDoc phrase "while the lineage remains live" overpromised — M2/R2/G2 prove an earlier alias stops working while the lineage is live. No provider runtime change is required to converge on this reading; the contract text was the defect.
  - Generic callers vs core refresh: generic callers must treat an expired alias as a hint, never a revocation channel (after the bridge window only the live ID or a scoped `deleteSessionsBy*` revokes). Core refresh is unaffected: it always rotates the live session ID directly and preserves `expiresAt` (`src/index.ts:730-750`), so alias lifetime never gates refresh.
  - Changed logical ID: an alias follows the lineage named at its own rotation (the successor's logical ID). It does not track later explicit lineage changes (M5b), and a rotation that changes the logical ID starts a new revocation scope for that alias (M5). Old aliases must NOT follow explicitly changed lineages — doing so would let a stale holder revoke an unrelated lineage.
  - Security/revocation vs storage tradeoff: fixed (non-extended) expiry bounds the window in which a leaked old ID is a live revocation handle, and lets Redis/Mongo reclaim alias keys via TTL without a lineage scan; the cost is that post-window revocation requires the live ID or a scoped delete. Whole-lineage revocation would keep every old ID dangerous for the session lifetime (larger blast radius on ID leak) and force unbounded alias accumulation. For non-expiring sessions the providers knowingly diverge: memory/Redis trade unbounded-but-lineage-scoped alias growth for a permanent bridge, MongoDB trades bridge durability for bounded storage via the 5-min fallback. Neither is changed here; the divergence is now documented in the interface and queued in FU-SVH-05b.
- Proposed README wording (for FU-SVH-05a to apply consistently across the three provider READMEs; memory README:67 already says "Aliases expire with the rotated target session"):
  - "Rotation aliases are a finite bridge, not whole-lineage revocation. Each old session ID revokes its lineage only until its immediate successor session expires; later rotations do not extend earlier aliases. After that window, use the live session ID or a scoped delete (`deleteSessionsByLogicalSessionId` / `...BySubject` / `...ByProviderSessionId`). Sessions without `expiresAt`: memory and Redis aliases persist until the lineage terminates; MongoDB expires them after `rotatedSessionAliasRetentionMs` (default 5 minutes)."
- Follow-ups (proposed, not implemented — no runtime change in this investigation):
  - FU-SVH-05a (docs/conformance; suggest SVH-06 owner since it sequences shared contract/docs): apply the README wording above to all three provider READMEs plus `packages/express-oidc-vault/README.md:615`, and add shared conformance cases for the A->B->C expiry boundary, non-expiring retention variation, and changed-logical-ID alias scoping. No migration notes needed (documentation-only).
  - FU-SVH-05b (behavior decision for maintainer; overlaps SVH-06/SVH-08): decide whether to align non-expiring alias retention (bound memory/Redis with a configurable fallback vs document permanent variation) and whether MongoDB `createSession` should clear a live stale alias for a reused ID like memory/Redis do. Requires migration/release notes and regression tests if behavior changes; explicitly do NOT implement indefinite retention or a new option by assumption.
- Commands/results:
  - `node /tmp/opencode/svh05-matrix.mjs`: 8/8 PASS (fixture deleted afterwards).
  - Redis tmp matrix (from `packages/express-oidc-vault-redis-store`): `pnpm exec vitest run --config ../../vitest.config.ts test/svh05-tmp-matrix.test.ts`: 1 file, 1 passed on `redis:7.2-alpine` (Docker OK; earlier failure with fake `expiresAt: 1000` diagnosed honestly — real Redis PXAT uses server wall-clock, fixture corrected to `Date.now()`-based expiries; fixture deleted afterwards).
  - MongoDB tmp matrix (from `packages/express-oidc-vault-mongodb-store`): same command: 1 file, 1 passed on real single-node replica set (fixture deleted afterwards).
  - `pnpm exec eslint packages/express-oidc-vault/src/types.ts`: clean.
  - V3 core (comment-only change sanity): `pnpm --filter @web-ts-toolkit/express-oidc-vault test`: 19 files, 260 passed.
  - `git status --short` confirms no other SVH sections or provider runtime files touched by this task (remaining worktree modifications belong to SVH-01..04 agents).
- Residuals: conformance suite still tests only immediate deletion (`store-provider-conformance.ts:247-260`), not lifetime boundaries — covered by FU-SVH-05a. Real-server evidence single-image each (Redis 7.2-alpine; MongoDB memory-server replset); 6.2-alpine and second MongoDB binary not exercised. Bulk-scale alias accumulation costs not measured (owned by SVH-07).

### Task SVH-06: Reconcile Create Semantics In The Shared Provider API

Status: completed

Kind: defect

Priority: P2; switching a provider changes the behavior promised by its shared TypeScript interface.

Suggested agent: public API and conformance specialist

Dependencies: SVH-05, to sequence shared contract/docs decisions

Primary ownership: `packages/express-oidc-vault/src/types.ts`, `test/store-provider-conformance.ts`, and the three providers' contract documentation. Coordinate provider runtime changes rather than editing them concurrently.

Finding and references: `OidcVaultStoreProvider.createSession` promises upsert (`src/types.ts:139-140`). Memory implements replacement (`packages/express-oidc-vault-memory-store/src/index.ts:149-166`), MongoDB does likewise (`packages/express-oidc-vault-mongodb-store/src/store.ts:131-142`), but Redis explicitly rejects an existing key (`packages/express-oidc-vault-redis-store/src/index.ts:185-198`, `README.md:74`). Shared conformance permits either mode (`packages/express-oidc-vault/test/store-provider-conformance.ts:12-15,169-183`), hiding the mismatch instead of describing it in the public contract. This is a confirmed contract defect, not a recommendation to undo RVR-02's index-ownership protection.

Requirements:

1. Have the maintainer choose one portable behavior or explicitly document supported provider variation and the portable subset. Do not make Redis an unsafe upsert to satisfy a comment.
2. Audit same-ID replacement/reuse implications for rotation, aliases, and scope ownership before any runtime change. Include overlap with SVH-08 evidence.
3. Update shared JSDoc, provider READMEs, conformance expectations, and release notes together if external behavior changes. Preserve shipped compatibility only where there is a concrete need.

Acceptance criteria:

- A consumer reading the emitted provider interface can accurately predict duplicate-create behavior or see the documented provider-specific constraint.
- All providers' duplicate-create tests conform to the selected policy; rejected creates preserve original records/indexes and accepted replacements follow documented alias ownership.
- The conformance suite no longer silently permits a behavior contradicted by the interface.

Verification: V2 all providers, V3, V5. Maintainer owns the portable-behavior decision; mark blocked before runtime changes if it remains unresolved.

Completion evidence:

- Decision (documented variation + portable subset, no runtime change): memory/MongoDB `createSession` replaces (upsert); Redis `createSession` is create-only and rejects live duplicates with `OidcVaultStoreConflictError` without changing the record or indexes (RVR-02 index-ownership protection preserved — Redis was deliberately NOT made an unsafe upsert). The portable subset is "callers must always create sessions with a fresh unused `sessionId` and handle `OidcVaultStoreConflictError`". This is compatible with shipped callers: core creates/rotates only fresh `createOpaqueId('sess')` IDs (`packages/express-oidc-vault/src/index.ts:579,730`), so it never depends on duplicate-create behavior. No provider runtime code changed; no migration needed (documentation-only).
- Same-ID replacement/reuse audit (rotation/aliases/scope, incl. SVH-08 overlap; SVH-08 itself not implemented):
  - Rejected creates (Redis) preserve the original record and its subject/logical/provider-session index memberships (conformance now asserts all three scopes stay with the original; Redis unit test `test/index.test.ts:869` already asserted subject/provider indexes).
  - Accepted replacements (memory/MongoDB) take over the ID with the replacement's own subject/logical/provider-session scope (conformance now asserts old subject scope is empty and the new subject scope owns the session). Memory needs no index migration (live-map scans); MongoDB document replacement updates indexed fields atomically via its own index maintenance.
  - Reuse-after-rotation (ID holds only a stale alias): memory (`src/index.ts:200` `rotatedSessionAliases.delete`) and Redis (write script stale-alias cleanup `src/scripts.ts:199-205`; rotate script `:452-458`) clear the stale alias so the reused ID cannot invoke the old lineage; MongoDB retains the stale alias row until its lineage is deleted (separate collections share the `_id`), so a second `deleteSession(reusedId)` after the replacement is gone revokes the OLD lineage on MongoDB but is a no-op on memory/Redis. Documented in JSDoc/README/conformance as a known divergence queued in FU-SVH-05b; not changed here.
  - SVH-08 overlap: MongoDB `createSession` upsert between `normalizeRotatedSession` (`src/store.ts:349-358`) and `withTransaction` (`:308-319`) can replace the source generation the rotation was prepared from; the transaction then inserts the successor and deletes by `_id` unconditionally. Portable precondition (now in the interface JSDoc): never reuse a live ID concurrently with rotation; rotation targets must be distinct unused IDs (already enforced with `ConflictError`). No generation check implemented here — owned by SVH-08.
- Changed files (docs/conformance/tests only; no provider runtime, no `dist/`, no `CHANGELOG.md` per user instruction — release-note draft below instead):
  - `packages/express-oidc-vault/src/types.ts`: `createSession` JSDoc replaced the blanket "Upsert" promise with the provider-specific contract (replace vs create-only, rejected-create preservation, replacement scope takeover, stale-alias divergence, portable fresh-ID subset, SVH-08 race note). Comment-only.
  - `packages/express-oidc-vault/test/store-provider-conformance.ts`: `sessionCreateMode` is now required (no silent default) plus required `reusedSessionIdClearsStaleAlias`; duplicate-create branches strengthened (create-only asserts original record + all three index scopes untouched; upsert asserts replacement values + scope ownership transfer); new `create-reuse-alias-ownership` case asserts first-`deleteSession` removes only the replacement on all providers and second-`deleteSession` follows the declared alias-clearing flag (no silent either-or).
  - Provider conformance declarations: memory `upsert`/`clears:true`, MongoDB `upsert`/`clears:false`, Redis `create-only`/`clears:true`.
  - READMEs: memory store (replacement scope takeover + stale-alias clearing + portable subset), MongoDB store (upsert + retained-stale-alias divergence + portable subset), Redis store (create-only + portable subset pointer), core `express-oidc-vault/README.md` Store Provider Contract (was line 609: blanket "deliberate upserts" contradicting Redis — now states the variation + portable subset; line 615 alias-lifetime wording untouched, owned by FU-SVH-05a).
  - Release-note draft (not applied to `CHANGELOG.md` per user instruction): "Store provider contract docs: `createSession` duplicate-ID behavior is now explicitly provider-specific — memory/MongoDB replace (upsert), Redis rejects live duplicates with `OidcVaultStoreConflictError`. Portable callers must use fresh session IDs and handle conflicts. MongoDB additionally retains a stale rotation-alias row across same-ID reuse until its lineage is deleted. Documentation-only; no runtime behavior changed, no migration required."
- Commands/results:
  - `pnpm exec eslint` on `types.ts`, conformance, and all three provider test files: clean.
  - V2 serial: memory `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test`: 2 files, 37 passed; MongoDB: 3 files, 41 passed (real standalone + replica-set harnesses); Redis: 8 files, 90 passed (includes live Docker Redis integration). Each +1 vs baseline from the new reuse-alias case.
  - V3: `pnpm --filter @web-ts-toolkit/express-oidc-vault test`: 19 files, 260 passed.
  - V5 file-list: `npm pack --dry-run --json` in `express-oidc-vault`, `-memory-store`, `-mongodb-store`, `-redis-store`: 6 files each, OK. Emitted `dist/index.d.ts` + `dist/index.d.mts` verified to carry the new `Duplicate-ID behavior` JSDoc (rebuilt by the package test scripts; no manual `dist/` edits).
  - `git status --short` confirms remaining worktree modifications (memory/mongo/redis `src/`, other test blocks) belong to concurrent SVH-01..04 agents; this task touched only the files listed above plus this section.
- Residuals: MongoDB stale-alias-on-reuse divergence locked into conformance via the declared flag pending FU-SVH-05b maintainer decision (align vs permanently document); SVH-08 owns the in-transaction source-generation guarantee; bulk alias-accumulation costs owned by SVH-07.

### Task SVH-07: Measure And Bound Remaining Bulk Revocation Work

Status: completed

Kind: investigation

Priority: P2; large lineages/result sets can defeat existing batching assumptions and monopolize memory or Redis execution.

Suggested agent: persistence performance reviewer

Dependencies: SVH-02, SVH-03, SVH-05; measure settled Redis behavior and alias policy

Primary ownership: focused benchmark/integration fixtures in the MongoDB and Redis packages and evidence in this task. Runtime changes require evidence-backed scoped follow-ups, owned per provider.

Finding and references: MongoDB's scoped deletion materializes every match with `.toArray()`, creates a full logical-ID set, sends it in `$in`, and repeats until empty (`packages/express-oidc-vault-mongodb-store/src/store.ts:362-382`). Large populations can create large memory/command payloads, and continuing matching writes can prolong the loop. Redis outer traversal uses `ZSCAN COUNT 250` (`packages/express-oidc-vault-redis-store/src/index.ts:433-454`), but COUNT is a hint, not a strict response cap. Alias deletion still materializes a full ZRANGE (`:570-580`), and Lua deletes whole alias/lineage sets (`src/scripts.ts:278-307,324-340`) without yielding. Prior RVR-07 evidence used a fake client's stable snapshots and capped batches; real integration tests currently exercise races but not this scale matrix.

Requirements:

1. Measure 1,000/10,000-session populations, a large single lineage/alias set, stale members, and multi-tenant matching scopes on real services. Record command sizes/counts, process memory, latency, and Redis responsiveness to an unrelated client.
2. Exercise actual compact and expanded sorted-set encodings; do not treat SCAN COUNT or the fake client's snapshot behavior as a hard Redis guarantee.
3. Define the completion model under concurrent creation and rotation; distinguish sessions present throughout a scan from new arrivals. Inspect MongoDB count behavior with logically expired but TTL-retained records.
4. Recommend bounded batches/continuations or a justified deferral based on measurements. Do not split atomic lineage revocation into unsafe partial deletes just to shorten a Lua call.

Acceptance criteria:

- Runnable evidence establishes actual batch/response bounds and whether the reviewed datasets hit unacceptable resource costs; no fake-only latency claim is presented as Redis performance.
- Recommendation specifies observable limits and concurrency semantics, including exact-count policy, or records why current costs are acceptable and what residual limit remains.
- Required fixes become independently verifiable per-provider follow-ups with no speculative shared abstraction.

Verification: real-service fixtures under V2 prerequisites; record commands, versions, dataset construction, results, and environmental limits.

Completion evidence:

- Changed files: none in `src/` (investigation only — no runtime change was justified; see recommendation). Temporary runnable fixtures `packages/express-oidc-vault-mongodb-store/test/svh07-tmp-bulk.test.ts` (5 tests) and `packages/express-oidc-vault-redis-store/test/svh07-tmp-bulk.test.ts` (4 tests) plus a throwaway debug/rotation-validation probe and a Mongo command-trace probe were deleted after recording the results below. This section only.
- Environment/versions: Node v26.7.0; MongoDB via `mongodb-memory-server@^11.2.0` single-node replica set (cached `mongod` binary, real driver + real server); Redis `redis:7.2-alpine` (`redis_version:7.2.15`) via Docker 29.7.2 (`test/redis-harness.ts`, ephemeral loopback ports). Vitest `^4.1.10`. Only `redis:7.2-alpine` exercised (6.2 image not re-run; ZSCAN/ZRANGE/Lua paths are version-stable for the measured commands).
- Method: fixtures built populations through the public store APIs (`createSession`/`rotateSession` with fully valid records — an early probe taught that `nextSession` inputs missing `createdAt`/`updatedAt` fail `validateSession`, so `getSession` correctly treats them as malformed and deletes them; fixture corrected, no source change). Measured wall latency, `process.memoryUsage` heap delta, live command counts/sizes via a `sendCommand` counting wrapper (Redis) and `monitorCommands` trace (MongoDB), `OBJECT ENCODING` / `ZCARD` / `MEMORY USAGE` (Redis), and an unrelated-client `PING` loop during bulk delete (Redis responsiveness).
- Measurements — MongoDB (`src/store.ts:362-382` loop):
  - 1k mixed-tenant build 2,924 ms; narrowed `deleteSessionsBySubject({subject, issuer, clientId})` 19 ms, deleted exactly the 500 matching-tenant sessions (multi-tenant isolation holds), heap +1.6 MB; second pass deleted the other 500, 0 remaining.
  - 10k distinct-logical-ID build 30,635 ms; scoped delete 202 ms, deleted 10,000, 0 remaining, heap delta negative (GC; projection-only `toArray` of 10k `{_id, logicalSessionId}` docs is process-tolerable). Estimated `$in` alias payload ~10 bytes x 10k IDs (~100 KB in one `deleteMany`; estimated, not packet-captured).
  - Single lineage of 500 (`deleteSessionsByLogicalSessionId`, direct `deleteMany`, no loop): 9 ms.
  - Logically expired but TTL-retained: 10 expired + 5 live all present before delete; `deleteSessionsBySubject` returned 15, 0 remaining. Exact-count policy established: the count includes logically-expired-but-TTL-retained docs (matches `deleteMany` semantics; callers must not interpret it as live-only).
  - Concurrent creation during scan: 2,000 seeded + 50 created mid-delete; first call returned 2,050, 0 remaining, second pass 0. Completion model: the loop-until-empty re-`find`s, so arrivals during the scan ARE picked up at the cost of extra iterations — but continuous writes can prolong the loop indefinitely (unbounded under adversarial write load; no hang observed).
  - Command trace (static 200-population, `monitorCommands`): `find, getMore, delete, delete, find` — i.e. 2 loop iterations (confirming find + final empty confirm), driver cursor batches the `find` (`getMore` at 200 docs with default batching; materialization is full but cursor-batched), then sessions `deleteMany(filter)` + alias `deleteMany($in)`.
- Measurements — Redis (`src/index.ts:433-454,567-580`, `src/scripts.ts:278-307,324-340`):
  - 1k same-subject build ~67 s (per-`createSession` post-commit maintenance SCAN from settled SVH-02 behavior dominates; observation only) vs 1k `deleteSessionsBySubject` 2,773 ms for 1,000 revocations (~2.8 ms/session). Command mix per delete: `ZSCAN`x4, `MGET`x4, `EVALSHA`x1001, `ZRANGE`x1000, plus per-revoked-session `TIME`+`ZREMRANGEBYSCORE` (x1001, from per-member `deleteRotatedSessionAliasesByLogicalSessionId` -> `cleanupExpiredIndexMembers`). Dominant cost is ~4 RTT per revoked session, not Lua execution.
  - ZSCAN `COUNT 250` is a hint, confirmed on real server: observed batch sizes 247-252 (`[252,251,250,247]`, `[250,251,250,249]` across runs); `MGET` sizes match. Batches are bounded in practice but must not be relied on as a cap.
  - Encodings on real server: 10-member subject index `listpack`; 300/1,000-member indexes `skiplist` (1k-member zset `MEMORY USAGE` 95,472 bytes). Compact vs expanded paths both exercised.
  - Single 300-member lineage delete: 638 ms (300 `EVALSHA` + 300 empty-alias `ZRANGE`s). Alias-chain K=100 revocation via single `deleteSession(alias_0)`: 8 ms including the whole-alias-set Lua path (`ZRANGE` full 100 + 100 `DEL`s + index `DEL` in one script) — whole-set Lua is fast at K=100 and must stay atomic (not split).
  - Stale members: 20 session keys `DEL`eted directly, then tenant-scoped delete returned exactly 80 (live client_1 members), 20 stale pruned via `ZREM` (not counted), other-tenant 100 untouched in index. Exact-count policy: return counts live revocations; stale prunes are housekeeping, not revocations.
  - Concurrent arrivals during ZSCAN: 300 seeded + 20 created mid-scan; first call returned 300 (arrivals after the cursor passed were missed), index still held 20, second pass returned 20. Completion model: unlike MongoDB's loop-until-empty, a single `deleteSessionsFromIndex` pass can MISS new arrivals — callers needing completeness must re-run; sessions present throughout the scan are all visited (barring concurrent mutation of the scanned zset, which only reorders, not the miss observed here).
  - Unrelated-client responsiveness during 1k delete (3,955 PINGs): max 6 ms, p99 2 ms — no Redis monopoly at this scale.
- Limits honestly recorded: Redis 10k population NOT run (extrapolated build ~11 min at ~67 ms/create; delete itself unmeasured at 10k); alias-set Lua bound measured only to K=100 (10k-alias whole-set Lua unmeasured); Mongo `$in` chunking unmeasured beyond 10k IDs; second Redis image (6.2-alpine) not exercised. No fake-client latency is presented as Redis performance — all Redis numbers are real-server.
- Recommendation (observable limits + concurrency semantics; no runtime change in this investigation):
  - Current costs are acceptable at measured scales (Mongo 10k/202 ms; Redis 1k/2.8 s with responsive server; whole-set Lua 8 ms at K=100). Do NOT split atomic lineage revocation into partial deletes.
  - Documented completion semantics (for provider READMEs, owner: FU-SVH-07a/b authors): MongoDB scoped deletes loop until a confirming empty `find` (picks up concurrent arrivals; may run long under continuous writes); Redis scoped deletes are single ZSCAN passes (may miss concurrent arrivals — re-run for completeness).
  - Documented exact-count policies: MongoDB counts include TTL-retained logically-expired docs; Redis counts live revocations only (stale `ZREM` prunes excluded).
  - Residual limits: Mongo `$in` alias payload grows with distinct logical IDs per iteration (~10 B/ID; ~100 KB at 10k); Redis per-member `TIME`+`ZREMRANGEBYSCORE`+`ZRANGE` (~3 avoidable RTT/session) dominates bulk cost; alias-set Lua unbounded in K.
- Follow-ups (per-provider, independently verifiable, no shared abstraction):
  - FU-SVH-07a (MongoDB owner): chunk the alias `deleteMany({logicalSessionId: {$in}})` (e.g. 1k-ID chunks) and/or document the loop-prolongation semantic in the Mongo README; regression test at 10k+ distinct lineages asserting chunk sizes via `monitorCommands`. Only if populations approach 100k IDs or prolonged loops are observed in production.
  - FU-SVH-07b (Redis owner): reuse a single server timestamp per `deleteSessionsFromIndex` pass and skip `ZREMRANGEBYSCORE` on just-written alias indexes (cuts ~2 RTT per revoked session); assert reduced `TIME`/`ZREMRANGEBYSCORE` counts with the counting-client technique from this investigation. Measurable, safe (no Lua atomicity change).
  - FU-SVH-07c (Redis owner, deferred): bound whole-alias-set Lua (K=10k aliases) and 10k-population delete once FU-SVH-07b lands or a production lineage approaches that size; requires faster seeding (direct index-construction fixture, clearly labeled as structural, plus store-level spot checks) since public-API seeding costs ~67 ms/create.
- Commands/results:
  - Mongo fixture (from `packages/express-oidc-vault-mongodb-store`): `pnpm exec vitest run --config ../../vitest.config.ts test/svh07-tmp-bulk.test.ts --reporter=verbose`: 1 file, 5 passed (44 s; `[mongo]` lines above). Command-trace probe: `find,getMore,delete,delete,find`, deleted=200. Both temp files deleted afterwards.
  - Redis fixture (from `packages/express-oidc-vault-redis-store`): same command on `test/svh07-tmp-bulk.test.ts`: 1 file, 4 passed (includes live Docker `redis:7.2-alpine`). Temp file deleted afterwards.
  - `git status --short` confirms this task touched only this task file (remaining worktree modifications belong to SVH-01..06 agents; no `CHANGELOG.md`, no `dist/`).
- Residuals: intermediate fixture failures fixed honestly (wrong assumed key names `subj:`/`sess:`/`lsess:` vs actual `subject:`/`session:`/`logical-session:`; rotation `nextSession` inputs missing `createdAt`/`updatedAt` failing `validateSession` and being correctly treated as malformed on read). 10k-Redis, 10k-alias Lua, and 6.2-alpine runs deferred to FU-SVH-07c with rationale above.

### Task SVH-08: Verify MongoDB Rotation Against Source Changes

Status: completed

Kind: investigation

Priority: P1; an out-of-transaction source read may let stale session data replace a newer same-ID generation.

Suggested agent: MongoDB transaction-isolation reviewer

Dependencies: SVH-01

Primary ownership: MongoDB barrier/failure-injection tests around `src/store.ts:304-324,349-359`; decision evidence here. Coordinate any create-contract edits with SVH-06.

Finding and references: rotation reads/normalizes the source through `getSession` before `withTransaction`; inside the transaction it inserts the supplied successor and deletes the source using only `_id`. Same-ID upserts are currently supported. A replacement committed between the external read and transaction start therefore is not checked against the source snapshot used to prepare rotation. Logical expiry is also checked before the transaction, not in the delete predicate. Existing race coverage at `test/index.test.ts:538-569` rotates during deletion, not an upsert between normalization and transaction start. MongoDB transaction atomicity itself is not disputed; the remaining question is the permitted linearization/generation contract.

Requirements:

1. Barrier the source read and transaction start, then replace the source under the same ID with a different lineage/token/scope. Record exactly what commits and what can subsequently be revoked.
2. Advance the injected clock through expiry while TTL cleanup is delayed, and exercise transaction retry after a source change. Decide the intended point at which source liveness must hold.
3. Recommend an in-transaction read/conditional mutation or a documented concurrency precondition based on evidence. Preserve atomic insert/delete/alias commit and do not restore standalone fallback.

Acceptance criteria:

- Experiments establish whether a stale rotation consumes a newer source generation, including transaction retry behavior and the public-create contract.
- A concrete conclusion identifies allowed versus forbidden outcomes. Reproduced unacceptable outcomes get a scoped implementation follow-up with regression tests and shared-contract implications before this investigation closes.

Verification: real replica-set barriers/failure injection through V2 MongoDB; no mock-only proof of MongoDB snapshot semantics.

Completion evidence:

- Decision (in-transaction generation guard implemented; stale consumption is FORBIDDEN): the pre-fix barrier experiments reproduced two unacceptable outcomes on a real single-node replica set (`mongodb-memory-server`), so this investigation closed with an implementation fix, not a documentation-only precondition. Source liveness and generation identity must hold at commit time (inside `withTransaction`, re-evaluated on every driver retry), not merely at the pre-transaction `getSession` read. Concurrent same-ID `createSession` + `rotateSession` remains caller error per the SVH-06 portable subset (fresh IDs + handle `OidcVaultStoreConflictError`), but the violation is now fail-closed with `ConflictError` instead of silent lineage hijack — consistent with SVH-06, no contract contradiction.
- Pre-fix reproduced outcomes (temporary barrier fixtures, real replica set, deleted afterwards):
  - E1 (replace between `normalizeRotatedSession` and `withTransaction`, same ID, `lineage_NEW`/`user_B`/`refresh_B`/`scope openid email`): rotation committed successor `sess_2` with the STALE lineage `sess_1`/`user_A`, deleted the newer generation (`sess_1` raw doc null), wrote alias `sess_1 -> sess_1`; subsequent `deleteSession('sess_1')` revoked `sess_2` through the stale alias. FORBIDDEN (newer generation silently destroyed + revocation handle hijacked).
  - E2 (clock advanced 100 -> 250 past `expiresAt: 200` between read and txn start): rotation returned success but committed an immediately-expired successor (`getSession('sess_e2')` null) while deleting the source. FORBIDDEN (success reported for a rotation that yields nothing live; expiry must be enforced at commit).
  - E3b (`failCommand` `insert` errorCode 112 forces driver retry — callback invoked 2x pre-fix — with source replaced by `user_B`/`lineage_NEW` before the retry): retried attempt committed the stale rotation over the new generation (`sess_r` null, `sess_r2` with stale lineage). FORBIDDEN (retry reuses the stale snapshot).
- Changed files (no standalone fallback restored; atomic insert/delete/alias commit preserved; SVH-01 startSession-after-normalize ordering preserved):
  - `packages/express-oidc-vault-mongodb-store/src/store.ts`: `normalizeRotatedSession` now returns `{ previous, nextSession }`; `rotateSessionWithTransaction` re-reads the source inside `withTransaction` (`findOne({_id}, {session})`), throws `OidcVaultStoreConflictError` when missing/expired at commit time, and throws `OidcVaultStoreConflictError('... changed before rotation could commit.')` when the in-txn document differs from the pre-read generation via `isSameSessionDocumentGeneration` (`_id`, logical ID, subject, providerSessionId, provider/refresh/id/access tokens, scope, `expiresAt`, `createdAt`/`updatedAt`, `user`/`metadata` with `isDeepStrictEqual` for objects). The check runs on every driver retry, so E1/E2/E3 all abort.
  - `packages/express-oidc-vault-mongodb-store/test/index.test.ts`: `createDbWithStartSessionHook` barrier helper (patches `withTransaction` on the real `ClientSession`, no session proxying) plus 3 regression tests: source-replaced-between-read-and-txn aborts with `changed` (new generation intact with `user_B`/`lineage_NEW`, no successor, no alias, replacement deletable without side effects); source-expired-before-commit aborts with `no longer exists` (raw source doc untouched by the txn, no successor); retried rotation with source changed between attempts (insertOne-proxy replacement + `failCommand` retryable insert error) aborts with `changed` (new generation intact, no successor/alias).
  - `packages/express-oidc-vault-mongodb-store/README.md`: rotation bullet now documents the changed-source/expired-source conflicts and the in-txn generation check. No `types.ts`/conformance change (SVH-06 ownership respected; the fail-closed `ConflictError` matches its documented portable subset). No `CHANGELOG.md`, no `dist/`.
- Post-fix verification (real replica set via `mongodb-memory-server`, Node v26.7.0):
  - E1 re-run: `OidcVaultStoreConflictError: changed before rotation could commit`, new generation preserved. E2 re-run: `OidcVaultStoreConflictError: no longer exists`, raw source doc intact. E3b re-run: single txn attempt, `changed` conflict, `sess_r` = `user_B`/`lineage_NEW`, no successor.
  - `pnpm exec eslint src/store.ts test/index.test.ts` (from package dir): clean.
  - V2: `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test`: 3 files, 44 passed (41 pre-existing incl. SVH-01/SVH-06 cases + 3 new).
- Shared-contract implications: SVH-06 portable subset unchanged and now enforced fail-closed on MongoDB; memory/Redis rotation-vs-reuse races remain their owners' scope (SVH-06 audit noted the overlap; no cross-provider change made here).
- Residuals: no per-field version counter — any concurrent source mutation (even a benign `updatedAt` touch) aborts rotation with a retryable-by-caller conflict; callers doing read-modify-write on session documents concurrently with rotation must retry the rotation after re-reading. Bulk/alias costs untouched (SVH-07). Intermediate helper failure recorded honestly: proxying the `ClientSession` object broke driver internals (`timeoutMS` read); the helper patches `withTransaction` on the real session instead.

### Task SVH-99: Independently Verify Store Integration

Status: completed

Kind: improvement

Priority: P1; independent review is required before treating coordinated store changes as safe for authentication state.

Suggested agent: reviewer who did not implement the main fixes

Dependencies: SVH-01, SVH-02, SVH-03, SVH-04, SVH-05, SVH-06, SVH-07, SVH-08, plus any implementation follow-ups required by their accepted conclusions

Primary ownership: integration evidence in this file, focused missing cross-provider regression cases, and final public-documentation consistency review. Do not rewrite provider implementations as part of review.

Requirements:

1. Verify every task's acceptance evidence, including post-commit failures, stale repair, expiry boundaries, resource cleanup, namespace/scope isolation, and selected create/alias semantics.
2. Review source/types/README/website/release notes together. Inspect fresh root exports/declarations and packed consumers; do not infer broken MongoDB ESM types solely from its different exports map.
3. Confirm Redis scripts remain atomic where required, MongoDB stays transaction-only, memory remains process-local with owned copies, and no diagnostics expose bearer-equivalent data.
4. Execute V2/V3/V4 and applicable V5 serially. Report service skips, minimum-runtime gaps, or unrelated failures explicitly. Do not count prior task completion notes as fresh verification.

Acceptance criteria:

- Fixes have regression evidence and all required checks pass; blocked checks retain a named prerequisite and owner.
- Investigation conclusions are evidence-backed, consequential follow-ups are tracked, and deferred work names rationale/residual risk.
- Public contract and deployed behavior agree, with release/migration notes for intentional external changes.
- No unrelated worktree changes are reverted and no generated output is manually patched.

Verification: V2/V3/V4 and applicable V5; independent acceptance review recorded below each completed task.

Completion evidence:

- Changed files: `docs/tasks/20260908-130120-oidc-vault-stores-health-follow-up.md` (this section only). No provider runtime, README, types, conformance, `CHANGELOG.md`, or `dist/` changes. No new regression files added (see cross-provider gap decision below).
- Acceptance spot-checks (source read, not inferred from claims):
  - SVH-01: `packages/express-oidc-vault-mongodb-store/src/store.ts:321-353` — `normalizeRotatedSession` now runs before `startSession()`; missing/expired/read-failure paths allocate zero sessions; txn paths close via `try/finally { endSession() }`. Regression: `test/index.test.ts` `createDbWithSessionLifecycleSpy` + 2 tests (success/missing/expired/read-reject/txn-reject/repeated-failure no-commit).
  - SVH-02: `packages/express-oidc-vault-redis-store/src/index.ts:464-472` — post-commit maintenance via `runPostCommitIndexMaintenance` (sanitized warn, resolve-with-commit, no rotation retry). Regression: `test/index-maintenance-failure.test.ts` (10 fault-injection tests).
  - SVH-03: `src/scripts.ts:485-496` `COMPARE_AND_DELETE_SCRIPT` (server-side value-equality `GET`/`DEL`, missing keys never deleted) wired through `RedisScriptRunner` EVALSHA handshake; `src/index.ts` single-key + MGET + missing-branch repairs use it. Regression: `test/index-corruption-race.test.ts` (5 emulator + 3 real-Redis scenarios x2 images) incl. honest negative control (3 failed pre-fix).
  - SVH-04: `packages/express-oidc-vault-memory-store/src/index.ts` positional per-map sweep state (`{ keys, position }`, 64 slots/op, grow-triggered continuation) + separate `sweepWork` counters; nested lineage cleanup explicitly documented as lineage-proportional, not bounded. Regression: 6 work-count tests incl. two-size late-cursor bound (1024/5120 both visit 64 vs 1,064 baseline) + honest intermediate failure (70-entry reclamation fixed via continuation).
  - SVH-05: `packages/express-oidc-vault/src/types.ts:161-181` finite-bridge JSDoc (comment-only, no runtime change); matrix evidence 8/8 memory + Redis 7.2-alpine + Mongo replset recorded in-task; temp fixtures deleted. BOV coordination checked: BOV-01/02/03 `completed`, edit touches only `rotateSession` docs — no conflict.
  - SVH-06: `types.ts:139-158` provider-specific create JSDoc (memory/Mongo upsert, Redis create-only, portable fresh-ID subset); conformance requires `sessionCreateMode` + `reusedSessionIdClearsStaleAlias` (no silent default) with strengthened duplicate + new `create-reuse-alias-ownership` cases; declarations memory `upsert/clears:true`, Mongo `upsert/clears:false`, Redis `create-only/clears:true`. No runtime change (documented variation, no migration).
  - SVH-07: investigation only, no `src/` change (justified by measurements: Mongo 10k/202 ms, Redis 1k/2.8 s, whole-set Lua 8 ms at K=100, PING p99 2 ms). Completion/exact-count semantics + FU-SVH-07a/b/c with rationale recorded in-task; temp fixtures deleted.
  - SVH-08: `store.ts:54-68` `isSameSessionDocumentGeneration` + in-txn re-read/expiry/generation guard on every driver retry (E1/E2/E3b reproduced pre-fix on real replset, all abort post-fix). Regression: 3 barrier tests via `createDbWithStartSessionHook` (patches `withTransaction` on the real session; honest note on proxy-`ClientSession` `timeoutMS` failure). No standalone fallback restored; SVH-01 ordering preserved.
- Property confirmations: Redis mutations/rotations/deletes run single-Lua via `EVALSHA` (`scripts.ts` + `RedisScriptRunner.run`); MongoDB rotation exclusively in `withTransaction` with `assertTransactionSupport` at init (`store.ts:309,327`); memory is `structuredClone` owned copies (`src/index.ts:38`), no timers/workers (grep clean); only diagnostic is the sanitized Redis maintenance `console.warn` (`src/index.ts:114-126,468` — name + 200-char message only, no IDs/keys/tokens); memory/Mongo `src/` have zero `console.*`. Namespace/scope isolation: Redis `keyPrefix` namespacing (`keys.ts:3`), Mongo separate collections + scoped compound indexes, conformance asserts all three index scopes on duplicate-create branches.
- Cross-provider gap decision: no new regression files added. Shared conformance (SVH-06) already covers duplicate-create modes + reuse-after-rotation alias ownership on all three providers (each V2 suite +1 case vs baseline, all green below). Lifetime-boundary conformance remains owned by FU-SVH-05a and bulk-scale work by FU-SVH-07a/b/c — duplicating them here would fork ownership.
- Fresh serial verification (Node v26.7.0, Docker 29.7.2; never concurrent; prior task notes NOT counted):
  - V2 memory `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test`: 2 files, 37 passed (rebuilds transitive dist; incl. packed-consumer).
  - V2 Mongo `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test`: 3 files, 44 passed (real standalone + replica-set harnesses via `mongodb-memory-server`; no skips).
  - V2 Redis `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`: 8 files, 90 passed (live Docker Redis integration on both 6.2/7.2 images per race suite; no skips).
  - V3 core `pnpm --filter @web-ts-toolkit/express-oidc-vault test`: 19 files, 260 passed.
  - V4 `pnpm lint`: 0 errors, 3 warnings (all pre-existing unused `eslint-disable` in `packages/access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts:100-105`, unrelated to OIDC vault).
  - V4 `pnpm build`: pass (all workspaces incl. apps).
  - V4 `pnpm test` (serial per AGENTS.md): all packages pass, 0 failed files; OIDC-relevant lines: core 19/260, memory 2/37, mongo 3/44, redis 8/90. No unrelated failures.
  - V5 file-list `npm pack --dry-run --json` (per package dir): 6 files each (`README.md`, `dist/index.d.mts`, `dist/index.d.ts`, `dist/index.js`, `dist/index.mjs`, `package.json`) for core/memory/mongo/redis. Fresh `dist/index.d.ts` + `dist/index.d.mts` carry the new `Duplicate-ID behavior` JSDoc. MongoDB exports-map note: `"."` uses flat `"types": "./dist/index.d.ts"` (vs conditional types in the other three) — verified working, not broken: existing packed-consumer stages packed tarballs and runs ESM `.mjs` + CJS `.cjs` consumers plus strict NodeNext `.ts` typecheck (all green in V2), and this review additionally compiled+ran fresh ad-hoc `.mts`/`.cts` consumers against the real exports map (`tsc -p` NodeNext `skipLibCheck:false` + `node` both print ok; temp dir removed afterwards). Minimum-Node (Node 22 engine floor) and `build-artifact`/`verify-artifact` not run — no release assembly changed, so V5 release-artifact step is not applicable.
- Docs consistency: core `README.md` Store Provider Contract states the SVH-06 variation + portable subset (old blanket "deliberate upserts" removed); provider READMEs carry SVH-02 maintenance policy, SVH-03 compare-and-delete, SVH-04 honest sweep bounds, SVH-06 create semantics, SVH-08 in-txn guard. Website pages checked: no blanket upsert promise for Redis, memory page upsert claim correct, Mongo page documents finite alias retention + stale-ID bridge (SVH-05-consistent). FU-SVH-05a still owns applying the uniform alias-lifetime README wording.
- Release/migration notes (drafts only — `CHANGELOG.md` NOT updated per user instruction): SVH-06 draft recorded in SVH-06 evidence (documentation-only, no migration). SVH-01/02/03/04/08 are behavior-preserving bug fixes with no intentional external change; SVH-05/07 are investigations with no runtime change. No migration required by any SVH task.
- Integration verdict: all SVH-01..08 acceptance evidence verified against source + fresh green V2/V3/V4/applicable-V5; investigations evidence-backed with tracked follow-ups (FU-SVH-05a/05b, FU-SVH-07a/b/c); nothing blocked (no unresolved maintainer decision gates remaining work — FU items are deferred enhancements with named owner areas and rationale). No unrelated worktree changes reverted (other modified task files and access-router/json-router follow-ups left untouched); no `dist/` manually patched (all dist output from package builds; `git status` shows no tracked `dist/` modifications).
- Residuals/follow-ups carried forward (unchanged ownership): FU-SVH-05a (alias-lifetime README + conformance, suggest SVH-06 owner), FU-SVH-05b (non-expiring retention alignment + Mongo stale-alias-on-reuse, maintainer decision + migration notes if behavior changes), FU-SVH-07a (Mongo `$in` chunking, only near 100k IDs), FU-SVH-07b (Redis per-pass timestamp/RTT reduction), FU-SVH-07c (deferred 10k-alias/10k-population Redis bounds after 07b or production need). SVH-99 adds no new follow-ups.

Kind: improvement

Priority: P1; independent review is required before treating coordinated store changes as safe for authentication state.

Suggested agent: reviewer who did not implement the main fixes

Dependencies: SVH-01, SVH-02, SVH-03, SVH-04, SVH-05, SVH-06, SVH-07, SVH-08, plus any implementation follow-ups required by their accepted conclusions

Primary ownership: integration evidence in this file, focused missing cross-provider regression cases, and final public-documentation consistency review. Do not rewrite provider implementations as part of review.

Requirements:

1. Verify every task's acceptance evidence, including post-commit failures, stale repair, expiry boundaries, resource cleanup, namespace/scope isolation, and selected create/alias semantics.
2. Review source/types/README/website/release notes together. Inspect fresh root exports/declarations and packed consumers; do not infer broken MongoDB ESM types solely from its different exports map.
3. Confirm Redis scripts remain atomic where required, MongoDB stays transaction-only, memory remains process-local with owned copies, and no diagnostics expose bearer-equivalent data.
4. Execute V2/V3/V4 and applicable V5 serially. Report service skips, minimum-runtime gaps, or unrelated failures explicitly. Do not count prior task completion notes as fresh verification.

Acceptance criteria:

- Fixes have regression evidence and all required checks pass; blocked checks retain a named prerequisite and owner.
- Investigation conclusions are evidence-backed, consequential follow-ups are tracked, and deferred work names rationale/residual risk.
- Public contract and deployed behavior agree, with release/migration notes for intentional external changes.
- No unrelated worktree changes are reverted and no generated output is manually patched.

Verification: V2/V3/V4 and applicable V5; independent acceptance review recorded below each completed task.

## Deferred Decisions And Definition Of Done

Maintainer decisions are limited to the alias lifetime/resource policy (SVH-05), portable duplicate-create semantics (SVH-06), and any source-generation/concurrent-revocation guarantees established by SVH-07/08. They do not block the independent lifecycle, housekeeping, repair, or iterator fixes. No new encryption layer, arbitrary record cap, mandatory Redis readiness API, or broad helper extraction is proposed without a concrete requirement.

The review deliverable is complete when this document is saved and its references/dependencies are checked. The remediation is complete only when accepted implementation tasks and required follow-ups pass their verification, investigations have recorded conclusions, and SVH-99 has independently checked integration. Append changed files, actual commands/results, and residuals as completion evidence; preserve the historical findings above.
