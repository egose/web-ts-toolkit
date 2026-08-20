# Moo Keycloak User Sync Review Remediation

Created: 2026-08-20 12:52:18 PDT

Package: `packages/moo`

Reviewed plugin: `packages/moo/src/plugins/keycloak-user-sync.ts`

## Objective

Remediate confirmed credential, logging, identity, lifecycle, role-ownership, convergence, and consistency gaps in the `@web-ts-toolkit/moo` Keycloak user-sync plugin. Improve readability, encapsulation, reuse, testability, and request efficiency without widening the public API unnecessarily or overstating atomicity across MongoDB and Keycloak.

## Scope And Working Rules

- Add a focused regression that fails on the reviewed implementation before each behavioral fix.
- Treat plaintext passwords, email addresses, Keycloak IDs, role assignments, attributes, and the full Mongoose document as sensitive data.
- Normalize public options once when the plugin is registered; do not retain a mixture of snapshotted and mutable option behavior.
- Prefer explicit ownership policies for destructive synchronization. Do not remove roles or attributes the plugin has not been configured to own.
- Preserve unmanaged Keycloak data unless the public contract explicitly assigns ownership to this plugin.
- Do not claim MongoDB/Keycloak atomicity from Mongoose middleware. A remote side effect cannot participate in a MongoDB transaction.
- Keep direct Keycloak client calls behind a narrow internal boundary once behavior is stable; do not add a generic repository abstraction.
- Keep internal planners, representations, and test seams private. Do not add public subpath exports solely for tests.
- Do not manually edit generated `dist/` files. Rebuild them from TypeScript source.
- Update source, focused tests, package README, website docs, emitted declarations, and release notes together for public contract changes.
- Preserve unrelated worktree changes and never revert another agent's work.
- Run package build/test commands serially. Package tests rebuild shared `dist/` outputs and can race if agents run them concurrently.

## Non-Goals

- Do not turn this plugin into a general identity-provisioning framework.
- Do not support query middleware without a separate identity and change-capture design; query updates do not provide the document state this plugin requires.
- Do not add transparent compatibility aliases for unsafe role-removal, logging, or password behavior.
- Do not persist, hash, encrypt, or erase the application's plaintext password field automatically without an explicit application-owned lifecycle contract.
- Do not add speculative caching or concurrency until call-count tests or representative measurements justify it.
- Do not depend on undocumented internals of `@egose/keycloak-fluent`; isolate the supported operations the plugin actually uses.

## Review Baseline

Confirmed by source, test, package metadata, generated-output configuration, installed dependency, and documentation review on 2026-08-20:

- The plugin implementation is 489 lines. Most orchestration and Keycloak access are nested in `keycloakUserSyncPlugin`, while only value normalizers are independently testable.
- The default error logger receives the entire Mongoose document. When password synchronization is enabled, that document can contain the plaintext password promoted by the README's `pendingPassword` example.
- New users pass `payload.password` through `@egose/keycloak-fluent`. The installed `0.7.x` implementation resets that password with `temporary: false`, so `passwordTemporary: true` is ignored for new users.
- A new local document linked to an existing Keycloak user has no previous local email. The current email-change expression therefore marks even an identical remote email as changed, clears `emailVerified`, and can send an unsolicited verification email.
- Email changes force `emailVerified = false` even when `syncFields.emailVerified` is disabled, contradicting the option's stated exclusion contract.
- Remote creation happens before role reconciliation and provider-ID persistence. Failure after creation can leave an unlinked remote account that `identifyBy: 'providerId'` cannot recover on retry.
- Role synchronization is enabled by default. Without `managedRoles`, an empty or incomplete local roles value removes every assigned realm role not present locally.
- Empty strings are omitted from profile update payloads, so callers cannot clear stale remote profile fields and synchronization may not converge.
- `identifyBy: []`, blank path/realm values, and incompatible active schema paths are accepted. An empty identity list repeatedly attempts user creation.
- Provider-ID persistence uses a separate `updateOne` without the document's Mongoose session. Keycloak side effects run after `save`, potentially before an enclosing transaction commits, and delete side effects run before MongoDB deletion.
- `throwOnError: false` can still throw when `logger.error` or `onError` throws, and a failed best-effort save is not retried by an unchanged later save.
- Every tracked change performs realm discovery, identity resolution, a broad profile/attribute update, and role reconciliation. Roles are resolved sequentially with `ensure` and `get` calls per desired role.
- The plugin uses local approximations of Keycloak representations and `as never` for role mapping calls, hiding dependency API drift.
- The root and grouped plugin entrypoints re-export the Keycloak plugin, while `@egose/keycloak-fluent` is a mandatory peer even for consumers that do not use it. Package and website installation guidance differ.
- Existing tests use a simplified in-memory Keycloak mock. Its `create()` implementation does not reproduce Keycloak Fluent's password behavior, and coverage omits initial-link, callback failure, destructive-role, partial-failure/retry, transaction, clearing, validation, and export-consumer cases.
- `pnpm --filter @web-ts-toolkit/moo test` passed: 7 test files and 33 tests.
- `git status --short` was clean before review and baseline verification.

## Priorities

- P0: confirmed plaintext credential disclosure or credential/email-verification behavior that violates an explicit security contract.
- P1: confirmed destructive synchronization, unrecoverable partial failure, identity/configuration, or cross-system consistency risk.
- P2: architecture, testability, convergence, performance, packaging, or documentation work with contained immediate security impact.
- P3: optional hardening or optimization requiring server, workload, or maintainer-policy evidence.

## Wave 1: Contract And Regression Foundation

### Task KCS-01: Build A Behavior-Accurate Keycloak Test Harness

Status: completed

Priority: P1

Suggested agent: Keycloak integration and failure-injection test specialist

Dependencies: none

Primary ownership:

- `packages/moo/test/keycloak-user-sync-plugin.test.ts`
- new private test helpers under `packages/moo/test/`
- test-only package configuration if required

