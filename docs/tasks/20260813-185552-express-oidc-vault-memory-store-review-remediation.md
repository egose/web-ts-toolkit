# Express OIDC Vault Memory Store Review Remediation

Created: 2026-08-13 18:55:52 PDT

Package: `packages/express-oidc-vault-memory-store`

## Objective

Remediate confirmed session-rotation, replay-record, alias-lifecycle, expiry-cleanup, provider-contract, packaging, and installed-documentation gaps in `@web-ts-toolkit/express-oidc-vault-memory-store`. Preserve the small factory-based API and its explicit local-development/test positioning while making behavior safe, deterministic, portable across store providers where the core contract requires it, and independently verifiable by installed TypeScript consumers.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Treat session IDs, logical session IDs, authorization states, exchange codes, replay JTIs, timestamps, and record metadata as caller-controlled provider inputs even when the core middleware normally generates or validates them.
- A failed rotation must preserve the source session and every unrelated target session.
- Keep stored records encapsulated from caller mutation; do not weaken the current input/output cloning boundary merely to avoid clone failures.
- Prefer fixes in the smallest owning operation. Do not export the concrete store class or internal maps solely to make tests easier.
- Do not manually edit generated `dist/` files. Build from tracked TypeScript source.
- Update the core store contract, all provider tests, package README, website docs, and release notes together when cross-provider behavior changes.
- Preserve unrelated worktree changes and never revert another agent's work.
- Run package tests serially. Store test scripts rebuild the shared core `dist/`, so agents must not run memory, Redis, MongoDB, or core package tests concurrently.

## Non-Goals

- Do not make this provider durable, multi-process, or suitable for production.
- Do not replace `Map` with an external cache or database.
- Do not split the approximately 250-line implementation into multiple modules without a concrete ownership or testability benefit; the current private class and small pure helpers are readable.
- Do not add arbitrary capacity limits, cleanup timers, or public diagnostics without a documented lifecycle policy and evidence.
- Do not preserve unsafe rotation behavior through compatibility aliases.
- Do not add a default export, subpath exports, or `llms.txt`; correct package metadata, declarations, README, and consumer tests first.

## Review Baseline

Confirmed on 2026-08-13 before this task file was created:

- `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passed: one test file and six tests.
- `pnpm exec eslint "packages/express-oidc-vault-memory-store/**/*.{ts,js}"` passed with no findings.
- `git diff --check` passed.
- `npm pack --dry-run --json` passed and listed six intended files: `package.json`, `README.md`, and four `dist/index` runtime/declaration files.
- The worktree was clean according to `git status --short` at review start.
- `rotateSession` checks only source existence, deletes the source, then clones and unconditionally writes the target ID. A target collision overwrites another session; a `structuredClone` or injected-clock failure deletes the source without creating a target.
- A runtime reproduction rotated `source` onto an existing `target` and observed the target subject change to the source subject. A second reproduction used function-valued metadata, observed `DataCloneError`, and found the source session was `null` afterward.
- When `nextSession.logicalSessionId` is omitted, rotation falls back to `input.sessionId` rather than the source record's existing logical ID. A runtime reproduction created logical ID `logical`, rotated `s` to `n`, observed logical ID `s`, and found deletion by `logical` removed zero sessions.
- Rotated-session aliases contain no expiry, are excluded from pruning, and are not removed by logical-session, subject, or provider-session bulk deletion. Chained rotations therefore retain stale aliases indefinitely; a stale ID can later revoke a new session if its logical ID is reused.
- `consumeBackchannelLogoutTokenJti` accepts an input whose `expiresAt` equals the current time. A runtime reproduction at time `200` consumed `{ jti: 'j', expiresAt: 200 }` twice and received `true` twice.
- Nearly every method calls `pruneExpiredRecords`, which scans all authorization transactions, exchange codes, sessions, and replay JTIs. Thus an otherwise constant-time `getSession` is linear in all stored record counts. `deleteSession` does not prune anything.
- The three `create*` operations use overwrite/upsert semantics. Redis and MongoDB broadly do the same, but `OidcVaultStoreProvider` does not document duplicate-key, same-ID rotation, target-collision, timestamp, or serialization behavior.
- `metadata?: Record<string, unknown>` permits values that do not share a portable representation: functions fail memory-store `structuredClone`, cyclic values and `bigint` fail Redis JSON serialization, and BSON has different semantics again.
- Tests do not cover target collisions, same-ID rotation, explicit logical lineage, pre-commit clone/clock failures, chained alias cleanup, exact expiry boundaries, expired JTI input, clone ownership, positive provider scoping, duplicate creates, or an installed package consumer.
- Tsup emits `dist/index.d.mts` and `dist/index.d.ts`, but the export map sends both module systems to `dist/index.d.ts`. The core OIDC package already uses conditional `types.import` and `types.require`; no memory-store consumer test verifies NodeNext ESM/CJS or Bundler selection.
- The shipped package README is much thinner than the website page. Its quick start omits provider configuration, it does not explain opportunistic cleanup or custom-clock constraints, and the exported option and factory have only minimal declaration JSDoc.

## Priorities

- P0: a store operation can overwrite an unrelated session or destroy the active source while reporting failure.
- P1: session lineage/revocation or one-time replay behavior is incorrect, or store providers disagree at an authentication-state boundary.
- P2: resource usage, packaging, documentation, testability, or maintainability gaps with contained immediate risk.
- P3: optional optimization or API expansion requiring benchmark evidence or maintainer policy.

## Wave 1: Rotation And Revocation Safety

### Task MEM-01: Make Memory Rotation Non-Destructive And Collision-Safe

Status: completed

Priority: P0

Suggested agent: in-memory transactional-state specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault-memory-store/src/index.ts`
- focused rotation tests in `packages/express-oidc-vault-memory-store/test/index.test.ts`

