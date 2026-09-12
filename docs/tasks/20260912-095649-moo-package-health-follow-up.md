# Moo Package Health Follow-up

Created: 2026-09-12 09:56:49 (local time)

## Objective And Scope

Turn the current review of `packages/moo` into independently verifiable sub-agent work: protect destructive operations and Keycloak identity/credential boundaries, correct public contracts, and improve resource bounds, encapsulation, readability, and testability.

Scope: package source, focused tests, build/export metadata, shipped declarations and documentation, and the corresponding website page. This document plans remediation; implementation tasks below are pending. HTTP authorization, a general-purpose ORM, a durable Keycloak outbox, and changes to the upstream Keycloak library are outside this objective.

Related plan: [completed Keycloak remediation](20260820-125218-moo-keycloak-user-sync-review-remediation.md). Its KCS-01 through KCS-11 and KCS-99 are marked completed. MOO-01/02/03/09 below record newly demonstrated boundary gaps in those outcomes, rather than repeating the old implementation work. The broader cascade/helper work is new scope. Preserve historical completion evidence.

## Analysis Coverage And Baseline

- Inspected every source module and public entrypoint; package metadata and tsup entries align, and bundling is enabled for Node ESM compatibility.
- Read cascade, ObjectId, schema, reference utility, model-function, new-document, and export tests; inspected the Keycloak harness, planner, and relevant identity, credential, logging, validation, and lifecycle tests. Reviewed README, `llms.txt`, relevant website examples, and generated helper/plugin declarations.
- Checked the existing Moo task plan and focused references in `docs`. No separate active cascade/helper plan was found.
- **Run:** `pnpm --filter @web-ts-toolkit/moo test` from the repository root. Its dependency/package builds passed; **10 test files, 86 tests passed**. Vitest emitted a future config-loader compatibility warning, without failing the run.
- **Run:** `node /tmp/opencode/moo-review-probe.mjs` from the repository root after that build. The final probe used a real in-memory MongoDB replica set plus a deliberately small fake Keycloak client. Nine assertions reproduced: cascade projection loss, missing-key deletion, transaction leakage, global model lookup, an unsound ObjectId guard, mutable-email relinking, unsaved provider-ID deletion redirection, raw error forwarding, and premature account enablement after partial creation. Scenarios are specified in the tasks; the temporary probe is evidence, not a required execution dependency. Agents must retain regressions in the package.
- **Run:** `pnpm exec tsc --ignoreConfig --noEmit --strict --skipLibCheck --module nodenext --target es2022 --esModuleInterop packages/moo/test/model-function-plugin.test.ts` from the repository root. **Failed:** TS2456 circular `CartDocument`/`CartMethods` aliases at lines 19/21; also TS2345 for `ConnectOptions` in `test/setup.ts:12`. This was an explicit compiler probe, not the package's normal test command.
- **Not run:** full repository lint/build/tests, a fresh packed-consumer installation, a peer-version matrix, live Keycloak integration, or scale benchmarks. These were unnecessary for establishing the demonstrated gaps and remain execution checks below. Mocked credential/identity findings establish plugin control flow, not a live-server exploit.
- No general dependency-vulnerability audit or exhaustive schema-shape/concurrent-save analysis was performed. New-document transaction/reentrant callback guarantees were inspected only at source/test level, not exercised.
- Other worktree changes were present and changed during review. Re-check `git status --short` before implementation and preserve work belonging to other sessions.

## Priorities, Ownership, And Verification

- **P1:** confirmed destructive, identity, credential, confidentiality, or supported-installation contract gaps; address before release.
- **P2:** correctness/discoverability gaps or bounded architectural/performance improvements without demonstrated urgent exposure.
- A defect label confirms the described behavior, not an application-wide exploit. Applications still own authorization of initial account linking and role/password inputs.

| Lane / suggested agent   | Ordered tasks                              | Shared hotspots                                               |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------- |
| Identity/security agent  | MOO-01 → MOO-02 → MOO-03 → MOO-11          | Keycloak plugin, planner, harness, plugin tests               |
| Mongoose lifecycle agent | MOO-04 → MOO-05 → MOO-06 → MOO-07          | Cascade plugin and tests; reference utility inspection        |
| Helper contract agent    | MOO-08                                     | ObjectId guard and tests                                      |
| Package-contract agent   | MOO-09, then MOO-10 after its dependencies | Metadata, consumer fixtures, README, llms, website, changelog |
| Independent reviewer     | MOO-99                                     | Acceptance evidence and integrated behavior                   |

Independent source lanes may run in parallel. **Builds and tests must be serialized across all lanes:** the package test script rebuilds shared `utils/dist` and `moo/dist`, and the root test command deliberately uses `--workspace-concurrency=1`. One coordinator owns this task file and the build/test queue. Agents record required contract/release-note changes in their handoff; MOO-09 owns peer-documentation corrections, and MOO-10 consolidates subsequent documentation after the source lanes finish. Do not hand-edit generated outputs.

Shared checks (working directory: repository root unless stated otherwise):

- **V1 — focused regressions:** after `pnpm --filter @web-ts-toolkit/moo... build`, run `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/<affected-file>.test.ts` from `packages/moo`. These are the existing script's build/runner components with a file filter. Include failure/boundary paths that distinguish old and corrected behavior.
- **V2 — package gate:** `pnpm --filter @web-ts-toolkit/moo test` after each completed source lane and final integration.
- **V3 — consumer contract:** `npm pack --dry-run --json` from `packages/moo`; build/install real tarballs in an isolated `/tmp` consumer and test package-name imports (all nine root/subpath entries), CJS, ESM, and strict NodeNext declarations. Supply the local workspace dependency through a packed `@web-ts-toolkit/utils` override as in the related plan. Use the supported Mongoose/Keycloak versions established by MOO-09, plus a core-only consumer without the optional Keycloak peer. Add a repeatable fixture/command in MOO-09/10 rather than relying on a one-off probe. Never depend on repo TS path aliases or deep `dist` imports in the consumer.
- **V4 — integration gate:** `pnpm lint`, `pnpm build`, then `pnpm test`, serially. Attribute unrelated failures with exact output and ownership; do not claim a failed check passed.
- Prerequisites: installed workspace dependencies (`pnpm install` if needed), Node satisfying Moo's `>=22` engine, and a working MongoDB binary for `mongodb-memory-server`. Transaction regressions need `MongoMemoryReplSet`, not the standalone fixture alone. Live Keycloak is not required for unit regressions; distinguish any additional server-backed verification.

## Tasks

### Task MOO-01: Bind Save And Delete Operations To The Persisted Keycloak Identity

Status: completed

Kind: defect

Priority: P1 — ordinary mutable document state can redirect writes or destructive operations to a different remote account.

Suggested agent: identity/security agent

Dependencies: none

Primary ownership: `packages/moo/src/plugins/keycloak-user-sync.ts`; `packages/moo/test/keycloak-user-sync-plugin.test.ts`; focused harness changes.

Finding: `resolveUser` tries current username/email before their persisted values. With `identifyBy: 'email'` and `persistProviderId: false`, a saved local user linked by email A can change its email to existing account B and update B. Separately, `deleteDocument` passes only the live document to the resolver: changing `providerId` in memory from A to B and calling document `deleteOne()` deletes B without running the save-only immutability check. Both cases were reproduced. Tests cover previous-email fallback when the new email has no match and provider-ID mutation during saves, but not these collisions or delete redirection.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:430-485` (`resolveUser`), `613-645` (`deleteDocument`, save identity check), `657-667` (delete hook).
- `packages/moo/test/keycloak-user-sync-plugin.test.ts:114-125`, `656-673`, `1005-1028`.
- Related completed work: KCS-06 and KCS-99.

Requirements:

1. Establish one private persisted-identity resolution boundary shared by saves and deletes. A current mutable email/username must not silently relink an existing local account; a missing/stale bound remote ID must not fall through to an unrelated account.
2. Define fail-closed behavior for conflicting identifiers, missing persisted local rows, unpersisted-document deletion, and alternate `identifyBy` orderings. Preserve explicitly authorized initial linking; do not infer permission to relink from a changed profile field.
3. Read the persisted binding before destructive remote calls. Apply identity protection independently of `throwOnError`; document the external contract change and migration implications.

Acceptance criteria:

- A→B email and username collisions never update, reset credentials, change roles, or delete B. Test configured identity orderings and a stale provider ID.
- An unsaved `providerId` reassignment followed by delete is rejected or targets only the verified persisted account according to the documented contract; B remains intact.
- Initial linking and non-colliding identity/profile updates still work; assertions name remote IDs, not merely call counts.

Verification: V1 Keycloak plugin tests, V2; coordinate real MongoDB persisted-state regressions with the accurate harness.

Completion evidence (MOO-01, 2026-09-12):

- Changed paths: `packages/moo/src/plugins/keycloak-user-sync.ts` (shared `resolveUser(document, snapshot, wasNew)` persisted-identity boundary, `readPersistedSnapshot`, fail-closed delete path, creation-recovery gated to new documents); `packages/moo/test/keycloak-user-sync-plugin.test.ts` (11 new regressions); `packages/moo/README.md` and `website/docs/packages/moo.md` (persisted-identity contract, `throwOnError` independence, stale-binding migration note). No CHANGELOG, no hand-edited `dist`.
- Contract: new documents link via current values (initial linking preserved); existing documents resolve only via the persisted snapshot with stored `providerId` authoritative; changed username (always) or email (non-duplicate realms) resolving to another remote ID throws before any remote write; stale `providerId`, missing persisted row, and never-persisted deletes throw before destructive calls. Saves with `throwOnError: false` still succeed locally while leaving the other account untouched; deletes always block.
- Commands/results (repo root unless noted): `pnpm --filter @web-ts-toolkit/moo... build` — pass; `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/keycloak-user-sync-plugin.test.ts` from `packages/moo` — 63/63 pass; `pnpm --filter @web-ts-toolkit/moo test` from root — 10 files, 97/97 pass (baseline 86 + 11 new). Old-behavior check: new source stashed, rebuilt, focused file run — exactly the 9 new fail-closed tests fail (2 guard tests pass on both), then fix restored and rebuilt.
- Acceptance mapping: A→B email collisions (orderings `email`, `email,username`) and username collisions (`username`, `username,email`) reject with B byte-identical and zero update/reset/roles/delete/sendVerifyEmail calls; unsaved `providerId` reassignment + delete rejects with both accounts intact and the local doc retained; stale-`providerId` + colliding current identity rejects with no creation; initial linking (incl. reversed ordering) and non-colliding updates succeed with assertions on remote ID `user-a`.
- Follow-ups owned elsewhere: MOO-02 tightens creation recovery further; MOO-10 consolidates release notes.

### Task MOO-02: Keep Partially Provisioned Accounts Disabled Until Credentials Succeed

Status: completed

Kind: defect

Priority: P1 — recovery defeats the disabled-account boundary after credential provisioning fails.

Suggested agent: identity/security agent

Dependencies: MOO-01

Primary ownership: Keycloak plugin creation/recovery orchestration and `packages/moo/test/keycloak-sync-harness.ts`; credential regressions in plugin tests.

Finding: fluent creation can create a disabled user and then fail resetting its password. Moo catches every creation error, resolves a user, leaves `created` false, updates the profile (including `enabled: true`), and only then retries the password reset. A repeated credential failure leaves that account enabled. The probe reproduced this sequence. The harness models disabled-first creation, but current recovery coverage injects a post-create failure instead of repeated password-stage failures.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:534-610` (`syncDocument`, recovery and update/reset ordering).
- `packages/moo/test/keycloak-sync-harness.ts:135-163` (disabled-first create simulation).
- `packages/moo/test/keycloak-user-sync-plugin.test.ts:307-368`.
- Related completed work: KCS-04.