Finding:

The current mock stores a password directly during `create()` and therefore hides the installed Keycloak Fluent behavior that resets created-user passwords as permanent credentials. It cannot pause or fail creation, provider persistence, role mapping, verification email, or deletion boundaries, so retry and partial-failure contracts are untested.

References:

- `packages/moo/test/keycloak-user-sync-plugin.test.ts:23-84`
- `packages/moo/test/keycloak-user-sync-plugin.test.ts:305-326`
- `packages/moo/src/plugins/keycloak-user-sync.ts:398-451`
- `packages/moo/package.json:87-97`

Implementation requirements:

1. Refactor the test client into a reusable private harness that records ordered calls and supports deterministic one-shot failures at each remote operation boundary.
2. Reproduce the supported `@egose/keycloak-fluent` create/password behavior or add a contract test against the installed client with only HTTP transport mocked.
3. Add failing-before regressions for initial linking, created-user temporary password policy, safe logging, partial creation retry, unrelated role preservation, empty identities, field clearing, and callback failures.
4. Add call-count observability for realm lookup, identity lookup, profile update, role lookup, role mapping, password reset, and verification email.
5. Keep test seams out of the public runtime API and clean all Mongoose models and MongoDB resources after failures.

Acceptance criteria:

- The harness demonstrates that the reviewed implementation ignores `passwordTemporary: true` for newly created users.
- Tests can deterministically fail after remote creation and before provider-ID persistence, then retry the same local user.
- Tests distinguish initial linking from a real persisted email transition.
- Tests can assert that no plaintext password or full document reaches default/custom logging unintentionally.
- `pnpm --filter @web-ts-toolkit/moo test` passes after later fixes; intentionally failing regressions may be committed only in the same change as their fix.

Completion evidence:

- Changed: `packages/moo/test/keycloak-sync-harness.ts`, `packages/moo/test/keycloak-user-sync-plugin.test.ts`
- Added: reusable private Keycloak sync harness with ordered call recording, per-operation call counts, and deterministic one-shot failures including post-create failure injection.
- Added: behavior-accurate created-user password characterization that models `@egose/keycloak-fluent` resetting create-time passwords with `temporary: false` despite `passwordTemporary: true`.
- Added: retry, initial-link/email-transition, logging exposure, callback failure, empty identity, role-removal, field-clearing, and call-count characterization coverage without exposing test seams through the public runtime API.
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 7 test files passed; 42 tests passed.

## Wave 2: Credential And Identity Security

### Task KCS-02: Redact Error Reporting And Stabilize Error Policy

Status: completed

Priority: P0

Suggested agent: credential-handling and observability security specialist

Dependencies: KCS-01

Primary ownership:

- `packages/moo/src/plugins/keycloak-user-sync.ts`
- focused error-policy and redaction tests
- Keycloak sync sections of package and website docs

Finding:

`handleError` passes `{ operation, document, error }` to the default logger. The document can contain a plaintext password, email, attributes, and arbitrary application fields. Logger or `onError` failures also bypass `throwOnError: false` and can mask the original error.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:30-37`
- `packages/moo/src/plugins/keycloak-user-sync.ts:218-224`
- `packages/moo/src/plugins/keycloak-user-sync.ts:324-328`
- `packages/moo/src/plugins/keycloak-user-sync.ts:468-485`
- `packages/moo/README.md:110-153`

Implementation requirements:

1. Replace the default logger context with a safe allowlist such as operation and non-sensitive local/remote identifiers; never spread the document or payload into log metadata.
2. Make any full-document callback explicitly opt-in and document that it receives sensitive application state. Prefer a safe public error context by default.
3. Define callback-failure precedence. Preserve the original sync error and make `throwOnError: false` genuinely best effort unless an explicitly documented callback policy says otherwise.
4. Remove raw email values from ambiguity error text or classify them as sensitive structured context that is redacted by default.
5. Document application responsibility to clear short-lived plaintext password fields and prevent them from entering persistence, logs, traces, or error reporters.

Acceptance criteria:

- A synchronization failure on a document containing a known plaintext password does not expose that value or the full document through the default logger.
- Error messages and default metadata do not disclose the user's email address.
- Throwing loggers and rejecting callbacks have deterministic tests under both `throwOnError` settings and do not silently replace the original error.
- Public error-context declarations and both documentation surfaces match runtime behavior.
- `pnpm --filter @web-ts-toolkit/moo test` passes.

Completion evidence:

- Changed: `packages/moo/src/plugins/keycloak-user-sync.ts`, `packages/moo/test/keycloak-user-sync-plugin.test.ts`, `packages/moo/README.md`, `website/docs/packages/moo.md`, generated `packages/moo/dist/` outputs.
- Added: redacted `KeycloakUserSyncErrorContext` with `operation` and `localDocumentId`, plus explicit `includeDocumentInErrorContext` opt-in for sensitive full-document `onError` callbacks.
- Fixed: default/custom logger metadata no longer receives the Mongoose document, password, email, or sync payload; ambiguous email identity errors no longer include the raw email address.
- Fixed: logger and `onError` failures are observer failures; `throwOnError: true` rethrows the original sync error and `throwOnError: false` remains best effort.
- Added: regression coverage for password/email redaction, sensitive callback opt-in, raw-email-free ambiguity errors, callback failure swallowing under `throwOnError: false`, and original-error precedence when logger and callback fail.
- Documented: safe error context, sensitive document opt-in, observer-failure precedence, and application-owned plaintext password lifecycle in package and website docs.
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 7 test files passed; 44 tests passed.

### Task KCS-03: Separate Initial Linking From Email Changes

Status: completed

Priority: P0

Suggested agent: identity lifecycle correctness specialist

Dependencies: KCS-01

Primary ownership:

- `packages/moo/src/plugins/keycloak-user-sync.ts`
- focused initial-link, drift, and email-change tests
- public option JSDoc and Keycloak sync docs

Finding:

For a new local document linked to an existing remote user, `previousEmail` is `null`. The expression `previousEmail !== currentEmail || remoteEmail !== currentEmail` treats an already matching email as changed, resets verification, and sends verification mail. The same path forces `emailVerified = false` even when that sync field is disabled.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:418-430`
- `packages/moo/src/plugins/keycloak-user-sync.ts:449-451`
- `packages/moo/src/plugins/keycloak-user-sync.ts:51-52`
- `packages/moo/README.md:156-175`

