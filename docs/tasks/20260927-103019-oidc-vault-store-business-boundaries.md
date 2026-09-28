# OIDC vault store business-boundary remediation

Created: 2026-09-27 10:30:19 local (generated with `date +%Y%m%d-%H%M%S`).

## Objective and product requirements

Review and implement residual improvements in `packages/express-oidc-vault-memory-store`, `packages/express-oidc-vault-mongodb-store`, and `packages/express-oidc-vault-redis-store`. These interchangeable adapters persist browser-login transactions, single-use exchanges, rotating server-side credentials, and logout replay reservations. Business-critical outcomes are single-use consumption, tenant/provider-scoped logout, revocation through unexpired rotation aliases, stable caller data ownership, and predictable deployment/operational behavior. Memory serves local development/tests; MongoDB and Redis support shared application instances.

Scope includes shared store conformance and narrowly necessary contract documentation in the core package. Preserve existing create/upsert variation, finite alias windows, transaction requirements, and caller-owned backend clients. Do not edit `CHANGELOG.md`, manually edit generated outputs, commit, or revert pre-existing changes. Release/compatibility notes belong here and in shipped READMEs. No new authentication endpoints, session-management UI, arbitrary retention policy, Redis Cluster support, or new general storage abstraction.

## Analysis, prior work, and limitations

- Read all three entrypoints, memory implementation, MongoDB store/mappers, Redis orchestration/keys/validators, shared provider contract, manifests, relevant tests and prior remediation. Two read-only analysis sessions ran sequentially: memory `ses_f1c194b4effeilCUnVGOiE2yTV`; persistent stores `ses_f1c181216ffe2aD38Y45laJn3g`.
- Worktree already contains extensive unrelated changes, including core OIDC source/README and MongoDB/Redis tests. Preserve these; inspect diffs before edits. The three adapter runtime implementations were unmodified at review start.
- Source-import experiments confirmed memory alias resurrection, MongoDB surviving-session alias deletion and input aliasing, Redis stale membership loss/wrong-identity mutation targeting, and arbitrary error-text disclosure. These used in-memory adapters: they establish orchestration behavior, not live-service isolation.
- Baseline full suites/builds/packed consumers were not run during analysis; implementation tasks require fresh verification. No production performance or comprehensive corruption-audit claim is made.
- Historical plans: `20260813-185552-express-oidc-vault-memory-store-review-remediation.md`, `20260813-185606-express-oidc-vault-mongodb-store-review-remediation.md`, `20260813-185747-express-oidc-vault-redis-store-review-remediation.md`, and `20260908-130120-oidc-vault-stores-health-follow-up.md`, all under `docs/tasks/`.
- This objective continues narrow gaps in completed MEM-02/04, MDB-05/08, RVR-04/06, SVH-02/03/08. STB-05 incorporates FU-SVH-07b's measurable redundant round-trip reduction; STB-07 closes FU-SVH-05a's documentation/conformance gap. Historical findings/completion evidence must remain intact.
- Deferred existing decisions: FU-SVH-05b's cross-provider non-expiring retention and MongoDB create-ID-reuse divergence remain documented variations; changing them requires an explicit compatibility policy. FU-SVH-07a's very-large MongoDB `$in` batching and FU-SVH-07c's 10k-alias Lua bounds remain scale-driven follow-ups. Residual risk: full-lineage scans/materialization and unbounded alias growth for non-expiring memory/Redis sessions. STB-07 must state these honestly. Redis payload expiry under externally altered TTL is a bounded policy review in STB-03, not a pre-labelled vulnerability.

## Execution and verification

P1: authentication/revocation consistency or sensitive diagnostic exposure. P2: contained correctness, portability, readability, or measured efficiency. No P0 exploit established.

Run **one fresh sub-agent per task, sequentially in document order**, including an independent final reviewer. Each agent reads this document and `the task-as-you-go skill`, marks its task `in_progress`, implements and verifies it, and appends `Completion evidence` before `completed`. Record new independent findings as fully specified follow-up tasks, not hidden notes. Shared files and transitive builds must never be edited/built concurrently.

Commands from repository root unless specified:

- V1: focused `pnpm exec vitest run --config ../../vitest.config.ts test/<file>.test.ts` from the affected adapter directory, plus `pnpm exec eslint <changed TS files>` from root. Focused source tests may require prior dependency builds.
- V2: affected `pnpm --filter @web-ts-toolkit/express-oidc-vault-<memory|mongodb|redis>-store test` (substitute actual provider). Each script rebuilds transitive dependencies and includes packed consumers. Run serially. Live MongoDB requires cached/downloadable mongod and loopback processes; Redis requires Docker and existing 6.2/7.2 images. Skips do not establish backend behavior.
- V3: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` when shared conformance/types/docs change, and at final integration.
- V4: final root `pnpm lint`, `pnpm build`, `pnpm test`, sequentially. Record unrelated failures with exact evidence; unrelated failures may be scoped exceptions to integration completion only when affected checks pass and reviewer establishes no causal link. Affected failing or unavailable required checks block completion.
- V5: existing packed CJS/ESM and strict declaration consumers, plus `npm pack --dry-run --json` in all three adapters and inspect fresh declarations/exports/README. Packaging assembly is unchanged, so no asdf artifact build is required.

Definition of done: every task's observable criteria verified, all task statuses reconciled with evidence, cross-path tests and public docs/types consistent, compatibility notes recorded, no `CHANGELOG.md` diff introduced, independent final review complete. Use `blocked` with exact prerequisite if required checks cannot run.

## Tasks

### Task STB-01: Make post-commit Redis diagnostics secret-independent

Status: completed

Kind: defect

Priority: P1; caller-provided adapter errors can disclose credentials through default logs.

Suggested agent: diagnostic-boundary implementer

Dependencies: none

Primary ownership: Redis `src/index.ts`, `test/index-maintenance-failure.test.ts`, README diagnostic wording.

Finding: `sanitizeMaintenanceCause` copies arbitrary error names/messages/strings and `runPostCommitIndexMaintenance` logs them despite promising sanitized output. Source probe emitted a synthetic credential URL/token. Existing tests inject benign messages and only check secrets unrelated to the error.

References: `packages/express-oidc-vault-redis-store/src/index.ts` (`sanitizeMaintenanceCause`, `runPostCommitIndexMaintenance`); `test/index-maintenance-failure.test.ts`; SVH-02.

Requirements: use fixed diagnostic text and only bounded allowlisted categories if useful; never interpolate arbitrary error fields. Preserve committed mutation success, eventual maintenance retry, and no rotation retry. Keep meaningful operation identification.

Acceptance criteria: error name, message, string, and unusual thrown values containing synthetic secrets never reach warnings; committed create/rotate still resolve; mutation errors still reject; recovery tests pass.

Verification: V1 plus Redis V2.

Completion evidence:

- Changed Redis `src/index.ts`: removed `sanitizeMaintenanceCause`; post-commit warnings use fixed text and the internal `createSession`/`rotateSession` operation name only, without inspecting or forwarding thrown values. Committed results, opportunistic maintenance recovery, and no committed-rotation retry remain covered.
- Changed Redis `test/index-maintenance-failure.test.ts`: 32 tests cover all four maintenance-command failures for create/rotate, 20 adversarial thrown-value cases across both operations (secret-bearing error names/messages/strings/objects/arrays/symbols, null/undefined, throwing error accessors and hostile proxies), exact warning arguments, committed records, mutation-command rejection, conflicts, and later cleanup recovery. Before the runtime fix, 20 failed / 12 passed: direct credential disclosure and hostile-value rejection of committed operations were reproduced; after the fix all 32 passed.
- Changed shipped Redis `README.md` diagnostic policy and compatibility note: warnings omit the former `Cause:` suffix and all adapter error details; log consumers retain fixed failure text and operation identification.
- V1: from `packages/express-oidc-vault-redis-store`, `pnpm exec vitest run --config ../../vitest.config.ts test/index-maintenance-failure.test.ts` — 1 file, 32 passed, 0 skipped. From root, `pnpm exec eslint packages/express-oidc-vault-redis-store/src/index.ts packages/express-oidc-vault-redis-store/test/index-maintenance-failure.test.ts` — passed.
- V2: from root, `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` — transitive core/Redis CJS, ESM and declaration builds passed; 8 files, 112 tests passed, 0 failed/skipped. Includes 26 live integration cases (13 each on `redis:6.2-alpine` and `redis:7.2-alpine`) and packed CJS/ESM/strict NodeNext consumers. Additional package-local `npm pack --dry-run --json` passed: README, manifest and four emitted runtime/declaration files (6 entries); staged release-package contents are also checked by V2.
- Scope/preservation: only this task section and the three owned Redis files were edited. Pre-existing Redis `test/index.test.ts` timeout change and core OIDC changes preserved; no CHANGELOG diff introduced, commits, resets, or manual generated-output edits. Scoped `git diff --check` passed.
- Limitations: diagnostic/recovery fault injection uses the adapter fake, not a live Redis maintenance outage. Live integration establishes existing server-path regressions only. V3/V4 and cross-provider V5 belong to later tasks and were not run for STB-01. The existing Vite config-loader advisory was non-failing.

### Task STB-02: Preserve Redis index ownership during stale repair

Status: completed

Kind: defect

Priority: P1; stale repair can make live sessions undiscoverable by later scoped logout.

Suggested agent: Redis atomic-repair specialist

Dependencies: STB-01

Primary ownership: Redis `src/index.ts`, `src/scripts.ts`, corruption race tests and minimal script-emulator support.

Finding: primary compare-and-delete is guarded, but `deleteSessionsFromIndex` unconditionally ZREMs missing/malformed/wrong-owner MGET snapshots. A replacement survives primary repair yet loses its fresh membership. Existing corrupt MGET fixtures use score `-1`, allowing initial time-based pruning to remove the intended fixture before MGET.

References: Redis `getSessionRecords`, `removeSessionIdFromIndex`, `deleteSessionsFromIndex`; `test/index-corruption-race.test.ts` MGET fixtures; `test/redis-integration.test.ts` malformed indexed revocation; SVH-03.

Requirements: guard membership repair atomically against current primary state/ownership or an equivalent observed-generation check. Retain primary compare-and-delete protection. Correct fixtures to use future/non-expiring scores and assert the corrupt snapshot was actually observed. Preserve later-member progress and counting.

Acceptance criteria: real Redis barriers cover missing, malformed, and wrong-owner snapshots followed by same-ID creation/replacement; fresh membership survives stale repair and a later matching scoped delete revokes the replacement. Unchanged stale memberships are reclaimed. Both supported images exercise the critical race; no mock-only proof.

Verification: V1 and Redis V2 with live races.

Completion evidence:

- Changed Redis `src/index.ts` and `src/scripts.ts`: retain the raw MGET observation alongside the parsed session and run stale membership removal through a small cached Lua script. It atomically ZREMs only when the primary is absent or still equals the observed non-owner/malformed payload; a changed primary preserves its membership. Existing primary compare-and-delete remains intact, including the separate window between primary repair and membership repair. Compatibility outcome: concurrent same-ID replacements remain discoverable by a later matching scoped revoke; stale repair does not contribute to the deleted-session count.
- Changed Redis `test/index-corruption-race.test.ts`, `test/redis-integration.test.ts`, and minimal emulator/fixture support in `test/index.test.ts`. Replaced misleading `-1` corruption scores (and expired live wrong-owner scores) with non-expiring scores; assert the corrupt MGET observation and inspect primary/index state directly so a later `getSession` cannot hide missed repair. Correcting the original race fixtures before the runtime fix reproduced 3 failures / 8 passes: one emulator membership-loss failure and later-revoke count failures on both real Redis images.
- Live matrix uses a separately connected writer and command-response barriers on each of `redis:6.2-alpine` and `redis:7.2-alpine`: missing, malformed, and wrong-owner MGET snapshots across subject/provider-session/logical-session indexes, with replacement and unchanged cases, plus creation after successful primary repair across all three indexes. The 42 matrix cases comprise 24 replacement interleavings and 18 unchanged-stale controls. They verify exact observed snapshots, later-member progress/counts, preserved fresh membership even with the same score, later scoped revocation, stale membership reclamation, and preservation of unchanged wrong-owner primaries.
- V1: from `packages/express-oidc-vault-redis-store`, `pnpm exec vitest run --config ../../vitest.config.ts test/index-corruption-race.test.ts test/redis-integration.test.ts test/index.test.ts` — 3 files, 105 passed, 0 failed/skipped. From root, `pnpm exec eslint packages/express-oidc-vault-redis-store/src/index.ts packages/express-oidc-vault-redis-store/src/scripts.ts packages/express-oidc-vault-redis-store/test/index-corruption-race.test.ts packages/express-oidc-vault-redis-store/test/redis-integration.test.ts packages/express-oidc-vault-redis-store/test/index.test.ts` — passed.
- V2: from root, `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` — transitive core/Redis CJS, ESM and declaration builds passed; 8 files, 152 tests passed, 0 failed/skipped, including packed CJS/ESM/strict declaration consumers. Live coverage ran successfully: 72 cases total, 36 per image (23 corruption-repair cases plus 13 general integration cases). Scoped `git diff --check` passed; no CHANGELOG diff. Only this task section and the five listed Redis files were edited; STB-01 diagnostics and the earlier `test/index.test.ts` timeout change were preserved. No commits, resets, subagents, or manual generated-output edits.
- Limitations: this is conservative observed-payload repair, so a concurrently changed primary that still does not own the index may leave stale membership for a later pass. Live barriers establish the specified interleavings, not a global revocation snapshot or production-load guarantee. Identity binding/expiry policy remains STB-03; V3/V4 and cross-provider V5 were not required or run for STB-02. The existing Vite config-loader advisory was non-failing.

### Task STB-03: Bind Redis records to their requested identities

Status: completed

Kind: defect

Priority: P1; shape-valid corrupt records can redirect indexed mutation to another session key.

Suggested agent: Redis record-boundary specialist

Dependencies: STB-02

Primary ownership: Redis `src/records.ts`, `src/index.ts`, focused/live corruption tests, relevant README.

Finding: GET/GETDEL/MGET validate shape but do not bind `sessionId`, `state`, or `code` to the lookup key. A source probe MGET of `lookup` containing `sessionId: victim` targeted the victim's delete script. This assumes inconsistent persisted data/adapter responses, not arbitrary external Redis access.

References: Redis `validateSession`, `parseStoredJson`, `getSession`, `consumeJson`, `getSessionRecords`, `deleteSessionRecord`; RVR-04.

Requirements: validate key/payload identity before returning data or deriving mutations, with generation-safe repair of the observed key only; preserve atomic one-time consumption. Evaluate persisted expiry versus key TTL: document an evidence-backed decision; any additional expiry check must use server time and preserve split-clock guarantees. Do not add routine per-read round trips without measuring/justifying them.

Acceptance criteria: wrong-identity session/state/code returns null; indexed corruption never deletes an unrelated valid victim; unchanged wrong-key payloads are removed safely; concurrent replacement remains intact. Tests cover single/batch/consume paths and valid records. TTL policy conclusion and any limitations are recorded with tests for behavior claimed.

Verification: V1 and Redis V2 including real-server wrong-identity mutation case.

Completion evidence:

- Changed Redis `src/records.ts` and `src/index.ts`: session/state/code validators now require the lookup identity. GET (including missing-session logout cleanup), GETDEL and each requested MGET slot bind decoded identity before returning data or deriving mutation keys. MGET iterates requested IDs, retaining each raw observation for STB-02 repair. Wrong-key sessions use the existing observed-key compare-and-delete; index membership retains the existing atomic generation guard. One-time mismatches return `null` after the original GETDEL with no second delete. No Lua or clock behavior changed.
- Extended `test/index-corruption-race.test.ts`: 29 additional cases cover wrong-key session reads/direct deletion/rotation, state/code fail-closed consumption with post-GETDEL replacement and concurrent single-winner consumption, live GET replacement, and live wrong-identity MGET replacement/unchanged controls across all three indexes. The live victim regressions deliberately omit a valid separate-lineage victim from the subject index, copy its payload under `lookup`, assert that MGET actually observed `lookup` but not the victim, and verify the victim's primary and logical membership survive while the lookup is repaired and later valid members are revoked/count correctly. Both Redis images run direct and indexed victim cases. Existing STB-02 missing/malformed/wrong-owner and post-primary-repair barriers remain green.
- Before the runtime fix, the corrected focused fixture run had 23 failures / 57 passes: wrong-identity data was returned/consumed, wrong-key rotation succeeded, and indexed live victim deletion returned 2 instead of 1 on both images. An earlier test-authoring run also exposed unsupported `it.each` context arguments; these were corrected before that baseline. After the runtime fix the same 80-case corruption file passed.
- TTL policy conclusion: retain Redis key-TTL authority. Inspected the accepted core `OidcVaultSession.expiresAt` lifetime contract, Redis README expiry policy, `RedisOidcVaultStoreOptions.now` split-clock JSDoc, `setJson`, and write/rotation `PXAT` plus index-score construction. Store-owned writes enforce the configured absolute lifetime through Redis; no accepted contract requires auditing externally changed TTLs. A routine independent payload-time check would duplicate that mechanism and require additional server-time work; none was added or justified by an unmeasured performance claim.
- Policy evidence: six live cases (session/transaction/exchange on each image) use Redis TIME to establish test deadlines and an application clock far in the future. Store-written future PXAT values remain readable/consumable; server-expired keys return `null` even with future payload expiry. Externally removed/extended TTLs allow past-dated payloads, and an expired index score can be pruned while the altered-TTL session remains readable. Recorded command traces are exactly one GET or GETDEL per single-record read, including expiry/missing cases; one-time consumption remains single-use. Redis README now states this TTL/index-integrity assumption and limitation, plus the wrong-identity compatibility change. This is a bounded policy evaluation, not a comprehensive external-corruption audit or latency benchmark.
- V1: from `packages/express-oidc-vault-redis-store`, `pnpm exec vitest run --config ../../vitest.config.ts test/index-corruption-race.test.ts test/index.test.ts` — 2 files, 108 passed, 0 failed/skipped. From root, `pnpm exec eslint packages/express-oidc-vault-redis-store/src/index.ts packages/express-oidc-vault-redis-store/src/records.ts packages/express-oidc-vault-redis-store/test/index-corruption-race.test.ts` — passed.
- V2: from root, `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` — transitive core/Redis CJS, ESM and declaration builds passed; 8 files, 181 passed, 0 failed/skipped, including packed CJS/ESM/strict declaration consumers. Live coverage: 96 cases total, 48 per `redis:6.2-alpine` / `redis:7.2-alpine` (35 corruption/policy and 13 general integration). Fresh declaration inspection confirms the public exports and split-clock comments remain present. The Vite config-loader advisory was non-failing.
- Preservation/scope: edited only this STB-03 section, Redis `src/records.ts`, `src/index.ts`, `test/index-corruption-race.test.ts`, and shipped README. Prior STB-01/02 and user modifications preserved. Scoped `git diff --check` passed; no CHANGELOG diff, commits, resets, subagents, or manual generated-output edits. V3/V4 and cross-provider V5 remain later-task verification. One-time replacement fault injection is emulator-based; the required unrelated-victim and session/index replacement regressions ran on real Redis.

### Task STB-04: Retire memory aliases at ownership transitions

Status: completed

Kind: defect

Priority: P2; development/test provider can resurrect stale revocation handles on lineage reuse.

Suggested agent: memory lifecycle implementer

Dependencies: STB-03 (required sequential execution)

Primary ownership: memory `src/index.ts`, `test/index.test.ts`, README contract notes.

Finding: create-upsert or rotation changing logical lineage never invokes inactive-old-lineage cleanup. A/L1 -> B/L1 -> C/L2 followed by D/L1 permits old A to revoke new D. Accepted rotation onto an alias-only target also retains the target's former alias ownership; after scoped removal of the replacement, that alias revokes the former lineage. `createSession` already clears target aliases, but `rotateSession` does not.

References: memory `createSession`, `rotateSession`, `removeAliasesForInactiveLogicalSession`; MEM-02/04; FU-SVH-05b rotation-path extension.

Requirements: after successful ownership transition retire old-lineage aliases only when no live member remains. Accepted rotation onto an alias-only target clears its old alias consistently with create; preserve acceptance of that target rather than inventing a new conflict policy. Do not retarget earlier aliases. Keep conflict/clone-failure atomicity and finite alias expiry.

Acceptance criteria: lineage-changing rotation/upsert followed by old-lineage reuse cannot resurrect stale handles; another live member preserves its aliases; target-ID reuse followed by logical/subject/provider deletion or expiry cannot activate the old target alias. Existing clone/expiry/sweep tests pass.

Verification: V1 and memory V2.

Completion evidence:

- Changed memory `src/index.ts`: successful lineage-changing create-upsert and rotation invoke the existing inactive-lineage cleanup for the previous owner. Liveness now excludes expired records using the operation's already-captured timestamp, including records still awaiting a bounded sweep. A surviving live member preserves earlier aliases in their original lineage; the immediate rotation-source alias belongs to the successor lineage. Accepted alias-only rotation targets clear their former alias just like create. Expired-target retirement now follows successful input cloning, preserving target/source state on clone failure. No new maps/indexes or sweep algorithm changes.
- Added 25 cases in memory `test/index.test.ts`: upsert/rotation with absent, live cross-provider, and unswept exact-boundary-expired peers; old-lineage reuse and earlier-alias non-retargeting; alias-only ID reuse followed by logical, issuer/client-scoped subject/provider-session, direct, expiry-read, and expiry-sweep removal; unrelated former-lineage alias preservation; clone failures over live/alias-only/expired targets; missing/same-ID/live-target conflicts; and finite earlier-alias expiry despite a later longer-lived rotation. The unswept-peer fixtures use 70 unrelated records and a deterministic existing sweep cursor, asserting the expired peer is still stored at transition time. Initial V1 reproduced 10 failures / 48 passes before the runtime fix; the expired-target clone regression was added afterward. Final V1 passed all 59 cases, including unchanged shared conformance and SVH-04 sweep/performance tests.
- Changed shipped memory `README.md`: documented lineage-transition retirement, genuinely live survivors, accepted alias-only/expired rotation targets, immediate-successor alias deadlines, no earlier-alias retargeting, and compatibility effects. Clarified that existing liveness/alias cleanup scans whole retained maps and remains outside the 64-slot same-map sweep bound; no latency or constant-time claim.
- V1: from `packages/express-oidc-vault-memory-store`, `pnpm exec vitest run --config ../../vitest.config.ts test/index.test.ts` — 1 file, 59 passed, 0 failed/skipped. From root, `pnpm exec eslint packages/express-oidc-vault-memory-store/src/index.ts packages/express-oidc-vault-memory-store/test/index.test.ts` — passed.
- V2: from root, `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` — transitive core/memory CJS, ESM and declaration builds passed; 2 files, 62 passed, 0 failed/skipped. Includes packed publish-manifest/content checks, CJS/ESM runtime consumers, strict NodeNext/Bundler and README consumers. Additional package-local `npm pack --dry-run --json` passed with README, manifest and four emitted runtime/declaration files (6 entries); fresh `.d.ts`/`.d.mts` inspection confirmed named exports and existing clock/factory JSDoc.
- Preservation: edited only this task section and the three owned memory files. Existing changes, STB-01/02/03 evidence, sweep tests and counters preserved; scoped `git diff --check` passed and no CHANGELOG diff introduced. No commits, resets, subagents, or manual generated-output edits. The existing Vite config-loader advisory was non-failing.
- Handoff: STB-05 can proceed sequentially. STB-07 should carry the memory README's immediate-successor deadlines, changed-lineage ownership and full-map cleanup limits into portable conformance/docs while retaining the documented non-expiring and MongoDB create-ID-reuse variations. V3/V4 and cross-provider V5 remain later-task verification; this task establishes memory lifecycle behavior, not persistent-backend concurrency or production performance.

### Task STB-05: Preserve surviving persistent-store aliases and remove redundant cleanup

Status: completed

Kind: defect

Priority: P1; scoped logout currently removes revocation handles belonging to retained sessions.

Suggested agent: cross-provider logout consistency implementer

Dependencies: STB-04

Primary ownership: MongoDB `src/store.ts`, Redis `src/index.ts`/`src/scripts.ts`, shared `test/store-provider-conformance.ts`, both backend tests, minimal docs.

Finding: MongoDB scoped/direct deletion clears all aliases for matched logical IDs even when sessions survive in other provider scopes. Redis `deleteRecord` and follow-up TypeScript cleanup have the same assumption. Shared conformance preserves different-provider sessions sharing a lineage but never rotates those survivors first. Redis additionally repeats TIME/prune/ZRANGE after scripts already clean aliases (SVH-07 measured ~3 avoidable RTT per member).

References: MongoDB `deleteSession`, `deleteSessionsAndAliasesByFilter`; Redis Lua `deleteRecord`, TypeScript `deleteRotatedSessionAliasesByLogicalSessionId`, `deleteSessionsFromIndex`; shared scoped-survivor conformance; MDB-05/RVR-06 and FU-SVH-07b.

Requirements: preserve finite aliases while an intentionally retained member survives; clean terminated lineage aliases without an unsafe check-then-delete race. Analyze concurrency at the backend atomic boundary, preserving rotation-vs-logout behavior and transaction resource closure. Remove redundant application cleanup where the atomic script can own it; prefer this smallest shared enforcement point over a new abstraction. Do not change the documented MongoDB create-ID-reuse divergence in this task.

Acceptance criteria: subject, provider-session and direct deletion preserve an unexpired alias to a surviving member sharing the logical ID (including different issuer/client scopes), and that alias still revokes its lineage; terminated lineages clean up. Live MongoDB/Redis barrier regressions cover concurrent rotation/deletion and shared conformance passes all three providers. Count live Redis commands for a fixed workload before/after and demonstrate reduced cleanup RTT without claiming unmeasured latency improvement. Record any remaining whole-lineage work.

Verification: V1, all three V2 serially, V3; real-service command-count measurement.

Completion evidence:

- Changed MongoDB `src/store.ts` and internal `src/documents.ts`: all explicit deletion paths now call one inactive-lineage alias cleanup helper. Session deletion commits first; only the live-member query and alias removal share a `readConcern: snapshot` transaction. A member in another subject/provider/issuer/client scope preserves aliases; expired peers do not. A later rotation inserting a new alias is outside the cleanup snapshot; a later rotation updating an observed alias causes write conflict/retry. Every rotation increments an internal optional alias `revision`, including identical lineage/expiry updates and legacy rows without a revision, so a no-op update cannot evade that conflict. No lineage lock collection or session-write transaction expansion. Cleanup uses `try/finally` to close its ClientSession; existing rotation normalization, generation checks and resource boundaries remain intact. MongoDB create-ID-reuse divergence is unchanged.
- Why deletion precedes the snapshot: placing disjoint scoped session deletions inside separate snapshot transactions could let both observe the other's soon-to-be-deleted member and preserve inactive aliases (write skew). With deletion committed first, the last deletion's cleanup can observe the empty lineage. Cleanup can still reject after the primary deletion committed, and later arrivals are not a global logout snapshot. Both shipped backend READMEs now document survivor compatibility and these concurrency/whole-lineage limits.
- Changed Redis `src/scripts.ts` and `src/index.ts`: the existing delete script checks actual keyed, same-lineage primaries (Redis TTL authority) before removing aliases; it preserves retained members' aliases atomically with deletion/rotation. The shared Lua liveness helper also serves a small empty-logical cleanup script, retaining alias-only logout cleanup when the last primary expired before logout. Removed repeated TypeScript TIME/prune/ZRANGE/DEL alias cleanup after successful scripts, including the duplicate stale-ID path. STB-01 diagnostics, STB-02 observed-generation index repair and STB-03 keyed record validation remain intact. Minimal `test/index.test.ts` emulator support models the new cleanup behavior; prior test edits/timeouts preserved.
- Shared `test/store-provider-conformance.ts`: six new named cases exercise subject/provider-session/direct deletion across different issuer/client scopes, each with finite and non-expiring session variants (12 scenarios per provider). Survivors are rotated before deletion, their old alias still revokes the lineage, and subsequent lineage reuse cannot reactivate the terminated alias. Baseline Redis conformance reproduced all six named failures before the runtime fix (28 existing cases passed). Shared conformance passes all three providers; MongoDB runs against mongod, Redis shared conformance uses its existing emulator plus the live coverage below.
- New MongoDB `test/alias-cleanup.test.ts`: 14 real replica-set cases, including 12 command-response barrier races (direct/subject/provider-session/logical deletion × new alias/changed alias/identical alias). Writer rotations commit after the empty liveness snapshot and before alias removal. Tests assert surviving primary/alias, successful later alias revocation, snapshot retries for updated aliases, and cleanup of the previous inactive generation. Identical-alias cases explicitly start with legacy revision-less rows. Initial snapshot-only implementation reproduced four identical-value failures because cleanup did not retry; adding the revision made all cases pass. Additional barriers prove last-deletion cleanup despite an earlier survivor snapshot; expired-peer and lifecycle checks cover success, no-op and injected cleanup failure, real snapshot commands, and exactly one endSession per explicit allocation. An initial lifecycle fixture incorrectly counted driver-owned implicit sessions; corrected it to count explicit allocations. Existing rotation-vs-logout, source-generation, conflict/rollback and rotation-resource tests all remain green.
- New Redis `test/alias-cleanup.test.ts`: 26 live cases (13 each on `redis:6.2-alpine` / `redis:7.2-alpine`). Separately connected writers rotate retained members immediately before delete EVALSHA or after its committed response across all three deletion paths; earlier and newly created survivor aliases remain effective. Actual GET/MGET response barriers rotate the matching source before stale deletion and verify successor revocation/counts; logout-winning-after-rotation-read conflicts safely. Controls reclaim aliases with missing/malformed/wrong-key/wrong-lineage logical memberships and after the final primary expires, without deleting an unrelated primary. The prior integration rotation test is preserved, and these new indexed barriers explicitly assert MGET was observed.
- Live command measurement: the same warmed workload creates 12 independent finite lineages, rotates each once, then counts only one subject logout (setup, verification, script-cache warmup and internal Lua commands excluded). Before runtime changes, exact assertions passed on both images: **52 commands = 13 TIME + 13 ZREMRANGEBYSCORE + 12 ZRANGE + 1 ZSCAN + 1 MGET + 12 EVALSHA**. After: **16 = 1 TIME + 1 ZREMRANGEBYSCORE + 1 ZSCAN + 1 MGET + 12 EVALSHA**, with exact assertions retained. Reduction: **36 sequential client round trips, three per deleted member**. All 12 primaries/aliases are verified removed. The initial measurement fixture lacked required idToken and was corrected before collecting the baseline. No latency improvement claimed. Lua still materializes whole logical membership sets, probes primaries until finding a live owner, and enumerates/deletes all aliases when inactive; MongoDB still materializes affected IDs/survivors. Existing FU-SVH-07a/07c scale follow-ups remain applicable.
- V1: Redis `pnpm exec vitest run --config ../../vitest.config.ts test/alias-cleanup.test.ts test/index.test.ts test/index-corruption-race.test.ts` — 3 files, 140 passed, 0 failed/skipped. MongoDB focused runs exposed the two fixture/no-op issues above; final full V2 covers the final 14-case race file and all existing tests. Baseline command measurement: package-local `pnpm exec vitest run --config ../../vitest.config.ts test/alias-cleanup.test.ts` — 2 passed, 0 skipped, with exact 52-command assertions on both images.
- Required V2 ran **serially** from root: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` — 2 files, **68 passed**; then MongoDB equivalent — 4 files, **64 passed**; then Redis equivalent — 9 files, **213 passed**. **0 failed/skipped** in all three. Transitive CJS/ESM/declaration builds and existing packed runtime/strict declaration consumers passed. Redis totals include **122 live cases**, 61 per image. MongoDB uses a real replica set plus existing standalone prerequisite tests; no emulator substitutes for its race evidence.
- V3: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` — 24 files, **475 passed**, 0 failed/skipped, including core build and packed consumers. Scoped eslint passed for MongoDB `src/store.ts`, `src/documents.ts`, new alias test; Redis `src/index.ts`, `src/scripts.ts`, `test/index.test.ts`, new alias test; and shared conformance. Scoped `git diff --check` passed; no CHANGELOG diff. Only the listed owned files, two READMEs and this STB-05 section were edited. Extensive user/core changes and earlier-task evidence preserved; no subagents, commits, resets or manual generated-output edits. The existing Vite config-loader advisory was non-failing.
- Handoff/limits: STB-06 remains pending; no independent implementation work was added. V4/root integration and additional V5 pack inspection remain later-task work. Evidence establishes specified interleavings and client-command reduction, not global revocation linearizability, cross-version rolling-writer compatibility, or production latency/scale.

### Task STB-06: Snapshot asynchronous inputs and detach returned data

Status: completed

Kind: defect

Priority: P2; caller mutation across awaits changes persistence targets and returned results.

Suggested agent: persistence data-ownership implementer

Dependencies: STB-05

Primary ownership: MongoDB/Redis public operations and internal snapshot helpers, focused tests, shared ownership conformance if appropriate.

Finding: MongoDB awaits readiness before reading inputs; both persistent stores shallow-spread returned sessions and share nested caller objects. MongoDB source probe changed the persisted ID via immediate post-call mutation and showed metadata input/result aliasing. Redis rotation reads caller input after a source-read await. Existing conformance replaces whole metadata properties only after awaiting create.

References: MongoDB `createAuthorizationTransaction`, `createExchangeCode`, `createSession`, `rotateSession`, `normalizeRotatedSession`, document mapping; Redis `createSession`, `rotateSession`, scoped delete input handling; shared ownership test; SVH-08 source-generation guard.

Requirements: own stable JSON-portable inputs before the first await; keep a consistent snapshot through retries and across provider/user/metadata nested arrays. Return data independent from caller-owned nested objects and consistent with committed data. Audit transaction/exchange/JTI/scoped-delete object inputs for later rereads. Preserve native backend serialization contracts outside the portable subset; avoid JSON-roundtrip data loss as an undocumented side effect. No public helper solely for tests.

Acceptance criteria: mutation immediately after invocation and during read/write barriers cannot change the target, scope, committed value or eventual result; nested input/result mutation is isolated; failure paths and MongoDB generation guard pass. Valid JSON-compatible metadata remains portable across all stores.

Verification: V1, affected V2, V3 if conformance/types change.

Completion evidence:

- Changed MongoDB `src/store.ts`: capture session/rotation/authorization inputs before readiness, and flat exchange/JTI/deletion inputs before the first await. The rotation snapshot is reused through source normalization and transaction retries; logical deletion retains the same ID through primary deletion and alias cleanup. Returned session plain-object/array containers no longer alias caller data. Existing MongoDB source-generation comparisons, transaction closure, STB-05 snapshot cleanup and internal alias revisions are preserved.
- Changed Redis `src/index.ts`: capture session input before create and rotation's source read, and copy object deletion scopes before the asynchronous index traversal. Audited authorization/exchange/JTI paths: their existing synchronous serialization or primitive command-argument construction already captures all declared inputs before yielding, so no extra copy or Redis round trip is needed. Script retry arguments remain stable; STB-01 diagnostics, STB-02/03 repair/identity guards and STB-05 atomic cleanup are preserved.
- Serialization choice: small non-exported helpers in each adapter recursively copy plain objects and arrays, preserving enumerable keys and graph references; they neither JSON-round-trip values nor structured-clone BSON instances. Opaque non-plain values retain existing backend serialization and returned-value semantics, with ownership isolation guaranteed only for the documented portable domain. Both shipped READMEs record this boundary and compatibility effect. MongoDB native-value tests compare persisted Date/ObjectId/Decimal128/Long/Binary/Buffer/RegExp/custom `toBSON`/undefined/NaN metadata against a direct driver-written reference. Redis tests preserve Date/Buffer/Map/custom `toJSON` return values and native persisted JSON, plus BigInt/cycle/throwing-serializer failures without consuming the rotation source.
- Shared `test/store-provider-conformance.ts`: six added cases per provider cover immediate post-invocation mutation for create, rotation, transaction/exchange/JTI, and all three object deletion scopes. Create/rotate cases mutate nested provider/user/metadata arrays in the input, result and subsequent reads independently, and replace rotation source/target fields before awaiting. Portable values persist under the original identity/scope and remain detached. Core public types/runtime were not changed.
- New MongoDB `test/input-ownership.test.ts`: **8 real replica-set cases**, including held pre-serialization create/authorization writes, rotation source-read/write barriers, a failCommand-induced transaction retry (exactly two insert attempts, stable target/data, revision 1), JTI probe-to-insert and logical deletion-to-alias-cleanup barriers, and native BSON preservation. New Redis equivalent: **30 live cases**, 15 per supported image, covering held rotation source reads, create/rotate persistence and post-commit barriers, actual NOSCRIPT/load retries, TIME/MGET barriers for all three deletion scopes, native values and serialization failure atomicity. These exercise public operations; no helper is exported for tests.
- V1 ran serially from adapter directories: MongoDB `pnpm exec vitest run --config ../../vitest.config.ts test/input-ownership.test.ts test/index.test.ts` — **55 passed**; Redis equivalent — **70 passed**; memory `pnpm exec vitest run --config ../../vitest.config.ts test/index.test.ts` — **71 passed**. Initial MongoDB fixture run had four equality failures because omitted optional fields follow the driver's existing undefined-to-null behavior; supplying those optional string fields corrected the fixture without changing native serialization. Final V1 had **0 failed/skipped**. Root scoped eslint passed for both changed runtime files, both new test files and shared conformance.
- V2 ran **serially**, root `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test`, then MongoDB equivalent, then Redis equivalent: memory **2 files / 74 passed**, MongoDB **5 files / 78 passed**, Redis **10 files / 249 passed**. V3 then ran `pnpm --filter @web-ts-toolkit/express-oidc-vault test`: **24 files / 475 passed**. All transitive CJS/ESM/declaration builds and existing packed runtime/strict declaration consumers passed. **876 tests passed across V2/V3, 0 failed, 0 skipped**. MongoDB used real replica-set/standalone harnesses; Redis included **152 live cases**, 76 per `redis:6.2-alpine` / `redis:7.2-alpine`. The existing Vite config-loader advisory was non-failing.
- Preservation/limits: edited only the two runtime files, two new test files, shared conformance, two READMEs and this task section. Scoped `git diff --check` passed; no CHANGELOG diff, subagents, commits, resets or manual generated-output edits. Existing extensive work and STB-05 protocol/revisions remain intact. Evidence covers the named input-ownership interleavings and native value examples, not mutation isolation of opaque runtime objects or a universal custom-serializer contract. STB-07 remains pending; V4 and additional V5 inspection belong to later tasks.

### Task STB-07: Publish accurate portable contracts and operational guidance

Status: completed

Kind: improvement

Priority: P2; installed consumers need reliable provider selection, logout and ownership guidance.

Suggested agent: installed-package contract/documentation specialist

Dependencies: STB-01, STB-02, STB-03, STB-04, STB-05, STB-06

Primary ownership: all three shipped READMEs, focused shared conformance tests, core store-contract JSDoc/README only as needed, website drift fixes limited to these contracts.

Finding: FU-SVH-05a finite-alias wording/conformance remains incomplete; Redis says SCAN processes “up to 100” despite COUNT being a hint. Prior SVH-07 bulk completion/count distinctions and current fixes need discoverable shipped docs. Metadata surfaces appear structurally plausible; no export defect assumed without consumer evidence.

References: prior SVH-05/SVH-07 evidence; provider READMEs and manifests; `packages/express-oidc-vault/src/types.ts` (`OidcVaultStoreProvider`); existing packed consumers.

Requirements: document alias immediate-successor expiry (not extended by later rotations), changed-lineage scope, non-expiring variation, duplicate-create portable subset, scoped deletion versus concurrent arrivals/counts, backend lifecycle/prerequisites, ownership snapshots and safe diagnostics. Add shared conformance for finite alias expiry and changed-lineage scoping without forcing provider-specific retention to converge. Include compatibility/release notes here/README, never CHANGELOG. Verify named imports, emitted declaration comments and packed ESM/CJS consumers. Correct actual packaging defects only if demonstrated.

Acceptance criteria: installed consumers can select/start a provider and predict relevant lifecycle/expiry/revocation behavior from README/declarations; shared lifetime regression matrix passes all providers; docs reflect implementation and measured bounds; package contents and both runtime/type consumer branches pass.

Verification: all three V2, V3, V5; focused documentation/type lint as applicable.

Completion evidence:

- Contract consolidation (no doc edits required): the working tree already contained the consolidated portable business/lifecycle contracts from STB-04/05/06 plus the prior STB-07 attempt's shared conformance additions. Each shipped README was verified accurate against its implementation: finite immediate-successor alias expiry with no later-rotation extension, changed-lineage scope (`A/L1 -> B/L1 -> C/L2` semantics, memory eager retirement vs MongoDB/Redis retain-until-expiry-or-cleanup), non-expiring variation (memory/Redis unbounded vs MongoDB `rotatedSessionAliasRetentionMs` 5-minute fallback), duplicate-create portable subset (fresh-ID portable; memory/MongoDB upsert, Redis create-only; MongoDB retains alias rows under reused IDs per FU-SVH-05b), backend startup/shutdown (memory no-connect/no-teardown, MongoDB replica-set `ready()` + caller-owned client close, Redis caller-connected client + in-flight drain), portable/native ownership snapshots (`structuredClone` vs plain-container copies, opaque BSON/JSON values excluded), safe diagnostics (fixed operation text, no raw errors/records/URLs/labels), count/concurrent-arrival semantics (primary-only counts, later arrivals can survive, no global snapshot), and real resource bounds (memory 64-slot sweeps with full-map lineage scans, MongoDB `$in` materialization, Redis Lua whole-set materialization). Core `OidcVaultStoreProvider` JSDoc and core README `Store Provider Contract` state the same portable subset with the same variations. Website `website/docs/packages/express-oidc-vault*.md` already match these contracts; no drift edits needed.
- Redis SCAN COUNT claim verified corrected: README states `SCAN ... COUNT 100` and `ZSCAN COUNT 250` are hints (not hard caps), the whole response is processed in one step, matching `INDEX_CLEANUP_SCAN_COUNT = 100`, `INDEX_REVOCATION_SCAN_COUNT = 250` and the single-step maintenance traversal in `src/index.ts`. No other stale "up to N" wording remains in the three READMEs.
- Shared regression matrix verified (present in `packages/express-oidc-vault/test/store-provider-conformance.ts`, unchanged by this session): 6 finite-alias scenarios per provider (`finite`/`none` later expiry × offsets −1/0/+1 around the immediate-successor deadline, asserting `getSession` nullness plus delete-through-expired-alias no-revoke vs delete-through-live-alias revocation) and 4 changed-lineage scenarios per provider (`earlier`/`immediate` handle × old-lineage survivor absent/present, permitting both memory eager retirement and MongoDB/Redis retention while forbidding retargeting). Non-expiring retention is covered without forcing convergence. Focused runs: memory 6 + 4 passed; MongoDB 22 alias tests passed (replica set); Redis emulator 21 alias tests passed (one upsert-only case correctly absent under declared `create-only` mode). Full focused files: memory 81, MongoDB 57, Redis 50 passed, 0 failed/skipped.
- V2 ran **serially** from root: memory 2 files / **84 passed**, MongoDB 5 files / **88 passed**, Redis 10 files / **259 passed** (0 failed/skipped; transitive CJS/ESM/declaration builds and packed runtime/strict-declaration consumers green, including live MongoDB replica-set and both Redis images).
- V3: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` — 24 files / **475 passed**, 0 failed/skipped.
- V5: `npm pack --dry-run --json` in all three adapters lists exactly `README.md`, `package.json`, `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`, `dist/index.d.mts`. Exports map lines up (`main`/`module`/`types`, `exports.types/import/require`); named-only imports verified in Node for CJS (`require` returns the factory, `default` undefined) and ESM; emitted declarations carry the consumer-facing JSDoc (memory factory/clock, Redis client/lifecycle contract, core portable `OidcVaultStoreProvider` boundary with alias/ownership/count wording). No packaging defect demonstrated, so no packaging fix made.
- Preservation/scope: no source, README, website, or core-contract edits were needed or made by this session; extensive pre-existing core README/types changes and STB-01–06 evidence preserved. `eslint` on the shared conformance file passed; scoped `git diff --check` passed; no CHANGELOG diff; no commits, resets, subagents, or manual generated-output edits. The existing Vite config-loader advisory was non-failing.
- Compatibility/release notes (no CHANGELOG): portable callers get finite immediate-successor alias windows, changed-lineage scoping with provider-specific old-lineage retention, non-expiring memory/Redis vs finite-MongoDB retention, fresh-`sessionId` creation, invocation-time portable snapshots, primary-only deletion counts with survivor-tolerant arrivals, and backend-owned lifecycle/shutdown. Prior STB-05/06 compatibility notes (surviving-alias preservation, 52→16 cleanup command reduction as count-only, ownership snapshots without JSON round-trips) remain accurate and were not restated in a conflicting way.
- Limitations: Redis shared conformance uses the emulator; live-server behavior is established by the V2 live suites (STB-02/03/05 barriers retained green) rather than re-proven here. Evidence covers the specified lifetime/lineage interleavings and measured command counts, not production latency, scale bounds beyond the documented materialization limits, or a comprehensive external-corruption audit. Root V4 integration belongs to STB-08.