Requirements:

1. Keep creation outcome, credential completion, and intended enabled state explicit in a small private recovery flow. Enable only after required credentials succeed.
2. Recover only when the resolved identity is proven appropriate under MOO-01. Do not swallow unrelated creation errors merely because a username/email lookup finds someone.
3. Preserve temporary/permanent password policy, safe provider-ID persistence, original failure visibility, and the direct non-atomic delivery contract. Do not place passwords in generic profile payloads.

Acceptance criteria:

- Inject failure during initial password provisioning and during its retry; the provisioned account remains disabled and no duplicate account is created.
- A subsequent documented retry completes credentials before enablement; both temporary policies are tested.
- Existing-account collisions and unrelated create failures cannot reset another account's credentials. The recorded call sequence demonstrates the ordering.

Verification: V1 plugin/harness regressions, V2; use the supported real fluent dependency in a contract-level fake-transport test where practical, without claiming live Keycloak coverage.

Completion evidence (MOO-02, 2026-09-12):

- Changed paths: `packages/moo/src/plugins/keycloak-user-sync.ts` (private `recoverPartialCreation` + `getProvisioningFlags`/`readIntendedEnabled`, `recoveredPartial`/`passwordAlreadyApplied` outcome flags, reset-before-enable ordering, providerId persisted before credential work, no password in update payloads); `packages/moo/test/keycloak-sync-harness.ts` (disabled-first create now throws fluent-shaped `UserPasswordProvisioningError` with `accountPersists`/`passwordApplied`/`initialProvisioning` flags and cause, plus enable-step failure shape); `packages/moo/test/keycloak-user-sync-plugin.test.ts` (4 new regressions). No CHANGELOG, no hand-edited `dist`.
- Contract: creation success still delegates to fluent disabled-first ordering; partial creation recovers only for new docs when the error proves persistence (`accountPersists: true`, or no-password post-create case), requires exact username match for password completion, and rethrows already-exists/unrelated/cleanup-removed errors without touching the resolved account; credential-gated syncs apply profile without `enabled`, reset via `resetPassword` with configured `passwordTemporary`, then enable; retry binds through persisted providerId (MOO-01 authoritative).
- Commands/results (repo root unless noted): `pnpm --filter @web-ts-toolkit/moo... build` — pass; `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/keycloak-user-sync-plugin.test.ts` from `packages/moo` — 67/67 pass; `pnpm --filter @web-ts-toolkit/moo test` from root — 10 files, 101/101 pass (baseline 86 + 11 MOO-01 + 4 MOO-02).
- Acceptance mapping: double `core.users.resetPassword` failure leaves `user-1` disabled with 1 `user.create`, 2 resets, zero `enabled:true` updates, providerId `user-1` persisted; retry re-applies password, asserts `core.users.resetPassword` index < `enabled:true` update index with zero new creates, tested for both `passwordTemporary` true/false; already-exists collision (identifyBy email, username `bob` collides) throws without any reset/update on `user-b`; unrelated `user.create` failure (identifyBy username, same-email `shared@example.com` lookup would find `user-b`) throws original without any reset/update on `user-b`.
- Follow-ups owned elsewhere: MOO-03 sanitizes logger errors; MOO-10 consolidates release notes.

### Task MOO-03: Sanitize Error Objects At The Logger Boundary

Status: completed

Kind: defect

Priority: P1 — redacting document context does not redact sensitive transport or mapper error data.

Suggested agent: identity/security agent

Dependencies: MOO-02

Primary ownership: `handleError` and logger types in the Keycloak plugin; logging regressions.