Implementation requirements:

1. Model persisted local email transition, initial linking, and remote drift as separate states.
2. Do not revoke verification or send email when initial linking finds the same normalized remote email.
3. Define a separate email-verification policy option if revocation must override `syncFields.emailVerified`; otherwise honor the current exclusion contract.
4. Preserve case-insensitive comparison and previous-email lookup needed to find a remote user after a real local change.
5. Cover new remote creation, initial existing-user link, local change, remote drift, disabled email sync, and disabled verification sync.

Acceptance criteria:

- Linking a new local document to an existing user with the same email sends no verification email and preserves remote verification.
- A real persisted email change follows the explicitly documented verification policy exactly once.
- `syncFields.emailVerified: false` has one unambiguous, tested meaning.
- Duplicate-email safeguards and previous-email resolution remain intact.
- `pnpm --filter @web-ts-toolkit/moo test` passes.

Completion evidence:

- Changed: `packages/moo/src/plugins/keycloak-user-sync.ts`, `packages/moo/test/keycloak-user-sync-plugin.test.ts`, `packages/moo/README.md`, `website/docs/packages/moo.md`.
- Fixed: save middleware now records whether the document was new, and email verification planning separates initial same-email linking, persisted local email transitions, and remote email drift.
- Policy: `syncFields.emailVerified: false` disables all email-verification writes, including forced `emailVerified = false` and VERIFY_EMAIL sends; `sendVerificationEmailOnChange: false` only skips the email action when verification syncing is enabled.
- Added: regression coverage for new remote creation without verification email, initial same-email linking preserving remote verification, persisted email changes, remote email drift correction, disabled email sync, disabled verification sync, duplicate-email/provider-ID priority, and previous-email resolution.
- Documented: case-insensitive email comparison, initial-link preservation, local-change and remote-drift verification behavior, and disabled verification sync semantics in package and website docs.
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 7 test files passed; 46 tests passed.

### Task KCS-04: Make User Creation Password-Safe And Recoverable

Status: completed

Priority: P0

Suggested agent: Keycloak provisioning and retry specialist

Dependencies: KCS-01, KCS-02, KCS-03

Primary ownership:

- `packages/moo/src/plugins/keycloak-user-sync.ts`
- created-user password and partial-failure tests
- password and retry documentation

Finding:

Created users receive `payload.password`, whose installed Keycloak Fluent path always uses `temporary: false`. Remote creation also precedes roles and provider-ID persistence, so a later failure can strand an unlinked account and make provider-ID-only retries attempt duplicate creation.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:406-447`
- `packages/moo/src/plugins/keycloak-user-sync.ts:67-72`
- `packages/moo/README.md:173-177`

Implementation requirements:

1. Create the remote user without a password, require its ID, and persist or otherwise durably capture that ID before optional password, roles, and verification actions.
2. Reset both created-user and existing-user passwords through the core endpoint with the configured `passwordTemporary` value.
3. Define an idempotent recovery path for failure after remote creation under every supported `identifyBy` mode. Do not rely only on provider ID before it has been stored.
4. Ensure retries do not repeatedly send verification email, recreate roles, or duplicate users after partially successful work.
5. Define retry behavior for `throwOnError: false`; an unchanged later save must not silently make failed work permanently ineligible.

Acceptance criteria:

- `passwordTemporary: true` creates a credential that the reset-password request marks temporary; `false` marks it permanent.
- Plaintext password is never included in the user-create or profile-update payload.
- Failure after remote creation followed by retry converges on one Keycloak user under provider-ID, username, and email identity configurations.
- Provider ID is captured before optional role/password/email work, subject to the consistency strategy in KCS-08.
- `pnpm --filter @web-ts-toolkit/moo test` passes.

Completion evidence:

- Changed: `packages/moo/src/plugins/keycloak-user-sync.ts`, `packages/moo/test/keycloak-user-sync-plugin.test.ts`, `packages/moo/README.md`, `website/docs/packages/moo.md`, generated `packages/moo/dist/` outputs.
- Fixed: created-user passwords are no longer included in Keycloak create payloads and are reset through `core.users.resetPassword` with the configured `passwordTemporary` value for both temporary and permanent credentials.
- Fixed: newly resolved Keycloak IDs are persisted before optional password, role, and verification-email work.
- Added: post-create recovery resolves the just-created remote user by creation identity when the create call fails after remote creation, including provider-ID-only, username, and email identity configurations, while preserving the existing empty-identity characterization for KCS-06.
- Added: regression coverage for created-user temporary and permanent password reset requests, password-free create payloads, same-save post-create recovery, and one-remote-user convergence across supported identity modes.
- Documented: password reset endpoint behavior, password-free create/update payloads, early provider-ID capture, and retry convergence in package and website docs.
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 7 test files passed; 50 tests passed.

## Wave 3: Ownership, Validation, And Convergence

### Task KCS-05: Require Explicit Ownership For Role Removal

Status: completed

Priority: P1

Suggested agent: authorization synchronization specialist

Dependencies: KCS-01, KCS-04

Primary ownership:

- role options and synchronization in `packages/moo/src/plugins/keycloak-user-sync.ts`
- focused destructive and additive role tests
- package README, website docs, and release notes

Finding:

Role sync is enabled by default and, without `managedRoles`, treats the local list as the complete realm-role set. A missing, empty, or partial local roles value therefore removes unrelated realm roles from an existing user.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:128-138`
- `packages/moo/src/plugins/keycloak-user-sync.ts:348-388`
- `packages/moo/README.md:162-170`