### Task STB-08: Independently review completed tasks and integration

Status: completed

Kind: investigation

Priority: P1; verify cross-provider security/correctness contracts after sequential edits.

Suggested agent: independent integration reviewer (fresh session, not a prior implementer)

Dependencies: STB-01 through STB-07

Primary ownership: this task document, review evidence; fixes found need explicitly scoped follow-up items and fresh implementation sessions.

Finding: delegated changes span Lua, MongoDB transactions, shared conformance, documentation and published consumers; individual green tests do not establish integrated acceptance.

References: all preceding task acceptance criteria and completion evidence; prior SVH-99 limitations.

Requirements: inspect each criterion against actual changes and tests; verify secret-independent logs, generation-safe repairs, keyed identity, surviving aliases, caller data ownership, finite lifetimes, accurate bounds and package surface. Run final V4 sequentially; ensure affected suites/live tests/packed checks ran on final code (reuse current evidence only where no later change invalidates it). Check no new CHANGELOG diff. Record concrete follow-ups and rerun applicable checks after fixes. Do not mark complete solely from previous status labels.

Acceptance criteria: all implementation criteria have defensible evidence, no unresolved affected failures, root verification outcomes/scoped unrelated exceptions documented, deferred decisions retain rationale/risk, task file reflects final delivered state.