Finding:

`rotateSession` deletes the source before cloning `nextSession` and calling `now()`, then writes the target with `Map.set` without checking whether that ID belongs to another session. It also defaults an omitted logical ID to the source public ID instead of the source record's stable logical ID. The operation can therefore overwrite unrelated credentials, lose the source on local failure, or detach a rotated session from logical revocation.

References:

- `packages/express-oidc-vault-memory-store/src/index.ts:130-150`
- `packages/express-oidc-vault/src/types.ts:22-29`
- `packages/express-oidc-vault/src/types.ts:80-83`
- `packages/express-oidc-vault-memory-store/test/index.test.ts:85-163`

Implementation requirements:

1. Read and retain the source record, normalize and clone the complete target, and obtain required timestamps before mutating any map.
2. Preserve `source.logicalSessionId ?? source.sessionId` when `nextSession.logicalSessionId` is omitted.
3. Reject an existing different target ID with `OidcVaultStoreConflictError`; preserve both source and target records unchanged.
4. Reject same-ID rotation explicitly rather than relying on `Map` mutation order. MEM-04 will align this contract across providers.
5. Commit source deletion, target insertion, and alias creation as one synchronous mutation block after all fallible local work succeeds.
6. Preserve current successful rotation timestamps and clone encapsulation.

Acceptance criteria:

- Rotating onto an existing target throws `OidcVaultStoreConflictError`, leaves both records byte-for-byte equivalent to their pre-call snapshots, and creates no alias side effect.
- A clone failure and an injected `now()` failure leave the source readable and the target absent.
- Same-ID rotation returns the selected conflict behavior without deleting the source.
- An explicit logical ID different from the source public ID survives rotation when omitted from `nextSession`; deletion by that logical ID removes the rotated session.
- Existing one-winner concurrent rotation behavior remains intact.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passes.

Completion evidence:

- Changed: `packages/express-oidc-vault-memory-store/src/index.ts`, `packages/express-oidc-vault-memory-store/test/index.test.ts`.
- Behavior: `rotateSession` now rejects same-ID and existing-target rotations with `OidcVaultStoreConflictError`, preserves source/target state on conflicts and local clone/clock failures, carries forward the source logical session ID when omitted, and commits delete/insert/alias mutations only after fallible preparation succeeds.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passed on 2026-08-13 with 1 test file and 11 tests.

### Task MEM-02: Bound Rotated Alias Lifetime And Remove Stale Revocation Handles

Status: completed

Priority: P1

Suggested agent: session lifecycle and revocation specialist

Dependencies: MEM-01

Primary ownership:

- `packages/express-oidc-vault-memory-store/src/index.ts`
- alias and bulk-deletion tests
- behavior documentation

Finding:

Aliases are stored as permanent `Map<string, string>` entries, omitted from expiry pruning, and usually survive deletion of the logical session they reference. After `A -> B -> C`, deleting logical session `L` removes `C` but leaves `A -> L` and `B -> L`. Reusing `L` later lets `deleteSession('A')` revoke the new session, and repeated rotations grow the map without a bound.

References:

- `packages/express-oidc-vault-memory-store/src/index.ts:62-64`
- `packages/express-oidc-vault-memory-store/src/index.ts:148-167`
- `packages/express-oidc-vault-memory-store/src/index.ts:170-225`
- `packages/express-oidc-vault-memory-store/src/index.ts:227-234`
- `packages/express-oidc-vault-redis-store/src/index.ts:116-120`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:375-389`

Implementation requirements:

1. Store alias records with the logical ID and the rotated target's optional `expiresAt`; include them in expiry cleanup.
2. When deleting by logical session ID, remove every alias whose value references that logical session, not only an alias keyed by an active session ID.
3. Apply equivalent alias cleanup after subject and provider-session deletion for every logical session actually removed.
4. Define whether direct deletion of the active session removes all aliases for its logical lineage. Prefer complete cleanup once no session in that lineage remains.
5. Preserve the logout-race behavior where an old public session ID can revoke the current rotated session while the lineage is still active.
6. Coordinate MEM-04 for the same lifecycle contract in Redis and MongoDB; do not claim memory-only behavior is provider-portable until then.

Acceptance criteria:

- Chained aliases revoke the current live lineage while it exists.
- Logical, subject, provider-session, direct, and expiry deletion leave no stale aliases for a lineage with no live sessions.
- An alias for an explicitly expiring target is unusable at `expiresAt <= now`.
- Reusing a previously deleted logical ID cannot be revoked through an alias from the old lineage.
- Repeated rotate/delete cycles do not produce monotonic retained alias growth; verify through behavior or package-private test instrumentation rather than a new public map API.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passes.

Completion evidence:

- Changed: `packages/express-oidc-vault-memory-store/src/index.ts`, `packages/express-oidc-vault-memory-store/test/index.test.ts`, `packages/express-oidc-vault-memory-store/README.md`.
- Behavior: rotated aliases now store `{ logicalSessionId, expiresAt }`, are pruned at their target session expiry, and are removed when logical, subject, provider-session, direct, or expiry deletion leaves no live session in that logical lineage. Old public session IDs still revoke chained live rotations, but aliases from deleted or expired lineages cannot revoke a reused logical ID.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passed on 2026-08-13 with 1 test file and 15 tests.

### Task MEM-03: Enforce Replay JTI Expiry Preconditions

Status: completed

Priority: P1

Suggested agent: replay-protection boundary specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault-memory-store/src/index.ts`
- replay and expiry-boundary tests
- core contract documentation if semantics are shared

Finding:

The JTI consume operation prunes before insertion but accepts an already expired record. At `expiresAt <= now`, every call can delete the previous entry, insert another already-expired entry, and return `true`, contradicting one-time consumption at the provider boundary. Core token validation normally rejects expired logout tokens, but the public store operation remains internally inconsistent and other providers differ.

References:

- `packages/express-oidc-vault-memory-store/src/index.ts:29-30`
- `packages/express-oidc-vault-memory-store/src/index.ts:186-195`
- `packages/express-oidc-vault/src/types.ts:101-104`
- `packages/express-oidc-vault-memory-store/test/index.test.ts:215-225`

Implementation requirements:

1. Define the provider contract for `expiresAt <= now`, non-finite values, and exact equality before storing a replay record.
2. Prefer fail-closed behavior that does not report a new successful consume for an already-invalid lifetime; use a stable return or validation-error contract across all stores through MEM-04.
3. Read the clock once for the operation so pruning and boundary validation use the same instant.
4. Preserve atomic one-winner behavior for two valid same-JTI calls in one process.

Acceptance criteria:

- Calls at `expiresAt === now` and `expiresAt < now` follow one documented deterministic contract and cannot repeatedly return successful first-consume results.
- `NaN`, infinities, and invalid expiry inputs follow the selected cross-provider validation contract.
- Two concurrent valid calls for one JTI produce exactly one `true` result.
- The JTI becomes consumable again only after a previously valid replay record actually expires.
- Affected store tests pass serially.

Completion evidence:

- Changed: `packages/express-oidc-vault-memory-store/src/index.ts`, `packages/express-oidc-vault-memory-store/test/index.test.ts`, `packages/express-oidc-vault-memory-store/README.md`.
- Behavior: `consumeBackchannelLogoutTokenJti` now reads the clock once, prunes with that instant, and returns `false` without storing when `expiresAt` is non-finite or `<= now`; finite future JTI values remain one-time until their stored record expires.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passed on 2026-08-13 with 1 test file and 17 tests.
- Verified: `pnpm exec eslint "packages/express-oidc-vault-memory-store/**/*.{ts,js}"` passed on 2026-08-13.

## Wave 2: Shared Contract, Testability, And Resource Use

### Task MEM-04: Establish A Reusable Store Provider Conformance Suite

Status: completed

Priority: P1

Suggested agent: authentication store contract and test-architecture specialist

Dependencies: MEM-01, MEM-02, MEM-03

Primary ownership:

- `packages/express-oidc-vault/src/types.ts`
- a reusable store-provider contract test harness in an appropriate test-support location
- memory, Redis, and MongoDB store tests
- provider READMEs and release notes for contract changes

Finding:

The interface lists methods but leaves duplicate creates, target collisions, same-ID rotation, source preservation, logical lineage, invalid expiries, timestamp defaults, serialization domain, and returned-value ownership unspecified. Current providers differ: memory and Redis can overwrite a rotation target, Redis can delete a same-ID rotation target, MongoDB rejects collisions through raw duplicate-key behavior, and metadata representations are not portable.

References:

- `packages/express-oidc-vault/src/types.ts:22-83`
- `packages/express-oidc-vault/src/types.ts:101-126`
- `packages/express-oidc-vault-memory-store/src/index.ts:27-31`
- `packages/express-oidc-vault-memory-store/src/index.ts:70-150`
- `packages/express-oidc-vault-redis-store/src/index.ts:73-123`
- `packages/express-oidc-vault-redis-store/src/index.ts:207-225`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:228-275`

Implementation requirements:

1. Create one reusable behavioral suite that each provider can run through a small setup/teardown adapter; keep provider-specific persistence tests separate.
2. Require conflict-safe rotation: source existence, distinct unused target ID, stable logical lineage, no unrelated overwrite, and source preservation on pre-commit failure.
3. Normalize rotation collisions to `OidcVaultStoreConflictError` across providers.
4. Decide and document whether `createAuthorizationTransaction`, `createExchangeCode`, and `createSession` are upserts, idempotent creates, or conflict-on-existing. Preserve current upsert behavior only if deliberate and security-reviewed.
5. Define the portable metadata/value domain shared by structured clone, JSON, and BSON. Prefer an explicit JSON-compatible contract if no richer common domain is required.
6. Define timestamp and expiry invariants, including finite epoch milliseconds and exact-boundary behavior.
7. Test input/output ownership without requiring every backend to preserve unsupported runtime prototypes.
8. Update core JSDoc and all provider docs when decisions alter externally observable behavior.

Acceptance criteria:

- The same suite proves create/consume, clone or serialization ownership, expiry, rotation, logical deletion, scoped deletion, replay, and concurrency semantics for memory, Redis, and MongoDB.
- Existing-target and same-ID rotations cannot delete or overwrite unrelated/source data in any provider.
- All providers throw the same public conflict type for equivalent rotation conflicts.
- Duplicate-create and metadata portability behavior is explicit rather than inferred from backend primitives.
- Provider-specific tests remain focused on indexes, TTL mechanisms, transactions, and client integration instead of duplicating the whole contract.
- Core and all store package tests pass serially.

Completion evidence:

- Changed: `packages/express-oidc-vault/test/store-provider-conformance.ts`, `packages/express-oidc-vault/src/types.ts`, `packages/express-oidc-vault/README.md`, provider test files and READMEs for memory, Redis, and MongoDB, plus Redis/MongoDB provider implementations.
- Behavior: Added a reusable conformance suite covering upserted one-time records, JSON-compatible metadata ownership, exact-boundary expiry, conflict-safe rotation, logical/scoped deletion, rotated alias revocation, and backchannel JTI replay/concurrency semantics across all three providers.
- Behavior: Redis rotation now rejects same-ID and existing-target rotations through `OidcVaultStoreConflictError` before mutating state, and Redis backchannel JTI consume rejects non-finite or expired/equal expiries without storing.
- Behavior: MongoDB rotation now normalizes same-ID and duplicate-target conflicts to `OidcVaultStoreConflictError`, and MongoDB backchannel JTI consume rejects invalid/expired expiries and explicitly prunes an expired JTI record before allowing reuse.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passed on 2026-08-13 with 1 test file and 23 tests.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` passed on 2026-08-13 with 1 test file and 12 tests.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passed on 2026-08-13 with 1 test file and 12 tests.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passed on 2026-08-13 with 4 test files and 70 tests.
- Verified: `pnpm exec eslint "packages/express-oidc-vault/**/*.{ts,js}" "packages/express-oidc-vault-memory-store/**/*.{ts,js}" "packages/express-oidc-vault-redis-store/**/*.{ts,js}" "packages/express-oidc-vault-mongodb-store/**/*.{ts,js}"` passed on 2026-08-13.

### Task MEM-05: Remove Whole-Store Scans From Unrelated Hot Paths

Status: completed

Priority: P2

Suggested agent: Node.js data-structure and performance specialist

Dependencies: MEM-02

Primary ownership:

- `packages/express-oidc-vault-memory-store/src/index.ts`
- focused expiry tests
- reproducible benchmark notes in this task document

Finding:

`pruneExpiredRecords` scans four maps before nearly every operation, so `getSession` and one-time record operations are linear in all unrelated stored data. `deleteSession` performs no cleanup, producing inconsistent reclamation. No production-scale use is intended, but unnecessary global scans can still stall tests or development processes with large fixtures.

References:

- `packages/express-oidc-vault-memory-store/src/index.ts:70-71`
- `packages/express-oidc-vault-memory-store/src/index.ts:88-89`
- `packages/express-oidc-vault-memory-store/src/index.ts:106-107`
- `packages/express-oidc-vault-memory-store/src/index.ts:122-131`
- `packages/express-oidc-vault-memory-store/src/index.ts:153-168`
- `packages/express-oidc-vault-memory-store/src/index.ts:227-242`

Implementation requirements:

1. Benchmark representative direct lookup/consume and bulk-delete workloads with small and large unrelated maps; record Node version, dataset, commands, and results.
2. Make targeted reads and consumes check the addressed record's expiry without scanning unrelated record kinds.
3. Select a bounded cleanup strategy for unreachable expired records: amortized sweeps, expiry ordering, or an explicitly documented manual/lifecycle operation. Avoid a background timer that keeps Node processes alive.
4. Keep expiry semantics deterministic under the injected clock and avoid reading a stateful clock multiple times in one operation.
5. Do not add arbitrary entry caps or public metrics without maintainer policy.
6. Preserve straightforward code; reject a complex heap implementation if measured package workloads do not justify it.

Acceptance criteria:

- Looking up one session no longer iterates authorization, exchange-code, or replay maps.
- Consuming one transaction/code/JTI does not scan unrelated record kinds.
- Expired records and aliases are eventually reclaimed under the documented operation/lifecycle policy, including delete-heavy workloads.
- A reproducible benchmark demonstrates the chosen change or records a justified partial deferral without speculative production code.
- All expiry and store tests pass.

Completion evidence:

- Changed: `packages/express-oidc-vault-memory-store/src/index.ts` and `packages/express-oidc-vault-memory-store/test/index.test.ts`.
- Behavior: Replaced whole-store pre-operation pruning with addressed-record expiry checks for `getSession`, one-time consumes, rotation, and JTI replay checks. Each operation reads the injected clock once and does not prune unrelated record kinds.
- Behavior: Added bounded per-map expiry sweeps with a 64-entry cursor batch on relevant lifecycle operations, avoiding background timers while eventually reclaiming expired sessions, aliases, one-time records, and JTI entries during subsequent same-kind/session lifecycle activity.
- Tests: Added focused memory-store tests proving session lookup and one-time consume paths leave unrelated expired maps untouched, and that expired records are reclaimed by bounded sweeps during later lifecycle/delete-heavy operations.
- Benchmark environment: Node `v26.5.0` on 2026-08-13, commands run from repo root against the built `packages/express-oidc-vault-memory-store/dist/index.mjs` after `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` built the package.
- Benchmark dataset: direct lookup/consume used 20,000 measured iterations. Large unrelated setup used 50,000 entries in each unrelated authorization, exchange-code, JTI, or session map as applicable. Bulk-delete used 50,000 sessions and compared 0 vs 50,000 entries in each unrelated authorization, exchange-code, and JTI map.
- Benchmark results: `getSession unrelated=0` 29.23 ms total / 1.461 us/op; `getSession unrelated=50000` 30.53 ms total / 1.527 us/op. `consumeExchangeCode` with large unrelated non-exchange maps: unrelated=0 30.00 ms total / 1.500 us/op; unrelated=50000 36.24 ms total / 1.812 us/op. `deleteSessionsBySubject` over 50,000 sessions: unrelated=0 5.09 ms; unrelated=50000 2.01 ms.
- Benchmark note: A separate `consumeExchangeCode` run with 50,000 unrelated entries in the same exchange-code map measured 314.585 us/op because it includes the deliberate bounded same-map expiry sweep; this is not a whole-store scan and remains capped by the 64-entry batch.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passed on 2026-08-13 with 1 test file and 26 tests.
- Verified: `pnpm exec eslint "packages/express-oidc-vault-memory-store/**/*.{ts,js}"` passed on 2026-08-13.

## Wave 3: Installed Package And Documentation Health

### Task MEM-06: Verify Conditional Declarations And Packed Consumers

Status: completed

Priority: P2