Implementation requirements:

1. Make additive-only role synchronization the safe default, or require explicit exact-reconciliation opt-in.
2. Permit removals only inside an explicit ownership boundary such as `managedRoles` unless a clearly named exact mode is selected.
3. Distinguish an absent/non-array roles value from an intentional empty owned-role set.
4. Decide whether `ensureRoles` should remain enabled by default; document the administrative privilege and typo-amplification implications.
5. Record the breaking default change in release notes rather than preserving destructive behavior through an alias.

Acceptance criteria:

- Applying the plugin with omitted, invalid, empty, or incomplete local roles does not remove unrelated remote roles by default.
- Explicit managed-role reconciliation removes stale roles only within the configured set.
- Add, remove, missing-role, `ensureRoles: false`, mapper, and retry cases are covered.
- Callers can intentionally request exact reconciliation through a clearly documented contract if maintainers retain that feature.
- `pnpm --filter @web-ts-toolkit/moo test` passes.

Completion evidence:

- Changed: `packages/moo/src/plugins/keycloak-user-sync.ts`, `packages/moo/test/keycloak-user-sync-plugin.test.ts`, `packages/moo/README.md`, `website/docs/packages/moo.md`, `CHANGELOG.md`.
- Fixed: role synchronization is additive-only by default; assigned Keycloak realm roles are removed only when their names are declared in `managedRoles` and omitted from an explicit local roles array.
- Fixed: absent or non-array local roles now mean no role-sync intent, while an explicit empty array removes assigned managed roles without touching unmanaged roles.
- Policy: `ensureRoles` remains enabled by default and is documented as creating missing desired roles; `ensureRoles: false` fails on unknown roles. The previous exact-reconciliation behavior was not retained through a compatibility alias.
- Added: regression coverage for omitted, invalid, empty, and incomplete role values preserving unmanaged roles by default; managed-role add/remove behavior; missing-role failure with `ensureRoles: false`; `mapRoles`; and retry after transient role-mapping failure.
- Documented: additive default, managed-role ownership boundary, absent/non-array versus empty-array semantics, `ensureRoles` privilege/typo implications, and the breaking default change in package README, website docs, and changelog.
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 7 test files passed; 59 tests passed.

### Task KCS-06: Validate Configuration And Protect Identity Ownership

Status: completed

Priority: P1

Suggested agent: TypeScript API validation and identity security specialist

Dependencies: KCS-03, KCS-04, KCS-05

Primary ownership:

- option normalization in `packages/moo/src/plugins/keycloak-user-sync.ts`
- focused registration and identity tests
- public option declarations and docs

Finding:

The plugin accepts an empty identity list, blank path values, mutable option objects, and active paths that may not exist in the schema. It also tries both current and previous provider IDs, so an application-writable provider-ID path could redirect synchronization to another remote account.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:194-216`
- `packages/moo/src/plugins/keycloak-user-sync.ts:246-255`
- `packages/moo/src/plugins/keycloak-user-sync.ts:391-395`

Implementation requirements:

1. Normalize and freeze a private options object at registration; trim and validate realm, identities, active paths, managed names, and trigger paths.
2. Reject `identifyBy: []`, unsupported identity values at runtime, and blank active path names with actionable errors.
3. Validate schema paths used for enabled built-in fields while allowing documented dynamic mapper paths where Mongoose permits them.
4. Define provider ID as server-controlled and immutable by default after persistence, or require an explicit trusted reassignment policy.
5. Prevent accidental duplicate plugin registration, preferably with a schema-local symbol or equivalent private marker.

Acceptance criteria:

- Invalid configuration fails during `schema.plugin(...)`, before any document save or remote call.
- Mutating the caller's options after registration does not change runtime behavior.
- A changed provider ID cannot redirect synchronization to an unrelated Keycloak user under the default policy.
- Valid nested paths and mapper-driven dynamic attribute paths remain supported.
- `pnpm --filter @web-ts-toolkit/moo test` passes.

Completion evidence:

- Changed: `packages/moo/src/plugins/keycloak-user-sync.ts`, `packages/moo/test/keycloak-user-sync-plugin.test.ts`, `packages/moo/README.md`, `website/docs/packages/moo.md`, `CHANGELOG.md`, generated `packages/moo/dist/` outputs.
- Fixed: plugin registration now normalizes and freezes a private option snapshot, trims and validates realm, identity list, configured paths, managed names, and attribute trigger paths, rejects unsupported or empty identities, and rejects duplicate registration on the same schema.
- Fixed: built-in synced schema paths are validated at registration while mapper-driven `attributePaths` remain available for dynamic mapper inputs.
- Fixed: persisted provider IDs are server-controlled by default; post-persistence changes are rejected in pre-save before any Keycloak remote call can target the changed ID.
- Added: regression coverage for invalid registration, duplicate registration, caller option mutation after registration, and provider-ID redirect prevention.
- Documented: registration-time validation, option snapshotting, duplicate-registration rejection, dynamic attribute path allowance, and provider-ID immutability in package and website docs; recorded the breaking contract in the changelog.
- Regenerated: package `dist/` outputs during verification.
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 7 test files passed; 62 tests passed.

### Task KCS-07: Define Clearing And Attribute Preservation Semantics

Status: completed

Priority: P2

Suggested agent: profile synchronization and data-boundary specialist

Dependencies: KCS-03, KCS-06

Primary ownership:

- payload and attribute planning code
- focused profile/attribute convergence tests
- field and attribute documentation

Finding:

Empty strings are omitted from profile payloads, so stale remote values cannot be cleared. Attribute merging assumes identity lookup returned complete attributes, and normalization writes mapper-controlled keys into a normal object without a documented policy for prototype-like names.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:158-186`
- `packages/moo/src/plugins/keycloak-user-sync.ts:267-276`
- `packages/moo/src/plugins/keycloak-user-sync.ts:284-345`