Verification: independent source/diff/evidence review; final V2/V3/V4/V5 as above.

Completion evidence:

- Reviewer independence: fresh session, no prior implementation in this plan. Only this task section was edited; no source, README, website, core-contract, CHANGELOG, commit, reset, or manual dist edits.
- Criterion-by-criterion review against actual code (no prior status taken on trust):
  - STB-01 secret-independent logs: confirmed `sanitizeMaintenanceCause` removed from Redis `src/index.ts`; grep finds no `sanitizeMaintenanceCause` or `Cause:` interpolation in `src/`; post-commit warnings use fixed text plus operation name only. 32-case focused suite (20 adversarial) plus final V2 Redis green.
  - STB-02 generation-safe repairs: confirmed observed-payload Lua guard (`buildCompareAndDeleteCommand`, repair command carrying observed value/null flag) in `src/scripts.ts` with raw MGET observation retained in `src/index.ts`; primary compare-and-delete intact. Final V2 Redis green including live corruption matrix.
  - STB-03 keyed identity: confirmed lookup-identity binding in `src/records.ts`/`src/index.ts` for GET/GETDEL/MGET slots with observed-key compare-and-delete repair; wrong-key sessions return null after original GETDEL with no second delete. TTL policy (key-TTL authority, no payload-time re-check) verified documented in shipped Redis README. Final V2 Redis green.
  - STB-04 memory alias retirement: confirmed lineage-changing create-upsert/rotation invoke inactive-lineage cleanup with operation-timestamp liveness, alias-only target clearing, post-clone expired-target retirement in `src/index.ts`; README documents deadlines/scope/full-map scan limits. Final V2 memory green.
  - STB-05 surviving aliases + RTT: confirmed single snapshot-transaction alias-cleanup helper (MongoDB `src/store.ts`/`src/documents.ts`, alias `revision` increments incl. legacy rows) and Redis Lua keyed same-lineage liveness check with removed TypeScript TIME/prune/ZRANGE/DEL repetition; both READMEs document survivor compatibility and whole-lineage limits; 52→16 exact command assertions retained. Final V2 all three + V3 green.
  - STB-06 data ownership: confirmed pre-first-await snapshots (MongoDB session/rotation/authorization/exchange/JTI/deletion; Redis session/rotation-source/deletion scopes) with plain-container recursive copies, no JSON round-trip, opaque BSON/JSON boundary documented in both READMEs; no test-only public helper exported. Final V2 all three + V3 green.
  - STB-07 accurate bounds: verified the three READMEs state finite immediate-successor expiry, changed-lineage scope, non-expiring variation, duplicate-create portable subset, scoped-delete/count semantics, lifecycle/prerequisites, ownership snapshots, safe diagnostics, and materialization bounds; SCAN `COUNT 100`/`ZSCAN COUNT 250` documented as hints matching `src/index.ts` constants; website docs match; shared conformance matrix (finite-alias + changed-lineage) present and passing.
  - Package surface: `npm pack --dry-run --json` in each adapter on final code lists exactly `README.md`, `package.json`, `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`, `dist/index.d.mts`; packed CJS/ESM/strict-declaration consumers pass inside final V2 runs. No packaging defect demonstrated; no fix made.