Suggested agent: Node package-resolution and TypeScript consumer specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault-memory-store/package.json`
- package-local packed-consumer tests and fixtures
- package test script only as needed

Finding:

The build emits both `.d.mts` and `.d.ts`, but `exports.types` always selects `.d.ts`. Tests import source directly and do not verify package-name ESM/CJS loading, NodeNext/Bundler declaration resolution, production `workspace:*` rewriting, or README compilation in a fresh installed consumer.

References:

- `packages/express-oidc-vault-memory-store/package.json:15-39`
- `packages/express-oidc-vault-memory-store/tsup.config.ts:3-9`
- `packages/express-oidc-vault-memory-store/test/index.test.ts:1-3`
- `packages/express-oidc-vault/package.json:19-29`
- `packages/express-oidc-vault/test/packed-consumer.test.ts`

Implementation requirements:

1. Add conditional `types.import`, `types.require`, and `types.default` entries matching the core package's verified pattern.
2. Production-transform and pack this package plus its core dependency; do not test a raw `workspace:*` manifest as if it were publishable.
3. Install tarballs into a fresh consumer and run ESM and CJS package-name runtime smoke checks.
4. Compile strict NodeNext ESM/CJS and Bundler consumers with `skipLibCheck: false`.
5. Compile the README quick start after MEM-07 updates it.
6. Assert transformed manifests contain no `PLACEHOLDER` or `workspace:` values and the six-file package allowlist remains intentional.

Acceptance criteria:

- ESM and CJS consumers load `createMemoryOidcVaultStore` by package name.
- NodeNext and Bundler consumers select compatible declarations and can assign the factory result to `OidcVaultStoreProvider`.
- Release-like package manifests contain resolvable versions and no workspace protocol.
- The installed README example compiles without repository aliases or source imports.
- A metadata, declaration, dependency-rewrite, or packed-file regression fails package tests.

Completion evidence:

- Changed: `packages/express-oidc-vault-memory-store/package.json` now uses conditional `types.import`, `types.require`, and `types.default` declarations matching the core package pattern.
- Added: `packages/express-oidc-vault-memory-store/test/packed-consumer.test.ts` stages release-transformed memory-store and core package manifests, packs tarballs, asserts no `PLACEHOLDER` or `workspace:` values, verifies the seven-file packed allowlist, and installs the tarballs into a fresh consumer.
- Added: `packages/express-oidc-vault-memory-store/test-packed-consumer/consumer/*` fixtures for CJS, ESM, strict NodeNext, strict Bundler, and README quick-start compilation using package-name imports only.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passed on 2026-08-13 with 2 test files and 29 tests.
- Verified: `pnpm exec eslint "packages/express-oidc-vault-memory-store/**/*.{ts,js}"` passed on 2026-08-13.

### Task MEM-07: Make Store Behavior Discoverable From README And Declarations

Status: completed

Priority: P2

Suggested agent: installed TypeScript API documentation specialist

Dependencies: MEM-01, MEM-02, MEM-03, MEM-04, MEM-05

Primary ownership:

- `packages/express-oidc-vault-memory-store/README.md`
- `website/docs/packages/express-oidc-vault-memory-store.md`
- high-value JSDoc in `packages/express-oidc-vault-memory-store/src/index.ts`
- release notes for behavior changes

Finding:

The shipped README does not provide the website page's complete provider configuration, clock example, or behavior notes. It also does not explain process-local loss, clone/serialization constraints, duplicate-create policy, opportunistic expiry/alias cleanup, rotation conflicts, or that a custom clock is a test seam requiring epoch-millisecond semantics. Installed declarations expose only `now?: () => number` and a one-line factory description.

References:

- `packages/express-oidc-vault-memory-store/README.md:11-45`
- `website/docs/packages/express-oidc-vault-memory-store.md:28-92`
- `packages/express-oidc-vault-memory-store/src/index.ts:19-21`
- `packages/express-oidc-vault-memory-store/src/index.ts:245-249`
- `packages/express-oidc-vault-memory-store/dist/index.d.ts:3-9`

Implementation requirements:

1. Make the shipped README self-sufficient with a complete, compiling local-development example using the current core middleware options.
2. Document all in-memory record kinds, restart/multi-instance limitations, one-time consumption, expiry boundary and cleanup strategy, rotation conflict behavior, logical revocation, and selected duplicate-create policy.
3. Document the supported metadata/value domain and clone ownership semantics after MEM-04.
4. Explain that `now()` returns epoch milliseconds, is intended for deterministic tests, and must be monotonic enough for the caller's expiry scenarios.
5. Add concise JSDoc to `MemoryOidcVaultStoreOptions.now` and the factory so the generated `.d.ts` and `.d.mts` provide useful editor hover text.
6. Keep website docs consistent but treat the shipped README and declarations as the installed-consumer source of truth.

Acceptance criteria:

- An installed consumer can determine intended deployment scope, import form, required core configuration, expiry/rotation behavior, and custom-clock contract from the README and editor hovers.
- README examples compile in MEM-06's fresh consumer.
- Generated `.d.ts` and `.d.mts` retain useful option and factory JSDoc.
- README, website docs, core contract, and runtime behavior make equivalent claims.
- Package tests pass.

Completion evidence:

- Changed: `packages/express-oidc-vault-memory-store/README.md` now includes a complete core middleware quick start, deployment-scope warning, clock contract, record kinds, one-time consumption, duplicate-create policy, clone/value-domain guidance, expiry cleanup behavior, rotation conflict behavior, logical revocation, and replay-JTI expiry behavior.
- Changed: `website/docs/packages/express-oidc-vault-memory-store.md` now mirrors the installed README's behavior claims and quick-start shape.
- Changed: `packages/express-oidc-vault-memory-store/src/index.ts` now documents `MemoryOidcVaultStoreOptions.now` and `createMemoryOidcVaultStore(...)`; regenerated declarations retain that JSDoc in `dist/index.d.ts` and `dist/index.d.mts`.
- Changed: `packages/express-oidc-vault-memory-store/test-packed-consumer/consumer/readme-quick-start.ts` now compiles the README quick-start shape with required core middleware options.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passed on 2026-08-13 with 2 test files and 29 tests.

## Wave 4: Independent Integration Review

### Task MEM-99: Perform Independent Final Store Review

Status: completed

Priority: P1

Suggested agent: independent authentication-state and package-contract reviewer

Dependencies: MEM-01 through MEM-07, except an explicitly deferred portion of MEM-05

Primary ownership:

- review and verification only across changed package/core/provider files
- completion evidence and deferred decisions in this task document

Finding:

The memory store is heavily used by core middleware tests, so a green six-test local suite does not prove revocation-race behavior, provider parity, installed declarations, or release-like package loading. Final review must be performed by an agent who was not the main implementer.

References:

- `packages/express-oidc-vault/test/index.test.ts:8`
- `packages/express-oidc-vault-memory-store/test/index.test.ts:1-226`
- `packages/express-oidc-vault-memory-store/package.json:15-39`

Implementation requirements:

1. Re-read every finding and verify each acceptance criterion against runtime behavior, types, docs, and packed output.
2. Re-run collision, clone/clock failure, explicit logical lineage, stale alias reuse, exact-expiry JTI, and concurrent consume/rotation negative cases.
3. Verify no internal map or mutable stored record becomes externally reachable.
4. Confirm the shared conformance suite covers alternate providers without hiding provider-specific transactional or TTL risks.
5. Review request-controlled collections and metadata for unbounded recursion, unsupported values, and accidental token disclosure in diagnostics.
6. Run targeted tests serially, then root lint/build/test if the worktree permits. Record exact unrelated blockers without reverting concurrent changes.
7. Run release-like packed ESM/CJS and strict TypeScript consumer checks.

Acceptance criteria:

- Every non-deferred task has completion evidence tied to observable behavior.
- Rotation cannot overwrite an existing target or lose the source on any tested pre-commit failure.
- Deleted/expired logical lineages leave no stale alias capable of revoking reused state.
- Memory, Redis, and MongoDB satisfy the selected shared provider contract.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passes.
- Core, Redis, and MongoDB tests pass serially when their contracts changed.
- `pnpm lint`, `pnpm build`, and `pnpm test` pass, or exact unrelated/pre-existing blockers are recorded.
- `git diff --check` passes and generated files were not manually edited.

Completion evidence:

- Independent review found provider-parity gaps: Redis and MongoDB did not remove rotated aliases for deleted logical lineages, and the shared conformance suite did not cover stale alias reuse after direct, logical, subject, provider-session, or expiry deletion.
- Changed: `packages/express-oidc-vault/test/store-provider-conformance.ts` now asserts that stale rotated public IDs cannot revoke newly reused logical sessions after direct, logical, subject, provider-session, or expiry cleanup.
- Changed: `packages/express-oidc-vault-redis-store/src/index.ts` now indexes rotated aliases by logical session ID and removes all aliases for a logical lineage when the current session or scoped lineage is deleted.
- Changed: `packages/express-oidc-vault-redis-store/test/index.test.ts` now runs the shared provider conformance suite and its fake Redis client simulates alias indexes and `DEL` of sorted indexes.
- Changed: `packages/express-oidc-vault-mongodb-store/src/index.ts` now deletes rotated aliases alongside direct, logical, subject, and provider-session deletions; rotation now rejects expired/missing sources through `getSession`, maps duplicate targets to `OidcVaultStoreConflictError`, and avoids deleting a pre-existing target during standalone cleanup.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passed on 2026-08-13 with 2 test files and 30 tests.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` passed on 2026-08-13 with 1 test file and 13 tests after the new stale-alias conformance test first reproduced the Redis gap.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passed on 2026-08-13 with 1 test file and 13 tests after the MongoDB standalone collision-cleanup regression was corrected.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passed on 2026-08-13 with 4 test files and 70 tests.
- Verified: `pnpm exec eslint "packages/express-oidc-vault/**/*.{ts,js}" "packages/express-oidc-vault-memory-store/**/*.{ts,js}" "packages/express-oidc-vault-redis-store/**/*.{ts,js}" "packages/express-oidc-vault-mongodb-store/**/*.{ts,js}"` passed on 2026-08-13.
- Verified: `git diff --check`, `pnpm lint`, `pnpm build`, and serialized `pnpm test` passed on 2026-08-13.
- Residual risk: MongoDB standalone rotation remains best-effort without multi-document transaction support if cleanup operations themselves fail after a partial write; transaction-capable deployments keep atomic rotation through `withTransaction`.

## Dependency And Parallelization Guidance

| Task   | Suggested owner            | Can start                   | Shared hotspots                                    |
| ------ | -------------------------- | --------------------------- | -------------------------------------------------- |
| MEM-01 | Rotation safety agent      | Immediately                 | memory source and main test file                   |
| MEM-02 | Alias lifecycle agent      | After MEM-01                | memory source, deletion/expiry tests               |
| MEM-03 | Replay boundary agent      | Immediately                 | JTI method and expiry tests                        |
| MEM-04 | Contract/conformance agent | After MEM-01 through MEM-03 | core types, all provider tests and implementations |
| MEM-05 | Performance agent          | After MEM-02                | memory expiry internals and benchmark evidence     |
| MEM-06 | Packaging agent            | Immediately                 | package metadata and consumer fixtures             |
| MEM-07 | Documentation agent        | After behavioral decisions  | README, website docs, public JSDoc                 |
| MEM-99 | Independent reviewer       | Last                        | review-only except task evidence                   |

- MEM-01 and MEM-03 can run in parallel only if they use separate focused test files or coordinate edits to `test/index.test.ts`.
- MEM-06 can run in parallel with Wave 1 because it should not change store behavior.
- MEM-04 owns cross-provider contract changes. MEM-01 through MEM-03 should not independently rewrite Redis or MongoDB implementations beyond a failing compatibility test needed to document the gap.
- MEM-05 starts after alias representation is final to avoid optimizing an obsolete data model.
- MEM-07 starts after contract and cleanup decisions so documentation is not rewritten repeatedly.
- Never run package test scripts concurrently when their dependency closures rebuild shared `dist/` outputs.

## Deferred Maintainer Decisions

No decision blocks MEM-01's safe memory-store implementation or MEM-06's consumer verification.

1. MEM-04: decide whether duplicate `create*` calls are intentional upserts, idempotent same-value creates, or conflicts. Current providers mostly overwrite, but the security-sensitive semantics are undocumented.
2. MEM-04: confirm the portable metadata domain. Recommended default is JSON-compatible values because all production providers can represent them predictably; document any deliberate richer memory-only behavior.
3. MEM-02/MEM-04: confirm how long old public session IDs must remain revocation-capable after rotation. Recommended behavior retains aliases only while a live session in that logical lineage exists and never beyond explicit session expiry.
4. MEM-03: choose return-versus-throw behavior for already-expired or invalid replay JTI input. The result must be fail-closed and consistent across providers.
5. MEM-05: choose an expiry-reclamation strategy only after benchmark evidence. Do not add a background timer that keeps test processes alive by default.

## Definition Of Done

- Every task is `completed`, `deferred` with rationale and residual risk, or `cancelled` with explanation.
- Rotation collisions and local pre-commit failures have failing-before/passing-after regressions and preserve all pre-existing sessions.
- Stable logical IDs survive rotation, and every deletion/expiry path cleans aliases according to the documented lifecycle.
- Replay JTI exact-boundary and invalid-lifetime behavior is deterministic and provider-consistent.
- The shared provider contract documents duplicate creation, collision, expiry, timestamp, serialization, and ownership behavior.
- Ordinary keyed operations do not scan unrelated record maps; any deferred cleanup cost is measured and explicit.
- Installed ESM/CJS runtime and strict NodeNext/Bundler consumers pass against release-like tarballs.
- README, website docs, emitted declarations, and runtime behavior agree.
- Targeted provider checks and full repository verification pass or exact unrelated blockers are recorded.
- An independent reviewer completes MEM-99 and records final evidence here.