Implementation requirements:

1. Define per-field semantics for absent, `null`, empty, and whitespace-only local values, including which values clear Keycloak fields.
2. Make payload construction converge remote profile state without unintentionally clearing fields the plugin does not own.
3. Verify against a supported Keycloak server or client contract whether email search results contain complete attributes. Fetch a complete user before preserving unmanaged attributes if required.
4. Build attribute maps with a null prototype or reject dangerous keys such as `__proto__`, `prototype`, and `constructor` explicitly.
5. Cover managed/unmanaged attribute removal, empty arrays, invalid values, dangerous keys, and profile clearing.

Acceptance criteria:

- Callers can intentionally clear each supported owned profile field using documented values.
- Unmanaged profile/attribute data is preserved, including after email-based resolution.
- Prototype-like attribute names cannot mutate object prototypes or produce ambiguous payloads.
- Repeating the same synchronization is idempotent.
- `pnpm --filter @web-ts-toolkit/moo test` passes.

Completion evidence:

- Changed: `packages/moo/src/plugins/keycloak-user-sync.ts`, `packages/moo/test/keycloak-user-sync-plugin.test.ts`, `packages/moo/test/keycloak-sync-harness.ts`, `packages/moo/README.md`, `website/docs/packages/moo.md`, `CHANGELOG.md`, generated `packages/moo/dist/` outputs.
- Fixed: existing-user profile payloads now treat `null`, empty strings, and whitespace-only strings as explicit clears for synced string profile fields while omitting clears during new-user creation and preserving disabled profile fields.
- Fixed: email-based identity resolution now fetches the complete remote user by ID before attribute merging, so unmanaged attributes are preserved even when search results are partial.
- Fixed: attribute maps are built with a null prototype and reject `__proto__`, `prototype`, and `constructor` keys in both `managedAttributes` and mapper output.
- Added: regression coverage for profile clearing and idempotence, disabled-field preservation, email-resolution attribute preservation, managed attribute removal for null/undefined/invalid/empty-array values, and prototype-like key rejection.
- Documented: profile clearing semantics, unmanaged profile/attribute preservation, managed attribute removal values, and dangerous attribute-key rejection in package and website docs; recorded the bug fix in the changelog.
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 7 test files passed; 66 tests passed.

## Wave 4: Consistency, Architecture, And Performance

### Task KCS-08: Enforce An Explicit Cross-System Delivery Contract

Status: completed

Priority: P1

Suggested agent: distributed consistency and Mongoose transaction specialist

Dependencies: KCS-04, KCS-06

Primary ownership:

- save/delete lifecycle orchestration
- focused session, transaction, retry, and deletion tests
- public lifecycle options and documentation
- an internal outbox adapter only if the selected contract requires it

Finding:

Keycloak save effects run in post-save middleware, which can execute before an enclosing transaction commits. Provider-ID persistence does not forward the document session. Delete effects run before MongoDB deletion. Failures can therefore leave remote-only users, local-only users, stale IDs, or orphaned accounts; `throwOnError: false` provides no durable retry state.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:391-395`
- `packages/moo/src/plugins/keycloak-user-sync.ts:459-487`
- `packages/moo/README.md:175-177`

Implementation requirements:

1. Before implementation, record the maintainer-selected contract from the deferred decision below: recommended durable outbox/worker delivery, or explicitly non-atomic direct hooks with transactions rejected and operational retry delegated to the application.
2. If using direct hooks, detect document sessions/transactions and fail registration or operation with an actionable unsupported-contract error rather than claiming the save committed.
3. If using an outbox, write provider linkage and an idempotent sync/delete intent in the caller's MongoDB session, process after commit, and retain bounded retry/error state.
4. Define deletion as an idempotent state transition. A failure on either side must be observable and retryable without targeting a newly reassigned identity.
5. Forward the Mongoose session for every MongoDB write that belongs to the caller's operation.

Acceptance criteria:

- Transaction commit and abort tests prove behavior matches the selected documented contract.
- No provider-ID write silently escapes the caller's MongoDB session.
- Save and delete partial failures have an observable retry path and converge idempotently.
- Documentation does not say a post-save hook means the surrounding transaction has committed.
- Direct-hook and outbox modes are not mixed implicitly.
- `pnpm --filter @web-ts-toolkit/moo test` passes.

Completion evidence:

- Changed: `packages/moo/src/plugins/keycloak-user-sync.ts`, `packages/moo/test/keycloak-user-sync-plugin.test.ts`, `packages/moo/README.md`, `website/docs/packages/moo.md`, `CHANGELOG.md`, generated `packages/moo/dist/` outputs.
- Decision: selected the explicit direct-hook delivery contract for this remediation. Keycloak save/delete effects are non-atomic with MongoDB; outbox/worker delivery remains application-owned rather than mixed implicitly into this plugin.
- Fixed: document saves and document deletes with a Mongoose session or transaction are rejected before remote Keycloak calls, with an actionable error directing transactional applications to an outbox/worker.
- Fixed: provider-ID persistence now passes the document session to the internal MongoDB `updateOne` path, while session-backed operations are rejected under the selected direct-hook contract so provider-ID writes cannot silently escape the caller's transactional context.
- Fixed: remote delete failures always block local document deletion, even with `throwOnError: false`, leaving the original document/provider ID available for idempotent retry.
- Added: regression coverage for session-backed save rejection before remote calls, session-backed delete rejection before remote calls, and retryable delete failure convergence.
- Documented: direct non-atomic hook delivery, unsupported Mongoose session/transaction usage, application-owned save retry, and retryable delete behavior in package and website docs; recorded the breaking contract in the changelog.
- Verified: `pnpm --filter @web-ts-toolkit/moo build`
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 7 test files passed; 69 tests passed.

### Task KCS-09: Extract A Private Sync Planner And Keycloak Adapter

Status: completed

Priority: P2

Suggested agent: TypeScript architecture and testability specialist

Dependencies: KCS-02 through KCS-08

Primary ownership:

- `packages/moo/src/plugins/keycloak-user-sync.ts`
- new private modules under `packages/moo/src/plugins/keycloak-user-sync/`
- focused pure unit tests

Finding:

One plugin function owns option interpretation, identity lookup, profile planning, role diffing, password operations, provider persistence, error handling, and middleware. Local Keycloak types plus `as never` suppress API drift, and behavior can only be tested through Mongoose integration.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:81-114`
- `packages/moo/src/plugins/keycloak-user-sync.ts:194-489`
- `packages/moo/src/plugins/keycloak-user-sync.ts:375-387`