- Final verification on final code (sequential from root):
  - `pnpm lint` — passed (clean `eslint .`).
  - `pnpm build` — exit 0 (rerun to confirm; first invocation's grep hits were filename matches like `error-format.ts`, not failures).
  - Affected V2 serially: memory 2 files / 84 passed; MongoDB 5 files / 88 passed (real replica set); Redis 10 files / 259 passed (live 6.2/7.2 images). 0 failed/skipped.
  - V3: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` — 24 files / 475 passed, 0 failed/skipped.
  - V5: pack contents verified per adapter (above); V2 packed consumers green.
  - V4 `pnpm test`: first attempt killed at 600s by the tool timeout (SIGTERM landed mid mongodb-store package under heavy unrelated machine load — eslint/firefox/chrome/go processes from other projects — not a test failure; 10 packages had already passed with 0 failures). Detached rerun completed: 26 packages, 7594 tests passed, 0 failed, no FAIL/ERR_PNPM lines.
- No CHANGELOG diff (`git diff --name-only | grep -i changelog` empty); scoped `git diff --check` on the four OIDC packages passed.
- Deferred decisions retain rationale/risk (unchanged): FU-SVH-05b cross-provider non-expiring retention + MongoDB create-ID-reuse divergence; FU-SVH-07a large `$in` batching; FU-SVH-07c 10k-alias Lua bounds; full-lineage materialization and unbounded non-expiring memory/Redis alias growth; no production latency/scale or global linearizability claims. No new defects found; no follow-up tasks created.
- Residual risk: live Redis/MongoDB evidence covers specified interleavings on `redis:6.2-alpine`/`7.2-alpine` and the repo MongoDB harness, not production load, rolling-writer version mixing, or external-corruption audit beyond the stated barriers.