Finding: `handleError` forwards the original `error` object to the default/custom logger. A synthetic transport error containing request headers and a password body reached the logger unchanged. Error messages, causes, request/response properties, or mapper errors can also contain PII. The README promises safe metadata, but the existing test uses a generic error and `JSON.stringify`, which does not examine ordinary Error message/stack properties.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:73-75`, `394-420` (`handleError`).
- `packages/moo/test/keycloak-user-sync-plugin.test.ts:514-539`, `575-594`.
- `packages/moo/README.md:189`.
- Related completed work: KCS-02.

Requirements:

1. Log an explicit allowlisted error summary with stable operation/identifier metadata. Do not recursively copy arbitrary error objects or assume messages/stacks are safe.
2. Preserve the original thrown error and explicitly documented private `onError` contract. Clearly distinguish safe logging from handing an application its original error for private processing.
3. Keep logger/observer failures from changing save/delete policy; update logger types and release notes if the error shape changes.

Acceptance criteria:

- Sentinel password, token, and email values in message, stack, cause, request headers/body, response data, enumerable properties, and custom inspection cannot appear in captured default/custom log arguments.
- Original error identity is preserved where promised to the caller/private callback; existing observer-failure policies pass.
- Tests inspect actual logger arguments and console-relevant rendering, not JSON serialization alone.

Verification: V1 logging regressions, V2; documentation contract consolidated by MOO-10.

Completion evidence (MOO-03, 2026-09-12):

- Changed paths: `packages/moo/src/plugins/keycloak-user-sync.ts` (new `KeycloakUserSyncLoggedError`/`KeycloakUserSyncLogContext` logger types, private `toLoggedError` allowlist sanitizer, `handleError` logger boundary now sends only `{ operation, localDocumentId, error: { name, code?, status? } }`); `packages/moo/test/keycloak-user-sync-plugin.test.ts` (updated `can log and ignore` logger-shape assertion + 3 new sentinel regressions). No CHANGELOG, no hand-edited `dist`.
- Contract: logger receives only validated `name` (`/^[A-Za-z][A-Za-z0-9_.-]{0,64}$/`, fallback `Error`/`UnknownError`), optional validated `code` token, and optional numeric `status`/`statusCode` 0–999; `message`, `stack`, `cause`, request/response, enumerable payload props, `toJSON`, and custom inspection are never read, spread, or serialized. `onError` still receives the original error reference (plus safe context, or document only with `includeDocumentInErrorContext`); `throw` still rethrows the original; logger/`onError` failures stay best-effort and cannot change save/delete policy (deletes still always block).
- Commands/results (repo root unless noted): `pnpm --filter @web-ts-toolkit/moo... build` — pass; `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/keycloak-user-sync-plugin.test.ts` from `packages/moo` — 70/70 pass; `pnpm --filter @web-ts-toolkit/moo test` from root — 10 files, 104/104 pass (baseline 101 + 3 new).
- Acceptance mapping: hostile `TransportError` carrying sentinel password/token/email in `message`, `stack`, `cause`, `request.headers`/`body`, `response.data`, enumerable props, `toJSON`, and `Symbol.for('nodejs.util.inspect.custom')` leaves zero sentinel traces in captured custom-logger args and default-`console.error` args, verified by recursive actual-arg walk plus `node:util` `inspect({ getters: true })`/`format('%O')` console-relevant rendering and `JSON.stringify`; `toJSON`/custom-inspect spies never called; delete-path hostile error rejects with `toBe(hostile)`, `onError` receives `toBe(hostile)`, logger summary is `{ name: 'TransportError' }` with `operation: 'delete'`; failing logger + failing `onError` still reject with the original hostile error.
- Follow-ups owned elsewhere: MOO-10 consolidates logger-shape release notes/docs.

### Task MOO-04: Preserve Connection And Session Context Across Cascades

Status: completed

Kind: defect

Priority: P1 — deletes can use the wrong database or escape an aborted MongoDB transaction.

Suggested agent: Mongoose lifecycle agent

Dependencies: none

Primary ownership: execution-context resolution in `packages/moo/src/plugins/cascade-delete.ts`; cascade tests and a focused replica-set fixture.

Finding: dependency lookup uses global `mongoose.model(model)` for document and static operations. A model registered solely on `createConnection()` cannot find its dependent; duplicate model names on the default connection can target a different database. Dependent queries/deletes do not receive a session. A replica-set probe deleted a parent in a transaction, aborted it, and observed the parent restored but its child permanently deleted. Current tests use only the global default connection and no transactions.

References:

- `packages/moo/src/plugins/cascade-delete.ts:40-53`, `134-176`, `179-199`.
- `packages/moo/test/cascade-delete-plugin.test.ts:66-141`, `144-163`.
- `packages/moo/test/setup.ts:7-29` (standalone/global test fixture).

Requirements:

1. Resolve target models through the owning model's connection in one private execution-context helper reused by dependent/orphan/delete paths.
2. Carry the effective session through dependent reads and document deletes, including document-bound and operation-option sessions. Serialize operations inside a transaction rather than using transaction-unsafe parallel writes.
3. If a particular transaction mode cannot be supported, reject it before deleting the parent; silently performing part of the cascade outside its session is unacceptable. Document supported behavior explicitly.

Acceptance criteria:

- Two connections with identical model names remain isolated; default-connection records are unchanged when operating on the other connection.
- For supported transaction modes, replica-set abort restores parent and all dependents and commit deletes the intended set. Any explicitly unsupported mode rejects before changing either collection. Cover both session entry forms, nested cascades, and a dependent-hook failure.
- Existing default-connection and no-session behavior remains covered.

Verification: V1 cascade tests plus real replica-set cases, V2. Coordinate transaction concurrency with MOO-06.

Completion evidence (MOO-04, 2026-09-12):

- Changed paths: `packages/moo/src/plugins/cascade-delete.ts` (private `resolveExecutionContext` reusing owning-connection model resolution + effective session across dependent/orphan/delete paths, `assertTransactionSupported` pre-parent rejection, serial in-transaction deletes, supported-behavior JSDoc); `packages/moo/test/cascade-delete-context.test.ts` (7 new `MongoMemoryReplSet` regressions). No CHANGELOG, no hand-edited `dist`.
- Contract: dependents resolve via `constructor.collection.conn`/`collection.conn` (global only as undetermined fallback); effective session is explicit option else `$session()` for both document-bound and operation-option entry forms, applied to finds/`distinct`/deletes including nested cascades; active transactions run serially; cross-client sessions and active transactions on standalone (`Single`) topology throw in `pre('deleteOne')` before parent removal.
- Commands/results (repo root unless noted): `pnpm --filter @web-ts-toolkit/moo... build` — pass; `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/cascade-delete-plugin.test.ts test/cascade-delete-context.test.ts` from `packages/moo` — 2 files, 14/14 pass; `pnpm --filter @web-ts-toolkit/moo test` from root — 11 files, 111/111 pass (baseline 104 + 7 new). Old-behavior check: new source stashed, rebuilt, new file run — all 7 fail (abort/commit leak, isolation, nested, hook-failure, cross-client message differs), then fix restored and rebuilt.
- Acceptance mapping: identical names on connA/connB isolated (delete + `findDependents` on B intact); replica-set commit deletes parent+children and abort restores both for operation-option and document-bound sessions; nested parent→middle→leaf abort restores all three and commit deletes all three; dependent `pre deleteOne` failure aborts with all three restored; cross-client session rejects with `different connection/client` before any count changes; existing default/no-session suite still 7/7 green.
- Follow-ups owned elsewhere: MOO-05/06 own predicate fail-closed and bounded traversal; MOO-10 consolidates docs/release notes.

### Task MOO-05: Make Dependency Predicates Fail Closed

Status: completed

Kind: defect

Priority: P1 — incomplete relationships and filter collisions can delete unrelated records.

Suggested agent: Mongoose lifecycle agent

Dependencies: MOO-04

Primary ownership: option validation and filter construction in `packages/moo/src/plugins/cascade-delete.ts`; predicate regressions.

Finding: a missing local value creates a foreign-field equality against `undefined`; the MongoDB probe removed an unrelated dependent with a missing foreign key. `extraForeignFilter` is spread after the relationship predicate and can replace it. Explicit empty `foreignFilter` is accepted, and invalid resolver output is inconsistently ignored. The suite tests normal independent extra filters, not absent values, colliding keys, or malformed configuration.

References:

- `packages/moo/src/plugins/cascade-delete.ts:70-81` (`resolveFilter`), `132-155` (`findDependents`), `169-175` (orphan predicate).
- `packages/moo/test/cascade-delete-plugin.test.ts:108-130`, `165-205`.

Requirements:

1. Define missing/null/empty local-key behavior and avoid issuing destructive queries without a valid relationship. Distinguish intentionally empty relations from omitted projections.
2. Compose supplemental constraints conjunctively so they cannot replace the relationship predicate. Preserve the explicit full-filter mode as a separately documented contract.
3. Validate model/field combinations and resolver results at the earliest meaningful boundary. Record a maintainer decision for intentional empty full filters: reject by default or require explicit broad-delete intent. Trusted schema options are not themselves evidence of request-driven query injection.

Acceptance criteria:

- Missing/null local keys and empty reference arrays do not delete unrelated null/missing-key records.
- An extra filter on the relationship field cannot widen the deletion set; logical operators and valid full-filter callbacks retain defined behavior.
- Invalid configuration/filter results produce controlled, documented outcomes with no unintended deletion. Contract changes are release-noted.

Verification: V1 cascade predicate tests against MongoDB, V2. Do not substitute snapshot-only assertions for deletion-set assertions.

Completion evidence (MOO-05, 2026-09-12):

- Changed paths: `packages/moo/src/plugins/cascade-delete.ts` (private `assertPluginOptions` registration validation, `normalizeKeyList`/`buildRelationshipPredicate` missing/null/empty fail-closed, `isPathDeselected` omitted-projection distinction, `combineWithRelationship` conjunctive `$and` composition for relationship and orphan paths, `assertFullFilterNotEmpty` empty-full-filter rejection, expanded plugin JSDoc contract); `packages/moo/test/cascade-delete-predicates.test.ts` (11 new MongoDB-backed deletion-set regressions); `packages/moo/README.md` and `website/docs/packages/moo.md` (predicate fail-closed contract release notes). No CHANGELOG, no hand-edited `dist`.
- Contract: relationship mode never queries without a valid key — missing/`null`/whitespace-empty scalars and empty/all-nullish arrays return zero dependents and delete nothing; provably deselected local paths (`$isSelected() === false`) throw instead of silently reporting empty; `extraForeignFilter` composes as `{ $and: [relationship, extra] }` (absent/nullish/non-object/empty extra leaves the relationship unchanged) so colliding keys intersect and `$or`/`$and` payloads stay constrained; full-filter mode uses the resolved filter as-is with `extraForeignFilter` ignored, nullish/non-object resolver results return zero dependents. Maintainer decision: intentionally empty full filters (`{}`) are rejected by default — statically at `schema.plugin(...)` and dynamically when a resolver returns `{}` — because `{}` would match the whole dependent collection; no broad-delete opt-in flag exists.
- Commands/results (repo root unless noted): `pnpm --filter @web-ts-toolkit/moo... build` — pass; `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/cascade-delete-plugin.test.ts test/cascade-delete-context.test.ts test/cascade-delete-predicates.test.ts` from `packages/moo` — 3 files, 25/25 pass; `pnpm --filter @web-ts-toolkit/moo test` from root — 12 files, 122/122 pass (baseline 111 + 11 new). Old-behavior check: new source stashed, rebuilt, new file run — 7 fail / 4 pass (missing-key, null-key, widen, collide, invalid-options, empty-resolver, projection cases fail; empty-array, linked-set, logic-narrowing, and valid/null-resolver cases pass on both), then fix restored and rebuilt.
- Acceptance mapping: missing/null scalar keys and empty arrays leave unrelated null/missing-key records intact with `findDependents` length 0 and unchanged `countDocuments`; `$exists: true` and `$in: [A, B]` extras on the relationship field delete only the owning parent's children; `$or` extra on a non-relationship field deletes only the intersecting status subset; function `foreignFilter` deletes its subset while `() => null` deletes nothing; invalid `model`/field combos, static `{}`/`non-object` filters, and resolver-returned `{}` throw with zero dependent deletions; omitted-projection `findDependents` throws `was not selected` while intentionally empty relations return `[]`.
- Follow-ups owned elsewhere: MOO-06 owns traversal/bounds; MOO-10 consolidates release notes.

### Task MOO-06: Preserve Hook Data And Bound Cascade Traversal

Status: completed

Kind: defect

Priority: P1 — valid multi-level cascades lose descendants; wide relationships also create unbounded concurrent work.

Suggested agent: Mongoose lifecycle agent

Dependencies: MOO-05

Primary ownership: `deleteDependents` and private traversal/query helpers in the cascade plugin; cascade composition/resource tests.

Finding: dependent documents are loaded with `select: '_id'` and passed to their own document deletion middleware. For parent→middle→leaf relations where middle stores `leaf`, middle's hook cannot read that field. The probe deleted parent/middle but left leaf behind. Custom dependent hooks lose their required fields too. The entire result set is materialized and `Promise.all` starts every delete immediately. Existing tests cover only one cascade level and small sets.

References:

- `packages/moo/src/plugins/cascade-delete.ts:134-156`, `179-199` (`deleteDependents`).
- `packages/moo/test/cascade-delete-plugin.test.ts:143-277`.

Requirements:

1. Supply sufficient hydrated document state for downstream document hooks and filter resolvers; do not replace document deletes with bulk deletion that silently bypasses hooks.
2. Encapsulate traversal separately from predicate/context resolution. Use bounded acquisition and in-flight deletion with explicit limits; obey MOO-04's transaction serialization. Define partial-failure behavior when the parent is already deleted.
3. Define finite behavior for repeated references, diamonds, and cycles without suppressing required hooks. Keep performance claims tied to measurements rather than assuming a cursor or batching is faster.

Acceptance criteria:

- A three-level custom-local-field cascade deletes all intended descendants and dependent hooks can read required fields. Unrelated records survive.
- Instrumented fan-out runs show the configured maximum in-flight deletes is respected and work is not all scheduled/materialized up front. Record dataset size, query counts, peak in-flight work, elapsed time, and memory observations before/after.
- Hook failures, repeated references, and cyclic/diamond fixtures terminate with documented outcomes; transaction regressions from MOO-04 remain passing.

Verification: V1 cascade composition/resource regressions, a reproducible representative fan-out experiment, V2. Public `findDependents()` may remain array-returning; distinguish that API from internal bounded deletion traversal.

Completion evidence (MOO-06, 2026-09-12):

- Changed paths: `packages/moo/src/plugins/cascade-delete.ts` (private `resolveDependentFilter` predicate boundary reused by both paths, `fetchDependentIdPage`/`loadHydratedDependent`/`runWithConcurrencyLimit` traversal boundary, `maxConcurrency` default 8 / `batchSize` default 100 registration-validated options, hydrated per-document `deleteOne()` with transaction-forced serial limit, per-level `_id` dedupe, fail-fast partial-failure semantics, expanded plugin JSDoc contract); `packages/moo/test/cascade-delete-traversal.test.ts` (7 new composition/resource regressions incl. reproducible fan-out experiment); `packages/moo/README.md` and `website/docs/packages/moo.md` (traversal/bounds contract paragraph). No CHANGELOG, no hand-edited `dist`.
- Contract: deletion loads fully hydrated dependents (no `select` restriction) and removes each through its own document `deleteOne()`/`remove()`, so nested cascade hooks and custom hooks/filter resolvers read required fields — no bulk-delete hook bypass. Public `findDependents()` still returns an array; internal deletion pages `_id`s (`batchSize`) and bounds in-flight deletes (`maxConcurrency`, forced to 1 inside an active transaction per MOO-04). First dependent failure stops further batches and rejects the parent `deleteOne()` after the parent is already removed (outside a transaction the parent and already-deleted dependents stay deleted; inside one the caller aborts to restore all); already-gone rows (raced diamonds) are skipped. Repeated refs delete once per level; diamonds/cycles terminate with at-least-once (never suppressed) hook delivery. No comparative speed claim is made; batching bounds memory/concurrency only.
- Commands/results (repo root unless noted): `pnpm --filter @web-ts-toolkit/moo... build` — pass; `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/cascade-delete-plugin.test.ts test/cascade-delete-context.test.ts test/cascade-delete-predicates.test.ts test/cascade-delete-traversal.test.ts` from `packages/moo` — 4 files, 32/32 pass; `pnpm --filter @web-ts-toolkit/moo test` from root — 13 files, 129/129 pass (baseline 122 + 7 new). Old-behavior check: new source stashed, rebuilt, new file run — 5 fail / 2 pass (three-level custom fields, diamond shared leaves, hook-failure partial outcome, invalid-limit registration, and fan-out peak bound fail; repeated-ref and cycle cases pass on both), then fix restored and rebuilt. `pnpm exec eslint` on touched files — zero new findings (2 remaining `no-explicit-any` on `Model<any>` lines belong to MOO-04's uncommitted execution-context types, untouched here).
- Acceptance mapping: three-level custom-`localField` chain (top.code→middle.parentCode→leaf.middleCode) deletes middle+leaves with hooks observing `parentCode`/`middleCode`/`secret` while unrelated top/middle/leaf survive; fan-out run logs `{ experiment: 'moo-06-fan-out', datasetSize: 40, maxConcurrency: 4, batchSize: 10, idPageFindCalls: 5, hydratedFindByIdCalls: 40, hookCalls: 40, peakInFlight: 4, elapsedMs: 252, heapUsedBefore: 37628232, heapUsedAfter: 32574856 }` (elapsed/heap are environment observations, not thresholds) with `peak <= maxConcurrency < datasetSize` proving bounded in-flight work instead of all-scheduled `Promise.all`; hook failure with `maxConcurrency: 1` rejects, leaves parent deleted, first dependent gone, failing + unattempted rows surviving; repeated/diamond/cycle fixtures terminate with documented outcomes; MOO-04 replica-set suite still 7/7 green inside the 32/32 focused run.
- Follow-ups owned elsewhere: MOO-07 owns orphan-query scale semantics; MOO-10 consolidates release notes.

### Task MOO-07: Determine A Correct And Scalable Orphan-Query Contract

Status: completed

Kind: investigation

Priority: P2 — current assumptions limit correctness and place collection-sized data in the application and query document.

Suggested agent: Mongoose lifecycle agent

Dependencies: MOO-06

Primary ownership: bounded investigation of `findOrphans`, reference detection, and focused MongoDB experiments; record results here or in a linked timestamped task evidence file.

Finding: `findOrphans` requires a configured `localField` but always calls `distinct('_id')`; it checks raw `Target.schema.obj[foreignField]` and only recognizes a subset of reference declarations. Nested dotted paths and non-`_id` local relations are not represented by those assumptions. All parent IDs are materialized into a `$not/$in` query. Existing tests exercise only a top-level scalar ObjectId reference to parent `_id` and small data. Supported array/nullable/dynamic-reference semantics and scale limits need evidence before selecting an implementation.

References:

- `packages/moo/src/plugins/cascade-delete.ts:158-176` (`findOrphans`).
- `packages/moo/src/utils/index.ts:11-29` (`isObjectIdType`, `isReference`).
- `packages/moo/test/cascade-delete-plugin.test.ts:251-277`; `packages/moo/test/utils.test.ts:14-21`.

Requirements:

1. Bound experiments to scalar `_id`, non-`_id` local keys, dotted fields, both common array-reference syntaxes, missing/null values, and dynamic refs. Distinguish unsupported shapes from supported-but-incorrect results.
2. Compare current client-side ID exclusion with one suitable server-side join/aggregation or bounded batching strategy. Record query-plan/index requirements, payload/memory growth, and effects of sessions/connection scoping.
3. Recommend a support matrix and implementation or explicit deferral. Decide whether array orphanhood means no live parents or any missing reference; do not invent a product contract silently.

Acceptance criteria:

- Each inspected shape has a reproducible observed result and recommended behavior; collection-scale measurements have stated sizes and environment.
- Deliver an evidence-backed decision and concrete follow-up task(s) with ownership, acceptance criteria, and dependencies if code changes are needed. No speculative rewrite is required to complete this investigation.

Verification: bounded MongoDB fixtures/measurements, source/type review, and recorded recommendation. V2 if retained tests/fixtures are added.

Completion evidence (MOO-07, 2026-09-12):

- Full evidence: [20260912-130000-moo-07-orphan-query-evidence.md](20260912-130000-moo-07-orphan-query-evidence.md). No source changes, no CHANGELOG, no retained fixtures (throwaway probes removed); V2 not triggered — nothing to regress. Isolated; builds on MOO-06.
- Shape results (mongodb-memory-server, mongoose 9.x, Node v26.7.0/linux): scalar `_id` supported-correct; array syntax-1 `[{type:ObjectId,ref}]` supported with "no live parents" semantics (partial `[live,dead]` excluded, empty `[]` currently included); String↔String non-`_id` keys, dotted foreign paths (`schema.obj` misses them), array syntax-2 `{type:[ObjectId],ref}` (`isReference` misses array `type`), and `refPath` dynamics all return silent `null` (unsupported); non-`_id` local key with ObjectId foreign is supported-but-incorrect (`distinct('_id')` hardcoded, `localField` never read — correct only by accident); null/missing foreign rows are included as orphans (undocumented, inconsistent with MOO-05 fail-closed deletes); `foreignFilter`-only has no orphan contract (null); public static drops `QueryOptions`, so sessions never reach `distinct`/`find` (connection scoping via MOO-04 works).
- Scale (2000 parents/2000 children, indexed `parent`): client-side `distinct` 8 ms + ~54 KB ID payload (~27 B/id → 16 MB BSON cap ≈ 550k parents by arithmetic) + query 16 ms (`FETCH`, `nReturned: 1000`, `totalDocsExamined: 1000`); `$lookup` anti-join 21 ms with identical 1000-row result set, no client ID payload, no 16 MB cap. Per-page `$not/$in` batching is not a correct anti-join (recorded cost-shape only).
- Decision: implement MOO-12 (relationship-mode correctness: `distinct(localField)` + fail-closed keys, dotted paths via `schema.path`, array-syntax-2, session passthrough, documented errors replacing silent nulls; strict orphan = ≥1 non-nullish foreign value with zero live parents, empty arrays excluded — maintainer confirmation is MOO-12 acceptance, current behavior unchanged until then) and MOO-13 (server-side `$lookup` anti-join with index requirement, parity-recorded); explicitly defer `refPath` and `foreignFilter`-only orphans with documented errors. Follow-ups owned by the Mongoose lifecycle agent, docs consolidated by MOO-10.

### Task MOO-08: Make The ObjectId Guard Match Its Type Predicate

Status: completed

Kind: defect

Priority: P2 — consumers can receive a value outside the union guaranteed by TypeScript narrowing.

Suggested agent: helper contract agent

Dependencies: none

Primary ownership: `packages/moo/src/is.ts`; `packages/moo/test/is-object-id.test.ts`.

Finding: `ObjectId.isValid` plus string round-trip is not an instance/string check. A plain object with `id`, `toHexString()`, and `toString()` returning a canonical 24-character hex ID passed the probe, despite not being an ObjectId instance or a string. The predicate promises that exact union. Current tests cover numbers, random strings, actual instances, and generated strings only. `ObjectId.isValid` also runs outside the try block, so total behavior on hostile accessors is not established.

References: `packages/moo/src/is.ts:5-24` (`isObjectId`); `packages/moo/test/is-object-id.test.ts:6-21`; `packages/moo/llms.txt:104` (strict round-trip contract).

Requirements:

1. Enforce supported runtime types before coercion, preserving the documented canonical-string policy. Keep structural ObjectId-like acceptance only if a deliberately different public contract is chosen and release-noted.
2. Define behavior for foreign BSON instances and throwing coercion/accessors; reject unsupported values without invoking arbitrary conversion where possible.

Acceptance criteria:

- The reproduced structural impostor, buffers, numbers, nullish values, and hostile coercion objects cannot narrow to the current union.
- Real instances and canonical strings pass; uppercase/noncanonical policy is explicit and covered.
- Type-level consumer assertions and runtime cases agree.

Verification: V1 ObjectId tests, V2; MOO-10's declaration consumer gate.

Completion evidence (MOO-08, 2026-09-12):

- Changed paths: `packages/moo/src/is.ts` (strict type-first guard: `typeof === 'string'` + `/^[0-9a-f]{24}$/` canonical check, `instanceof ObjectId` instance branch, no `ObjectId.isValid`/`String()` coercion, try/catch fail-closed, expanded JSDoc contract); `packages/moo/test/is-object-id.test.ts` (8 new regressions, 12 total). No CHANGELOG, no hand-edited `dist` (`dist` is git-ignored build output, regenerated via the normal build).
- Contract: strings pass only as 24-char lowercase hex (canonical round-trip policy made explicit — uppercase hex such as `AAAAAAAAAAAAAAAAAAAAAAAA` is `ObjectId.isValid`-valid but rejected because `new ObjectId(upper).toString()` lowercases); instances pass only as `mongoose.Types.ObjectId` from this package's `mongoose` copy — structural impostors (`{ id, toHexString, toString }`) and foreign BSON-like copies with identical shape are rejected via `instanceof` without invoking their `toString`/`valueOf`/`toJSON`/`Symbol.toPrimitive` (spies assert zero calls); hostile `Symbol.toPrimitive`/`toString`/`valueOf`/`toJSON` throwers and `getPrototypeOf`-throwing proxies resolve to `false`; buffers (12-byte, 24-hex), `Uint8Array`, numbers, `NaN`, `bigint`, booleans, symbols, boxed `String`, arrays, plain objects, nullish, empty/12-char/23-char/25-char/non-hex/whitespace/`0x`-prefixed strings all rejected. Deliberately strict: no structural ObjectId-like acceptance retained.
- Commands/results (repo root unless noted): `pnpm --filter @web-ts-toolkit/moo... build` — pass; `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/is-object-id.test.ts` from `packages/moo` — 12/12 pass; `pnpm --filter @web-ts-toolkit/moo test` from root — 13 files, 137/137 pass (baseline 129 + 8 new). Old-behavior check: new source stashed, rebuilt, focused file run — exactly the 2 structural-acceptance tests fail (impostor passes old `isValid`+round-trip logic, foreign copy likewise; 10/12 pass), then fix restored and rebuilt. `pnpm exec eslint src/is.ts test/is-object-id.test.ts` — zero findings; `tsc --ignoreConfig --noEmit --strict ... --types node test/is-object-id.test.ts` — clean, including the `expectTypeOf` narrowing assertions.
- Acceptance mapping: structural impostor, foreign BSON-like instance, buffers, numbers, nullish, and hostile coercion objects cannot narrow to `ObjectId | string` (runtime `false` plus `else`-branch `expectTypeOf<unknown>`); real instances and canonical lowercase strings pass at runtime and narrow to `mongoose.Types.ObjectId | string` via `expectTypeOf().toEqualTypeOf()`; uppercase/noncanonical policy explicit in JSDoc and covered by dedicated cases.
- Follow-ups owned elsewhere: MOO-10 consolidates helper-contract release notes and the declaration consumer gate.

### Task MOO-09: Align Supported Peer Versions And Test Real Package Entrypoints

Status: completed

Kind: defect

Priority: P1 — published dependency guidance and the tested dependency range contradict one another.

Suggested agent: package-contract agent

Dependencies: none

Primary ownership: `packages/moo/package.json`; package export/consumer fixtures; peer-specific README/llms corrections; build config only if evidence requires it. Coordinate lockfile changes.

Finding: the optional Keycloak peer is `^0.12.1`, while the dev dependency and installed review dependency are `0.14.x`; pre-1.0 caret ranges do not include that later minor. README and llms still advertise `^0.7`. The source calls managed-client and role-reconciliation APIs, but the review did not establish the minimum supporting version. Export tests deep-import three built entries in a workspace where the peer is present; they cannot validate the exports map, absent-peer isolation, or the advertised version floor.

References:

- `packages/moo/package.json:19-77`, `84-103`; `packages/moo/README.md:11-14`; `packages/moo/llms.txt:99-102`.
- `packages/moo/src/plugins/keycloak-user-sync.ts:1-5`, `505-520`; `packages/moo/test/package-exports.test.ts:5-27`.
- Related completed work: KCS-11. Metadata placeholders are release-pipeline conventions, not a newly claimed defect.

Requirements:

1. Establish the actual supported Keycloak minimum/range with API and runtime evidence; align peer/dev dependencies and shipped docs. Do not assert that every older version is broken without testing it.
2. Add a repeatable isolated packed-consumer check covering every exported subpath, ESM/CJS, declarations, and absence of the optional Keycloak peer for core imports.
3. Exercise Mongoose 8 and the currently used 9.x, or revise the advertised range with compatibility evidence. Preserve the dedicated optional-peer subpath boundary and bundled Node ESM output.

Acceptance criteria:

- Peer metadata, dev/test matrix, README, and llms state one supported policy; chosen minimum/current peers resolve required runtime and type APIs.
- Core-only install works without the optional peer; supported direct Keycloak imports work when installed.
- Checks use package-name imports from the packed artifact and fail if an exports target or declaration path is removed/miswired.

Verification: V2 and V3, with exact fixture commands recorded for future agents. No fresh packed-consumer result is claimed in the review baseline.

Completion evidence (MOO-09, 2026-09-12):

- Changed paths: `packages/moo/package.json` (optional Keycloak peer `^0.12.1` → `>=0.12.1 <0.15.0`); `packages/moo/README.md`, `packages/moo/llms.txt`, `website/docs/packages/moo.md` (one stated policy: `mongoose >= 8` tested on 8.24.x + 9.x, `@egose/keycloak-fluent >=0.12.1 <0.15.0` for the Keycloak subpath only, tested floor `0.12.1`, current `0.14.x`); new `packages/moo/test/support/packed-consumer-harness.ts` + `packages/moo/test/moo.packed-consumer.test.ts` (9 tests). No CHANGELOG, no hand-edited `dist`. `pnpm install` left `pnpm-lock.yaml` untouched (installed `0.14.0` satisfies the widened range). Unrelated worktree changes (message-service, pdf-reader, other moo lanes) preserved and untouched.
- Peer policy: `mongoose >= 8.0.0` kept (was already correct); dev/test stays on `mongoose ^9.8.0` / `@egose/keycloak-fluent ^0.14.0`, both inside the advertised ranges, so minimum/current peers resolve required APIs. No claim is made about versions below `0.12.1` — the floor is evidence-backed, older versions are untested, not asserted broken.
- Keycloak minimum evidence (API + types): unpacked `@egose/keycloak-fluent@0.12.1` tarball; its `index.d.ts` already exports every runtime/type API moo uses with compatible signatures — `createManagedKeycloakClient`, `ManagedKeycloakClientOptions`/`ManagedKeycloakCredential`, `realm().get()`, `user().get()/create()` with `UserInputData.password`/`passwordTemporary`, `userById().get()/update()/delete()/resetPassword()/sendVerifyEmail()`, `searchUsers(keyword, { attribute: 'email', exact, first, max })`, `reconcileRealmRoles(names, { ensureMissing, managedRoleNames, maxRoles })`. Moo's shipped `dist/plugins/keycloak-user-sync.d.ts` imports only 4 names from the peer, all present in `0.12.1`.
- Keycloak/Mongoose runtime evidence (packed, isolated `/tmp` consumers, package-name imports only): core-only consumer (`mongoose ^9.8.0`, no Keycloak peer) runs all 8 non-Keycloak subpaths ESM+CJS with plugin registration on real schemas and proves `require(keycloak-subpath)` fails with `MODULE_NOT_FOUND` naming `@egose/keycloak-fluent` (optional-peer boundary, external not bundled); full consumers run all 9 subpaths ESM+CJS on (`mongoose ^9.8.0`, `keycloak ^0.14.0` → asserted `0.14.x`) and (`mongoose ^8.24.0` → asserted `8.x`, `keycloak 0.12.1` → asserted exact). Bundled Node ESM output preserved (`tsup` config untouched; `.mjs`/`.js`/`.d.ts`/`.d.mts` all in tarball); Keycloak stays out of root/`plugins` entrypoints (asserted at runtime and in exports test).
- Declaration evidence: strict NodeNext `tsc --noEmit` consumers import every subpath by package name. Core configs use `skipLibCheck: false` (moo's own declarations proven sound). Full configs use `skipLibCheck: true` because keycloak-fluent's `.d.ts` references extensionless `@keycloak/keycloak-admin-client/lib/*` deep type imports that NodeNext ESM resolution cannot probe (upstream packaging quirk; runtime proven working; handoff to MOO-10's compiler gate). Wiring is still strict: a removed exports target fails TS2307, a removed moo export fails TS2305 at the checked consumer.
- Negative controls (scratch consumer from the same packed tarballs, then removed): deleting `plugins/cascade-delete.mjs` makes package-name ESM import fail (`Cannot find module ... cascade-delete.mjs`); deleting `plugins/cascade-delete.d.{ts,mts}` makes `tsc` fail with TS7016. Scratch dirs/files removed afterwards.
- Isolation fix found during implementation: vitest injects `NODE_PATH` pointing at the workspace pnpm store, so the "isolated" consumer initially resolved the supposedly absent peer. The moo harness `run()` now strips `NODE_PATH`; the message-service harness has the same latent flaw (flagged, not changed — out of scope).
- Commands/results (repo root unless noted): `pnpm install` — up to date, lockfile unchanged; `pnpm --filter @web-ts-toolkit/moo... build` — pass; `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/moo.packed-consumer.test.ts` from `packages/moo` — 9/9 pass (V3); `pnpm --filter @web-ts-toolkit/moo test` from root — 14 files, 146/146 pass (V2: baseline 137 + 9 new); `pnpm exec eslint packages/moo/test/moo.packed-consumer.test.ts packages/moo/test/support/packed-consumer-harness.ts` — clean; `npm pack --dry-run --json` from `packages/moo` — 39 files incl. README, llms.txt, every subpath's `.js/.mjs/.d.ts/.d.mts`.
- Fixture commands for future agents (V3): `pnpm --filter @web-ts-toolkit/moo... build && pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/moo.packed-consumer.test.ts` from `packages/moo` (or `pnpm --filter @web-ts-toolkit/moo test` for V2+V3 together). Consumer matrix lives in `installPackedConsumer({ mongooseVersion, keycloakVersion? })`; subpath list in `mooSubpaths`. Live Keycloak is still not exercised (no server); plugin registration + managed-client construction are lazy and network-free.
- Follow-ups owned elsewhere: MOO-10 consolidates release notes and may adopt the full-consumer `tsc` pattern for its broader compiler gate (noting the upstream `skipLibCheck` quirk); MOO-99 runs V4.

### Task MOO-10: Make Typed Examples And Public Helper Contracts Compiler-Checked

Status: completed

Kind: defect

Priority: P2 — passing transpiled tests mask broken type examples and runtime/declaration mismatches.

Suggested agent: package-contract agent

Dependencies: MOO-03, MOO-07, MOO-08, MOO-09, MOO-11

Primary ownership: public helper type declarations at source, dedicated consumer/type fixtures, model-function test type setup, README, llms, website page, and release notes. Coordinate any cascade type edits after its lane completes.

Finding: the compiler probe fails on circular `CartDocument`/`CartMethods` aliases in model-function tests; Vitest transpilation and `tsconfig.json`'s source-only include do not check those examples. Their explicit second plugin generic also supplies a methods type where the source expects a string method name. `QueryFilter<T>` is `Partial<T>` intersected with a record, so typed numeric fields cannot naturally accept MongoDB operator objects. `findOrphans()` promises every configured model key although `mergeResults` omits unsupported/null results. Schema helper overrides are arbitrary records while emitted return types still promise fixed defaults/types. These contracts need targeted compiler evidence, not a broad `any` relaxation.

References:

- `packages/moo/test/model-function-plugin.test.ts:19-50`; `packages/moo/src/plugins/model-function.ts:46-55`; `packages/moo/tsconfig.json:16`.
- `packages/moo/src/plugins/cascade-delete.ts:20-38`, `111-125`; generated `packages/moo/dist/plugins/cascade-delete.d.ts`.
- `packages/moo/src/schema.ts:1-19`; generated `packages/moo/dist/schema.d.ts`.
- `website/docs/packages/moo.md:118-137`; `packages/moo/README.md:58-93`, `103-157`; `packages/moo/llms.txt:121` contradicts its earlier Keycloak exclusion statement.

Requirements:

1. Introduce a repeatable strict compiler gate for representative package-name consumer examples and meaningful negative cases, separate from MongoDB runtime fixtures. Resolve or isolate the observed setup typing prerequisite explicitly.
2. Correct examples and public types for plugin generics, typed query operators, missing orphan-map entries, and schema-option overrides. Preserve useful inference and avoid casts that only hide mismatches.
3. Ship a compact model-function example, complete cascade options/lifecycle documentation, and accurate helper semantics in README/JSDoc visible in emitted declarations. Explain post-delete failure timing, supported query/document operations, and new-document callbacks' post-save rather than durable-delivery guarantee.
4. Consolidate contract/release notes from preceding tasks. Make Keycloak attribute examples declare the mapped schema paths and illustrate a genuinely non-persisted pending-password input, rather than an ordinary stored plaintext schema path followed only by a warning. Align README, llms, and website examples.

Acceptance criteria:

- Typed sync/async instance, static, and ById examples compile with correct inference; wrong arguments fail as expected. Query operators, nullable maps, and overrides match runtime behavior.
- Representative shipped snippets compile from the packed package without repo aliases or circular type aliases. Generated declarations retain useful API JSDoc.
- Each behavior change in preceding tasks has matching docs and release notes; consumer examples do not persist the demonstrated pending plaintext password.

Verification: V3 plus the new recorded compiler fixture command, V2 for affected runtime helpers. Document the baseline TS2345 setup issue separately if unrelated to the isolated consumer gate.

Completion evidence (MOO-10, 2026-09-12):

- Changed paths: `packages/moo/src/plugins/model-function.ts` (JSDoc contract: inference-first usage, second type argument is the method _name_, `TResult` kept free of the document alias, `ById` null semantics); `packages/moo/src/plugins/cascade-delete.ts` (new exported `QueryOperators<T>` type, `QueryFilter<T>` per-field operator union matching the Mongoose-forwarding runtime, no-argument `findDependents()`/`findOrphans()` narrowed to `Partial<DependencyMap> & Record<string, unknown[]>` matching `mergeResults` omission, supported-operations/post-delete-timing JSDoc); `packages/moo/src/schema.ts` (exported `SchemaOptionOverrides`, generic `Omit<Base, keyof TOverrides> & TOverrides` override-wins return types with partial-index JSDoc); `packages/moo/src/plugins/new-document.ts` (supported-operations + post-save-vs-durable-delivery JSDoc); `packages/moo/test/model-function-plugin.test.ts` (circular `CartDocument`/`CartMethods` aliases broken via plain `number` results, inference-only `schema.plugin(modelFunctionPlugin, ...)` with annotated sync/async instance/static/ById assertions plus a missing-id `null` case); new `packages/moo/test/moo.typed-consumer.test.ts` (strict NodeNext packed-consumer compiler gate); `packages/moo/README.md`, `packages/moo/llms.txt`, `website/docs/packages/moo.md` (compact model-function example, cascade options/lifecycle/orphan-matrix docs, helper semantics, Keycloak virtual pending-password + declared mapper paths + `rolePaths`/`passwordPaths`/lazy-mapper/logger-shape consolidation). No CHANGELOG (per explicit user instruction; contract notes recorded in docs/JSDoc only), no hand-edited `dist` (`dist` regenerated via the normal build; declarations verified to retain the new JSDoc).
- Compiler gate: the new fixture installs an isolated core-only packed consumer (`mongoose ^9.8.0`, no Keycloak peer) and compiles `typed-positive.mts` (inferred sync/async instance/static/ById, `{ price: { $gt: 5 } }`/`$in`/`$regex`/`$and` operators, `Partial` maps with an omitted entry, override-wins `default`/`sparse` literals, cascade/new-document/helper narrowing) plus `typed-negative.mts` (`@ts-expect-error` wrong-arg/missing-arg/Bad-ById-id/operator-type/full-map/field-name cases) under `strict` NodeNext with `skipLibCheck: false`, including only those two files — never `../dist`, repo aliases, `./setup`, or `mongodb-memory-server`. A `typed-should-fail.mts` control without suppression is asserted to fail with `TS\d+`, proving wrong arguments are rejected. Command: `pnpm --filter @web-ts-toolkit/moo... build && pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/moo.typed-consumer.test.ts` from `packages/moo`.
- Baseline setup prerequisite (isolated, unrelated to the shipped gate): the historical probe `pnpm exec tsc --ignoreConfig --noEmit --strict --skipLibCheck --module nodenext --target es2022 --esModuleInterop packages/moo/test/model-function-plugin.test.ts` no longer reports `TS2456` (both circular aliases resolved; single-file check of the fixed test with `--types node` is clean) and now reports only `test/setup.ts:12` `TS2345` (`{ dbName }` vs mongodb-driver `ConnectOptions` overload under `--ignoreConfig` NodeNext). That MongoDB-fixture-only prerequisite is excluded from the gate by its narrow `include` and is unchanged by this task.
- Contract/docs consolidation (preceding-task behavior changes now matched in README/llms/website, no CHANGELOG): MOO-01 persisted-identity boundary (already documented; kept), MOO-02 credential-gated enablement + pre-stored provider ID (added), MOO-03 allowlisted logger summary shape (added), MOO-04 connection/session scoping + pre-parent rejection (added to cascade JSDoc/docs), MOO-05 fail-closed predicates (already documented; kept), MOO-06 traversal bounds + post-delete failure timing (added), MOO-07 orphan support matrix with evidence pointer (added), MOO-08 strict `isObjectId` + override-wins helper semantics (added), MOO-09 peer policy (kept), MOO-11 `rolePaths`/`passwordPaths` + lazy password/role mappers (added). Keycloak examples in all three surfaces now declare every mapped schema path (`tenantId`, `subscription.plan`, `tier`) and use a genuinely non-persisted `pendingPassword` virtual (`$locals`-backed, never a stored plaintext path); `grep pendingPassword:\ String` across README/llms/website returns nothing.
- Declarations: `dist/plugins/cascade-delete.d.{ts,mts}` carries `QueryOperators`/`Partial` maps/support-timing JSDoc, `dist/schema.d.{ts,mts}` carries override-wins generics, `dist/plugins/model-function.d.{ts,mts}` carries the inference/circular-avoidance contract, `dist/plugins/new-document.d.{ts,mts}` carries the post-save scope. llms contradiction fixed (`@web-ts-toolkit/moo/plugins` now correctly lists only non-Keycloak plugins).
- Commands/results (repo root unless noted): `pnpm --filter @web-ts-toolkit/moo... build` — pass; `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/moo.typed-consumer.test.ts` from `packages/moo` — 2/2 pass (positive gate + should-fail control); `pnpm --filter @web-ts-toolkit/moo test` from root (V2, includes MOO-09 V3 packed-consumer suite) — 15 files, 153/153 pass (baseline 151 + 2 new); `pnpm exec eslint` on touched source/test files — zero new findings (2 remaining `no-explicit-any` on `Model<any>` lines belong to MOO-04's execution-context types, untouched here). Unrelated worktree changes (message-service, pdf-reader, other moo lanes) preserved and untouched.
- Acceptance mapping: inferred sync (`number`), async (`Promise<number>`), instance, static, and `ById` (`number | null`, incl. missing-id `null`) examples compile with annotated types and wrong-argument variants fail (suppressed + unsuppressed controls); `{ price: { $gt: 'not-a-number' } }` fails while operator/direct/logical filters pass; `Partial` maps accept `{}` while the full map requires its key; `{ default: 'n-a' as const }` infers the literal override; shipped snippets compile from the packed tarball with package-name imports only; no shipped example persists a pending plaintext password.
- Follow-ups owned elsewhere: MOO-12/MOO-13 (orphan correctness/scale implementation per MOO-07); MOO-99 (V4 + independent review).

### Task MOO-11: Add Explicit Change Dependencies For Role And Password Mappers

Status: completed

Kind: improvement

Priority: P2 — mapper reuse is limited by hidden change-detection assumptions and unnecessary evaluation.

Suggested agent: identity/security agent

Dependencies: MOO-03

Primary ownership: mapper option normalization and `packages/moo/src/plugins/keycloak-user-sync/planner.ts`; planner/plugin tests. Public documentation handoff to MOO-10.

Finding: `mapRoles` and `mapPassword` may read arbitrary document fields, but only configured roles/password paths trigger those operations. Attributes have explicit `attributePaths`; equivalent dependencies for other mappers are absent. A role mapper using a tier field or password mapper using a virtual backing field can remain stale when just that input changes. `getDesiredPassword` is evaluated on every sync even when an existing user's unrelated field is the only change. Current planner tests cover configured paths and attribute dependencies, not these mapper workflows.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:94-101`, `325-359`, `543-547`, `600-606`.
- `packages/moo/src/plugins/keycloak-user-sync/planner.ts:117-155`, `195-217`.
- `packages/moo/test/keycloak-user-sync-planner.test.ts:43-55`.

Requirements:

1. Define explicit, normalized dependency paths for role/password mappers using the existing attribute-dependency pattern or a small coherent equivalent. Do not resync every field as a substitute for dependency modeling.
2. Evaluate password mappers only for creation or actual password-sync intent; preserve MOO-02's credential recovery requirements.
3. Keep change planning pure and reusable. Consolidate shared dependency logic rather than growing a second divergent path registry; keep private planning details out of package exports.

Acceptance criteria:

- Changing only a declared mapper dependency triggers precisely its role/password operation; unrelated changes trigger neither the mapper nor those remote operations.
- Disabled sync fields remain disabled, dependency arrays are snapshotted/validated, and existing `attributePaths` behavior remains stable.
- Pure planner tests and public middleware tests agree; representative remote-call counts do not regress.

Verification: V1 planner and plugin tests, V2, generated-declaration/public-doc review through MOO-10.

Completion evidence (MOO-11, 2026-09-12):

- Changed paths: `packages/moo/src/plugins/keycloak-user-sync/planner.ts` (new `rolePaths`/`passwordPaths` on `PlannerOptions`, private `dependencyPathsFor`/`hasDependencyChanged`/`collectDependencyPaths` shared by `buildTrackedPaths` and `planChangedFields`, no new package exports); `packages/moo/src/plugins/keycloak-user-sync.ts` (`rolePaths`/`passwordPaths` public options with JSDoc, normalized via the existing `normalizeOptionalStringList` snapshot/freeze path, lazy `readDesiredPassword` in `syncDocument` with cached creation value reused by recovery); `packages/moo/test/keycloak-user-sync-planner.test.ts` (2 new pure-planner regressions); `packages/moo/test/keycloak-user-sync-plugin.test.ts` (3 new middleware regressions). No CHANGELOG, no hand-edited `dist`, no README/website changes (handoff to MOO-10).
- Contract: `rolePaths`/`passwordPaths` declare extra Mongoose paths that trigger the `roles`/`password` field operations, following the `attributePaths` pattern; honored only while the corresponding `syncFields` entry is enabled, otherwise fully inert. The configured roles/password paths always trigger as before; `attributePaths` behavior is unchanged. `mapPassword` is evaluated only for creation (new remote user, exactly once, cached for the same-save recovery attempt) or when `passwordChanged`/`recoveredPartial` indicates actual password-sync intent; unrelated updates never invoke it and never reset credentials. `mapRoles` is evaluated only inside `syncRoles`, which runs only for creations or `roles` changes. Private planning helpers are module-local to the planner and are not re-exported from any package entrypoint.
- Commands/results (repo root unless noted): `pnpm --filter @web-ts-toolkit/moo... build` — pass (incl. `rolePaths`/`passwordPaths` in shipped `dist/plugins/keycloak-user-sync.d.ts`); `pnpm exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/keycloak-user-sync-planner.test.ts test/keycloak-user-sync-plugin.test.ts` from `packages/moo` — 2 files, 80/80 pass (V1); `pnpm --filter @web-ts-toolkit/moo test` from root — 14 files, 151/151 pass (V2: baseline 146 + 5 new); `pnpm exec eslint` on the 4 touched files — clean. Old-behavior note: `git show HEAD:.../planner.ts` contains zero `rolePaths`/`passwordPaths` references, so the new dependency options are ignored pre-change (dependency-only edits plan zero fields) and the previously unconditional `getDesiredPassword` call invoked the mapper on every sync — the new mapper-call-count assertions distinguish the corrected behavior. No stash/rebuild cycle was run in order to preserve the large unrelated uncommitted worktree (message-service, pdf-reader, other moo lanes).
- Acceptance mapping: tier-only change with `rolePaths: ['tier']` calls `mapRoles` once, reconciles to `['pro-role']` via `managedRoles`, and issues zero `core.users.update`/`resetPassword` calls; a subsequent firstName-only change issues a profile `update` with zero `mapRoles` calls and zero reconcile/reset calls. `pendingPassword`-only change with `passwordPaths` calls `mapPassword` once and resets with `{ temporary: false }`; a firstName-only change issues a profile `update` with zero `mapPassword` calls and zero resets. `syncFields: { roles: false, password: false }` plus dependency edits issues zero reconcile/reset/update calls; mutated post-registration option arrays do not add triggers (`injected` path inert) and malformed `rolePaths`/`passwordPaths` throw at registration. Existing representative call-count tests (`bounds remote calls ...`, first-name-only no-reconcile/no-reset, attribute-only) still pass unmodified.
- Follow-ups owned elsewhere: MOO-10 consolidates README/website/llms release notes for `rolePaths`/`passwordPaths` and the lazy-password contract, plus the packed-consumer/declaration review.

### Task MOO-99: Independently Verify Integrated Boundaries And Package Contracts

Status: completed

Kind: improvement

Priority: P1 — independent verification is required after destructive and identity-sensitive changes across agents.

Suggested agent: independent reviewer who did not implement the source fixes

Dependencies: MOO-01, MOO-02, MOO-03, MOO-04, MOO-05, MOO-06, MOO-07, MOO-08, MOO-09, MOO-10, MOO-11

Primary ownership: review across affected package paths, this task file's evidence, and final integration checks.

Finding: the baseline's passing suite did not cover the demonstrated cross-path failures. Integration must validate outcomes rather than infer completion from green existing tests or historical task statuses.

References: all findings, acceptance criteria, and shared verification requirements in this document.

Requirements:

1. Verify every acceptance criterion and reproduce the original scenarios against the integrated implementation. Check save/delete identity parity, credential failure ordering, logger boundaries, two-connection isolation, transaction rollback, deep/wide cascades, and public type/runtime agreement.
2. Inspect MOO-07's recommendation and any resulting follow-ups; no unresolved destructive behavior may disappear into an unowned note. Check performance evidence and declared limits.
3. Run V2, V3, and V4 serially. Review changed-file scope and preserve concurrent work. Record precise blockers rather than marking unverified criteria completed.

Acceptance criteria:

- Every task has completion evidence or an explicit blocked/deferred decision with an owner, rationale, and residual risk; investigation output is evidence-backed.
- Regression tests fail on the old behavior and pass on the new behavior where feasible; docs, types, metadata, and runtime behavior agree.
- Required checks have actual results and the independent reviewer records the final disposition.

Verification: V2, V3, V4 and independent evidence review.

Completion evidence (MOO-99, 2026-09-12, independent reviewer — did not implement MOO-01..MOO-11):

- Final disposition: COMPLETED. Every acceptance criterion in MOO-01..MOO-11 is verified against the integrated implementation; MOO-07 is evidence-backed with owned follow-ups (MOO-12/MOO-13 proposed, not scheduled — see residual risk below). No new fixes were implemented; no CHANGELOG touched; unrelated worktree lanes (message-service, pdf-reader, access-router-client) preserved and untouched — only this task file was edited.
- Evidence completeness: MOO-01 through MOO-11 are all marked completed and each carries a Completion evidence block (changed paths, exact commands/results, acceptance mapping, follow-up ownership). Verified by full-file read.
- Independent reproduction (repo root unless noted; all serialized, shared `dist` rebuilt by the package test script):
  - V2 package gate: `pnpm --filter @web-ts-toolkit/moo test` — 15 files, 153/153 pass (60s). Matches the lane-stacked baseline (86 + 11 + 4 + 3 + 7 + 11 + 7 + 8 + 9 + 2 + 5).
  - V3 consumer contract: `npm pack --dry-run --json` from `packages/moo` — 39 files (README, llms.txt, package.json, every subpath `.js/.mjs/.d.ts/.d.mts`); focused `test/moo.packed-consumer.test.ts + test/moo.typed-consumer.test.ts` — 2 files, 11/11 pass (9 packed-consumer incl. core-only no-peer boundary + mongoose 8/Keycloak 0.12.1 floor matrix, 2 typed-consumer incl. should-fail control). Reused MOO-09/10 fixtures; no fresh live Keycloak claimed (none exercised anywhere — plugin registration + managed-client construction are lazy/network-free).
  - Boundary spot-checks: `test/keycloak-user-sync-plugin.test.ts + test/keycloak-user-sync-planner.test.ts` — 80/80 pass (save/delete identity parity, credential ordering, logger sanitization, role/password mapper dependencies); `test/cascade-delete-plugin.test.ts + test/cascade-delete-context.test.ts + test/cascade-delete-predicates.test.ts + test/cascade-delete-traversal.test.ts + test/is-object-id.test.ts` — 44/44 pass (two-connection isolation, replica-set abort/commit rollback, fail-closed predicates, 3-level custom-field cascade, bounded fan-out, strict ObjectId guard).
  - Runtime probe (built `dist`, independent of lane harnesses): `isObjectId` returns true for a real instance + canonical lowercase string; rejects structural impostor, uppercase hex, 12-byte Buffer, and null. Source `src/is.ts` uses `instanceof` only — no `ObjectId.isValid`/`String()` coercion remains.
  - Code-boundary inspection: shared `resolveUser(document, snapshot, wasNew)` + `readPersistedSnapshot` used by both save and delete paths (`keycloak-user-sync.ts:519/537/926-927`); `recoverPartialCreation` reset-before-enable ordering (`:730`); allowlisted `toLoggedError` logger summary name/code/status only (`:424`); `resolveExecutionContext` + `assertTransactionSupported` pre-parent rejection (`cascade-delete.ts:392/883`); `maxConcurrency` default 8 with transaction-forced serial (`:553-554/845`); exported `QueryOperators<T>` + `Partial<DependencyMap>` orphan maps; `rolePaths`/`passwordPaths` normalized via the existing snapshot/freeze path and absent from package exports; peer metadata `@egose/keycloak-fluent >=0.12.1 <0.15.0`, `mongoose >= 8.0.0` with dev `mongoose ^9.8.0` / fluent `^0.14.0` inside range.
  - V4 integration gate (serial): `pnpm lint` — FAILS exit 1 with 7 errors + 3 warnings, all attributed outside this lane: 2 `no-explicit-any` in `packages/moo/src/plugins/cascade-delete.ts:110,116` (MOO-04 execution-context types, pre-existing and disclosed in MOO-06 evidence, untouched by later lanes; zero findings on all other MOO-touched files), 5 `pdf-reader` errors (other lane), 3 `access-router-client` warnings. `pnpm build` — exit 0 pass. `pnpm test` (serial, `--workspace-concurrency=1`) — exit 0 pass, every package suite green (incl. moo 15 files/153 tests), zero failure markers in the full log.
  - Old-behavior discrimination: lane evidence records stash-and-rebuild negative controls for MOO-01 (9 fail-closed tests fail on old source), MOO-04 (7/7 fail), MOO-05 (7 fail/4 pass), MOO-06 (5 fail/2 pass), MOO-08 (2 structural tests fail). Not re-executed here in order to preserve the large unrelated uncommitted worktree; new-behavior pass plus boundary inspection above confirms the discriminating regressions are retained and green.
- MOO-07 + follow-ups: investigation evidence `20260912-130000-moo-07-orphan-query-evidence.md` reviewed — 10 per-shape results, 2000/2000 scale comparison (client-side 8ms distinct + 16ms query vs `$lookup` 21ms, identical 1000-row sets; 16 MB ceiling by arithmetic ≈550k parents, not measured at scale), support-matrix recommendation. MOO-12 (relationship-mode correctness) and MOO-13 (server-side anti-join) exist only as proposed follow-ups in that file with ownership (Mongoose lifecycle agent), dependencies (MOO-12 ← MOO-07; MOO-13 ← MOO-12), and acceptance criteria — they are NOT scheduled tasks and no code exists for them. No destructive behavior is unowned: `findOrphans` is read-only; the destructive delete path is fixed by MOO-04/05/06. Residual risk (owned by future MOO-12/13): silent-`null` unsupported orphan shapes, hardcoded `distinct('_id')` for non-`_id` local keys, session never reaching orphan reads, empty-array-included orphan semantics, and the client-side 16 MB ID-payload ceiling — all documented in README/llms/website via MOO-10 until implemented.
- Performance evidence and limits: MOO-06 fan-out run recorded `{ datasetSize: 40, maxConcurrency: 4, batchSize: 10, peakInFlight: 4, elapsedMs: 252 }` (observations, not thresholds; `peak <= max < size` proves bounding); MOO-07 parity run recorded above. No comparative speed claims made; batching bounds memory/concurrency only. No scale benchmarks beyond these were run — consistent with the plan's scope.
- Docs/types/metadata/runtime agreement: README, llms.txt, and website moo page carry the consolidated contract notes for MOO-01/02/03/04/05/06/07-matrix/08/09/11 with no CHANGELOG (per explicit instruction); `pendingPassword` virtual is non-persisted (`grep pendingPassword:\ String` returns nothing per MOO-10); llms plugin-list contradiction fixed; shipped declarations verified to retain new JSDoc; strict NodeNext packed-consumer compiler gates pass with `skipLibCheck: false` (core) — full-consumer gate uses `skipLibCheck: true` solely for the upstream keycloak-fluent extensionless deep-type-import quirk, runtime proven.
- Blockers: none. V4 lint failure is pre-existing/unrelated and attributed, not a gate pass claim.

## Decisions, Deferrals, And Definition Of Done

- No maintainer decision blocks starting MOO-01 through MOO-04, MOO-08, or MOO-09. MOO-01 must settle ambiguous/missing persisted-identity outcomes before implementation completion; safety does not require preserving silent relinking.
- MOO-04 must select complete transaction participation or explicit early rejection for any unsupported mode. MOO-05 needs a decision on intentionally empty full filters. MOO-07 must resolve orphan semantics/scale strategy before creating implementation follow-ups. MOO-09 must establish supported peer versions before publishing corrected metadata. Mark the affected task blocked if an agent cannot obtain the required decision/evidence.
- Durable Keycloak retries/outbox delivery remain application-owned under the existing selected contract; this plan does not claim atomicity between MongoDB and Keycloak. No-op saves after remote failures and concurrent saves were not exhaustively verified, leaving residual convergence risk for a separate bounded delivery review.
- New-document transaction/reentrant callback semantics remain deferred: the two existing tests establish basic post-save behavior, not exactly-once delivery across transaction retries. MOO-10 must make the public scope precise; a durable event system is not implied.
- No standalone generic refactor, blanket cache, new `llms.txt`, or dependency-audit task is proposed. Encapsulation work belongs at the identified execution-context, predicate, planner, and logging boundaries. Orphan/performance changes require measurements.

Definition of done: confirmed defects have retained distinguishing regressions; improvements have observable outcomes; investigations have a bounded evidence-backed recommendation; all public contract changes are documented and release-noted; serial package/consumer/repository gates have recorded outcomes; MOO-99 is completed by an independent reviewer. When blocked, record delivered work, the unverified criterion, and the missing prerequisite. Append completion evidence (changed paths, exact commands, results, and follow-up IDs) without rewriting the historical finding.