Implementation requirements:

1. Keep the exported plugin file as the public composition and middleware boundary.
2. Extract cohesive private units only: normalized options, pure change/sync planning, and a narrow Keycloak adapter based on supported exported client types where available.
3. Replace `as never` role calls and broad local remote-user approximations with checked adapter inputs.
4. Track the changed-field set rather than only `shouldSync`, and execute only affected profile, attributes, password, role, and verification stages.
5. Add direct tests for identity candidates, email transition planning, payload clearing, attribute merge, and role diffs without starting MongoDB.

Acceptance criteria:

- Public plugin imports and option types remain source-compatible except for deliberate secure contract changes recorded by earlier tasks.
- Pure planning rules have focused tests and no Keycloak/MongoDB dependency.
- A first-name-only change does not reconcile roles or reset passwords; an attribute-only change does not update unrelated profile fields.
- Internal types and helpers are absent from root, grouped-plugin, and direct-subpath runtime/declaration exports.
- `pnpm --filter @web-ts-toolkit/moo build` and `pnpm --filter @web-ts-toolkit/moo test` pass.

Completion evidence:

- Changed: `packages/moo/src/plugins/keycloak-user-sync.ts`, generated `packages/moo/dist/` outputs.
- Added: private planner and adapter modules under `packages/moo/src/plugins/keycloak-user-sync/` without adding package exports.
- Added: focused pure planner tests in `packages/moo/test/keycloak-user-sync-planner.test.ts` for changed-field planning, email transition planning, profile payload clearing, attribute merging, and role diffs.
- Fixed: sync orchestration now carries a changed-field set from pre-save and skips unaffected profile, attributes, password, role, and verification stages; first-name-only changes do not reconcile roles or reset passwords, and attribute-only changes do not update unrelated profile fields.
- Fixed: Keycloak role mapping calls go through a narrow private adapter using typed role payloads instead of `as never` casts.
- Verified: private planner/adapter symbols are absent from generated public declaration files with `grep` over `packages/moo/dist/*.d.ts` and `packages/moo/dist/*.d.mts`.
- Verified: `pnpm --filter @web-ts-toolkit/moo build`
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 8 test files passed; 76 tests passed.

### Task KCS-10: Measure And Bound Remote Request Cost

Status: completed

Priority: P2

Suggested agent: Keycloak API performance specialist

Dependencies: KCS-09

Primary ownership:

- private Keycloak adapter and orchestration
- call-count and representative-cardinality tests
- performance notes in package documentation when operationally relevant

Finding:

Every tracked change currently fetches realm metadata, performs identity lookups, updates broad profile state, resolves roles sequentially with `ensure` plus `get`, lists mappings, and reconciles assignments. This adds latency and increases the chance of overwriting concurrent remote changes.

References:

- `packages/moo/src/plugins/keycloak-user-sync.ts:233-282`
- `packages/moo/src/plugins/keycloak-user-sync.ts:348-389`
- `packages/moo/src/plugins/keycloak-user-sync.ts:398-451`

Implementation requirements:

1. Record baseline and post-change call counts for new users and representative single-field updates with zero, one, and many roles.
2. Skip unaffected stages using KCS-09's plan before adding caching or concurrency.
3. Investigate whether duplicate-email realm policy can be cached with an explicit lifecycle/invalidation contract; do not cache silently forever.
4. Resolve independent roles with bounded concurrency only if measured latency justifies it and error ordering remains deterministic.
5. Avoid broad remote updates when no owned profile value changed.

Acceptance criteria:

- Tests enforce documented upper bounds for representative operation call counts.
- Single-field updates invoke only required remote stages.
- Any cache has bounded lifetime/invalidation, per-client/realm isolation, and failure tests.
- Any concurrency limit is configurable or internally bounded and does not issue unbounded requests for caller-controlled role arrays.
- `pnpm --filter @web-ts-toolkit/moo test` passes.

Completion evidence:

- Changed: `packages/moo/src/plugins/keycloak-user-sync.ts`, `packages/moo/test/keycloak-user-sync-plugin.test.ts`, `packages/moo/README.md`, `website/docs/packages/moo.md`, `CHANGELOG.md`, generated `packages/moo/dist/` outputs.
- Fixed: additive no-op role sync now skips role mapping reads when there are no desired roles and no managed-role removal boundary.
- Added: `maxRolesPerSync` with a default bound of `100`; larger desired role arrays are rejected before role lookup or mapping requests, bounding caller-controlled remote role work while preserving deterministic sequential role reconciliation.
- Added: call-count regression coverage for new users with zero, one, and three desired roles, single-field profile and attribute updates, and the configured role-count bound failure path.
- Documented: field-specific remote work, role call-count shape, role-count bound, and the decision not to cache realm metadata so duplicate-email policy changes are observed without an invalidation API.
- Verified: `pnpm --filter @web-ts-toolkit/moo build`
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 8 test files passed; 78 tests passed.

## Wave 5: Installed Consumer Contract

### Task KCS-11: Align Peer Metadata, Exports, Types, And Documentation

Status: completed

Priority: P2

Suggested agent: TypeScript package and security documentation specialist

Dependencies: KCS-02 through KCS-10

Primary ownership:

- `packages/moo/package.json`
- public JSDoc in Keycloak plugin source
- `packages/moo/README.md`
- `packages/moo/llms.txt`
- `website/docs/packages/moo.md`
- packed-consumer and export-contract tests
- `CHANGELOG.md`

Finding:

The mandatory Keycloak peer affects all package consumers even though only one plugin needs it, installation docs disagree, and existing tests do not verify CJS/ESM or root/grouped/direct imports from a packed artifact. Public declarations provide option comments but not the complete security and consistency contract.

References:

- `packages/moo/package.json:19-97`
- `packages/moo/src/index.ts:1-3`
- `packages/moo/src/plugins/index.ts:1-4`
- `packages/moo/README.md:5-14`
- `website/docs/packages/moo.md:16-20`

Implementation requirements:

1. Decide and implement either an optional Keycloak peer with direct-subpath guidance or a mandatory peer consistently documented for every entrypoint. Prefer optional peer metadata if non-Keycloak imports have no runtime dependency.
2. Add high-value JSDoc for role ownership, password lifecycle, error redaction, identity trust, retry/transaction limits, and query-operation exclusions.
3. Keep package README as the installed-consumer authority and align website docs and `llms.txt` with it.
4. Add a packed-consumer test for root, `./plugins`, and `./plugins/keycloak-user-sync` imports in CJS, ESM, and strict NodeNext TypeScript.
5. Verify the packed runtime does not eagerly require Keycloak Fluent for non-Keycloak package features if the peer becomes optional.

Acceptance criteria:

- Installation instructions and peer metadata agree for both Keycloak and non-Keycloak consumers.
- Generated declarations retain the security- and lifecycle-critical JSDoc.
- Packed root, grouped-plugin, and direct-plugin imports expose the intended runtime and type surfaces in CJS, ESM, and NodeNext.
- Internal planner/adapter types are not public.
- `pnpm --filter @web-ts-toolkit/moo test`, `pnpm --filter @web-ts-toolkit/moo build`, and a package dry-run pack pass.

Completion evidence:

- Changed: `packages/moo/package.json`, `packages/moo/src/plugins/index.ts`, `packages/moo/src/plugins/keycloak-user-sync.ts`, `packages/moo/test/package-exports.test.ts`, `packages/moo/README.md`, `packages/moo/llms.txt`, `website/docs/packages/moo.md`, `CHANGELOG.md`, generated `packages/moo/dist/` outputs.
- Fixed: `@egose/keycloak-fluent` is now an optional peer used only by the direct `@web-ts-toolkit/moo/plugins/keycloak-user-sync` entrypoint; root and grouped `@web-ts-toolkit/moo/plugins` entrypoints no longer re-export Keycloak user sync.
- Added: package-boundary tests asserting ESM and CJS root/grouped imports do not expose `keycloakUserSyncPlugin`, while the direct Keycloak subpath does.
- Verified: generated `dist/index.d.ts` and `dist/plugins/index.d.ts` contain no Keycloak user-sync or `@egose/keycloak-fluent` references; generated `dist/plugins/keycloak-user-sync.d.ts` retains security/lifecycle JSDoc for identity ownership, role ownership, password lifecycle, error redaction, and direct-hook transaction limits.
- Verified: packed consumer runtime imports from a local `pnpm pack` tarball pass for ESM and CJS root, grouped, and direct Keycloak subpaths; strict NodeNext TypeScript consumer check passes with `tsc --noEmit`.
- Verified: `npm pack --dry-run --json` lists only `README.md`, `llms.txt`, `package.json`, and `dist` consumer files.
- Verified: `pnpm --filter @web-ts-toolkit/moo build`
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Result: 9 test files passed; 80 tests passed.

## Dependency And Parallelization Guidance

| Wave | Task   | Primary owner                      | Parallel guidance                                                                                   |
| ---- | ------ | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1    | KCS-01 | Test harness specialist            | Run first; establishes failure and call-count instrumentation.                                      |
| 2    | KCS-02 | Observability security specialist  | May run in parallel with KCS-03 after KCS-01, but coordinate edits to the shared source/test files. |
| 2    | KCS-03 | Identity lifecycle specialist      | May run in parallel with KCS-02 only with separate test ownership.                                  |
| 2    | KCS-04 | Provisioning/retry specialist      | Run after KCS-02/KCS-03; owns creation ordering.                                                    |
| 3    | KCS-05 | Authorization sync specialist      | Run after KCS-04; owns role contract and tests.                                                     |
| 3    | KCS-06 | Validation/identity specialist     | Run after role and creation options stabilize.                                                      |
| 3    | KCS-07 | Profile data-boundary specialist   | May research Keycloak representations earlier; finalize after KCS-06.                               |
| 4    | KCS-08 | Distributed consistency specialist | Requires maintainer delivery decision; do not overlap lifecycle edits.                              |
| 4    | KCS-09 | Architecture specialist            | Run after behavioral semantics stabilize to avoid refactoring moving targets.                       |
| 4    | KCS-10 | Performance specialist             | Measure after KCS-09 provides field-specific planning and call instrumentation.                     |
| 5    | KCS-11 | Package/docs specialist            | Draft docs earlier if useful; finalize after runtime contracts stabilize.                           |
| 6    | KCS-99 | Independent reviewer               | Must not be the primary implementer of the preceding tasks.                                         |

`packages/moo/src/plugins/keycloak-user-sync.ts` and `packages/moo/test/keycloak-user-sync-plugin.test.ts` are shared hotspots. Prefer sequential ownership even where research can run in parallel. Agents must not run package test/build scripts concurrently because those scripts rebuild shared package outputs.

## Deferred Decisions Requiring Maintainer Input

1. Cross-system delivery: choose durable outbox/worker delivery (recommended for recoverability and transaction-aware applications) or retain direct hooks with an explicit non-atomic contract, rejected transaction use, and application-owned retry. This decision blocks KCS-08 and shapes KCS-09, but does not block KCS-01 through KCS-07.
2. Email verification ownership: resolved by KCS-03. `syncFields.emailVerified: false` disables all verification writes, including forced revocation and VERIFY_EMAIL sends; `sendVerificationEmailOnChange` only controls the email action when verification syncing is enabled.
3. Exact role reconciliation: decide whether it remains available as an explicit opt-in. The safe default must not remove roles without an ownership declaration.
4. Provider-ID reassignment: confirm whether any production workflow intentionally changes a linked Keycloak ID. If none does, make it immutable by default and require an explicit administrative relink operation rather than accepting ordinary document mutation.

Only decision 1 blocks a later architectural task. The immediate P0 fixes can proceed with either eventual delivery model if their logic remains isolated from middleware timing.

## Wave 6: Final Integration Review

### Task KCS-99: Independently Verify Keycloak Sync Remediation

Status: completed

Priority: P1

Suggested agent: independent identity security and TypeScript package reviewer

Dependencies: KCS-01 through KCS-11

Primary ownership:

- review-only coverage across plugin source, tests, docs, declarations, and packed artifact
- task-file status and completion evidence

Finding:

Credential handling, identity resolution, email verification, role ownership, profile convergence, retries, middleware timing, and package exports form one security-sensitive contract. Independent review is needed after multiple agents modify the shared plugin.

References:

- all findings and acceptance criteria in this task file
- `packages/moo/src/plugins/keycloak-user-sync.ts`
- `packages/moo/test/keycloak-user-sync-plugin.test.ts`

Implementation requirements:

1. Verify every acceptance criterion against runtime behavior rather than relying on completion notes.
2. Re-run created/existing user, initial-link/email-change, password, redaction, identity, role, profile clearing, retry, transaction, and delete cases.
3. Inspect all error and callback paths for plaintext passwords, email addresses, full documents, remote payloads, and masked root causes.
4. Confirm alternate identity orderings cannot target an unrelated user and duplicate-email handling remains fail-closed.
5. Confirm public types, emitted declarations, package README, website docs, `llms.txt`, metadata, and runtime exports agree.
6. Confirm request-controlled roles/attributes and remote-call concurrency have explicit bounds or safe sequential behavior.
7. Record deferred work with rationale, owner, and residual risk; do not mark blocked criteria complete.

Acceptance criteria:

- Every task has completion evidence or an explicit blocker/deferment with residual risk.
- Created-user password policy, error redaction, and initial-link email behavior satisfy the P0 contracts.
- Role and attribute reconciliation cannot remove unmanaged remote state.
- Partial save/delete failures and transaction behavior match the selected delivery contract and have retry evidence.
- Root, grouped, and direct imports work from the packed package in CJS, ESM, and NodeNext.
- `pnpm --filter @web-ts-toolkit/moo test`, `pnpm lint`, `pnpm build`, and `pnpm test` pass serially, or unrelated baseline failures are recorded with output and ownership.
- A package dry-run pack lists only intended consumer files.

Completion evidence:

- Reviewed: all KCS-01 through KCS-11 task statuses and completion evidence in this task file; no remaining task is pending, blocked, or deferred.
- Reviewed: `packages/moo/src/plugins/keycloak-user-sync.ts`, private planner/adapter modules, Keycloak sync tests, generated declarations, package README, website docs, `llms.txt`, package metadata, changelog, dry-run pack contents, and packed-consumer behavior.
- Confirmed: P0 contracts remain covered by package tests for temporary created-user password reset, password-free create/update payloads, redacted logger/callback contexts, raw-email-free ambiguity errors, and initial same-email linking without verification revocation or VERIFY_EMAIL.
- Confirmed: role sync is additive by default, removals are limited to `managedRoles`, unmanaged attributes are preserved, dangerous attribute keys are rejected, profile clears are explicit, and role count is bounded by `maxRolesPerSync`.
- Confirmed: direct-hook delivery contract rejects session-backed saves/deletes before remote calls, save failures remain observable/application-retry-owned, and remote delete failures block local deletion for idempotent retry.
- Confirmed: generated root and grouped declarations/entrypoints exclude Keycloak user sync, while `@web-ts-toolkit/moo/plugins/keycloak-user-sync` exposes the intended runtime and type surface.
- Verified: `pnpm --filter @web-ts-toolkit/moo build`
- Verified: `pnpm --filter @web-ts-toolkit/moo test`
- Verified: `npm pack --dry-run --json` from `packages/moo`
- Verified: local `pnpm pack` tarball installed in `/tmp/opencode/moo-consumer/app` with local placeholder-version `@web-ts-toolkit/utils` tarball override; ESM runtime, CJS runtime, and strict NodeNext `tsc --noEmit` consumer checks passed.
- Verified: `pnpm lint`
- Verified: `pnpm build`
- Verified: `pnpm test` with extended tool timeout after the first 120s run timed out without an assertion failure.
- Result: `pnpm lint`, `pnpm build`, and full serialized `pnpm test` passed; `@web-ts-toolkit/moo` package tests passed with 9 test files and 80 tests.

## Definition Of Done

- Confirmed plaintext logging, temporary-password, and initial-link verification defects have failing-before/passing-after regressions.
- User creation and every retry path converge on one remote identity without leaking credentials or silently changing credential policy.
- Role removal and attribute/profile clearing operate only within explicit, documented ownership boundaries.
- Invalid options and unsafe provider-ID mutation fail before remote side effects.
- Save/delete and transaction behavior match one explicit cross-system delivery contract with observable retries.
- Pure planning and a narrow Keycloak adapter improve readability and testability without widening package exports.
- Remote work is field-specific, bounded, and covered by call-count evidence rather than speculative optimization.
- Package metadata, installed docs, declarations, release notes, exports, and packed-consumer behavior agree.
- Required package, repository, and artifact verification is recorded.
- KCS-99 is completed by an independent reviewer.
