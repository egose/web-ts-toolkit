# Message Service Multi-App Adaptability

Created: 2026-10-18 18:56:29 (local timestamp, generated at task-file creation)

Current execution status: **MSGA-01 through MSGA-18 are completed**, including the
frontend typecheck follow-up and independent review. Both frontend compiler
projects now have zero diagnostics and all 43 frontend tests pass. Earlier
nine-error limitations and pending/blocked checkpoints below are historical;
the latest coordinator records supersede them.

## Objective and selected scope

Make `@web-ts-toolkit/message-service` straightforward to integrate into independent
Express + Mongoose applications with different authentication shapes, user
identifiers, provider integrations, and business handlers.

The maintainer selected **separate apps first**: each application configures its
own models/connections and template registry. Shared-collection tenant/application
isolation is a bounded investigation in MSGA-12, not an approved implementation.

Scope:

- Package implementation, public types, README/DESIGN, and focused regressions.
- Narrowly necessary Node and React reference-application integration fixes.
- Real-MongoDB multi-application fixtures and installed-package compatibility.
- Explicit decisions where existing contracts leave materially different designs.

The supported baseline remains Express 5+, Mongoose 8+, and Node 22+. Idempotent
creation and archival retain their transaction-capable MongoDB requirement.
Message IDs retain the existing ObjectId contract; MSGA-03 concerns user IDs.
Templates remain trusted application code, and successful actions retain their
terminal archival lifecycle.

Non-goals for this phase: a native MongoDB-driver adapter, Express 4 support, a
general workflow engine, conversation/read-receipt features, a dependency-injection
framework, or automatic execution of the feature deferrals listed below. Saving
this task document does not implement the backlog.

## Analysis coverage and baseline

Reviewed revision: `ffb9b1c`. `git status --short` was clean during review and again
before task-file creation. Two read-only research scopes examined identity/model
boundaries and lifecycle/provider boundaries; the coordinator checked package
metadata, source exports, build configuration, packed-consumer fixtures, reference
callers, CI commands, and related task histories.

The review inspected source, focused tests, README/DESIGN, and relevant Node/React
callers. Findings described as defects are established by code inspection and
existing contracts; they were not reproduced with new runtime probes in this
review. No builds, tests, installs, or provider experiments ran during analysis.
Generated `dist` declarations were absent in the reviewed checkout, so installed
declaration/runtime compatibility remains a verification requirement, not a
measured passing baseline. Historical completion evidence is not current evidence.

Production load, external-provider process death, the entire host domain-permission
model, arbitrary custom schemas, and the declared minimum-peer matrix were not
comprehensively evaluated.

### Existing work and corrections to the earlier assessment

Related completed plans:

- [Original remediation](20260823-151605-message-service-review-remediation.md):
  MSG-04/06/07/09 cover payment compensation, action execution, model integration,
  and best-effort email.
- [Boundary follow-up](20260912-095904-message-service-boundary-health-follow-up.md):
  MSGF-01/03/05/10/11/13 cover fencing, principal validation, payment compensation,
  creation timing, service injection, and installed contracts.
- [Residual workflow health](20260919-185326-message-service-residual-workflow-health.md):
  MSGR-01 through MSGR-06 cover cleanup outcomes, denied claims, public DTOs,
  authoritative reads, host integration, and review. Its consequential deferrals
  explicitly include tenancy, payload fingerprints, and host payload validation.

This is a new adaptability phase. Preserve those completed guarantees and link
new findings to their history rather than treating completed items as unimplemented.

- Connection-local models, custom model names, exact service injection, and
  per-instance registries already work. MSGA-11 expands integration evidence.
- `UserId` accepting strings does not make arbitrary string identities compatible
  with the bundled ObjectId reference schemas. A complete custom-schema recipe
  must include archive ownership fields.
- `adminRoles` currently expands recipients even when `toUser` is explicit.
- Action authorization spreads caller principals, which can lose getter-backed
  fields on hydrated Mongoose users.
- Expiry permits action-lease takeover; it does not itself cancel a handler or
  prevent the still-current owner from committing.
- The email provider callback is usable today. The remaining coupling is recipient
  address lookup, not the absence of an email-provider constructor option.
- Changed-payload completed replay, terminal actions, and session-bound email
  skipping are documented decisions, not newly discovered defects.
- The Node example defines payload validators without invoking them; the browser
  assumes envelopes that the package's create/action routes do not return.

## Priority, execution, and task maintenance

- **P1:** unintended authorization or recipient expansion.
- **P2:** contained integration correctness, portability, contract clarification,
  or compatibility evidence.
- All tasks start `pending`. Set `in_progress` only after dependencies complete.
  Use `blocked` for missing decisions or verification prerequisites, with the
  exact blocker and responsible owner. Record evidence before `completed`.
- Implement sequentially across shared hotspots: `message-service.ts`, template
  types, schema factories, route options, public exports, and README/DESIGN.
  Independent read-only investigations may overlap, but shared-file writers and
  build/test processes must not overlap.
- An investigation is complete with an evidence-backed implement/defer/no-action
  recommendation. Maintainer approval is needed before a resulting public-contract
  implementation. Add approved follow-ups with new IDs starting at MSGA-14; keep
  existing IDs stable and update MSGA-11/MSGA-13 dependencies before execution.
- Public behavior changes require updated tests, shipped README/JSDoc, and
  migration/release guidance in the package documentation. Follow the existing
  plans' convention of leaving root `CHANGELOG.md` to the release workflow.
- If implementation is delegated, each handoff identifies this file, task IDs,
  scope, dependencies, checks, and expected evidence. The final reviewer must be
  independent of the main implementer. No implementation/reviewer assignment is
  implied by the read-only analysis already performed.
- Keep all evidence repo-relative and scrub private session identifiers. Preserve
  unrelated worktree changes. Append new findings rather than rewriting history.

Suggested sequence: recipient/principal fixes, identity integration, provider and
input decisions, approved adaptation improvements, reference-app fixes, installed
compatibility, and independent review. MSGA-12 is independently investigable.

## Shared verification

Commands below run from `<repo-root>` unless a command itself selects a workspace.
Replace placeholders before execution. Installed dependencies, supported build
tooling, MongoDB memory-server binaries, and packed-consumer installation access
are prerequisites. The final full repository suite also needs its CI prerequisites,
including browser tooling for packages that use it.

Package tests rebuild transitive dependencies and write shared `dist` outputs.
Run build/test commands serially as required by `AGENTS.md`. Provision an ignored
repo-local `_tmp*` directory for temporary consumers, verify it with
`git check-ignore`, and set `TMPDIR` to that directory's absolute path before
starting tests that use `os.tmpdir()`. Record it only as a repo-scoped placeholder
such as `<repo-root>/_tmp-msga`, and clean temporary fixtures afterward.

- **V1 — Focused package regressions.** Build dependencies when needed with
  `pnpm --filter @web-ts-toolkit/message-service... build`, then run
  `pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false 'test/<actual-file>.test.ts'`.
  Substitute the actual affected test files; record the exact invocation. Prefer
  real MongoDB for casting, claims, transactions, replay, and connection isolation.
- **V2 — Package integration.**
  `pnpm --filter @web-ts-toolkit/message-service test`. This includes MongoDB,
  README, and packed ESM/CJS/strict TypeScript consumer checks. Run after a coherent
  implementation batch; subsequent changes invalidate affected earlier evidence.
- **V3 — Node reference host.**
  `pnpm --filter org-access-nodejs-example build:deps`, then
  `pnpm --filter org-access-nodejs-example typecheck`, then
  `pnpm exec vitest run --config vitest.config.ts --fileParallelism=false apps/nodejs/test/message-lifecycle.test.ts`.
  Record exact commands for any added focused host test files too.
- **V4 — Browser reference app.**
  `pnpm --filter react-vite test` and `pnpm --filter react-vite build` after adding
  the focused contract regression. No current browser-test baseline is claimed.
- **V5 — Hygiene and final workspace integration.** `git diff --check`, then
  `pnpm lint`, `pnpm build`, and `pnpm test`, serially at final integration.
  Record unrelated failures precisely; do not change other packages merely to
  obtain a passing summary. Required unverified criteria keep the affected task
  blocked, and required workspace failures keep final integration blocked.
- **V6 — Investigation/document evidence.** Review inspected references, the
  bounded questions, compatibility/migration implications, decision ownership,
  and implement/defer/no-action recommendation. Documentation-only work uses
  content/link/formatting review rather than a new runtime-test requirement.

Defect regressions should demonstrate fail-before/pass-after where feasible
without reverting or stashing unrelated work. Add public API assertions to the
existing packed-consumer harness rather than claiming source imports establish
installed-package compatibility. Do not manually edit generated declarations.

## Tasks

### Task MSGA-01: Correct fallback recipient-role behavior

Status: completed

Assigned: MSGA-01 implementation sub-agent (fresh session, sequential execution)

Kind: defect

Priority: P1 — enabling fallback roles can grant unintended message visibility and receiver-action eligibility.

Dependencies: none

Primary ownership:

- `packages/message-service/src/message-service.ts` (`buildMessageDocument`)
- `packages/message-service/test/message-service.mongodb.test.ts`
- Focused recipient and action-authorization regressions; relevant README contract

Finding:

`buildMessageDocument` applies `adminRoles` whenever prepared `toRoles` is absent
or empty, including messages with an explicit `toUser`. The README describes
fallback when no direct/role recipient is specified. Role membership is an
independent receiver grant, subject to any additional action permission/condition.
No focused fallback regression was found in the inspected tests.

References:

- `packages/message-service/src/message-service.ts:1014-1041` (`buildMessageDocument`)
- `packages/message-service/src/schemas/methods.ts:10-13` (`isReceiver`)
- `packages/message-service/src/message-service.ts:649-653` (`buildVisibilityFilter`)
- `packages/message-service/README.md:160-172` (`adminRoles` option)

Requirements:

1. Apply fallback roles according to the documented recipient-defaulting contract.
2. Preserve deliberately supplied direct-recipient-plus-role combinations.
3. Specify whether an explicit empty role array suppresses fallback when no direct
   recipient exists. Document the decision and any migration impact.

Acceptance criteria:

- A directly addressed message with omitted/empty roles is not visible or
  actionable to fallback-only users.
- Intentionally unaddressed messages receive the documented fallback.
- Explicit role recipients remain eligible.
- List, count, action listing, execution, and archived relationship outcomes agree.

Verification: V1 recipient/authorization regressions, V2 at package integration.

Completion evidence (2026-10-18, task-local implementation):

- Decision: omitted `toRoles` and explicit `[]` both use `adminRoles` only when
  prepared `toUser` is absent. Empty roles intentionally do not suppress the
  documented unaddressed fallback. A direct recipient with omitted/empty roles
  stores `[]`; explicit nonempty roles remain intact with or without `toUser`,
  including deliberately supplied admin roles alongside a direct user.
- Implementation: one recipient-defaulting expression in `buildMessageDocument`,
  retaining the array copy, plus public `adminRoles` JSDoc. The real-MongoDB matrix
  adds seven recipient configurations in both direct and idempotent creation
  (14 regressions). It checks list/count, receiver-action listing, denied mutation
  without handler effects or attempt-ID disclosure, legitimate execution,
  transactional archive movement, and stored archived relationship gates.
  Combined-recipient cases execute as a role-only user.
- Migration: README/DESIGN document the matrix, explicit-role opt-in for direct
  messages, and review of legacy active/archive grants. Existing stored records
  and completed idempotent replays retain their recipients; application knowledge
  is needed to distinguish old implicit fallback from intentional combined grants.
- Changed paths:
  - `packages/message-service/src/message-service.ts`
  - `packages/message-service/test/message-service.mongodb.test.ts`
  - `packages/message-service/README.md`
  - `packages/message-service/DESIGN.md`
  - `docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
- Execution environment: all commands ran from `<repo-root>`, with build/test
  processes serialized. Runtime commands used `ASDF_NODEJS_VERSION=26.11.1`;
  `ASDF_NODEJS_VERSION=26.11.1 node --version` returned `v26.11.1`. Test/build
  `TMPDIR` was the absolute path represented here only as `<repo-root>/_tmp-msga`.
  Command paths below normalize that environment value to this placeholder.
  Parent verification used `ls -ld <repo-root>` before directory creation;
  `git check-ignore -v _tmp-msga` confirmed `.gitignore:8:_tmp*`. Temporary MongoDB
  fixtures and the generated compile cache were removed after tests; the ignored
  directory was left empty. MongoDB memory-server used a real 8.2.6 replica set.
- Build, before the reproduction and again after the fix (both passed, five
  packages, including ESM/CJS and declarations):
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service... build`.
  Inspection confirmed the option JSDoc in both generated `dist/index.d.ts` and
  `dist/index.d.mts`.
- Fail-before/pass-after, regression written before changing the implementation:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.mongodb.test.ts -t 'recipient fallback'`.
  Before: exit 1, **4 failed / 10 passed / 27 skipped**; the four failures exposed
  fallback-only inbox visibility for direct recipients with omitted/empty roles
  in both creation modes. After: exit 0, **14 passed / 27 skipped**, including all
  action/archive assertions. The skipped tests were outside the name filter.
- V1 affected/nearby verification:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.mongodb.test.ts test/message-service.test.ts test/message-service.action-target-authz.test.ts test/message-service.authoritative-reads.test.ts test/message-service.permission-grants.test.ts test/message-service.action-fencing.test.ts test/message-service.direct-archive.test.ts test/message-service.transaction-cleanup.test.ts test/message-service.payment-compensation.test.ts test/message-service.readme-contract.test.ts`.
  Passed: **10 files / 182 tests**, no skips, covering recipient defaults plus
  authoritative authorization, strict permission grants, archive outcomes,
  fencing, direct archival, transaction cleanup, payment compensation, and the
  README create/action recipe.
- Formatting:
  `ASDF_NODEJS_VERSION=26.11.1 pnpm exec prettier --check packages/message-service/src/message-service.ts packages/message-service/test/message-service.mongodb.test.ts packages/message-service/README.md packages/message-service/DESIGN.md docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Passed for all five changed paths after applying the formatter's requested
  README table/test-line corrections with `apply_patch`.
- Lint: `ASDF_NODEJS_VERSION=26.11.1 pnpm lint` passed (repository-wide ESLint).
  Whitespace: `git diff --check` and
  `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  passed; the second command includes the still-untracked task document.
- Status is **local MSGA-01 completion**: required V1 and local hygiene passed.
  **V2 is due at coherent batch/package integration**, as specified by the shared
  rules: `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service test`.
  That full package/packed-consumer check, final workspace build/test, and
  independent integration review remain coordinator integration work; this
  evidence establishes the focused task's behavior rather than batch acceptance.

### Task MSGA-02: Preserve authenticated principal fields consistently

Status: completed

Assigned: MSGA-02 implementation sub-agent (fresh session, sequential execution)

Kind: defect

Priority: P2 — supported caller shapes can produce inconsistent inbox and action authorization.

Dependencies: none

Primary ownership:

- `packages/message-service/src/message-service.ts` (principal handling and user-facing entry points)
- `packages/message-service/src/schemas/methods.ts`
- `packages/message-service/test/message-service.principal-validation.test.ts`
- `packages/message-service/test/message-service.authoritative-reads.test.ts`

Finding:

`getActions` and `handleAction` build authorized principals using object spread.
Hydrated Mongoose users can expose roles/display names through prototype getters,
so copying own enumerable properties loses those fields even though list/count
can read them. List/count also resolve a model before validating the principal.
The inspected principal tests use plain objects and do not prove hydrated-caller
parity. Separately, a malformed string `roles` value can use substring `.includes`
in `isReceiver`; treat its rejection as adapter hardening, not a demonstrated
attacker-controlled route exploit.

References:

- `packages/message-service/src/message-service.ts:664-691` (`listMessages`, `countMessages`)
- `packages/message-service/src/message-service.ts:733-740,806-829` (authorized principal copies)
- `packages/message-service/src/schemas/methods.ts:10-13` (`isReceiver`)
- `packages/message-service/test/message-service.principal-validation.test.ts:69-82,169-205`

Requirements:

1. Preserve documented `MessageUser` fields independently of enumerability, without
   serializing an arbitrary user document into public output.
2. Validate principals before model resolution on user-facing entry points.
3. Define malformed-role handling consistently across visibility and action paths;
   missing optional roles remain valid and must not be confused with invalid roles.
4. Preserve authoritative stored-target checks, original request extraction, and
   the existing trusted-host boundaries of find/notification/direct-archive APIs.

Acceptance criteria:

- Plain, getter-backed, and hydrated callers with equivalent IDs/roles produce
  equivalent list/count/action/archived-outcome decisions.
- Handlers retain documented presentation fields; caller objects are not mutated.
- Invalid list/count principals cause zero model-resolver calls.
- Non-array or invalid-element roles never widen access or create substring grants.

Verification: V1 principal, authoritative-read, and action regressions; V2.

Completion evidence (2026-10-18, task-local implementation):

- Contract: action principals explicitly read `_id`, `id`, `roles`, and
  `displayName`, independently of enumerability, and copy the roles array.
  Handlers receive only these documented fields; arbitrary user properties,
  private getters, Mongoose internals, `toObject()`, and `toJSON()` are not read
  or copied. The existing action string-ID normalization is retained. List/count
  build and validate their visibility filter before resolving the active model.
- Role policy: omitted/undefined roles and `[]` remain valid. Any provided roles
  must be an array containing only strings, including no sparse entries. Invalid
  roles reject the whole principal with `InvalidMessageUserError` before service
  effects (401 at every route), including direct relationships and admin views.
  Active/archive `isSender`/`isReceiver` helpers return false for malformed roles.
  Exact case-sensitive string membership is retained; strings cannot create
  substring grants, and mixed arrays do not retain their valid-element grants.
- Boundaries: original request/extractor values and preparation's original user
  are preserved. Authoritative claims and stored archive relationship checks
  remain in force, including stale active/archive copies, pending notification
  outcomes, and denied attempt-ID disclosure. Trusted find/notification/direct
  archive APIs and stored ID normalization were not changed. MSGA-01 work was
  inspected first and preserved; MSGA-03 identity policy remains separately scoped.
- Regression coverage: **45 new tests**, comprising 29 principal/route cases and
  16 real-MongoDB cases. The latter include plain/prototype-getter/hydrated users
  across sender/direct/role relationships, presentation fields in handler context,
  private-field/serializer exclusion, caller nonmutation (including handler-local
  edits to the copied roles), transaction-backed archive ownership, terminal and
  notification-pending outcomes, revoked stored grants, malformed string/mixed
  roles, and a live HTTP create/list-actions/execute flow with custom extractors
  receiving the original Express request despite a decoy default request user.
  Hydrated users are persisted and re-read from MongoDB; a Mixed role path keeps
  malformed fixture values from being silently cast into valid arrays.
- Shipped guidance: README documents the policy and migration for malformed-role
  adapters and handlers relying on extra spread user fields (explicit typed host
  request data or template-factory closures). No stored-message migration is
  needed. Public `MessageUser`, `ActionContext.user`, principal-validation, and
  route-extractor JSDoc describe the contract; inspection confirmed these comments
  in both generated `dist/index.d.ts` and `dist/index.d.mts` after the build.
- MSGA-02 changed paths:
  - `packages/message-service/src/message-service.ts`
  - `packages/message-service/src/schemas/methods.ts`
  - `packages/message-service/src/route-factory.ts` (JSDoc only)
  - `packages/message-service/src/types/message.ts`
  - `packages/message-service/src/types/template.ts`
  - `packages/message-service/test/message-service.principal-validation.test.ts`
  - `packages/message-service/test/message-service.authoritative-reads.test.ts`
  - `packages/message-service/README.md`
  - `docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
- Environment: commands ran from `<repo-root>`; all build/test invocations were
  serialized and used `ASDF_NODEJS_VERSION=26.11.1`.
  `ASDF_NODEJS_VERSION=26.11.1 node --version` returned `v26.11.1`.
  Read/`ls -ld "<repo-root>" "<repo-root>/_tmp-msga"` verified the pre-existing
  empty temporary directory; `git check-ignore -v _tmp-msga` confirmed
  `.gitignore:8:_tmp*`. Build/test `TMPDIR` used its absolute path, normalized below
  to `<repo-root>/_tmp-msga`. Tests used a real MongoDB replica set. After testing,
  process inspection found no remaining repo-local MongoDB processes;
  `rm -r -- "<repo-root>/_tmp-msga"/mongo-mem-* "<repo-root>/_tmp-msga/node-compile-cache"`
  removed generated fixtures/cache, and a directory read confirmed it was empty.
- Build, before reproduction and after implementation (both exit 0, five packages
  including ESM/CJS and declarations):
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service... build`.
- Fail-before/pass-after command (new regressions written before the fix):
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.principal-validation.test.ts test/message-service.authoritative-reads.test.ts -t 'MSGA-02'`.
  Before: exit 1, **44 failed / 1 passed / 60 skipped**, reproducing getter-field
  loss, private spread fields, substring/mixed-role grants, premature list/count
  model resolution, and malformed-role acceptance. First post-fix run: exit 1,
  **9 failed / 36 passed / 60 skipped** because the test's `not.toBe(user)` matcher
  itself inspected the private getter; replacing it with a boolean reference
  comparison isolated implementation reads. Final run: exit 0, **45 passed /
  60 skipped**. Skips were outside the name filter.
- V1 affected/nearby command:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.principal-validation.test.ts test/message-service.authoritative-reads.test.ts test/message-service.action-target-authz.test.ts test/message-service.permission-grants.test.ts test/message-service.action-fencing.test.ts test/message-service.direct-archive.test.ts test/message-service.test.ts test/message-service.mongodb.test.ts test/schemas.test.ts test/template-engine.test.ts test/route-factory.test.ts test/message-service.route-service-reuse.test.ts test/message-service.public-message.test.ts test/message-service.rendering-separation.test.ts test/message-service.readme-contract.test.ts`.
  Exit 0, **15 files / 336 tests passed**, no skips. This includes MSGA-01's
  recipient matrix, authoritative target checks, permission grants, ownership
  fencing, direct archival, schema relationships, route reuse, public DTOs,
  rendering separation, creation/replay, and the README integration recipe.
- After strengthening the role-copy assertion to compare against independent
  pre-call role values, rechecked the affected file with
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.authoritative-reads.test.ts`.
  Exit 0, **1 file / 30 tests passed**, no skips. All test invocations printed
  Vite's existing native-config-loader advisory; it did not affect test outcomes.
- Formatting command:
  `ASDF_NODEJS_VERSION=26.11.1 pnpm exec prettier --check packages/message-service/src/message-service.ts packages/message-service/src/schemas/methods.ts packages/message-service/src/route-factory.ts packages/message-service/src/types/message.ts packages/message-service/src/types/template.ts packages/message-service/test/message-service.principal-validation.test.ts packages/message-service/test/message-service.authoritative-reads.test.ts packages/message-service/README.md docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Final exit 0 for all nine paths. Earlier checks requested formatting in the two
  added test sections, then the strengthened expected-object assertion; corrections
  were applied with `apply_patch` using read-only formatter output.
- Hygiene: `ASDF_NODEJS_VERSION=26.11.1 pnpm lint` passed (repository-wide ESLint).
  `git diff --check` exited 0 without whitespace diagnostics.
  `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  also emitted no whitespace diagnostics; its exit 1 is the expected new-file
  content difference against `/dev/null`, confirmed by capturing the exit code.
  This second check includes the still-untracked task document.
- Status is **local MSGA-02 completion**: focused acceptance, V1, build, and local
  hygiene passed, with no unresolved task-local prerequisites. **V2 was not run**:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service test`
  is coordinator batch integration, including packed consumers, not a passing
  baseline established by this task. Final workspace build/test and independent
  integration review also remain coordinator work.

### Task MSGA-03: Establish a supported arbitrary-string user-ID integration

Status: completed

Assigned: MSGA-03 implementation sub-agent (fresh session, sequential execution)

Kind: improvement

Priority: P2 — applications with external or UUID user identities need a complete, consistent integration contract.

Dependencies: MSGA-02

Primary ownership:

- `packages/message-service/src/schemas/base.ts`
- `packages/message-service/src/schemas/message-archive.ts`
- `packages/message-service/src/schemas/message.ts`
- `packages/message-service/src/schemas/methods.ts`
- Identity handling in `packages/message-service/src/message-service.ts`, public types, and MongoDB fixtures

Finding:

`UserId` accepts strings, while bundled `fromUser`, `toUser`, and `archivedBy`
fields are ObjectIds. Custom String schemas are possible, but overriding active
parties alone leaves archival incompatible. String principal validation trims
IDs, while creation can persist the original value; a custom String schema can
therefore store a padded ID that inbox queries do not find. ObjectId instances
normalize to lowercase hex while principal strings remain case-sensitive, which
can also make query casting and relationship comparison disagree. Existing mock
tests do not establish end-to-end arbitrary-string storage behavior.

References:

- `packages/message-service/src/types/message.ts:26-42` (`UserId`, `MessageUser`)
- `packages/message-service/src/schemas/base.ts:30-38` (default reference types)
- `packages/message-service/src/schemas/message-archive.ts:28-37` (`archivedBy`)
- `packages/message-service/src/message-service.ts:264-272,458-464,1036-1051,1608-1613`
- `packages/message-service/src/schemas/methods.ts:20-35` (identity comparison)

Requirements:

1. Provide a documented and tested configuration for arbitrary string user IDs
   across active/archive records, including `archivedBy`. Prefer existing schema
   customization when sufficient; justify any new public storage configuration
   with the complete consumer fixture.
2. Establish consistent validation, storage, query, comparison, and request-scope
   normalization. Preserve native ObjectId storage and case-sensitive opaque strings.
3. Define ObjectId/hex-string equivalence without lowercasing arbitrary identities.
4. Address legacy record and idempotency-key compatibility before changing persisted
   normalization; document any migration rather than silently merging scopes.

Acceptance criteria:

- ObjectId and non-hex string configurations complete creation, list/count, actions,
  service/direct archival, replay, and public serialization against real MongoDB.
- Padded identities do not create messages that disappear from inbox queries.
- Approved ObjectId representations agree, while distinct opaque strings stay distinct.
- Default schemas remain usable without extra configuration; message IDs retain
  their ObjectId route contract.
- A public-root-import example typechecks from the installed package.

Verification: V1 real-MongoDB identity/lifecycle tests, V2 packed consumers.

Completion evidence (2026-10-18, task-local implementation):

- Configuration decision: existing schema factories plus `schema.add()` are
  sufficient; no new public storage API or exported helper was added. The shipped
  root-import `createStringIdMessaging` recipe overrides `fromUser`/`toUser` on
  **both** active/archive schemas and archive **`archivedBy`**, using String paths
  with trim, nonempty validation, null defaults, and the archive ownership index.
  Factory methods/hooks/timestamps/lifecycle indexes remain available. Request
  storage is already String; message `_id` and attachment IDs stay ObjectId.
- Normalization: template persistence trims default/prepared sender and prepared
  recipient strings in direct/idempotent creation without mutating the original
  principal supplied to preparation. Native ObjectId inputs are preserved for
  schema casting. Direct archive ownership now trims its validated string input;
  service archival already uses the validated action snapshot. Trusted generic
  notifications retain raw host input, with schema setters in the String recipe
  handling host Mongoose writes. Direct archive still performs no relationship or
  permission authorization; arbitrary preparation fields are still excluded.
- Comparison decision: a **stored native ObjectId** (also a populated `_id`)
  accepts ObjectId/lowercase/uppercase 24-hex principal representations with trimmed
  padding, matching default query casting. **Stored Strings** use exact trimmed
  case even for hex-looking values. ObjectId input into String storage maps to its
  lowercase hex identity only. DTOs preserve string case and emit ObjectId hex,
  including archive ownership; serialization neither authorizes nor repairs data.
- Request-scope decision: retain existing trimmed, case-sensitive textual owner
  keys. Native ObjectId and lowercase hex share a key; uppercase hex remains a
  different key even when party storage uses ObjectIds. Relationship equivalence
  does not silently alias/merge scopes. Tests seed separate legacy upper/lower
  completed reservations with active/archive items and prove exact replay without
  preparation or new reservations under both configurations.
- Limits/migration: String integrations require consistent BSON String party
  storage and simple/binary collation. Significant outer whitespace, mixed legacy
  BSON types, case-insensitive collations, and custom case-folding setters are
  outside the recipe. README/DESIGN explain raw-BSON padding inspection, drained
  host mapping/type migration, collision checks, and coordinated scope migration
  across request/active/archive records if a host changes principal values or
  hex canonicalization. Conflicting historical batches/business effects need
  application reconciliation; unreconcilable histories retain exact-scope legacy
  retries through their retention window. No automatic data or scope rewrite.
- Coverage: **15 new real-MongoDB tests** cover ObjectId mixed representations,
  arbitrary case-sensitive IDs and hex-looking opaque IDs, sender/receiver
  list/count/actions, denied case variants, normalized handler actors, native BSON
  types, service/direct transaction-backed archive ownership, mixed/final replay,
  sender notifications, hydrated populated parties and DTO exclusions, padding
  even without schema setters, unchanged trusted notification input, ignored
  top-level preparation overrides, and separate fresh/legacy scope histories.
- Added **one focused packed-consumer test**: extracts the recipe from the
  **installed tarball's README**, compiles strict NodeNext ESM/CommonJS and Bundler
  consumers with `skipLibCheck: false`, then runs the compiled recipe's real-MongoDB
  lifecycle through **both ESM and CommonJS** package-root APIs. It verifies active
  parties, service/direct `archivedBy`, native message IDs, list/count/actions,
  case-sensitive denials, replay, and serializer output, and checks relevant JSDoc
  in packed `.d.ts` and `.d.mts` declarations. This establishes the task-local
  installed recipe; it is not the full V2 compatibility batch or minimum-peer lane.
- MSGA-03 changed paths (pre-existing MSGA-01/02 work inspected and preserved):
  - `packages/message-service/src/user-id.ts` (package-private helper)
  - `packages/message-service/src/message-service.ts`
  - `packages/message-service/src/schemas/methods.ts`
  - `packages/message-service/src/schemas/message.ts`
  - `packages/message-service/src/schemas/message-archive.ts`
  - `packages/message-service/src/types/message.ts` (JSDoc only)
  - `packages/message-service/test/message-service.user-ids.mongodb.test.ts`
  - `packages/message-service/test/message-service.packed-consumer.test.ts`
  - `packages/message-service/README.md`
  - `packages/message-service/DESIGN.md`
  - `docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
- Environment: all commands ran from `<repo-root>` with build/test processes
  serialized and no delegated/concurrent workers. Runtime commands used
  `ASDF_NODEJS_VERSION=26.11.1` (`node --version`: `v26.11.1`).
  `ls -ld "<repo-root>" "<repo-root>/_tmp-msga"` verified the pre-existing temporary
  directory; `git check-ignore -v _tmp-msga` confirmed `.gitignore:8:_tmp*`.
  Build/test `TMPDIR` was its absolute path, normalized below to
  `<repo-root>/_tmp-msga`. MongoDB tests used actual replica-set transactions.
- Build, before reproduction and after implementation: exit 0 for both, five
  transitive packages, ESM/CJS plus declarations:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service... build`.
  Declaration inspection confirmed identity/scoping and complete schema recipe
  guidance survives in both generated declaration formats.
- Fail-before/pass-after command:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.user-ids.mongodb.test.ts`.
  Before implementation: exit 1, **8 failed / 5 passed** (13 initial regressions),
  reproducing padded default/prepared parties, padded default ObjectId cast errors,
  padded direct ownership, and uppercase-hex query/action disagreement. After
  implementation and two additional fresh case-distinct scope cases: exit 0,
  **15 passed**, no skips. No unrelated changes were reverted/stashed to reproduce.
- Focused installed/public recipe validation:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.packed-consumer.test.ts -t MSGA-03`.
  Exit 0, **1 passed / 9 skipped** (other cases excluded by the name filter).
- V1 affected/neighboring verification:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.user-ids.mongodb.test.ts test/message-service.principal-validation.test.ts test/message-service.authoritative-reads.test.ts test/message-service.action-target-authz.test.ts test/message-service.permission-grants.test.ts test/message-service.action-fencing.test.ts test/message-service.direct-archive.test.ts test/message-service.test.ts test/message-service.mongodb.test.ts test/schemas.test.ts test/template-engine.test.ts test/route-factory.test.ts test/message-service.route-service-reuse.test.ts test/message-service.public-message.test.ts test/message-service.rendering-separation.test.ts test/message-service.readme-contract.test.ts test/message-service.transaction-cleanup.test.ts test/message-service.payment-compensation.test.ts`.
  Exit 0, **18 files / 378 tests passed**, no skips. Includes MSGA-01 recipient
  fallback and MSGA-02 getter/hydrated/role regressions, authorization/fencing,
  direct archive, payment compensation, transaction cleanup, DTOs, routes, and
  README behavior. Existing Vite native-config-loader advisories were non-failing.
- Formatting:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check packages/message-service/src/user-id.ts packages/message-service/src/message-service.ts packages/message-service/src/schemas/methods.ts packages/message-service/src/schemas/message.ts packages/message-service/src/schemas/message-archive.ts packages/message-service/src/types/message.ts packages/message-service/test/message-service.user-ids.mongodb.test.ts packages/message-service/test/message-service.packed-consumer.test.ts packages/message-service/README.md packages/message-service/DESIGN.md docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Passed after applying read-only formatter suggestions with `apply_patch`.
- Hygiene: `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm lint`
  passed repository-wide. `git diff --check` and no-index whitespace checks against
  `/dev/null` for the new helper, new MongoDB test, and untracked task document
  produced no whitespace diagnostics. Packed temporary consumers cleaned themselves;
  process inspection found no remaining MongoDB processes, generated MongoDB/cache
  directories were removed from `<repo-root>/_tmp-msga`, and a final directory read
  confirmed it was empty.
- Status is **local MSGA-03 completion**: focused lifecycle, public-root installed
  recipe, build, and hygiene acceptance is demonstrated, with no task-local blocker.
  **Full V2 remains coherent batch integration**:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service test`.
  The full package/packed suite, bounded minimum/current peers/runtime matrix,
  final workspace build/test, and independent integration review remain MSGA-11/13
  coordinator checks; this evidence does not claim they ran.

### Task MSGA-04: Resolve payment configuration semantics

Status: completed

Assigned: MSGA-04 investigation sub-agent (fresh session, sequential execution)

Kind: investigation

Priority: P2 — provider omission currently changes creation behavior, but the required-payment contract needs an explicit decision.

Dependencies: none

Primary ownership:

- Payment creation contract in `packages/message-service/src/message-service.ts`
- `packages/message-service/src/providers/payment.ts`
- Focused payment tests and package README/DESIGN decision evidence

Finding:

A nonempty payment code with no provider can create a message with a null session.
A configured no-op provider instead fails when its null return is checked. A
payment code with no recipient can also skip session creation. The README calls
the provider optional, while design prose describes templates as specifying
whether payment is required. This is a configuration-contract gap, not proof
that checkout/payment-completion authorization is bypassed.

References:

- `packages/message-service/src/message-service.ts:1014-1027` (`buildMessageDocument`)
- `packages/message-service/src/providers/payment.ts:38-71`
- `packages/message-service/README.md:160-166`
- `packages/message-service/DESIGN.md:18-25`
- `packages/message-service/test/message-service.test.ts:970-1028` (configured-provider failures)

Requirements:

1. Determine whether a payment code requests mandatory session creation or may
   represent sessionless metadata. Recommend an explicit policy to the maintainer.
2. Cover absent/null/no-op providers, missing recipients, template/item overrides,
   and whether an empty item override can disable a template payment code.
3. Specify a typed failure and route behavior if the selected policy requires a
   provider. Address direct/idempotent creation and migration compatibility.
4. Preserve completed replay without rerunning preparation/payment and preserve
   compensation of known uncommitted sessions and sequential batch semantics.

Acceptance criteria:

- A decision matrix and evidence-backed recommendation cover each configuration.
- The maintainer decision or remaining blocker is recorded explicitly.
- An approved behavioral change receives a new implementation task with tests for
  missing-provider failure, no committed paid message, replay, and compensation.
- Payment completion, capture, and webhooks remain host/provider responsibilities.

Verification: V6 contract review; V1 focused configuration probes only as needed
to resolve uncertainty. Do not close an implementation follow-up on design evidence.

Completion evidence (2026-10-18, investigation only):

- **Outcome:** V6 investigation completed against the current worktree, including
  MSGA-01/02/03. Recommend implementing the session-required contract below,
  **subject to explicit maintainer approval**. The maintainer has not selected a
  payment policy; that decision blocks implementation, not investigation completion.
- Evidence is source/contract inspection and review of existing test assertions.
  The matrices compose: resolve the item code, resolve recipients, apply the
  provider row, then apply the batch/replay row. They assume valid prepared user
  references and otherwise successful rendering/persistence. No new runtime probe
  was necessary to establish these explicit branches.

#### MSGA-04 code and recipient matrix

Code selection is exactly `m.paymentCd || template.paymentCd || ''` in
`packages/message-service/src/message-service.ts:1041-1055`. Both declarations
are optional strings (`packages/message-service/src/types/template.ts:22-32,107-116`);
raw caller `payload.paymentCd` is not an override unless trusted preparation maps
it into the result. Only the prepared item's `priceArgs` reaches the provider.

| Template code   | Prepared item code     | Effective code, current and recommended                                |
| --------------- | ---------------------- | ---------------------------------------------------------------------- |
| Omitted or `''` | Omitted or `''`        | `''`; no payment-session call for any provider/recipient configuration |
| Nonempty `T`    | Omitted                | `T`                                                                    |
| Nonempty `T`    | `''`                   | `T`; an empty override **cannot disable** the template code            |
| Any             | Nonempty `I`           | `I`; the item overrides the template                                   |
| Any             | Whitespace-only string | That exact string; currently truthy, with no trimming/code grammar     |

Runtime `null` codes also fall through the `||` expression, but are outside these
public string types. Recommendation: preserve this selection rule and exact code
values, including empty-override inheritance. A template without a default code can
return mixed free/paid items by setting codes only on paid items. Adding explicit
clearing to a paid default would be a separate contract choice, not an incidental
switch from `||` to `??`.

Recipients are resolved before the provider gate. MSGA-01's corrected fallback is
already present (`packages/message-service/src/message-service.ts:1041-1048`;
`packages/message-service/test/message-service.mongodb.test.ts:167-304`). With a
nonempty effective code and a configured provider:

| Prepared recipients / service configuration             | Stored recipients          | Current session attempt         | Recommended session attempt     |
| ------------------------------------------------------- | -------------------------- | ------------------------------- | ------------------------------- |
| No `toUser`, omitted/empty roles, `adminRoles: []`      | No recipients              | Skipped; null session           | Required                        |
| No `toUser`, omitted/empty roles, nonempty `adminRoles` | Fallback roles             | One per item                    | One per item                    |
| Direct `toUser`, omitted/empty roles, any `adminRoles`  | Direct user, `toRoles: []` | One per item                    | One per item                    |
| No `toUser`, explicit nonempty roles                    | Explicit roles             | One per item                    | One per item                    |
| Direct `toUser` plus explicit nonempty roles            | Both explicit grants       | One per item, not per recipient | One per item, not per recipient |

Neither sender presence alone nor an empty fallback opens the current recipient
gate. Changing only `adminRoles` can therefore change whether a provider is called.
The payer is **not** the recipient or prepared sender: it is
`(payerUser || user)._id`. Both supplied principals are validated before effects;
HTTP supplies the authenticated user as payer
(`packages/message-service/src/message-service.ts:479-486,1048-1053`;
`packages/message-service/src/route-factory.ts:395-405`). The recommendation removes
the recipient gate: an already-known payer makes a new missing-recipient payment
error unnecessary. Host recipient/business validation remains a separate concern.

#### MSGA-04 provider matrix

Omitted/undefined and explicit null providers are identical:
`options.paymentProvider ?? null`, not an automatically installed no-op
(`packages/message-service/src/message-service.ts:79-83,338-347`). For a nonempty
effective code:

| Provider configuration                 | Current: direct, role, or fallback recipient              | Current: no recipient/fallback      | Recommended: any recipient configuration                |
| -------------------------------------- | --------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| Omitted/undefined                      | No call; code stored with null session                    | Same                                | Typed missing-provider failure before this item's write |
| Explicit `null`                        | Same as omitted                                           | Same                                | Same typed missing-provider failure                     |
| `NoopPaymentProvider`                  | Called; null return causes creation failure               | Not called; null session can commit | Called; creation fails                                  |
| Other provider returns `null` or `''`  | `Error('payment session creation failed')`; no item write | Not called; null session can commit | Same existing failure                                   |
| Provider throws/rejects                | Original rejection propagates; no item write              | Not called; null session can commit | Same original rejection                                 |
| Provider returns a nonempty session ID | Session ID stored if persistence succeeds                 | Not called; null session can commit | Session ID required and stored if persistence succeeds  |

An effective `''` skips all provider calls, including Noop/throwing providers, and
stores a null session. These outcomes follow
`packages/message-service/src/message-service.ts:1044-1085`; schemas accept both
fields independently (`packages/message-service/src/schemas/base.ts:39-40`).
`packages/message-service/src/providers/payment.ts:38-71` explicitly makes null a
failure result, while describing Noop as useful for nonpayment apps/tests. Noop is
therefore not a successful paid-session adapter. The recommendation keeps it that
way rather than inventing a dummy successful session ID.

#### MSGA-04 creation, mixed-batch, and replay matrix

| Entry/state                                                                | Existing behavior to preserve under the recommendation                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct single item, no `clientRequestId`                                   | Build/session work precedes `Message.create`. A called provider's null/throw prevents that item from being written. The new missing-provider failure must do the same.                                                                                                                                                                                                                                                                      |
| Direct mixed free/paid batch                                               | Process items sequentially, build then persist each. Failure stops later items; earlier committed items and their sessions remain. Compensate only the failing item's known uncommitted session. Do not introduce whole-batch preflight/atomicity or compensate the committed prefix.                                                                                                                                                       |
| Fresh idempotent mixed free/paid batch                                     | Acquire the scoped reservation before preparation/payment; build items sequentially outside the retryable transaction callback. Commit all documents plus reservation completion/item count atomically. Any build/configuration failure commits no batch items and expires all earlier known uncommitted sessions; transaction/setup failure likewise compensates all known sessions. The normal failure path records a failed reservation. |
| Completed same-scope replay, active, mixed active/archive, or all archived | Return current stored records in exact item-index order before template lookup/preparation/provider work. Preserve stored codes/sessions, including legacy nonempty-code/null-session items. Reconfiguration to absent/null/Noop/throwing providers, template replacement/removal, or changed payload/payer does not re-evaluate payment. Principal/payer validation still runs first.                                                      |
| Failed or live pending reservation                                         | A failed key raises `ClientRequestFailedError` (HTTP 409) without new provider work, even after configuration is repaired; use a new key after reconciliation. Pending duplicates retain bounded wait/lease takeover and `ClientRequestPendingError` (409). Do not turn configuration errors into automatic retries of failed keys.                                                                                                         |
| Preparation returns null or an empty array                                 | No items means no payment work, even if the template declares a code. Idempotent zero-item completion/replay remains `[]`.                                                                                                                                                                                                                                                                                                                  |

Implementation evidence:
`packages/message-service/src/message-service.ts:516-623,1017-1031,1088-1214,1682-1800,1884-1900`.
Without a request key, another call is fresh creation, not completed replay.
Replay retains exact requester/template/key namespaces, the bounded reconciliation
read, archive retention limits, and inconsistent-state errors rather than creating
replacement messages/sessions.

Existing assertions inspected, **not rerun in this investigation**:

- `packages/message-service/test/message-service.test.ts:919-1105`: payer choice,
  concurrent duplicate session deduplication, null/throw failed reservations,
  persistence compensation, and cleanup diagnostics.
- `packages/message-service/test/message-service.payment-compensation.test.ts:52-158,161-405,407-535`:
  later-item provider/null/render failure; model/session setup and transaction
  failures; attempt-every-session/observer aggregation; committed replay;
  non-idempotent committed-prefix retention; bound provider methods and legacy
  single-session compensation shape.
- `packages/message-service/test/message-service.replay-coherence.test.ts:74-162`:
  mixed active/archive replay without preparation and all-archived paid replay
  without new sessions.
- `packages/message-service/test/message-service.transaction-cleanup.test.ts:69-103,177-222`:
  paid commit/replay survives cleanup/observer rejection; real rollback preserves
  its error and compensates every known session.
- `packages/message-service/test/message-service.failed-replay-boundary.test.ts:109-169,171-235`:
  failed-replay HTTP 409 hides stored provider/template/database diagnostics;
  ordinary first-failure server errors use the sanitized default response.

The inspected tests establish the existing recovery contract's intended coverage,
not a passing runtime baseline here. They do not supply the full provider/code/
recipient matrix above; its configuration rows are established by source review.
Historical guarantees remain owned by MSG-04, MSGF-05/06, and MSGR-01; in particular,
`packages/message-service/src/persistence.ts:85-124` treats resolved
`withTransaction()` as committed even if `endSession()`/its observer rejects.
Preserve all cleanup attempts and compensation-error precedence
(`PaymentSessionCompensationError` / its aggregate subclass, including
`originalError`), idempotent expiration, and out-of-band reconciliation of process
death/unobserved provider or commit outcomes. Session creation stays outside
driver-retried transaction callbacks.

#### MSGA-04 recommendation, typed failures, and compatibility

**Recommended smallest contract:** a nonempty effective code requests mandatory
session creation for that item. Provider configuration remains optional for
code-free items and completed replays, not a switch that downgrades a paid item to
sessionless metadata. Check this per fresh item after replay selection; avoid
constructor/registry checks that would break valid replay-only/nonpayment use.
Keep code selection, payer selection, MSGA-01 recipients, and batch semantics.

Propose one new root-exported, ESM/CJS-branded `PaymentProviderRequiredError` for
the missing/null-provider case, with a stable server-side configuration message
and HTTP **500**. This is trusted template/service configuration, not a caller
400 or proof that payment is due (402). The name is proposed, not an existing API.
For the smallest compatibility delta, retain the existing null/empty-return Error
and original provider rejection identity; uniform wrapping of all provider errors
is not part of this recommendation. Cleanup failures still take precedence while
retaining the triggering configuration/provider error as `originalError`.

Current routes have no special payment-creation mapping
(`packages/message-service/src/route-factory.ts:120-173,394-409`); ordinary Errors
reach the response handler's default sanitized 500
(`packages/express-response-handler/src/create-handler.ts:302-337`;
`packages/express-response-handler/src/error-format.ts:16-17,122-128`). Arbitrary
provider rejections can already carry HTTP status or match other mappings (such
as CastError); retaining them deliberately does not promise every throw is 500.
The proposed missing-provider error must reliably take the server-error path
without exposing internal causes/session IDs. Failed-key replay keeps the stable
409 body, pending keeps 409, and successful create/replay keeps the existing DTO
array. Existing error branding/exports are in
`packages/message-service/src/errors.ts:1-12,284-355` and
`packages/message-service/src/index.ts:98-120`.

Tradeoffs and migration if approved:

- **Behavioral break:** fresh code-bearing items that currently commit sessionless
  because the provider is absent/null must fail. Configured providers now run for
  unaddressed code-bearing items too; Noop/null/throw outcomes there change from
  skipped success to failure. This removes implicit configuration-dependent
  payment semantics but can add external session work for sender-only items.
- **Compatibility retained:** existing empty overrides still inherit, valid paid
  recipients/payers and exact codes remain unchanged, provider null/throw error
  identities stay intact, and direct mixed batches retain their committed prefix.
  Tradeoff: the existing heterogeneous null/throw failure shapes remain public.
- Hosts using `paymentCd` only as metadata should move that data to `payload` or
  `display` and remove the template/item payment code, or configure a real provider
  when a checkout is intended. A free item beneath a paid template default cannot
  be expressed with `''`; use a template without that default and assign per-item
  codes. No new bypass/policy option is recommended without a demonstrated need.
- Audit active/archive nonempty-code/null-session records using host knowledge.
  Do not backfill sessions, charge, expire, rewrite codes, invalidate completed
  reservations, or reinterpret legacy actions automatically. Keep nullable
  storage/DTO types for code-free and legacy records. Corrected configuration
  does not reset failed keys; reconcile provider effects/retained direct-batch
  items before a new operation. No request-scope/schema/index migration is needed.
- Shipped guidance needs the new matrix/error/migration and clarification of
  README's optional-provider wording and DESIGN's no-op/default wording
  (`packages/message-service/README.md:160-166,290-299,613-624,704-739`;
  `packages/message-service/DESIGN.md:18-25,181-197`). Payment completion, capture,
  refunds/webhooks, and any business authorization based on payment remain
  host/provider responsibilities; a created session is not proof of payment.
  Action orchestration currently delegates to trusted handlers, with bound
  expire/refund helpers (`packages/message-service/src/message-service.ts:883-909,1217-1230`).

**Outstanding decision — owner: maintainer, via coordinator.** Approve the
recommended mandatory-session meaning, recipient independence, and unchanged
empty-override inheritance, or select explicit sessionless-metadata/override
semantics before any public-contract implementation. No decision/approval is
recorded by this investigation. MSGA-04 is completed; resulting implementation
remains blocked on that decision.

Coordinator question/recommendation:

> Approve requiring a session for every nonempty effective `paymentCd`, even with
> no recipient, with absent/null providers failing as `PaymentProviderRequiredError`
> (HTTP 500), while keeping `''` inheritance and completed replay unchanged? I
> recommend this smallest contract; metadata-only uses would move to payload/display.

Unapproved follow-up outline for the coordinator (no implementation task/ID is
authorized here): after the maintainer chooses, allocate the next available
MSGA-14+ ID and add it to MSGA-11/MSGA-13 dependencies. Cover direct and idempotent
missing/null-provider failures with no new code-bearing message committed;
code/empty-override/recipient/provider matrices; free-then-paid and paid-then-failing
mixed batches with committed-prefix versus atomic-batch outcomes; legacy completed
active/archive replay after provider/template changes without preparation/payment;
failed-key behavior; all known-session compensation and cleanup-failure precedence.
Ship the approved error's root exports/branding/JSDoc, README/DESIGN migration,
focused real-MongoDB/HTTP V1 regressions, and V2 packed-consumer type/runtime checks.
Acceptance criterion 3 is conditional on that future approval, not an implemented
or verified behavioral change in MSGA-04.

Verification (V6 and documentation hygiene; command paths normalized to repo scope):

- Read `AGENTS.md`, `docs/tasks/README.md`, shared rules, MSGA-01/02/03 completion
  evidence, MSGA-04 requirements, the references above, and relevant MSGA-11/13
  dependency/decision rules. Content review checked every bounded configuration,
  evidence locations, compatibility, decision ownership, and recovery invariants.
- `ASDF_NODEJS_VERSION=26.11.1 node --version` returned `v26.11.1` (executed with
  `TMPDIR="<repo-root>/_tmp-msga"`). A directory read verified that pre-existing
  temporary directory was empty;
  `ASDF_NODEJS_VERSION=26.11.1 git check-ignore -v _tmp-msga` confirmed
  `.gitignore:8:_tmp*`. No temporary consumer/MongoDB fixtures were created.
- Formatting:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  passed. The first check flagged the four added table layouts; read-only formatter
  suggestions were applied with `apply_patch` only within MSGA-04 before rechecking.
- Whitespace:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" git diff --check`
  and
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  produced no whitespace diagnostics. The no-index check explicitly includes the
  still-untracked task document.
- Preservation: before/after
  `ASDF_NODEJS_VERSION=26.11.1 git diff --binary -- . ':(exclude)docs/tasks/20261018-185629-message-service-multi-app-adaptability.md' | sha256sum`
  returned the identical SHA-256
  `20081abceaa323a628d6357451938e88c3a6401ae0a804c3a07dbea5dfc1c051`.
  `ASDF_NODEJS_VERSION=26.11.1 git hash-object packages/message-service/src/user-id.ts packages/message-service/test/message-service.user-ids.mongodb.test.ts`
  likewise returned unchanged fingerprints for both pre-existing untracked source/
  test files. After-check invocations also set `TMPDIR="<repo-root>/_tmp-msga"`.
  MSGA-01/02/03 evidence and all other task sections were preserved; edits are
  confined to MSGA-04's status and investigation prose.
- No build, test, lint, installation, or provider experiment was run; prior task
  execution results above are preserved as historical task-local evidence.

### Task MSGA-05: Make email recipient lookup injectable

Status: completed

Assigned: MSGA-05 implementation sub-agent (fresh session, sequential execution)

Kind: improvement

Priority: P2 — different user schemas and external contact directories cannot use the default recipient lookup directly.

Dependencies: none

Primary ownership:

- `packages/message-service/src/schemas/message.ts` (`MessageSchemaConfig`, email hooks)
- Public exports/JSDoc and `packages/message-service/test/message-service.mongodb.test.ts`

Finding:

The send callback is pluggable, but lookup resolves a local user model and runs
`findById(...).select('email').lean()`. A configurable model name does not support
nested email fields, external directories, or host-specific address/preferences
resolution. The eager User-model registration check also assumes this default path.

References:

- `packages/message-service/src/schemas/message.ts:65-77,328-346,423-430`
- `packages/message-service/src/providers/email.ts:5-14`
- `packages/message-service/test/message-service.mongodb.test.ts:879-1014`

Requirements:

1. Add an optional recipient-address resolver with sufficient documented context
   for the host; retain the current connection-local lookup as the default adapter.
2. Avoid requiring a dummy local User model when a custom resolver owns lookup.
3. Export the resolver types and document missing-address and failure outcomes.
4. Preserve best-effort delivery, owning-connection behavior, callback binding,
   exclusions, disabled-email behavior, session-bound skipping, and no update resend.

Acceptance criteria:

- Nested-email and external-directory fixtures resolve and deliver correctly.
- A custom resolver works without local User-model registration.
- Resolver/notifier rejection is observable without rejecting a committed save.
- Missing address follows the documented skip outcome.
- Existing email timing and connection-local regressions remain valid.

Verification: V1 schema/email tests, V2 public declaration and installed-consumer checks.

Resumption checkpoint (2026-10-19, replacement implementation session):

- Resumed only MSGA-05 after the prior host restart, with no nested agents or
  concurrent build/test worker. Read `AGENTS.md`, shared task rules, this section,
  and the public-package skill; inspected the actual source/docs/test diffs and
  untracked email test before relying on the partial implementation. MSGA-01/02/03,
  MSGA-14, and the other task sections remain existing work to preserve.
- The partial root-exported `EmailRecipientResolver`/context, schema option and
  lookup branch, three schema tests, and MongoDB email test file exist, but there
  is **no recorded MSGA-05 passing build/test evidence**. This session will establish
  fresh focused results, finish shipped examples/JSDoc, and add a focused packed
  consumer contract before evaluating local completion.
- Verified the existing temporary directory and parent with
  `ls -ld <repo-root> <repo-root>/_tmp-msga`; `git check-ignore -v _tmp-msga`
  confirmed `.gitignore:8:_tmp*`. It contained only `node-compile-cache/` at
  resumption. `ASDF_NODEJS_VERSION=26.11.1 node --version` returned `v26.11.1`.
  Build/test processes will run serially with that Node override and absolute
  `TMPDIR` represented in evidence only as `<repo-root>/_tmp-msga`.

Completion evidence (2026-10-19, resumed task-local implementation):

- API: `MessageSchemaConfig.emailRecipientResolver?: EmailRecipientResolver`
  accepts synchronous/asynchronous address or null/undefined/empty skip results.
  Root-exported `EmailRecipientResolverContext` provides the schema-cast direct
  recipient ID, document-owning connection, and shallow read-only saved message
  view (including `_id`, template, payload/display, and content). The view is not
  cloned/frozen; trusted callbacks must not mutate it or nested data. Addresses
  pass through unchanged; validation/preferences remain host-owned. Custom lookup
  fully replaces the default, with no fallback or dummy User registration.
- Compatibility: omitted resolver retains the connection-local User.email lookup
  and eager registration check, including custom `userModelName`. Custom resolvers
  bypass only that default-adapter check. Disabled email, title exclusions/blank
  titles, missing direct recipients, updates, and all session-bound saves still
  skip lookup/delivery. Existing best-effort failure stages, original diagnostics,
  observer-failure swallowing, body/title selection, and explicit method binding
  are preserved. No data/index migration or new retry/outbox behavior is introduced.
- Coverage: **21 real-MongoDB email cases**, **3 new schema cases**, and **1 focused
  packed-consumer case**. Includes nested contacts/preference opt-out, external
  directories without User, default/User lookup with competing connections,
  missing users/addresses, opaque String IDs after casting, address pass-through,
  bound resolver/provider instances, sync throws and async rejections at both
  failure stages with throwing/rejecting observers, committed/aborted/outside-
  transaction sessions, hydrated/query updates, exclusions, and disabled email.
- Shipped guidance: README adds default lookup/registration behavior, nested and
  external-directory recipes, failure/skip/timing/binding contracts, and optional
  adoption/migration guidance; DESIGN and public JSDoc agree. The packed case
  extracts **both recipes from the installed tarball README**, compiles strict
  NodeNext ESM/CommonJS and Bundler consumers with `skipLibCheck: false`, asserts
  root types/read-only context/invalid-return rejection, checks resolver and
  notifier JSDoc in packed `.d.ts`/`.d.mts`, and executes the compiled recipes on
  real MongoDB through **both ESM and CommonJS**. Runtime covers bound delivery,
  missing addresses, observable lookup failure, update/session skipping, nested
  preference opt-out, and the unchanged default User.email adapter.
- MSGA-05 changed paths (including resumed partial implementation):
  - `packages/message-service/src/schemas/message.ts`
  - `packages/message-service/src/providers/email.ts` (JSDoc)
  - `packages/message-service/src/index.ts` (resolver type exports)
  - `packages/message-service/test/schemas.test.ts`
  - `packages/message-service/test/message-service.email.mongodb.test.ts`
  - `packages/message-service/test/message-service.packed-consumer.test.ts`
  - `packages/message-service/README.md`
  - `packages/message-service/DESIGN.md`
  - `docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
- All commands ran from `<repo-root>`; build/test invocations were serialized and
  used `ASDF_NODEJS_VERSION=26.11.1`, with absolute `TMPDIR` normalized below to
  `<repo-root>/_tmp-msga`. These are fresh post-resumption results; no interrupted
  run is counted as passing, and no fail-before execution is claimed.
- Build/declarations:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service... build`.
  Exit 0, **five packages built**, ESM/CJS and declarations. Inspected generated
  `dist/index.d.ts` and `dist/index.d.mts`: both expose the resolver/context/config
  and retain public JSDoc on skips, owning connection, non-frozen context, failures,
  and binding. Generated files were not manually edited.
- V1 email/schema plus neighboring regression command:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.email.mongodb.test.ts test/schemas.test.ts test/message-service.mongodb.test.ts test/message-service.test.ts test/message-service.user-ids.mongodb.test.ts test/message-service.direct-archive.test.ts test/message-service.transaction-cleanup.test.ts test/message-service.rendering-separation.test.ts test/message-service.readme-contract.test.ts`.
  Exit 0, **9 files / 179 tests passed**, no skips. Includes existing email timing
  and connection-local regressions, MSGA-01 recipient fallback, MSGA-03 identity
  lifecycle, direct archive, transaction cleanup, rendering, and README flow.
- Focused installed-package command:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.packed-consumer.test.ts -t MSGA-05`.
  Exit 0, **1 passed / 11 skipped**; skips are other packed cases outside the name
  filter. Both Vitest invocations emitted the existing non-failing Vite native-
  config-loader advisory.
- Formatting:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check packages/message-service/src/schemas/message.ts packages/message-service/src/providers/email.ts packages/message-service/src/index.ts packages/message-service/test/schemas.test.ts packages/message-service/test/message-service.email.mongodb.test.ts packages/message-service/test/message-service.packed-consumer.test.ts packages/message-service/README.md packages/message-service/DESIGN.md docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Passed. The initial check requested formatting in the two email/packed test
  additions; read-only Prettier output was applied with `apply_patch`, without
  changing test semantics. Repository lint:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm lint` passed.
- Whitespace: `git diff --check`, plus
  `git diff --no-index --check /dev/null packages/message-service/test/message-service.email.mongodb.test.ts`
  and
  `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  produced no whitespace diagnostics (the latter checks include untracked files).
  Packed fixtures cleaned themselves. `pgrep -af '[m]ongod'` found no remaining
  MongoDB processes; removed generated MongoDB/cache directories under
  `<repo-root>/_tmp-msga` and confirmed the temporary parent is empty.
- Status is **local MSGA-05 completion**, with no task-local blocker. **Full V2 is
  still due at coherent batch integration**:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service test`.
  The full package/packed suite, bounded peer/runtime matrix, final workspace
  build/test (V5), and independent MSGA-13 integration review remain batch work.
  Other task statuses and prior MSGA-01/02/03/14 implementation are preserved.

### Task MSGA-06: Let template preparation control attachments

Status: completed

Assigned: MSGA-06 implementation sub-agent (fresh session, sequential execution)

Kind: improvement

Priority: P2 — preparation cannot authoritatively select attachments or vary them across fan-out items.

Dependencies: none

Primary ownership:

- `packages/message-service/src/types/template.ts` (`PrepareResult`)
- `packages/message-service/src/message-service.ts` (`buildMessageDocument`)
- Creation/batch tests and public type documentation

Finding:

Root attachments always come from the original caller's `payload.documents`,
even when preparation returns a validated replacement payload. There is no
prepared attachment field. This is a preparation-control limitation, not evidence
that any downstream application exposes unauthorized attachments.

References:

- `packages/message-service/src/types/template.ts:22-32` (`PrepareResult`)
- `packages/message-service/src/message-service.ts:1036-1051` (document construction)

Requirements:

1. Add explicit prepared attachment selection, distinguishing omission from `[]`.
2. Preserve a documented legacy fallback when the prepared field is omitted.
3. Allow each fan-out item to select its own attachments without mutating caller input.
4. Keep the explicit document-field construction boundary; do not spread arbitrary
   preparation properties over lifecycle/ownership fields. Preserve `templateData`
   rendering and prepared business-payload semantics.

Acceptance criteria:

- Prepared attachments override original input; explicit `[]` clears them.
- Omission follows the documented compatibility rule.
- Fan-out items store different approved attachment sets correctly.
- Caller input remains unchanged, and the field is discoverable in public types.

Verification: V1 direct/idempotent creation and batch regressions, V2 type/README checks.

Completion evidence (2026-10-19, task-local implementation and first package batch):

- Contract: root-exported `PrepareResult` now has optional
  `documents?: mongoose.Types.ObjectId[]`, matching existing attachment types.
  A supplied array selects that item's attachments; `[]` intentionally clears.
  Omission/explicit `undefined` retains the original `PrepareContext.payload.documents`
  fallback (or `[]` when absent), independently of any replacement business payload.
  Every selected array is shallow-copied per item, including reused/fallback arrays.
  No caller/preparation arrays are mutated and no generic schema extension is needed.
- Boundaries: the existing explicit field allowlist remains intact, including
  lifecycle/message/request ownership protection. Content still renders from
  `templateData` without evaluating action conditions during creation; later action
  labels use stored business `payload`. Payment, recipients, principals, identity
  normalization, email, and existing MSGA-01/02/03/05/14 work were preserved.
- Coverage: **17 real-MongoDB regressions** exercise direct/idempotent override,
  explicit clear, omitted/undefined fallback with replaced/empty/omitted business
  payloads, absent original attachments, six-item fan-out with distinct/reused/
  cleared/fallback selections, native BSON attachment IDs, frozen input nonmutation,
  per-document array independence at the real schema setter boundary, ignored
  lifecycle/ownership overrides, rendering/action-label separation, public DTO IDs,
  and mixed active/archive replay after changed caller attachments without preparation.
- Installed surface: **one new packed-consumer case** extracts the fan-out recipe
  from the installed tarball README, compiles strict NodeNext ESM/CommonJS and
  Bundler consumers with `skipLibCheck: false`, and executes direct/idempotent
  creation plus replay on real MongoDB through **both ESM and CommonJS**. Root
  declarations accept ObjectId selections/empty/omitted/undefined, reject String
  IDs/null/lifecycle overrides, and match active/archive attachment types.
  Inspection of generated and packed `.d.ts`/`.d.mts` confirms selection/fallback/
  copy JSDoc survives. Generated declarations were not manually edited.
- Shipped README documents the selection matrix, approved-review/attachment-free-
  audit fan-out recipe, explicit field boundary, rendering/payload separation, and
  optional adoption: return selected IDs or `[]` instead of relying on replacement
  payloads. Existing records/completed replay retain stored attachments; no schema,
  index, or automatic stored-data migration is required.
- MSGA-06 changed paths:
  - `packages/message-service/src/types/template.ts`
  - `packages/message-service/src/message-service.ts`
  - `packages/message-service/test/message-service.documents.mongodb.test.ts`
  - `packages/message-service/test/message-service.packed-consumer.test.ts`
  - `packages/message-service/README.md`
  - `docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
- Environment: commands ran from `<repo-root>` with no nested delegation or
  overlapping build/test processes. `ASDF_NODEJS_VERSION=26.11.1 node --version`
  returned `v26.11.1`. `ls -ld <repo-root> <repo-root>/_tmp-msga` verified the
  existing parent and temporary directory; `git check-ignore -v _tmp-msga`
  confirmed `.gitignore:8:_tmp*`. Build/test `TMPDIR` was its absolute path,
  represented below only as `<repo-root>/_tmp-msga`.
- Build, before reproduction and after implementation (both exit 0, five packages,
  ESM/CJS and declarations):
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service... build`.
- Fail-before command:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.documents.mongodb.test.ts`.
  Corrected pre-implementation run: exit 1, **7 failed / 10 passed**, reproducing
  ignored override/clear/fan-out/replay selections. The initial run had **9 failed /
  8 passed**; two assertions incorrectly expected an empty Mixed payload to remain
  on disk despite Mongoose minimization, and were corrected before implementation.
  First post-implementation run: **2 failed / 15 passed**, because the setter probe
  also counted each document's default `[]`; retaining the final input per document
  fixed that probe. All **17 pass** in the final V1/V2 runs below. No unrelated work
  was reverted/stashed for reproduction.
- V1 affected/neighboring command:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.documents.mongodb.test.ts test/message-service.test.ts test/message-service.mongodb.test.ts test/message-service.rendering-separation.test.ts test/message-service.readme-contract.test.ts test/message-service.replay-coherence.test.ts test/message-service.public-message.test.ts`.
  Exit 0, **7 files / 133 tests passed**, no skips.
- Focused installed-package command:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.packed-consumer.test.ts -t MSGA-06`.
  Exit 0, **1 passed / 12 skipped** (other packed cases excluded by the name filter).
- Formatting:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check packages/message-service/src/message-service.ts packages/message-service/src/types/template.ts packages/message-service/test/message-service.documents.mongodb.test.ts packages/message-service/test/message-service.packed-consumer.test.ts packages/message-service/README.md docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Final exit 0 for all six paths; initial suggestions were applied with `apply_patch`.
  Repository lint:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm lint` passed.
  `git diff --check`,
  `git diff --no-index --check /dev/null packages/message-service/test/message-service.documents.mongodb.test.ts`,
  and
  `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  produced no whitespace diagnostics, including the new files.
- **V2 passed: 27 files / 540 tests**, no skips; exact command and combined
  MSGA-01–06/14 batch result are recorded in the shared execution note below.
  All Vitest runs emitted the existing non-failing Vite native-config-loader advisory.
  Packed consumers cleaned themselves; `pgrep -af '[m]ongod'` found no remaining
  MongoDB processes. Generated MongoDB/cache directories under `<repo-root>/_tmp-msga`
  were removed and a final directory read confirmed it was empty.
- Status: **MSGA-06 completed**, with V1, installed public-root recipe/declarations,
  full V2, build, and local hygiene acceptance demonstrated. No task-local blocker
  or new package integration defect was found. Other task statuses/history remain
  unchanged; the bounded compatibility matrix, host/workspace integration, and
  independent review retain their MSGA-11/13 scope.

### Task MSGA-07: Specify transport-independent action input

Status: completed

Assigned: MSGA-07 investigation sub-agent (fresh session, sequential execution)

Kind: investigation

Priority: P2 — handlers requiring submitted data currently depend on an opaque request shape and an undefined command-retry policy.

Dependencies: none

Primary ownership:

- `packages/message-service/src/types/template.ts` (`ActionContext`, action metadata)
- `packages/message-service/src/message-service.ts` (`handleAction`, action context)
- `packages/message-service/src/route-factory.ts` (action adapter)
- A bounded business-handler integration design and focused evidence

Finding:

Action input reaches handlers through opaque `req`; `ActionContext` has no explicit
command input. The same attempt ID can be retried with a different request body.
Action `payload` and confirmation metadata describe presentation, not a validated
submitted command. The host advertises rejection notes but does not consume them.
Applications can already inject business services through template-factory closures.

References:

- `packages/message-service/src/types/template.ts:38-52,69-94`
- `packages/message-service/src/route-factory.ts:431-447`
- `packages/message-service/src/message-service.ts:856-908,1190-1204`
- `apps/nodejs/src/messages.ts:275-290`
- `apps/react-vite/src/api.ts:129-138`

Requirements:

1. Define explicit action input usable through HTTP and direct service calls,
   including parsing, validation, and compatibility with existing request callbacks.
2. Choose where stable command data lives across retries: package persistence or
   a demonstrated host command store. Specify changed-input behavior under one
   `actionAttemptId`, including authorization and legacy attempts.
3. Define validation failure behavior without needlessly pinning an unexecuted
   fresh message to an action or discarding a possibly-effectful retry.
4. Design one executable integration using a captured business service that
   deduplicates by attempt ID, survives archival failure/retry, and works without
   Express. Keep external effects outside retryable MongoDB transaction callbacks.

Acceptance criteria:

- An evidence-backed public-contract proposal covers invalid input, direct/HTTP
  parity, changed retry input, and fresh versus existing attempts.
- Presentation metadata is clearly distinguished from enforced business validation.
- The maintainer decision or remaining blocker is recorded, and approved API work
  receives a new implementation task with positive and negative integration cases.
- No exactly-once external-effect or joint business-write/archive guarantee is
  claimed without an implemented protocol establishing it.

Verification: V6 design review against existing claims/retries; V1 bounded probes
only where needed to resolve a material question.

Completion evidence (2026-10-19, investigation only):

- **Outcome:** V6 investigation is complete. Recommend an additive `input` channel,
  an optional pure parsing/validation hook, and **host-owned immutable commands
  deduplicated by `actionAttemptId`**, subject to the maintainer's explicit choice
  below. Package-persisted input is the bounded alternative. The outstanding
  decision gates implementation, not completion of this investigation.
- Evidence is current source and existing test assertions, including preserved
  MSGA-01–06/14 changes. No runtime uncertainty required a probe. The recorded
  **27-file / 540-test V2** is the earlier coherent-batch result, not a test run by
  this investigation.

#### MSGA-07 inspected behavior and evidence

- **Handler input:** `packages/message-service/src/types/template.ts:50-69,98-111`
  and `packages/message-service/src/message-service.ts:845-853,1242-1256` expose no
  explicit submitted input or parser; the original `req` is forwarded. The public
  `actionAttemptId` type remains optional, although successful claims supply it.
- **HTTP body:** `packages/message-service/src/route-factory.ts:96-104,380-405,434-459`
  checks object bodies for **creation**; the action route forwards `req`, not a
  separate command, and performs no action-body validation. Its result is the
  handler value, not a new envelope.
- **Atomic attempt identity:** `packages/message-service/src/message-service.ts:1259-1322`
  stores an attempt ID/action and owner token on first claim; same-action retry or
  expired takeover keeps the ID and rotates the token. Different actions/live
  claims conflict. `packages/message-service/src/schemas/base.ts:41-53` contains
  lifecycle fields but no command snapshot/fingerprint. Changed bodies therefore
  have no package comparison today.
- **Authoritative authorization:**
  `packages/message-service/src/message-service.ts:864-909,1348-1380` only fast-fails
  on the caller copy; the claimed stored template, parties, roles, permissions and
  condition determine authorization/handler selection.
  `packages/message-service/test/message-service.action-target-authz.test.ts:78-294`
  proves stale-recipient/template/condition/role denials. Input must not replace
  those fields or supply its own authority.
- **Denied release/fencing:** `packages/message-service/src/message-service.ts:1383-1434`
  and `packages/message-service/test/message-service.action-target-authz.test.ts:296-453`
  show fresh pre-handler denial restores action choice, while retry/takeover
  retains its potentially effectful ID/action. Owner-conditioned release cannot
  clear a replacement's claim.
  `packages/message-service/test/message-service.action-fencing.test.ts:55-348`
  covers stale workers, legacy claims and different-action conflicts after expiry.
- **Handler versus archive failure:**
  `packages/message-service/src/message-service.ts:910-956,1437-1517` wraps handler
  rejection in `ActionRetryableError`; archive-transaction rejection marks retryable
  but propagates the archive error.
  `packages/message-service/test/message-service.transaction-cleanup.test.ts:224-290`
  proves rollback, preserved primary archive errors and driver transaction retries
  without rerunning the handler within that acquisition. No inspected existing
  test demonstrates a durable host command/result store across acquisitions.
- **Legacy request compatibility:**
  `packages/message-service/test/message-service.authoritative-reads.test.ts:388-410,520-599`
  asserts original request identity/body and custom extractor values.
  `packages/message-service/test/route-factory.test.ts:296-341,377-418` asserts
  409/202/410 mappings and direct service argument forwarding.
- **Metadata versus commands:** `packages/message-service/src/template-engine.ts:150-167`
  returns action `payload` and renders confirmation metadata;
  `packages/message-service/src/template-registry.ts:63-81` shallow-freezes them.
  Neither validates submitted data. Stored `message.payload` supplies business
  targets/conditions and action-label interpolation, distinct from action metadata
  and creation-time `templateData`.
- **Reference host confirmation:** `apps/nodejs/src/messages.ts:275-290` advertises
  required rejection notes but its handler ignores input.
  `apps/react-vite/src/pages/messages-page.tsx:162-177,226-244` checks notes only in
  the browser and submits `{ notes }` through `apps/react-vite/src/api.ts:129-138`.
  `apps/nodejs/test/message-lifecycle.test.ts:158-179` covers mark-read/terminal
  replay, not rejection-note enforcement. Browser response-envelope correction
  remains MSGA-10 work.

Archived outcomes still require the authoritative stored relationship gate before
attempt/notification disclosure
(`packages/message-service/src/message-service.ts:1333-1345`;
`packages/message-service/test/message-service.action-target-authz.test.ts:455-673`).
An input error must not become a new way to bypass that gate. These findings extend
the intentional payload-validation/fingerprint deferrals in
`docs/tasks/20260919-185326-message-service-residual-workflow-health.md:785-796`.

#### MSGA-07 minimal proposed API and validation policy

**Proposed, not implemented:** add `input?: unknown` to `handleAction`'s existing
data argument and to `ActionContext`; add optional
`MessageAction.parseInput?: (input: unknown) => unknown`. A parser returns the
normalized, allowlisted command delivered as `ctx.input`, or throws a proposed
root-exported `ActionInputValidationError`. Keep heterogeneous commands `unknown`
at the package boundary; a template-local parser supplies its concrete type.
No container, business-service registry, generic workflow, schema-library
dependency or template-wide generic parameter is necessary.

- The Express action adapter supplies **`input: req.body`**, without a new
  `{ input: ... }` envelope or merging action metadata/stored payload into it.
  Missing/undefined input stays undefined; values accepted by the host's body
  parser are forwarded verbatim. Direct input can also be null, arrays or scalars.
  No unconditional object-body restriction is added to legacy actions. An opted-in
  parser can require an object and reject extra keys.
- Direct calls pass `input` explicitly and require no Express object. Supplying
  only `req` does not cause the service to infer `input` from `req.body`. If both
  are supplied, `input` is the command channel and `req` remains unchanged.
  Existing handlers, notification callbacks and request extractors retain the
  original request; conditions keep their message-only signature. Behavior without
  a parser remains compatible. A notification callback receives the same action
  context, including parsed input, but must not repeat the business effect.
- Parsing is synchronous, deterministic and effect-free: no database/provider
  calls, request access, authorization writes or command reservation. Treat the
  raw value as read-only and return a fresh normalized value. Promise/thenable
  output is a host configuration error (500), not an async hook. Purity is a
  trusted-template contract, not a sandbox. With no parser, input is passed
  through; this channel alone promises neither validation nor deep immutability.
- Run the parser **after atomic claim and authoritative authorization/handler
  selection**, before `runHandler` or any host command-store/business call, once
  per acquisition. Do not parse via a stale caller-selected action, during
  creation/listing, or before an archived outcome's relationship gate. Keep
  `condition(message)` and the existing permission/relationship checks independent
  of caller input. Resource-specific/domain authorization belongs in the captured
  business service and is checked again on retries, including cached-result reads.

- **Pure parser rejects a fresh claim:** fenced pre-handler release restores
  `active` and clears claim bookkeeping, allowing corrected input or a different
  allowed action with a new attempt ID. Throw `ActionInputValidationError`
  directly; HTTP 400 with fixed public `invalid action input`, no submitted
  values/cause/attempt ID.
- **Pure parser rejects a retry/takeover:** keep the same ID/action and host
  command; fenced mark to `retryable`, clear the lease. Same typed 400, not
  `ActionRetryableError`. It describes this submission only and does not imply
  earlier owners had no effects. Resend the valid original or reconcile with the host.
- **Parser throws unexpectedly or returns a thenable:** apply the same
  fresh-versus-retry pre-handler cleanup, then preserve the operational failure
  through sanitized HTTP 500. Do not label a programming error as invalid client
  data. A non-conflict cleanup failure remains an operational failure.
- **Ownership changes before pre-handler release:** never clear/change the
  replacement. As with current denial release, report this caller's validation/
  authorization error on an owner conflict; it says nothing about replacement effects.
- **Any error after entering `runHandler`:** retain the conservative existing
  retryable lifecycle, even if an error calls itself validation. Only the dedicated
  pure pre-handler hook justifies fresh release. Existing handler errors remain
  `ActionRetryableError` (409); archive errors retain their current mapping/primary cause.
- **Archived/committed-notification-pending retry:** existing authorized 410 or 202
  outcome; no parser, handler, command comparison or repeated business effect.
  This adds no result-replay or notification-reconciliation API.

UI `confirmation.requireNotes`, `notesLabel`, `documents` and action `payload`
remain presentation hints, not implied server schemas or defaults. A notes or
attachment command must be validated explicitly; attachment access/business grants
must also be checked by the host. Do not write submitted notes into stored message
payload merely to make them available to a handler.

#### MSGA-07 bounded command-ownership choice

**Recommend host ownership for this phase.** Before any effect, the captured
business service reserves a durable immutable, versioned command under a unique
`actionAttemptId` key in its own application store. The record binds the claimed
message ID, action/template identity, authoritative business target and normalized
command; actor binding is an explicit host policy. Use insert-only/`$setOnInsert`
with a unique constraint and compare the winning record, including after duplicate
key races. A process-local `Set`, or checking before an unconstrained insert, is
insufficient. Retain records/results for the entire action/provider retry window.

The **first durable host reservation wins**, not necessarily the first package
claim or first request received. If an owner dies before reserving a host command,
there is no host original to preserve; the next authorized owner may reserve a
different valid command under that attempt. Once reserved, require equivalent
normalized input on retries; changed input gets a controlled conflict and never
overwrites the original or its result. Missing required input is invalid, not an
implicit request to replay something else. Canonicalize an allowlisted,
versioned command, not arbitrary raw `JSON.stringify(req.body)`.

A host `HostCommandConflictError` thrown **inside the handler** can use today's
`ActionRetryableError` with that error as its direct-service `cause`, and HTTP 409
with the existing safe retryable message. This avoids another package public
error solely to identify host-domain conflicts. It retains the outstanding
attempt/action even if the current handler did not perform an effect. A more
specific HTTP conflict code would be a separate approved contract, not forwarding
raw host errors through the generic route mapper.

- **Host command store benefits:** small additive transport/validation API;
  business-specific canonicalization, versions, target/actor policy, results and
  retention stay beside business writes. No package schema/index or DTO expansion.
  A host-local transaction couples its command result with its own MongoDB mutation
  independently of package archival. **Cost:** every effectful integration needs
  the durable unique-key protocol, input is stable only after host reservation,
  and domain grants must be checked before cached-result reads. The package cannot
  reconstruct a missing host command or make legacy request readers safe.
- **Package-persisted input benefits:** centralized stable input before handlers;
  consumers need not build another store just to retain it. Binding the snapshot
  **atomically with the first claim**, if required, also closes the claim-to-host-
  reservation gap. **Cost:** define bounded JSON-compatible values, absent versus
  null, deep copying, canonical equality/fingerprint, schema versions and privacy/
  retention. Use fenced initialize-once persistence before effects; retries never
  replace input. Claim-time binding needs an atomic claim/snapshot protocol, not a
  later unguarded save. Fresh pure-validation release clears the snapshot; retries
  retain it. Active/archive schemas, custom-schema recipes, service/direct archival
  and explicit DTO exclusion need coverage. Stable input still does not deduplicate
  business effects.

For package ownership, prefer a **strict changed-normalized-input 409** over
silently ignoring a changed submission; process retries using the stored original
and its supported schema version. A new typed input-conflict error would belong
to that approved package comparison contract. Never relabel a legacy missing
snapshot as `{}` or capture a retry's current body as proof of its original input.

**Migration for either choice:** opt-in parsing and explicit input delivery do not
rewrite existing data or remove `req`. Migrate handlers to use only validated
`ctx.input` for commands; mixed code reading both it and a changed `req.body` can
still defeat stability. Inventory/drain existing `processing`/`retryable` attempts
before enabling a new command protocol, or preserve an explicit legacy handler
path through its retry window. Recover known originals/results from trusted host
records only after effect reconciliation; unknown originals require host review,
not a new attempt ID, cleared claim, or opportunistic first-seen body backfill.
The minimal API exposes no new `fresh` flag: the sample's upsert is safe for its
new-template population, not an automatic classification of legacy attempts.
Keep versioned decoders/template handlers for outstanding commands across schema
changes; re-normalizing an old command under new rules must not silently change
its meaning. Package ownership additionally needs a persisted legacy/version
marker and a deliberate policy for missing snapshots in custom/old schemas.

**External effects:** pass the stable attempt key and the immutable original
command to a downstream system that durably deduplicates that key, including
concurrent owners and retries after an ambiguous response. Recording `done` only
after an external call does not close the crash gap. Keep external calls outside
automatically retryable MongoDB transaction callbacks. A host outbox can retain
intent, but delivery still needs downstream deduplication or explicit ambiguous-
outcome reconciliation. Neither storage choice supplies exactly-once external
execution, cancels stale workers, or jointly commits business effects and the
package archive.

#### MSGA-07 executable follow-up specimen

This is a **designed test specimen for the proposed API, not executed evidence or
an API available today**. After approval it can become
`packages/message-service/test/message-service.action-input.mongodb.test.ts`.
It uses the existing real-MongoDB fixture and root API, a concrete rejection
service captured by a template factory, and an actual unique-key MongoDB command
store. Its host transaction contains only local business/result writes, separately
from package archival. The fixed target is trusted fixture preparation; the
business service independently checks the current reviewer's domain grant.
This sample deliberately binds the actor too; a successor-reviewer policy would
need a host rule preserving the original initiator while reauthorizing the new
caller, not an incidental change to package authorization.

```ts
import mongoose from 'mongoose';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import {
  ActionInputValidationError,
  ActionRetryableError,
  createMessageRoutes,
  type MessageTemplate,
} from '@web-ts-toolkit/message-service';
import { createMongoMessageServiceFixture } from './support/mongodb-fixture';

type RejectInput = { notes: string };
type RejectCommand = RejectInput & {
  attemptId: string;
  messageId: string;
  approvalId: string;
  actorId: string;
};

class HostCommandConflictError extends Error {}

function parseRejectInput(raw: unknown): RejectInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ActionInputValidationError();
  const notes = (raw as { notes?: unknown }).notes;
  if (
    Object.keys(raw).some((key) => key !== 'notes') ||
    typeof notes !== 'string' ||
    notes.length > 2000 ||
    !notes.trim()
  ) {
    throw new ActionInputValidationError();
  }
  return { notes: notes.trim() };
}

function createRejectionBusinessService(connection: mongoose.Connection) {
  const Approval = connection.model(
    'Msga07Approval',
    new mongoose.Schema({
      reviewer: { type: String, required: true },
      state: { type: String, default: 'pending' },
      notes: { type: String, default: '' },
      effectCount: { type: Number, default: 0 },
    }),
  );
  const Command = connection.model(
    'Msga07RejectCommand',
    new mongoose.Schema({
      _id: { type: String, required: true }, // MongoDB's unique _id index
      canonical: { type: String, required: true },
      notes: { type: String, required: true },
      result: { type: mongoose.Schema.Types.Mixed, default: null },
    }),
  );

  return {
    Approval,
    Command,
    async reject(c: RejectCommand) {
      if (!(await Approval.exists({ _id: c.approvalId, reviewer: c.actorId }))) {
        throw new Error('domain permission denied');
      }
      const canonical = JSON.stringify([
        1,
        'approval-review-v1',
        'reject',
        c.messageId,
        c.approvalId,
        c.actorId,
        c.notes,
      ]);
      try {
        await Command.updateOne(
          { _id: c.attemptId },
          { $setOnInsert: { canonical, notes: c.notes } },
          { upsert: true },
        );
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 11000)) throw error;
        // A concurrent insert won; compare that durable original below.
      }
      return connection.transaction(async (session) => {
        const approval = await Approval.findOne({ _id: c.approvalId, reviewer: c.actorId }).session(session).lean();
        if (!approval) throw new Error('domain permission denied');
        const stored = await Command.findById(c.attemptId).session(session).lean();
        if (!stored) throw new Error('command missing');
        if (stored.canonical !== canonical) throw new HostCommandConflictError();
        if (stored.result) return stored.result as { rejected: true; notes: string };
        if (approval.state !== 'pending') throw new Error('approval already decided');
        await Approval.updateOne(
          { _id: c.approvalId },
          { $set: { state: 'rejected', notes: stored.notes }, $inc: { effectCount: 1 } },
          { session },
        );
        const result = { rejected: true as const, notes: stored.notes };
        await Command.updateOne({ _id: c.attemptId }, { $set: { result } }, { session });
        return result;
      });
    },
  };
}

function makeRejectionTemplate(
  business: ReturnType<typeof createRejectionBusinessService>,
  approvalId: string,
  reviewer: mongoose.Types.ObjectId,
): MessageTemplate {
  return {
    templateCd: 'approval-review-v1',
    type: 'request',
    description: 'Review one approved fixture target',
    senderContent: { title: 'Sent', long: 'Review requested', short: 'Sent' },
    receiverContent: { title: 'Review', long: 'Please review', short: 'Review' },
    uiTemplate: 'card',
    prepareMessage: async ({ user }) => ({
      fromUser: user._id,
      toUser: reviewer,
      payload: { approvalId },
    }),
    actions: [
      {
        actionCd: 'reject',
        name: 'Reject',
        variant: 'danger',
        sender: false,
        receiver: true,
        confirmation: { title: 'Reject', message: 'Reject request?', requireNotes: true },
        parseInput: parseRejectInput,
        async runHandler({ message, user, actionAttemptId, input }) {
          if (!actionAttemptId) throw new Error('attempt missing');
          return business.reject({
            attemptId: actionAttemptId,
            messageId: String(message._id),
            approvalId: String(message.payload.approvalId), // authoritative claimed target
            actorId: String(user._id),
            notes: (input as RejectInput).notes, // output of this action's parser
          });
        },
      },
    ],
  };
}

it.each(['direct', 'http'] as const)('deduplicates a rejection first submitted by %s', async (firstVia) => {
  const f = await createMongoMessageServiceFixture();
  let server: Server | undefined;
  try {
    const reviewer = new mongoose.Types.ObjectId();
    const business = createRejectionBusinessService(f.connection);
    await business.Command.init();
    const approval = await business.Approval.create({ reviewer: String(reviewer) });
    const template = makeRejectionTemplate(business, String(approval._id), reviewer);
    const attempts: Array<string | undefined> = [];
    const handler = template.actions[0].runHandler;
    template.actions[0].runHandler = async (ctx) => {
      attempts.push(ctx.actionAttemptId);
      return handler(ctx);
    };
    f.registry.register(template);
    const [message] = await f.service.createMessage({
      templateCd: template.templateCd,
      user: { _id: new mongoose.Types.ObjectId() },
      payload: {},
    });
    const id = String(message._id);
    const { router } = createMessageRoutes({ service: f.service, getUser: () => ({ _id: reviewer }) });
    const app = express();
    app.use(express.json());
    app.use(router.original);
    server = await new Promise<Server>((resolve) => {
      const started = app.listen(0, '127.0.0.1', () => resolve(started));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    async function call(via: 'direct' | 'http', input: RejectInput) {
      if (via === 'http') {
        const response = await fetch(`${base}/${id}/action/reject`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        return { status: response.status, body: await response.json(), error: undefined };
      }
      try {
        const body = await f.service.handleAction(template.templateCd, 'reject', {
          message: await f.service.findMessageOrThrow(id),
          user: { _id: reviewer },
          input,
        }); // deliberately no req / Express input
        return { status: 200, body, error: undefined };
      } catch (error) {
        return { status: error instanceof ActionRetryableError ? 409 : 500, body: undefined, error };
      }
    }

    const archiveFailure = new Error('archive unavailable');
    const archive = vi.spyOn(f.models.MessageArchive, 'create').mockRejectedValueOnce(archiveFailure);
    const first = await call(firstVia, { notes: '  original  ' });
    expect(first.status).toBe(500);
    if (firstVia === 'direct') expect(first.error).toBe(archiveFailure);
    archive.mockRestore();
    const active = (await f.models.Message.findById(id).lean()) as unknown as {
      actionAttemptId: string;
      actionState: string;
    };
    expect(active.actionState).toBe('retryable');
    const attempt = active.actionAttemptId;
    expect(attempt).toEqual(expect.any(String));
    const original = await business.Command.findById(attempt).lean();
    expect(original).toMatchObject({ notes: 'original', result: { rejected: true, notes: 'original' } });
    expect(await business.Approval.findById(approval._id).lean()).toMatchObject({ effectCount: 1 });
    expect(await f.models.MessageArchive.countDocuments({ _id: id })).toBe(0);

    const retryVia = firstVia === 'direct' ? 'http' : 'direct';
    const changed = await call(retryVia, { notes: 'changed' });
    expect(changed.status).toBe(409);
    if (retryVia === 'direct') expect(changed.error).toMatchObject({ cause: expect.any(HostCommandConflictError) });
    expect(await business.Command.findById(attempt).lean()).toEqual(original);
    expect(await f.models.Message.findById(id).lean()).toMatchObject({
      actionState: 'retryable',
      actionCd: 'reject',
      actionAttemptId: attempt,
    });

    const retried = await call(retryVia, { notes: 'original' });
    expect(retried).toMatchObject({ status: 200, body: { rejected: true, notes: 'original' } });
    expect(attempts).toEqual([attempt, attempt, attempt]);
    expect(await business.Command.countDocuments({})).toBe(1);
    expect(await business.Approval.findById(approval._id).lean()).toMatchObject({
      state: 'rejected',
      notes: 'original',
      effectCount: 1,
    });
    expect(await f.models.Message.countDocuments({ _id: id })).toBe(0);
    expect(await f.models.MessageArchive.findById(id).lean()).toMatchObject({ actionAttemptId: attempt });
  } finally {
    vi.restoreAllMocks();
    if (server)
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    await f.close();
  }
});
```

This demonstrates a retried handler with one **host-local** business mutation and
the original normalized command/result. An external-provider variant must replace
that mutation with the downstream deduplication/reconciliation protocol described
above; moving a provider call into `connection.transaction` is not that variant.

#### MSGA-07 decision and approval

**Coordinator approval question for the maintainer:** Do you approve the additive
`data.input` / `ctx.input` channel, raw HTTP-body mapping, optional synchronous pure
`parseInput` with the fresh/retry validation-error policy above, and **host-owned
immutable command/result storage keyed by `actionAttemptId`**, with first durable
host reservation winning and changed normalized input returning 409 while retaining
the original? Or do you require **package-persisted immutable input**, including
binding at the initial claim rather than at host reservation? The latter needs the
bounded persistence/legacy contract before implementation. **No choice or follow-up
implementation is approved by this investigation.**

Concrete follow-up outline, conditional on that answer (candidate **MSGA-15**, not
an added/authorized implementation task):

1. Coordinator records the selected ownership/binding policy and migration, creates
   the next stable implementation ID, and adds it to MSGA-11/MSGA-13 dependencies
   before execution. Keep MSGA-07 completed as investigation evidence.
2. Add the chosen input/parser/error root types, context delivery and action-adapter
   mapping; extend owner-fenced pre-handler cleanup without changing handler-entered
   failure semantics. Preserve legacy request/extractor identities and authoritative
   claim/archive authorization. Add no generic service container.
3. Land the specimen as an actual real-MongoDB integration, plus invalid/missing/
   null/array/extra-key input, normalization/nonmutation, no-parser compatibility,
   fresh corrected/different-action recovery, invalid retry retention, stale-target
   denial before parsing/store access, lost-owner release, concurrent host reservation,
   actor/target mismatch, host-result retry after process restart, and parser-bug
   failure cases. Check terminal 410 / notification-pending 202 without rerunning
   parsers or effects. If package ownership is selected, additionally cover bounded
   immutable snapshot persistence, changed-input conflicts, archive/DTO exclusion,
   custom schemas and known/unknown legacy snapshots.
4. Ship README/JSDoc/DESIGN policy and the captured-service recipe with explicit
   external-effect limits; packed strict ESM/CJS consumers must verify root types,
   error identity and executable recipe. Coordinate the Node rejection-note adoption
   with MSGA-09 and raw browser response handling with MSGA-10 rather than silently
   expanding this investigation into host changes.
5. Run the approved task's focused V1, installed-consumer checks and coherent-batch
   V2 serially; MSGA-11/13 retain compatibility/final independent review. Acceptance
   requires actual implementation/test evidence, not the specimen above.

V6 verification for this deliverable:

- Reviewed current references, both bounded ownership choices, fresh/retry/error
  timing, legacy migration, external deduplication limits, concrete integration and
  decision ownership. Only MSGA-07 and its action-command decision summary are
  edited. The decision-summary anchor resolves to the approval heading; cited
  source/test files and current line ranges were inspected. Existing implementation/
  batch evidence remains historical evidence.
- Hygiene commands run from `<repo-root>` use `ASDF_NODEJS_VERSION=26.11.1`;
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" node --version`
  returned `v26.11.1`. `git check-ignore -v _tmp-msga` confirmed `.gitignore:8:_tmp*`;
  `ls -ld _tmp-msga` and directory review verified the initially empty directory.
  Absolute `TMPDIR` values are normalized here to `<repo-root>/_tmp-msga`.
- Formatting passed:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  The initial check requested formatting; corrections used `apply_patch` with
  read-only formatter output. No formatter write mode was used.
- Whitespace checks emitted no diagnostics, including the untracked task document:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" git diff --check` and
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  `git status --short` / `git diff --stat` review retained the pre-existing paths
  and tracked diff totals (18 files, 1897 insertions, 73 deletions); all edits in
  this investigation used task-local document patches. The formatting-generated
  ignored cache was removed with `rm -r -- _tmp-msga/node-compile-cache`; final
  directory review confirmed `<repo-root>/_tmp-msga` was empty.
- **MSGA-07 completed (investigation/V6).** No runtime probes, builds or test runs
  were needed. The specimen is designed, not a passing regression or installed-
  package claim. The maintainer owns the command-storage/binding choice; the
  coordinator owns approval recording and creation of any implementation follow-up.

### Task MSGA-08: Expose configurable action lease duration

Status: completed

Assigned: MSGA-08 implementation sub-agent (fresh session, sequential execution)

Kind: improvement

Priority: P2 — applications cannot tune a legitimate action workload's processing lease through the public configuration.

Dependencies: none

Primary ownership:

- `packages/message-service/src/message-service.ts` (options, duration validation, claims)
- `packages/message-service/src/route-factory.ts` (construction/injection option contracts)
- `packages/message-service/test/message-service.timing-validation.test.ts`
- `packages/message-service/test/message-service.action-fencing.test.ts`

Finding:

The private action lease is fixed at 30 seconds, while creation timing is publicly
configurable. Expiry allows same-action takeover, but completion checks ownership,
not expiry alone. Existing tests intentionally allow an expired original owner to
finish when no replacement acquired the attempt.

References:

- `packages/message-service/src/message-service.ts:177,318-355,1207-1258`
- `packages/message-service/src/route-factory.ts:248-298,355-373`
- `packages/message-service/test/message-service.action-fencing.test.ts:284-348`

Requirements:

1. Expose an action-lease duration with finite positive safe-integer bounds,
   consistent with the existing timing-validation conventions and default duration.
2. Forward the option through route construction and reject conflicting options
   when injecting an already configured service.
3. Preserve stable attempt IDs, rotating ownership tokens, and existing takeover/
   completion semantics. Document that expiry is not handler cancellation.
4. Keep renewal/heartbeat design separately scoped if a real workload requires it.

Acceptance criteria:

- Invalid durations fail at construction; direct and route-created services use
  the same configured duration.
- Deterministic tests cover live claims, expiry, takeover, and completion with and
  without a replacement owner.
- Stale workers cannot modify replacement-owned state; different actions cannot
  take over an outstanding same-action attempt.
- Public declarations and README accurately describe configuration and its limits.

Verification: V1 timing/route tests and real-MongoDB fencing regressions, V2.

Completion evidence (2026-10-19, task-local implementation and second core batch):

- **Public contract:** optional `MessageServiceOptions.actionLeaseMs`, default
  `30000` ms, uses the existing duration validator: finite positive safe integer
  in `[1, MAX_MESSAGE_SERVICE_TIMEOUT_MS]` (`2147483647`), otherwise
  `InvalidMessageServiceOptionError` before model lookup. Route construction
  forwards it; injected-service options declare it `never` and reject conflicts
  at runtime. Configure an injected service itself.
- Each fresh/retry/takeover acquisition persists its configured duration. Exact
  expiry permits only same-action takeover; it does not cancel a handler, change
  state, or automatically reject a still-current owner's completion/failure.
  Takeover retains the attempt ID and rotates the owner token, fencing stale
  completion/failure writes. No heartbeat/renewal was added. Existing deadlines
  are unchanged; omission preserves the prior policy without schema/index/backfill.
- **Coverage:** 18 new runtime tests (11 invalid-value cases across direct/route
  construction, four real-MongoDB default/configured/min/max claim cases, one
  expired-owner failure/retry case, two HTTP construction/injection cases).
  Strengthened both stale-worker tests with configured durations, controlled
  `Date`, exact-boundary takeover and replacement-state assertions; extended the
  injection-conflict matrix. MongoDB/timers stay real; barriers control handlers.
  Packed strict ESM/CJS/Bundler consumers assert numeric configuration, invalid
  types and injection conflicts; both packed declarations retain option JSDoc.
- **Changed paths (MSGA-08 only):**
  - `packages/message-service/src/message-service.ts`
  - `packages/message-service/src/route-factory.ts`
  - `packages/message-service/test/message-service.timing-validation.test.ts`
  - `packages/message-service/test/message-service.action-fencing.test.ts`
  - `packages/message-service/test/message-service.route-service-reuse.test.ts`
  - `packages/message-service/test/message-service.packed-consumer.test.ts`
  - `packages/message-service/test/support/mongodb-fixture.ts`
  - `packages/message-service/README.md`
  - `packages/message-service/DESIGN.md`
  - `docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
- All commands ran from `<repo-root>` with serialized build/test processes and
  `ASDF_NODEJS_VERSION=26.11.1` (`node --version`: `v26.11.1`). `ls -ld` verified
  the initially empty temp directory; `git check-ignore -v _tmp-msga` confirmed
  `.gitignore:8:_tmp*`. Absolute `TMPDIR` is normalized below to
  `<repo-root>/_tmp-msga`. No nested delegation; MSGA-01–07/14/15 work was preserved.
- Fail-before command:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.timing-validation.test.ts test/message-service.route-service-reuse.test.ts -t 'MSGA-08|rejects every conflicting'`.
  Exit 1: **14 failed / 12 name-filtered skips**, exposing missing validation,
  ignored configured deadlines and accepted injection conflicts. After implementation:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.timing-validation.test.ts test/message-service.route-service-reuse.test.ts test/message-service.action-fencing.test.ts`.
  Exit 0: **3 files / 36 tests passed**, no skips.
- Build:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service... build`.
  Exit 0: **5 packages**, ESM/CJS and declarations. Inspected option/semantics JSDoc
  in generated `packages/message-service/dist/index.d.ts` and `dist/index.d.mts`;
  packed strict checks also assert their public option/injection declarations.
- Final V1:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.timing-validation.test.ts test/route-factory.test.ts test/message-service.route-service-reuse.test.ts test/message-service.action-fencing.test.ts test/message-service.action-input.mongodb.test.ts test/message-service.action-command.mongodb.test.ts test/message-service.action-target-authz.test.ts test/message-service.authoritative-reads.test.ts test/message-service.permission-grants.test.ts test/message-service.direct-archive.test.ts test/message-service.test.ts test/message-service.transaction-cleanup.test.ts test/message-service.readme-contract.test.ts`.
  Exit 0: **13 files / 243 tests passed**, no skips (**81.55 s**).
- Focused installed typings:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.packed-consumer.test.ts -t 'strict NodeNext'`.
  Exit 0: **1 passed / 13 name-filtered skips**; strict NodeNext ESM/CommonJS and
  Bundler with `skipLibCheck: false`, shipped declarations and README checks.
- Full V2, after focused checks:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service test`.
  Exit 0: **29 files / 609 tests passed**, no skips; **383.22 s** Vitest duration
  plus successful rebuild of five packages. Includes accumulated MSGA-01–08/14/15,
  real MongoDB, README and packed runtime/strict-consumer coverage; see batch note.
- Formatting:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check packages/message-service/src/message-service.ts packages/message-service/src/route-factory.ts packages/message-service/test/message-service.timing-validation.test.ts packages/message-service/test/message-service.action-fencing.test.ts packages/message-service/test/message-service.route-service-reuse.test.ts packages/message-service/test/message-service.packed-consumer.test.ts packages/message-service/test/support/mongodb-fixture.ts packages/message-service/README.md packages/message-service/DESIGN.md docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Passed; corrections used read-only formatter suggestions and `apply_patch`.
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm lint` passed.
  `git diff --check` and
  `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  produced no whitespace diagnostics, including the untracked task document.
- Packed consumers self-cleaned; process inspection found no live MongoDB/test
  workers. Generated MongoDB/cache directories were removed from the verified
  ignored temp directory, leaving it empty. Vite's existing config-loader advisory
  was non-failing. **MSGA-08 complete; no task-local or independent failure found.**
  Host integration, bounded peer/runtime compatibility, full-workspace build/test
  and independent final review remain coordinator work under the other task IDs.

### Task MSGA-09: Execute reference-app payload validation

Status: completed

Assigned: MSGA-09 implementation sub-agent (fresh session, sequential execution)

Kind: defect

Priority: P2 — the reference application presents validation rules that its actual template path does not enforce.

Dependencies: none

Primary ownership:

- `apps/nodejs/src/messages.ts` (payload schemas and template preparation)
- `apps/nodejs/test/message-lifecycle.test.ts` and focused host validation regressions

Finding:

The host defines five Zod schemas and `parseTemplatePayload`, but the inspected
preparation functions coerce/default raw values without calling them. Declared
normalization and field limits therefore do not govern actual creation. An email
lookup miss can return `null` and complete an idempotent request as an empty batch.
Earlier host integration work explicitly deferred application payload validation.

References:

- `apps/nodejs/src/messages.ts:18-63` (declared schemas/parser)
- `apps/nodejs/src/messages.ts:110-127,174-196,239-261,310-330,365-386` (preparation)
- `packages/message-service/src/message-service.ts:556-570` (zero-item completion)
- `docs/tasks/20260919-185326-message-service-residual-workflow-health.md:785-796` (deferrals)

Requirements:

1. Invoke the declared schemas inside the host preparation boundary before recipient
   lookup/business effects, so direct service usage cannot bypass validation.
2. Construct prepared payload and rendering data from parsed values.
3. Return a controlled application input error through the host HTTP adapter.
4. Explicitly decide recipient-not-found behavior and document whether invalid
   idempotent creation consumes a failed reservation. Preserve the package's
   documented failed-key behavior unless an approved contract change replaces it.

Acceptance criteria:

- Required fields, enum/length rules, trimming, and email normalization are enforced.
- Valid normalized addresses locate the intended recipient.
- Invalid input produces a controlled client error rather than successful empty
  output; direct calls using the same templates also reject invalid input.
- Tests cover the chosen missing-recipient and same-key retry outcomes.

Verification: V3 plus focused host validation regressions; V2 if public package
behavior is affected by an approved follow-up.

Completion evidence (2026-10-19, host boundary only):

- All five `prepareMessage` implementations now invoke their declared Zod schema
  before recipient queries/effects, including direct service calls. Prepared
  `templateData` and business payload use parsed values; invitation payload is now
  explicit rather than falling back to raw input. Required/size/enum/type rules,
  trimming and email lowercase apply. Existing optional defaults, trusted actor/
  recipient rendering sources, announcement cap/exclusion and terminal lifecycle
  are retained. No package, auth, tenant or domain-policy implementation changed.
- **Errors:** existing host `AppError` gives schema failures HTTP **400** with
  `{"message":"Invalid message payload."}` through the message route response
  wrapper. Missing addressed users or zero eligible announcement recipients give
  **404** with `{"message":"Message recipient not found."}`, never successful `[]`.
  Direct calls throw the same `AppError`; validation/lookup does not create users.
- **Idempotency:** initial 400/404 with a fresh key leaves a failed reservation
  (`itemCount: null`) and no message. Corrected same-user/template/key returns
  **409** / direct `ClientRequestFailedError` without preparation; use a **new key**.
  Completed keys still replay the first batch even with changed invalid input.
  Unkeyed failures leave no reservation. App README documents these decisions.
- Changed paths: `apps/nodejs/src/messages.ts`,
  `apps/nodejs/test/message-validation.test.ts`, `apps/nodejs/README.md`, and this
  task's status/evidence only. Prior MSGA-01–08/14/15 changes and full V2
  **29-file / 609-test** evidence are preserved; host-only changes require no V2 rerun.
- **Coverage:** 125 new real-MongoDB tests: 84 invalid-field cases across HTTP/
  direct calls (including zero recipient queries/model effects/message writes),
  10 normalized recipient/rendering/payload/nonmutation cases, 10 exact-size-boundary
  cases, 8 optional/default/enum cases, 8 addressed-recipient misses, 4 failed-key/
  corrected-key/completed-replay cases, and one empty-announcement case using both
  transports. Existing host lifecycle/startup/shutdown tests remain intact.
- Commands ran serially from `<repo-root>` with `ASDF_NODEJS_VERSION=26.11.1`
  (`node --version`: `v26.11.1`). `ls -ld` verified the initially empty temp directory;
  `git check-ignore -v _tmp-msga` confirmed `.gitignore:8:_tmp*`. Absolute `TMPDIR`
  is represented below as `<repo-root>/_tmp-msga`. No nested agents were used.
- **V3 dependency build, exit 0:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter org-access-nodejs-example build:deps`.
  Both five-package dependency graphs built ESM/CJS/declarations. The first focused
  test import found absent generated `express-runtime` entrypoints (zero tests);
  the supplemental prerequisite build passed:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/express-runtime... build`.
  The app README records this clean-checkout prerequisite; no manifest change.
- **Fail-before probes, exit 1:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec vitest run --config vitest.config.ts --fileParallelism=false apps/nodejs/test/message-validation.test.ts -t 'rejects direct-message: missing subject|normalizes team-invitation|rejects missing direct-message|keeps a failed invalid|no eligible recipients'`
  gave **3 failed / 122 name-filtered skips** (quoted table names did not match
  the narrower patterns). The same command with `-t 'normalizes|rejects missing'`
  gave **18 failed / 107 skips**, exposing raw lookup/rendering data and empty
  success. No prior work was reverted/stashed. First post-fix full focused run:
  **121 passed / 4 failed**, solely an incorrect test expectation of failed
  `itemCount: 0`; corrected to the existing `null` contract before final checks.
- **V3 source typecheck, exit 0:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter org-access-nodejs-example typecheck`.
- **Final V3 + focused regressions, exit 0:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec vitest run --config vitest.config.ts --fileParallelism=false apps/nodejs/test/message-lifecycle.test.ts apps/nodejs/test/message-validation.test.ts`.
  **2 files / 128 tests passed**, no skips (**12.54 s**): 125 new validation cases
  plus all 3 existing lifecycle/cleanup cases, using actual replica-set MongoDB.
- **Formatting, exit 0:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check apps/nodejs/src/messages.ts apps/nodejs/test/message-validation.test.ts apps/nodejs/README.md docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Formatting corrections used read-only formatter output and `apply_patch`.
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm lint` passed.
  `git diff --check` plus `git diff --no-index --check /dev/null <path>` for the
  new validation test and task document emitted no whitespace diagnostics.
- MongoDB fixtures self-cleaned; process inspection found no live test/MongoDB
  workers. Generated compile cache was removed from the verified ignored temp
  directory, leaving it empty. Vite's existing config-loader advisory was non-failing.
  **MSGA-09 completed; no task-local blocker.** Other task statuses and batch
  evidence are unchanged; workspace/final independent integration remains separate.

### Task MSGA-10: Correct the reference browser's response handling

Status: completed

Assigned: MSGA-10 implementation sub-agent (fresh session, sequential execution)

Kind: defect

Priority: P2 — the example caller reads missing envelope fields from valid package responses.

Dependencies: none

Primary ownership:

- `apps/react-vite/src/api.ts`
- `apps/react-vite/src/types.ts` and focused client contract tests
- Narrow message-page integration adjustments if needed

Finding:

The browser's create, action-list, and action-execution helpers expect
`{ success, data }` and return `response.data.data`. The package routes return
message arrays, action metadata, and handler results directly. The separate host
list endpoint intentionally does use an envelope. Existing host tests assert the
bare action response, but do not exercise this browser adapter.

References:

- `apps/react-vite/src/api.ts:100-138`
- `packages/message-service/src/route-factory.ts:392-403,409-428,431-450`
- `apps/nodejs/test/message-lifecycle.test.ts:130-138,162-179`

Requirements:

1. Match each client helper and its response types to its endpoint's actual public
   contract; preserve the host list envelope.
2. Add a caller-level regression rather than modifying the server contract to
   accommodate an incorrect client assumption.
3. Cover the package's action result/status shapes used by the UI, including an
   accepted pending-notification outcome where applicable.

Acceptance criteria:

- Creation returns public message DTOs, action listing returns usable action
  metadata, and execution returns the handler result.
- An authorized action can reach the UI from the actual adapter contract.
- Enveloped list results still work, and private stored fields are not added to
  client types or responses to make the integration pass.

Verification: V4, plus V3 for host HTTP contract evidence.

Completion evidence (2026-10-19, browser caller boundary):

- **Contract correction:** create/replay returns bare public `Message[]`, action
  listing returns bare `{ uiTemplate, actions }`, and execution returns the bare
  handler result as `unknown` (including arrays, scalars and null). The host's
  `GET /messages` still unwraps `{ success, data }`. HTTP **202** resolves with its
  public `{ message, actionAttemptId }` pending-notification body; the UI displays
  that notice, closes the action view and refreshes messages without another POST.
- Client DTOs now match the public serializer: optional party presentation fields,
  public action state/code/attempt ID, optional archive ownership/date/notification
  state, and confirmation's optional documents flag. No private storage fields or
  server response changes. The message page narrows unknown results before reading
  `message`; handler results without a message retain `Action completed`.
- Changed paths: `apps/react-vite/src/api.ts`, `apps/react-vite/src/types.ts`,
  `apps/react-vite/src/pages/messages-page.tsx`,
  `apps/react-vite/tests/message-contract.test.tsx`, and this task's status/evidence.
  Prior MSGA-01–09/14/15 work and other task statuses were preserved.
- **16 new caller regressions** use the installed workspace adapter and real Axios
  requests to a local HTTP fixture server, with no API/adapter/Axios mocks. They
  cover the list envelope/pagination/token, active/archive creation DTOs, both
  action views/confirmation metadata, six handler result shapes, submitted/default
  input, HTTP 403 rejection, and UI action-button/200/202/refetch/single-POST flows.
  HTTP fixtures establish caller transport behavior; V3 below independently checks
  the real host's authorization, response bodies, DTO exclusions and lifecycle.
- Environment: build/test commands ran serially from `<repo-root>` with
  `ASDF_NODEJS_VERSION=26.11.1` (`node --version`: `v26.11.1`).
  `ls -ld <repo-root> <repo-root>/_tmp-msga` verified the initially empty temp
  directory; `git check-ignore -v _tmp-msga` confirmed `.gitignore:8:_tmp*`.
  Absolute `TMPDIR` is normalized below to `<repo-root>/_tmp-msga`. No nested agents.
- Inspected existing app scripts, Vite/Vitest/jsdom configs, TS project references,
  tests and package entrypoints first. Only the two missing frontend dependency
  outputs were built; utils and all host entrypoints already existed:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/access-router-client --filter @web-ts-toolkit/access-router-react --workspace-concurrency=1 build`.
  Exit 0, both packages' ESM/CJS/declarations. No host dependency rebuild needed.
- **Fail-before/pass-after:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite test --fileParallelism=false tests/message-contract.test.tsx`.
  Before implementation: **13 failed / 2 passed**, exposing undefined create/action
  bodies, incorrect unwrapping of business `data`, null-result failure and missing
  UI action buttons. After: **15 passed**; a subsequent host-style no-message UI
  case brings the final focused coverage to 16. The initial harness-only run failed
  all 15 before HTTP because Node 26's native localStorage shadowed jsdom's; the
  test now restores jsdom's actual browser storage for its lifetime. No revert/stash.
- **V4:** before implementation, the existing **2 files / 3 tests** and build passed.
  Final command:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite test --fileParallelism=false`.
  Exit 0, **3 files / 19 tests passed**, no skips (**5.99 s**).
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite build`
  exited 0, including Vite production assets and PWA service worker generation.
- **V3:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter org-access-nodejs-example typecheck`
  exited 0.
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec vitest run --config vitest.config.ts --fileParallelism=false apps/nodejs/test/message-lifecycle.test.ts apps/nodejs/test/message-validation.test.ts`
  exited 0, **2 files / 128 tests passed**, no skips (**12.35 s**), real replica-set
  MongoDB. No backend change, so package V2 was not repeated.
- **Precise unrelated typecheck baseline, measured before app edits:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite exec tsc --noEmit -p tsconfig.app.json`
  exited 2: **TS5101**, `apps/react-vite/tsconfig.app.json:21:5`, deprecated `baseUrl`.
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite exec tsc --noEmit -p tsconfig.app.json --ignoreDeprecations 6.0`
  exited 2 both before and after implementation with the **same nine diagnostics**:
  `src/api.ts:86:5` TS2322 (`Partial<OrganizationMember>[]` workspace result);
  `src/pages/workspace-page.tsx:9:15` TS6196 (unused type), `23:9`, `23:39`,
  `27:9`, `27:42` TS2339 (obsolete create/update/delete hook names), `100:23`
  TS7006 (`result`), `160:32` TS2339 (`save`); and
  `src/pages/workspace/organization-panels.tsx:15:7` TS6133 (`sectionHeaderClass`).
  These paths are app-relative; no new message/test diagnostics remain. The new
  HTTP test explicitly references the already-installed Node types. The shipped
  build's `tsc --noEmit` uses a solution config with `files: []` and does not check
  its referenced app project; its passing build does not establish full source
  typecheck health. No unrelated workspace/config fix was included.
- **Hygiene:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check apps/react-vite/src/api.ts apps/react-vite/src/types.ts apps/react-vite/src/pages/messages-page.tsx apps/react-vite/tests/message-contract.test.tsx docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  passed; formatting used read-only formatter suggestions and `apply_patch`.
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm lint` passed.
  `git diff --check` plus `git diff --no-index --check /dev/null <path>` for the new
  frontend test and task document produced no whitespace diagnostics.
- HTTP/React Query fixtures and MongoDB processes self-cleaned; generated PWA temp
  files and compile cache were removed from the verified ignored temp directory.
  Vite's existing config-loader/chunk-size advisories were non-failing.
  **MSGA-10 completed; no task-local blocker.** The explicit source-project
  typecheck still has the recorded unrelated baseline failures. Full workspace
  integration and independent review remain MSGA-11/13 work.

### Task MSGA-11: Prove multi-app and installed-consumer compatibility

Status: completed

Assigned: MSGA-11 compatibility implementation sub-agent (fresh session, sequential execution)

Kind: improvement

Priority: P2 — portable source APIs need evidence from independently configured apps and the actual published surface.

Dependencies: MSGA-01, MSGA-02, MSGA-03, MSGA-04, MSGA-05, MSGA-06, MSGA-07, MSGA-08, MSGA-09, MSGA-10, MSGA-14, MSGA-15

Primary ownership:

- `packages/message-service/test/support/mongodb-fixture.ts`
- `packages/message-service/test/support/packed-consumer-harness.ts`
- `packages/message-service/test/message-service.packed-consumer.test.ts`
- `packages/message-service/test/message-service.readme-contract.test.ts`
- Package public exports, README/DESIGN, and relevant CI configuration

Finding:

Existing fixtures cover custom connection-local models and service injection, and
packed tests cover ESM/CJS/TypeScript. The installed-consumer harness requests
`express: ^5.2.1` and `mongoose: ^9.8.0`; it does not certify the declared minimum
Mongoose 8/Express 5 range. A distinct two-app fixture would prove adaptation
without dependence on the reference host's global models/registry.

References:

- `packages/message-service/test/message-service.mongodb.test.ts:802-875`
- `packages/message-service/test/message-service.route-service-reuse.test.ts:156-223`
- `packages/message-service/test/support/packed-consumer-harness.ts:133-168`
- `packages/message-service/package.json:16-49`
- `packages/message-service/tsup.config.ts:3-12`
- `.github/workflows/test.yml`

Requirements:

1. Exercise two apps in one process with distinct connections, registries, model
   names, user-ID configurations, and provider adapters. Use the public API.
2. Reuse identical template codes/request keys to prove configured isolation;
   preserve owning-connection checks and explicit registry behavior.
3. Establish a bounded minimum/current peer matrix, including the declared consumer
   Node floor. Separate build-tool prerequisites from consumer-runtime support.
4. Compile/run real packed consumers in ESM, CommonJS, and strict TypeScript modes;
   inspect emitted declarations and ensure new exports/JSDoc survive publication.
5. Ship self-contained root-import integration recipes in README. Document approved
   contract changes and migration implications; check secondary website docs for
   material drift without relying on them as the installed consumer's instructions.
6. Add any approved implementation follow-ups from MSGA-04/MSGA-07 to this task's
   dependencies before starting it. A deferred recommendation requires explicit
   rationale rather than a fabricated implementation dependency.

Acceptance criteria:

- Each app creates, lists, acts, archives, and replays through its own configuration
  without cross-app template, model, provider, or reservation fallback.
- ObjectId and arbitrary-string user integrations work from installed root imports.
- The bounded peer/runtime lanes report exact resolved versions and results.
- Public types, emitted declarations, README examples, and runtime behavior agree.
- Existing DTO exclusions, mixed-module behavior, and transaction guarantees remain
  covered. No unsupported native-driver or shared-collection guarantee is implied.

Verification: V1 multi-app fixtures, V2 packed/README consumers, new bounded
compatibility lanes with their exact commands recorded, and V3/V4 as affected.

Completion evidence (2026-10-19, MSGA-11 only):

- **Delivered:** extended the existing release-transformed staging/packing/install
  harness, preserving all prerequisite work. The new standalone
  `packages/message-service/test/support/two-apps-consumer.mjs` is copied into fresh
  installed consumers and imports only public package roots. Its factory is extracted
  from the **installed README**, compiled to ESM/CommonJS, and executed against a
  real MongoDB replica set. No source-import proof substitutes for installation.
- Each execution hosts **two Express apps in the same process**, with distinct
  connections/databases, model/collection names, registries, auth-request shapes and
  stateful payment/email adapters. Native ObjectId and opaque String parties cover
  both active/archive storage and **`archivedBy`**. Both reuse the exact same template,
  action, payment code, textual requester scope and request key. Assertions cover
  HTTP create/action listing/execution, service list/count, parser rejection/claim
  release, handler context/model resolution, service/direct transactional archival,
  mixed/final changed-payload replay, terminal outcomes, DTO exclusions, payment
  create/expire/refund binding, local-user email and optional external-directory
  email. Null directory results do not fall back even with a local decoy user.
- Isolation negatives cover foreign IDs/documents, miswired resolver connections,
  missing configured models, registry removal, omitted direct-archive registry,
  decoy default request users, and a poisoned global model getter/default template.
  Global model getter calls are **zero**. Authorization rejects an unrelated actor
  before model resolution; an authorized foreign document then fails model resolution.
- **Actual minimum-peer defect found and fixed:** pre-fix installed Mongoose 8.0.0
  strict declarations failed with TS2707/TS2694 (inferred schema constants expanded
  Mongoose 9-only generic arities/`HydratedDocumentOverrides`) and TS2345/TS2322
  (Mongoose 8's optional document `_id` could not satisfy the serializer contract).
  Small source correction: explicitly type content/default schema constants using
  common Mongoose types/`ReturnType`, and require persisted ObjectId `_id` on active
  and archive document types. Runtime schemas, bundling, exports and declared floors
  are preserved. No metadata narrowing or generated declaration edits were needed.
- Shipped root imports, strict positive/negative types, new attachment/input/email/
  lease APIs, both new branded errors in both module directions, nonenumerable
  branding and unbranded-object rejection are checked. Both emitted declaration
  formats retain the relevant API/JSDoc. README adds the executable independent-app
  factory, floor reproduction and compatibility correction; website changes address
  material migration/API drift and invalid default-schema ID examples only.
- Bounded matrix (both lanes **passed**, actual consumer runtime **Node 22.0.0**):

  | Lane                          | Express | Mongoose | MongoDB | ESM/CJS two-app runs |
  | ----------------------------- | ------- | -------- | ------- | -------------------- |
  | Minimum declared peers        | 5.0.0   | 8.0.0    | 8.2.6   | 2 passed             |
  | Exact installed-current peers | 5.2.1   | 9.9.2    | 8.2.6   | 2 passed             |

  Both resolve TypeScript **6.0.3**, `@types/express` **5.0.6**, `@types/node`
  **22.20.1**, `mongodb-memory-server` **11.3.0**. Builds/install/compiler/Vitest
  use **Node 26.11.1**, pnpm **11.18.0**, tsup **8.5.1**, Vitest **4.1.11**.
  The matrix uses **4 compiler invocations / 6 strict mode-lanes** (NodeNext ESM,
  NodeNext CJS, Bundler, all `skipLibCheck: false`), **10 runtime smokes**, and
  **4 two-app executions / 44 named lifecycle check groups** (11 per execution).

- Runtime preparation: verified the standard asdf Node install parent, then ran
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" asdf install nodejs 22.0.0`.
  No tool selection/configuration was changed. Verified the pre-existing empty
  temp directory with `ls -ld <repo-root> <repo-root>/_tmp-msga` and
  `git check-ignore -v _tmp-msga` (`.gitignore:8:_tmp*`). All builds, tests and
  fixture installs ran sequentially; fixture installs have private manifests,
  workspace boundaries and lockfiles, leaving root lockfiles/config untouched.
- Exact successful verification commands from `<repo-root>`, with this environment
  (the placeholder `TMPDIR` denotes its actual absolute repo-local path):

  ```bash
  export ASDF_NODEJS_VERSION=26.11.1
  export TMPDIR="<repo-root>/_tmp-msga"
  export MESSAGE_SERVICE_CONSUMER_NODE="$(asdf where nodejs 22.0.0)/bin/node"
  export MESSAGE_SERVICE_EXPECT_NODE=22.0.0
  export MESSAGE_SERVICE_REPORT_DIR="$TMPDIR"
  pnpm --filter @web-ts-toolkit/message-service... build
  pnpm --filter @web-ts-toolkit/message-service build
  pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.packed-consumer.test.ts -t MSGA-11
  pnpm --filter @web-ts-toolkit/message-service test
  pnpm lint
  git diff --check
  ```

  Focused compatibility: **1 file / 2 passed / 14 name-filtered skips**, 52.69 s
  in the final focused run. Initial probe: **2 failed / 14 skipped**, exposing the
  minimum declaration defect plus a fixture expectation corrected to reflect
  authorization-before-resolution; post-fix runs passed without reverting work.
  Full **V2: 29 files / 611 tests passed, no skips**, including **16 packed tests**;
  486.80 s test duration after rebuilding the five transitive packages. Matrix
  consumers executed Node 22.0.0; remaining V2 tests/older packed probes ran on
  Node 26.11.1. Vite's pre-existing native-config-loader advisory was non-failing.

- Formatting command (all **12 MSGA-11 changed paths** passed):
  `pnpm exec prettier --check .github/workflows/message-service-compatibility.yml packages/message-service/README.md packages/message-service/src/schemas/base.ts packages/message-service/src/schemas/message.ts packages/message-service/src/schemas/message-archive.ts packages/message-service/src/schemas/message-request.ts packages/message-service/src/types/message.ts packages/message-service/test/message-service.packed-consumer.test.ts packages/message-service/test/support/packed-consumer-harness.ts packages/message-service/test/support/two-apps-consumer.mjs website/docs/packages/message-service.md docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Repository `pnpm lint` and whitespace checks passed. New/untracked files were
  additionally included via `git diff --no-index --check /dev/null <path>`.
- Reproducible CI: `.github/workflows/message-service-compatibility.yml` follows
  existing setup actions/pinned checkout and artifact-upload conventions. It builds
  with workspace tools, installs asdf Node 22.0.0 without editing tool config, runs
  both peer lanes serially, and saves exact resolved JSON reports. Those reports
  were inspected locally; temporary consumers/reports/MongoDB/cache files were
  cleaned from `_tmp-msga`, with no surviving repo-local MongoDB processes.
- **Limits/handoff:** no MSGA-11 acceptance gap remains. This is a bounded matrix,
  not every intermediate/future peer, compiler, MongoDB or OS combination. CI's
  commands passed locally; the hosted GitHub job has not been dispatched here.
  No reference-host/browser files changed in this task, so no additional V3/V4 run
  was required. Final whole-workspace V5 and independent security/public-contract
  review remain **MSGA-13**; root build/test and independent review were not run.

### Task MSGA-12: Investigate shared-collection tenancy separately

Status: completed

Assigned: MSGA-12 investigation sub-agent (fresh session, sequential execution)

Kind: investigation

Priority: P2 — tenancy is a separate deployment contract requiring end-to-end scoping, not an assumed property of independent-app reuse.

Dependencies: none

Primary ownership:

- Scope/query contracts in `packages/message-service/src/message-service.ts`
- Message/archive/request schemas and direct archival scope
- Design evidence linked to the existing tenancy deferrals

Finding:

Current visibility covers sender, direct recipient, and role recipient. Request
scope contains requester/template/key without a tenant namespace. Passing
`identity.tenantId`, adding a schema property, or filtering one list endpoint does
not establish scoping across claims, replay, archival, and derived notifications.
Separate connection/model configurations already offer a different isolation model.

References:

- `packages/message-service/src/message-service.ts:369-384,505-510,614-691,1207-1266,1517-1525,1608-1631`
- `packages/message-service/src/types/template.ts:8-32`
- `packages/message-service/src/schemas/message.ts:188-265` (direct archival)
- `packages/message-service/src/schemas/message-request.ts:37-39` (reservation indexes)
- `docs/tasks/20260912-095904-message-service-boundary-health-follow-up.md:1238-1245`
- `docs/tasks/20260919-185326-message-service-residual-workflow-health.md:792-796`

Requirements:

1. Compare current physical/model isolation with a first-class shared-collection
   namespace and any proposed host-owned scoped-model integration.
2. Produce a coverage matrix for create, list/count, find, action reads/execution,
   claims and follow-up writes, direct/service archival, derived notifications,
   replay, and compound indexes. Account for document-owned model resolution.
3. Identify authenticated scope ownership, conflicting caller input, migration,
   legacy records, and index requirements.
4. Recommend implement/defer/no action under the selected separate-apps-first
   objective. Shared-collection implementation needs separate approval and tasks.

Acceptance criteria:

- Every listed path has an evidence-backed scope/ownership assessment.
- The recommendation explains why a tenant field or inbox filter alone is insufficient.
- Any implementation proposal includes two scopes with overlapping IDs, roles,
  template codes, and request keys, plus cross-scope negative tests and scope
  preservation through archival/notification creation.

Verification: V6 path matrix and design review; bounded experiments only if needed.

#### MSGA-12 decision and evidence (2026-10-19, V6)

**Recommendation: defer shared-collection tenancy implementation; no new package
implementation needed for the selected separate-apps-first scope.** Distinct
databases/collections are already selectable with app-local registries and
providers. Different connections/model names pointing at the same collections
do not partition storage. This preserves the completed predecessors'
[namespace deferral](20260912-095904-message-service-boundary-health-follow-up.md#decisions-and-consequential-deferrals)
and [residual feature deferrals](20260919-185326-message-service-residual-workflow-health.md#consequential-feature-deferrals-not-execution-tasks).
No missing separate-app requirement was identified; **MSGA-11 has no tenancy
blocker or new approval dependency**. Its existing two-app/installed-consumer
verification remains necessary.

Source-backed matrix for the current worktree; shared-store gaps are obligations
for a future proposal, not implemented guarantees:

| Path / evidence                                                                                                                                                                                                                                        | Current model/ownership boundary                                                                                                                                                                                   | Shared-collection gap                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Create](../../packages/message-service/src/message-service.ts#L588-L658), [persistence](../../packages/message-service/src/message-service.ts#L1091-L1188)                                                                                            | Configured active model; fixed field projection; `identity` reaches preparation only. Reserved batches use active-owned transactions.                                                                              | Trusted scope must reach both message and reservation before effects; extra prepared properties are not copied.                                           |
| [List/count](../../packages/message-service/src/message-service.ts#L709-L755)                                                                                                                                                                          | Configured active model; sender/direct-user/role `$or`.                                                                                                                                                            | Scope must constrain every branch; an inbox filter covers only these queries.                                                                             |
| [Find](../../packages/message-service/src/message-service.ts#L405-L449)                                                                                                                                                                                | Principal-free active-to-archive lookup by `_id`; host authorizes exposure.                                                                                                                                        | Both stores and populated references need scoped resolution.                                                                                              |
| [Actions](../../packages/message-service/src/message-service.ts#L783-L987), [claims](../../packages/message-service/src/message-service.ts#L1326-L1447)                                                                                                | Stored listing; admin bypasses relationships for read-only views. Atomic claims use ID/state/lease, then authoritative relationship/permission checks; archive outcomes re-read stored relationships.              | Bind authenticated scope before lookup/claim/template effects, including admin and archived outcomes; existing authorization is not tenant authorization. |
| [Follow-up writes](../../packages/message-service/src/message-service.ts#L1450-L1500), [notification status](../../packages/message-service/src/message-service.ts#L1587-L1608)                                                                        | Release/retry/status filters fence ID, attempt and owner token.                                                                                                                                                    | Preserve the same immutable scope through failures, takeover and asynchronous completion; owner fencing alone supplies no namespace.                      |
| [Service archive](../../packages/message-service/src/message-service.ts#L1504-L1584)                                                                                                                                                                   | Source-owned active/archive models; copied document, transactional insert and fenced delete.                                                                                                                       | Both schemas must retain scope; ownership read, insert and delete must agree on it.                                                                       |
| [Direct archive](../../packages/message-service/src/schemas/message.ts#L186-L315)                                                                                                                                                                      | Trusted host primitive; constructor model and named archive on its connection; fresh ID read and conditional delete.                                                                                               | Must enforce scope independently of service wrappers; no principal/relationship authorization is performed here.                                          |
| [Derived notification](../../packages/message-service/src/message-service.ts#L1611-L1645), [generic create](../../packages/message-service/src/message-service.ts#L674-L695), [email](../../packages/message-service/src/schemas/message.ts#L358-L388) | Sender notification selects source-owned active model but creates only listed generic fields. Email uses owning connection plus recipient ID, or host resolver.                                                    | Source connection is not scope propagation: copy source namespace into derived records and scope recipient/directory lookup.                              |
| [Replay/reservations](../../packages/message-service/src/message-service.ts#L1727-L1992)                                                                                                                                                               | Requester/template/key; lease acquisition/failure and active/archive replay use that tuple. Completion uses it plus lease owner (create row).                                                                      | Namespace every reservation and replay path; an equal tuple can return another scope's completed batch before preparation.                                |
| [Request indexes](../../packages/message-service/src/schemas/message-request.ts#L37-L39), [active](../../packages/message-service/src/schemas/message.ts#L500-L532), [archive](../../packages/message-service/src/schemas/message-archive.ts#L47-L73)  | Unique reservation tuple; unique tuple+item index in each message store; replay/inbox/lease indexes omit tenants.                                                                                                  | Tenant-aware queries need corresponding replay/unique indexes; changing filters alone leaves cross-scope uniqueness conflicts.                            |
| [Document-owned resolvers](../../packages/message-service/src/message-service.ts#L999-L1048)                                                                                                                                                           | With no resolver, source connection precedes configured connection. `getModel` checks connection equality only; handler model lookup uses `source.db.model`. Direct archive/email also use constructor connection. | Same connection is not same tenant/collection. A service `getModel` wrapper cannot cover these constructor/handler paths alone.                           |

**Approach comparison.** Physical/model isolation works when models actually target
distinct stores and hosts route callers/documents to their app configuration;
`connection` alone is not a foreign-document authorization guard. First-class
shared scoping would require an end-to-end authenticated namespace contract.
Host-owned scoped models, discriminators or schema plugins are possible candidates
only if every resolved active/archive/request and related-user model enforces
scope on creates, reads, updates, deletes and transactional array creates. They
must also survive named document resolution and collection-level indexes. No
such integration is certified by the inspected tests. A tenant schema field or
`payload.tenantId` supplies neither enforcement nor automatic notification scope.

**Scope/conflicts.** A future scope must come from host-authenticated membership
and remain immutable during work. Reject missing authenticated scope and
conflicting body/path/identity/action-input or supplied-document hints before
effects. Admin permissions do not
select a namespace. Overlapping user IDs and role strings satisfy the current
[relationship checks](../../packages/message-service/src/schemas/methods.ts#L15-L23);
equal template codes can select different app handlers, while equal requester/
template/key tuples share replay irrespective of submitted payload. Additional
principal tenant fields are excluded from the
[action snapshot](../../packages/message-service/src/message-service.ts#L1741-L1747).

**Future migration implications.** Host-map legacy active/archive/request records
and derived notifications together; quarantine ambiguous ownership rather than
assigning a permissive default. Reconcile conflicting histories/business effects,
preserve textual requester/key normalization and replay retention, and drain live
leases during a coordinated cutover. Backfill before building scoped unique/replay
indexes, then retire old reservation/item unique constraints before admitting
overlapping tuples; review inbox, lease and archive indexes. `_id` remains unique
per physical collection; retain attempt uniqueness unless separately redesigned. No
concrete shared-store requirement justifies new implementation tasks or proposed
runtime acceptance tests in this phase.

**Existing evidence inspected, not rerun:**
[custom connection/model lifecycle](../../packages/message-service/test/message-service.mongodb.test.ts#L940-L1013),
[index/replay cases](../../packages/message-service/test/message-service.mongodb.test.ts#L430-L585),
[foreign-document resolver rejection](../../packages/message-service/test/message-service.authoritative-reads.test.ts#L606-L635),
[direct archive](../../packages/message-service/test/message-service.direct-archive.test.ts#L277-L308),
[same-ID owning-connection email](../../packages/message-service/test/message-service.email.mongodb.test.ts#L59-L147),
and [exact service/registry injection](../../packages/message-service/test/message-service.route-service-reuse.test.ts#L158-L224).
These support existing seams, not a new shared-store security claim. Explicit
source branches resolved the bounded questions; no build/runtime tests were needed.

**Executed checks** (from `<repo-root>`; only this task section/status edited):

- `ASDF_NODEJS_VERSION=26.11.1 pnpm exec prettier --check docs/tasks/20261018-185629-message-service-multi-app-adaptability.md` — final pass after applying the initial check's matrix-alignment correction with `apply_patch`.
- `ASDF_NODEJS_VERSION=26.11.1 git diff --check` — passed.
- `ASDF_NODEJS_VERSION=26.11.1 git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md` — no whitespace diagnostics (includes the untracked document).
- Local link/fragment validation below — **28 valid**. V6 covers path ownership,
  compatibility/migration, selected scope and decision ownership: the maintainer
  owns any future shared-store activation. Investigation deliverable completed;
  prior implementation/status evidence retained.

```sh
ASDF_NODEJS_VERSION=26.11.1 node --input-type=module -e '
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
const f = "docs/tasks/20261018-185629-message-service-multi-app-adaptability.md";
const section = readFileSync(f, "utf8").split(/^### Task MSGA-12:/m)[1].split(/^### Task MSGA-13:/m)[0];
const links = [...section.matchAll(/\]\(([^)]+)\)/g)];
for (const [, url] of links) {
  const [p, hash] = url.split("#"), text = readFileSync(p ? resolve(dirname(f), p) : f, "utf8");
  if (!hash) continue;
  const line = /^L(\d+)(?:-L(\d+))?$/.exec(hash);
  assert(line ? +line[1] > 0 && +(line[2] || line[1]) >= +line[1] && +(line[2] || line[1]) <= text.trimEnd().split("\n").length : [...text.matchAll(/^#{1,6} (.+)$/gm)].some(([, h]) => h.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-") === hash), url);
}
console.log(`MSGA-12: ${links.length} local links/fragments valid`);
'
```

### Task MSGA-13: Independently review integration and public contracts

Status: completed

Assigned: MSGA-13 independent review sub-agent (same independent session resumed after separate MSGA-16 implementation)

Kind: improvement

Priority: P2 — the combined changes need an independent check against all acceptance criteria and installed/reference-app contracts.

Suggested agent: independent integration reviewer, distinct from the main implementer

Dependencies: MSGA-01, MSGA-02, MSGA-03, MSGA-04, MSGA-05, MSGA-06, MSGA-07, MSGA-08, MSGA-09, MSGA-10, MSGA-11, MSGA-12, MSGA-14, MSGA-15, MSGA-16

Primary ownership:

- This task document's completion evidence and final integration assessment
- Delivered package/public-contract, installed-consumer, and reference-app behavior

Finding:

Identity adaptation, recipient defaults, providers, and client contracts interact
with existing claims, transactions, replay, and public serialization. Individual
green unit tests are insufficient evidence for the complete adaptability objective.

References:

- All task findings and acceptance criteria in this document
- `AGENTS.md` (serialized workspace verification)
- `packages/message-service/test/message-service.packed-consumer.test.ts`
- `apps/nodejs/test/message-lifecycle.test.ts`

Requirements:

1. Verify every acceptance criterion against delivered behavior or the required
   investigation evidence, independently of implementation completion summaries.
2. Check alternate direct-service, document-method, and HTTP entry paths; preserve
   stored-target authorization, ownership fencing, transaction outcomes, replay
   coherence, and public DTO exclusions.
3. Confirm public types, emitted declarations, JSDoc, README, migrations, and the
   bounded support matrix agree. Retain explicit host-controlled data boundaries.
4. Add all approved follow-up implementation IDs to dependencies before execution.
   Investigation approval alone does not complete resulting code changes.
5. Record exact commands/results and unresolved decisions. Introduce a new task for
   independent actionable findings; do not silently expand the reviewed scope.

Acceptance criteria:

- All prerequisites have verified outcomes; required runtime/public-contract cases
  pass, and investigations have evidence-backed conclusions.
- V2-V5 and the selected compatibility lanes pass. Missing required prerequisites
  or failing required checks leave the affected work/final integration blocked.
- Deferred work has rationale and residual limitations; no private operational
  identifiers or machine-specific paths are included in shared evidence.
- The coordinator reviews the finished document and delivered diff once more.

Verification: V2-V6 and the compatibility lanes established by MSGA-11. The final
reviewer reports evidence independently; do not imply this review has already run.

Initial independent review evidence (2026-10-19, historical pre-MSGA-16 checkpoint;
the independent recheck below supersedes its blocker and affected package results):

- **Blocked on MSGA-16:** explicit `actionLeaseMs: null` silently selects the
  30000-ms default in direct and route construction, contradicting the documented
  non-number rejection contract. The runtime invalid-value matrix omits null,
  while packed strict types already reject it. This is a contained configuration
  validation defect, not an authorization bypass. All required integration commands
  below passed; their success does not satisfy this uncovered acceptance case.
- Owner/handoff: the coordinator assigns MSGA-16 to a separate implementation agent,
  then obtains affected verification and an independent recheck before closing
  MSGA-13. The coordinator's required final document/diff reread is also outstanding.
  No other material implementation defect or selected-scope coverage hole was found.
- Reviewed independently in this fresh reviewer session, without implementation or
  nested agents: `AGENTS.md`, task workflow/shared rules, every task's requirements,
  acceptance and completion evidence, the full 31-path tracked diff, and all 13
  untracked paths present at handoff. Inspected delivered source, regressions,
  README/DESIGN/website guidance, release-transformed packing/install harness,
  generated `.d.ts`/`.d.mts`, and compatibility CI/setup actions. Prior work remains
  intact; reviewer changes are confined to this task document.

Acceptance audit against actual delivery:

| Tasks             | Independent assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MSGA-01           | Seven recipient configurations in both creation modes genuinely distinguish omitted/empty fallback from explicit combined grants; MongoDB list/count, denied mutation, role-only execution and stored archive relationships agree.                                                                                                                                                                                                                                                                                                                              |
| MSGA-02           | Explicit principal projection preserves plain/getter/persisted hydrated callers without reading private getters/serializers; malformed/sparse roles fail before model effects, and copied roles prevent handler mutation of callers. Stored-target and archived-outcome gates remain authoritative.                                                                                                                                                                                                                                                             |
| MSGA-03           | Native ObjectId and case-sensitive String storage cover both parties and archive ownership, padding, populated references, service/direct archival, serialization and exact legacy request scopes. Installed README recipe executes through both module roots.                                                                                                                                                                                                                                                                                                  |
| MSGA-04 / MSGA-14 | Approved mandatory-session decision is implemented per fresh paid item, including unaddressed items. Tests exercise missing/null/no-op providers, empty override inheritance, payer selection, direct committed prefixes, atomic batches, known-session compensation and legacy completed replay without providers/preparation. Confirmed-commit cleanup remains covered.                                                                                                                                                                                       |
| MSGA-05 / MSGA-06 | Real persistence and installed recipes exercise default owning-connection versus custom/no-User email lookup, binding, opt-outs/failures/session skips, and prepared attachment override/clear/fallback/fan-out copying. Explicit construction excludes injected lifecycle/ownership fields.                                                                                                                                                                                                                                                                    |
| MSGA-07 / MSGA-15 | Approved host-owned input contract is implemented after claimed authorization: parser errors, unexpected/CastError-shaped failures, rejected/function/custom/async thenables, fresh/retry release and lost-owner races have meaningful negative assertions. Durable unique-key commands/local results survive archive failure and fresh service/connection closures; changed input, actor/target binding, cached-result authorization and first-host-reservation ownership are tested. No remote exactly-once or joint archive/business transaction is claimed. |
| MSGA-08           | Configured/default/min/max numeric leases, exact expiry, live conflicts, stale fencing, stable attempts and route injection are verified. The missing null runtime case is the MSGA-16 exception.                                                                                                                                                                                                                                                                                                                                                               |
| MSGA-09 / MSGA-10 | All five host preparations validate before recipient lookup, normalize stored/rendering values and retain failed-key policy. Real host HTTP tests corroborate the browser's bare create/action versus enveloped list contract; Axios/React fixture tests exercise usable action buttons, arbitrary result shapes and single-POST 202 handling.                                                                                                                                                                                                                  |
| MSGA-11           | Actual installed README factory runs two live apps with distinct databases/models/collections/registries/auth shapes and stateful providers, identical codes/owner scope/request key, native and opaque IDs, cross-app negative checks and zero poisoned-global-model calls. Release transformation, root exports, both new error brands, declaration portability/JSDoc and DTO exclusions are exercised. Source-owned connection resolution is not misrepresented as a universal foreign-document guard.                                                       |
| MSGA-12           | Inspected path matrix agrees with create/find/list/count/claim/retry/archive/notification/replay/index/resolver source. Shared-store tenancy is deliberately deferred under separate-apps-first; different names/connections targeting the same collections supply no namespace. Future authenticated scope, migration and overlapping-scope negatives remain explicit obligations.                                                                                                                                                                             |

Fresh executed verification (from `<repo-root>`, one command at a time):

```bash
export ASDF_NODEJS_VERSION=26.11.1
export TMPDIR="<repo-root>/_tmp-msga"
export MESSAGE_SERVICE_CONSUMER_NODE="$(asdf where nodejs 22.0.0)/bin/node"
export MESSAGE_SERVICE_EXPECT_NODE=22.0.0
export MESSAGE_SERVICE_REPORT_DIR="$TMPDIR/msga13-reports"
pnpm lint
pnpm build
pnpm test
pnpm --filter org-access-nodejs-example build:deps
pnpm --filter org-access-nodejs-example typecheck
pnpm exec vitest run --config vitest.config.ts --fileParallelism=false apps/nodejs/test/message-lifecycle.test.ts apps/nodejs/test/message-validation.test.ts
pnpm --filter react-vite test --fileParallelism=false
pnpm --filter react-vite build
git diff --check
```

- Environment: `node --version` returned **v26.11.1**; build tooling used pnpm
  **11.18.0**, tsup **8.5.1**, TypeScript **6.0.3**, Vitest **4.1.11**. `ls -ld`
  verified the existing checkout/temp parent; `git check-ignore -v _tmp-msga`
  confirmed `.gitignore:8:_tmp*`. The initially nonempty ignored directory was
  reused with absolute TMPDIR, normalized above; tool-selection files were not edited.
- **V5:** root lint, build and serial test all exited **0**. Root test reporter
  totals: **34 Vitest runs / 549 file executions / 13488 passing test executions,
  1 todo** (includes repeated compatibility lanes, not unique-test counts).
  Required browser-backed package suites also passed; no prerequisite provisioning
  was needed. Vite/native-loader and frontend chunk-size advisories were non-failing.
- **V2 was included in root test**, not duplicated: **29 files / 611 tests passed**,
  including all **16 packed-consumer tests**, real MongoDB and README contracts.
  The message-service test script rebuilt its five transitive packages first.
- **MSGA-11 lanes:** independently inspected the newly generated JSON reports:
  actual consumer **Node 22.0.0**, Express/Mongoose **5.0.0/8.0.0** and
  **5.2.1/9.9.2**; MongoDB **8.2.6**, `@types/express` **5.0.6**, `@types/node`
  **22.20.1**, `mongodb-memory-server` **11.3.0**. Both passed strict NodeNext
  ESM/CJS and Bundler with `skipLibCheck: false`: **4 compiler invocations / 6 mode
  lanes, 10 runtime smokes, 4 two-app lifecycles / 44 named check groups**. Other
  package tests/older packed recipes used Node 26.11.1. Hosted CI was reviewed,
  not dispatched; this bounded result does not certify all peer/OS/compiler versions.
- **V3:** dependency builds and source typecheck exited **0**; lifecycle plus
  validation passed **2 files / 128 tests**, no skips, on replica-set MongoDB.
- **V4:** focused app suite passed **3 files / 19 tests**, no skips; production/PWA
  build exited **0**. The root build/test also exercised these app scripts.
- Supplemental frontend source-project check:
  `pnpm --filter react-vite exec tsc --noEmit -p tsconfig.app.json --ignoreDeprecations 6.0`
  exited **2**, with exactly the **nine diagnostics recorded before/after MSGA-10**:
  `src/api.ts:86` TS2322; `src/pages/workspace-page.tsx:9` TS6196, `23`/`27`/`160`
  TS2339 (five), `100` TS7006; `src/pages/workspace/organization-panels.tsx:15`
  TS6133. No new message-path diagnostic appeared. Those unchanged failing lines
  and MSGA-10's measured baseline were inspected; this reviewer did not recreate a
  pre-implementation checkout. The solution-config build is not full app-project
  typecheck assurance. This supplemental baseline limitation is not a failed V2-V5 gate.
- Independent MSGA-16 reproduction, using the built package-root API:
  `pnpm --filter @web-ts-toolkit/message-service exec node -e 'const assert = require("node:assert/strict"); const { MessageService, createMessageRoutes, InvalidMessageServiceOptionError } = require("@web-ts-toolkit/message-service"); let failures = 0; for (const [label, construct] of [["direct service", (options) => new MessageService(options)], ["route construction", createMessageRoutes]]) { try { assert.throws(() => construct({ actionLeaseMs: null }), InvalidMessageServiceOptionError); } catch { failures++; console.error(label + ": expected InvalidMessageServiceOptionError; explicit null was accepted"); } } if (failures) process.exitCode = 1;'`
  exited **1**, reporting acceptance in **both** construction paths. A separate
  control probe confirmed undefined is accepted and string/zero are rejected.
- Existing deferrals remain explicit: shared-store tenancy, renewal, durable email/
  notification recovery, ambiguous payment outcomes, creation fingerprints and joint
  business/archive transactions are not supplied by the approved implementation.
  Hosts retain input/attachment/domain authorization, body bounds and DTO business-
  data responsibilities. No package/app source, root changelog, commit or tool config
  was changed to obtain passing results.
- Hygiene passed: `pnpm exec prettier --check docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`,
  `git diff --check`, and `git diff --no-index --check /dev/null <path>` for all
  **13 untracked files**, with no whitespace diagnostics. Whole-document formatting
  required only table alignment/blank lines in the earlier MSGA-11 evidence in
  addition to the new review table; that minor correction changes no historical result.
  Shared evidence contains no machine-specific paths/private session identifiers.
- Review-created temporary consumers, reports and fixture leftovers were cleaned;
  pre-existing temp entries (including the shared compile cache) were retained.
  No repo-local MongoDB, Vitest or Playwright worker remained. MSGA-16 is pending;
  MSGA-13 remains blocked on its
  separate implementation, independent recheck and coordinator final reread.

Independent recheck and completion (2026-10-19, same independent reviewer):

- **MSGA-16 independently verified; MSGA-13 completed.** No remaining material
  finding or new MSGA-17 follow-up is needed. All fifteen prerequisites, including
  approved MSGA-14/15 and corrective MSGA-16, have delivered outcomes. Rechecked
  all sixteen task statuses, dependency resolution/acyclicity, approval/deferral
  claims and public contracts. **Coordinator final document/diff reread is still
  due** as the post-review handoff; it is not claimed performed here.
- Inspected the actual incremental source and all six MSGA-16 package/doc/test
  paths before relying on completion evidence. The only production behavior delta
  is undefined-only `actionLeaseMs` defaulting; legacy `clientRequest*` nullish
  defaults remain intact. New null regressions genuinely fail the old expression;
  omitted/undefined controls include persisted direct/HTTP claim deadlines and
  live-conflict protection. Packed runtime assertions exercise both roots and
  constructors, cross-format typed errors, default controls and zero model calls;
  strict types, rebuilt `.d.ts`/`.d.mts` JSDoc and README migration now agree.
- Fresh commands ran serially from `<repo-root>`, after verifying the existing
  ignored temp parent (`git check-ignore -v _tmp-msga`: `.gitignore:8:_tmp*`):

  ```bash
  export ASDF_NODEJS_VERSION=26.11.1
  export TMPDIR="<repo-root>/_tmp-msga"
  export MESSAGE_SERVICE_CONSUMER_NODE="$(asdf where nodejs 22.0.0)/bin/node"
  export MESSAGE_SERVICE_EXPECT_NODE=22.0.0
  export MESSAGE_SERVICE_REPORT_DIR="$TMPDIR/msga13-recheck-reports"
  pnpm --filter @web-ts-toolkit/message-service... build
  pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.timing-validation.test.ts test/message-service.route-service-reuse.test.ts test/message-service.action-fencing.test.ts
  pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.packed-consumer.test.ts -t 'MSGA-11|loads ESM and CommonJS package-name imports from a freshly installed tarball|strict NodeNext'
  pnpm lint
  pnpm exec prettier --check packages/message-service/src/message-service.ts packages/message-service/README.md packages/message-service/test/message-service.timing-validation.test.ts packages/message-service/test/message-service.route-service-reuse.test.ts packages/message-service/test/message-service.action-fencing.test.ts packages/message-service/test/message-service.packed-consumer.test.ts docs/tasks/20261018-185629-message-service-multi-app-adaptability.md
  git diff --check
  ```

- Original exact package-root null assertion recorded above was rerun after the
  fresh build: **exit 0** (previously exit 1). An additional independent root-import
  probe used actual Node **22.0.0**, both ESM/CJS and direct/convenience paths:

  ```bash
  pnpm --filter @web-ts-toolkit/message-service exec "$MESSAGE_SERVICE_CONSUMER_NODE" --input-type=module -e 'import assert from "node:assert/strict"; import { createRequire } from "node:module"; const esm = await import("@web-ts-toolkit/message-service"); const cjs = createRequire(import.meta.url)("@web-ts-toolkit/message-service"); let nullRejections = 0, defaults = 0, legacyControls = 0; for (const [api, other] of [[esm, cjs], [cjs, esm]]) { for (const construct of [(options) => new api.MessageService(options), (options) => api.createMessageRoutes(options).service]) { let effects = 0; const getModel = () => { effects++; throw new Error("unexpected model lookup"); }; assert.throws(() => construct({ getModel, actionLeaseMs: null }), (error) => error instanceof api.InvalidMessageServiceOptionError && error instanceof other.InvalidMessageServiceOptionError); nullRejections++; for (const lease of [{}, { actionLeaseMs: undefined }, { actionLeaseMs: 30000 }]) { const service = construct({ getModel, ...lease }); assert.equal(service.actionLeaseMs, 30000); defaults++; } const legacyNulls = [{ clientRequestLeaseMs: null }, { clientRequestWaitMs: null }, { clientRequestPollMs: null }, { clientRequestLeaseMs: null, clientRequestWaitMs: null, clientRequestPollMs: null }]; for (const legacy of legacyNulls) { const service = construct({ getModel, ...legacy }); assert.deepEqual([service.clientRequestLeaseMs, service.clientRequestWaitMs, service.clientRequestPollMs], [30000, 5000, 200]); legacyControls++; } assert.equal(construct({ getModel, actionLeaseMs: 90000 }).actionLeaseMs, 90000); assert.equal(effects, 0); } } assert.equal(process.versions.node, "22.0.0"); console.log(JSON.stringify({ node: process.versions.node, formats: 2, paths: 2, nullRejections, defaultControls: defaults, legacyNullControls: legacyControls, configuredAndZeroResolverEffects: "passed" }));'
  ```

  **Exit 0:** 4 null rejections, 12 omitted/undefined/explicit-default controls,
  16 individual/combined legacy-null controls (30000/5000/200 ms), configured
  90000-ms controls and zero resolver effects. Internal JS timing reads here are
  diagnostic assertions, not new public properties; V1 also checks actual MongoDB claims.

- Fresh results: **five-package build passed; V1 3 files / 47 tests passed**, no
  skips; packed **1 file / 4 passed / 12 name-filtered skips**. Fresh lint and
  seven-path formatting passed. Inspected new minimum/current reports: consumer
  Node **22.0.0**, Express/Mongoose **5.0.0/8.0.0** and **5.2.1/9.9.2**, MongoDB
  **8.2.6**, TypeScript **6.0.3**, `@types/express` **5.0.6**, `@types/node`
  **22.20.1**, memory-server **11.3.0**; build/Vitest Node **26.11.1**. Both lanes
  execute the extended mixed-root rejection probe and real two-app lifecycles.
- Evidence reconciliation: MSGA-16's post-fix **full V2: 29 files / 622 tests,
  including 16 packed tests**, is separately attributed implementation evidence,
  reviewed against delivered changes; this reviewer did not repeat full V2.
  It supersedes the pre-fix **611-test V2** for the affected package, corroborated
  by the fresh independent checks above. The earlier reviewer V5 root build/test
  (**13488 passing executions / 1 todo**) and V3/V4 (**128 host / 19 browser-app
  tests plus required builds/typecheck**) **predate MSGA-16**. Those unchanged
  workspace/host/frontend suites were not rerun for this narrow fix, as authorized;
  no final-tree whole-workspace test count is asserted.
- The explicit frontend app-project typecheck still has the recorded **nine
  baseline diagnostics**; the actual required V4 test/build passed. This limitation,
  bounded peer/runtime matrix, undispatched hosted CI and explicit feature deferrals
  remain unchanged. Historical blocked/creation-only text is labelled as history.
  Only this task document was edited by the reviewer; prior source/tests/docs remain
  preserved. Temp consumers/reports and three new MongoDB directories were cleaned,
  retaining all fourteen original temp entries; no repo-local test worker remained.
- Final document hygiene: **16 completed tasks / 15 MSGA-13 prerequisites**, valid
  acyclic dependencies, **32 local links/fragments**, no private paths/session IDs,
  and whitespace checks for all **13 untracked files** passed; final task-document
  Prettier and tracked `git diff --check` also passed.

### Task MSGA-14: Require payment sessions for nonempty payment codes

Status: completed

Assigned: MSGA-14 implementation sub-agent (fresh session, sequential execution)

Kind: improvement

Priority: P2 — make the maintainer-approved payment requirement explicit instead of silently persisting sessionless paid items.

Dependencies: MSGA-04

Primary ownership:

- `packages/message-service/src/message-service.ts` (`buildMessageDocument`)
- `packages/message-service/src/errors.ts`, public exports, provider documentation
- Payment configuration, compensation, route, and packed-consumer regression tests

Finding:

MSGA-04 established that missing providers and missing recipients can bypass session
creation for a nonempty effective payment code. The maintainer approved **Require
sessions**: all nonempty effective codes request a session regardless of recipients.
Absent/null providers must raise a typed server-configuration error. Completed
replay and empty-item-override inheritance remain unchanged.

References:

- MSGA-04 investigation matrices and recommendation in this document
- `packages/message-service/src/message-service.ts` (`buildMessageDocument`, replay and compensation paths)
- `packages/message-service/src/providers/payment.ts` (`PaymentProvider`, `NoopPaymentProvider`)

Requirements:

1. Reject fresh payment-bearing items without a provider using a root-exported,
   mixed-ESM/CJS-branded `PaymentProviderRequiredError`; HTTP must report a server
   configuration failure without exposing raw diagnostics.
2. Invoke a configured provider for nonempty effective codes independently of
   recipient presence. Keep provider-free code-free items valid.
3. Preserve null-return/provider rejection behavior, payer selection, empty item
   override inheritance, completed replay, compensation, sequential direct batches,
   atomic idempotent batches, and confirmed-commit cleanup handling.
4. Update public declarations, README/DESIGN migration guidance, provider JSDoc,
   and installed-consumer assertions. Payment completion/webhooks remain host-owned.

Acceptance criteria:

- Direct/idempotent/HTTP creation with template/item paid codes and absent/null
  providers fails predictably without committing a payment-bearing message.
- Paid messages with no recipients invoke the configured provider and persist its
  session on successful creation.
- Mixed-batch failures retain committed direct prefixes and compensate every known
  uncommitted idempotent session according to the existing contract.
- Completed replays, including legacy sessionless records, do not require a
  provider or rerun preparation. Code-free creation remains provider-optional.
- Public error imports and cross-format identity work; existing provider failures
  and transaction-cleanup regressions remain covered.

Verification: V1 payment/configuration/routes/compensation regressions; V2 and
installed public-error checks at coherent batch integration.

Completion evidence (2026-10-18, task-local implementation):

- Approved contract: every fresh item's nonempty
  `item.paymentCd || template.paymentCd || ''` requires a session independently of
  direct/role/fallback recipients. Empty item overrides still inherit and exact
  codes (including whitespace-only strings) remain unchanged. Absent/null providers
  now throw `PaymentProviderRequiredError` before that item's write. Code-free
  items, zero-item preparations, and completed replay need no provider. The
  maintainer approval recorded above resolves MSGA-04's historical decision blocker;
  its investigation findings remain historical and unmodified.
- Implementation: a per-item provider requirement replaces the recipient/provider
  skip gate. The new error is root-exported through the existing shared-error seam,
  uses the existing non-enumerable runtime brand and cross-format `Symbol.hasInstance`,
  and carries a stable server-configuration message without code/payer/session data.
  It has no HTTP status override and reaches the existing sanitized 500 response
  (`{ message: 'Internal Server Error' }`). Configured-provider rejection identity,
  null/empty-return Error, payer selection, per-item pricing arguments, recipient
  defaults, known-session compensation, direct committed-prefix retention, atomic
  idempotent creation, and confirmed-commit cleanup outcomes are preserved.
- New coverage: **85 real-MongoDB regressions** across direct/idempotent creation,
  template/item/empty-override codes, omitted/null providers, addressed/unaddressed
  items, exact whitespace codes, default/separate payers versus prepared senders,
  provider-free code-free/zero-item creation, Noop/null/empty/rejected provider
  contracts, mixed free/paid failures, compensation/observer aggregation, failed-key
  repair behavior, live HTTP 500/409/success, and legacy active/mixed/all-archive
  replay after provider/template/payload/payer changes. Legacy sessionless records
  are seeded directly; archive movement uses real transactions. Replay does not
  rerun preparation, create/expire sessions, or require a registered template.
- Installed surface: **one new focused packed-consumer case** installs release-like
  tarballs, compiles package-root imports under strict NodeNext ESM/CommonJS and
  Bundler with `skipLibCheck: false`, checks shipped README plus both declaration
  formats/JSDoc, and verifies genuine service-thrown errors and bidirectional
  ESM/CJS `instanceof` while rejecting an unbranded lookalike. The existing public
  runtime-export inventory now includes the error. README/DESIGN/provider/template/
  service JSDoc document the matrix, optional-provider boundary, migration from
  sessionless metadata, failed-key reconciliation, legacy replay, and host-owned
  payment completion. No schema/index/scope rewrite or vendor integration was added.
- MSGA-14 changed paths (pre-existing MSGA-01/02/03 work inspected and preserved):
  - `packages/message-service/src/errors.ts`
  - `packages/message-service/src/index.ts`
  - `packages/message-service/src/message-service.ts`
  - `packages/message-service/src/providers/payment.ts`
  - `packages/message-service/src/types/template.ts`
  - `packages/message-service/test/message-service.payment-configuration.mongodb.test.ts`
  - `packages/message-service/test/message-service.packed-consumer.test.ts`
  - `packages/message-service/README.md`
  - `packages/message-service/DESIGN.md`
  - `docs/tasks/20261018-185629-message-service-multi-app-adaptability.md` (MSGA-14 only)
- Environment: commands ran from `<repo-root>`, without delegated or overlapping
  build/test workers. `ASDF_NODEJS_VERSION=26.11.1 node --version` returned
  `v26.11.1`; `ls -ld <repo-root> <repo-root>/_tmp-msga` verified the pre-existing
  temporary directory and `git check-ignore -v _tmp-msga` confirmed
  `.gitignore:8:_tmp*`. All build/test commands used its absolute path as `TMPDIR`,
  normalized below to `<repo-root>/_tmp-msga`. Packed consumers cleaned themselves;
  `ps -C mongod -o pid=,args=` found no remaining MongoDB processes. Generated
  MongoDB fixtures/cache were removed from that directory and a final read
  confirmed it was empty.
- Build, before reproduction and after implementation (both exit 0, five packages,
  ESM/CJS plus declarations):
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service... build`.
  Inspection confirmed the new error export and payment JSDoc in both generated
  `dist/index.d.ts` and `dist/index.d.mts`.
- Fail-before/pass-after, with all new MongoDB regressions written before the fix:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.payment-configuration.mongodb.test.ts`.
  Before: exit 1, **61 failed / 24 passed**; missing-provider paid writes/HTTP 200s
  and skipped unaddressed provider/session/compensation work reproduced. After:
  exit 0, **85 passed**, no skips. No unrelated changes were reverted or stashed.
- Focused installed public-error validation:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.packed-consumer.test.ts -t MSGA-14`.
  Exit 0, **1 passed / 10 skipped** (other cases excluded by the name filter).
- V1 affected/neighboring verification:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.payment-configuration.mongodb.test.ts test/message-service.payment-compensation.test.ts test/message-service.transaction-cleanup.test.ts test/message-service.replay-coherence.test.ts test/message-service.failed-replay-boundary.test.ts test/message-service.test.ts test/message-service.mongodb.test.ts test/message-service.user-ids.mongodb.test.ts test/message-service.principal-validation.test.ts test/message-service.authoritative-reads.test.ts test/route-factory.test.ts test/message-service.route-service-reuse.test.ts test/message-service.public-message.test.ts test/message-service.rendering-separation.test.ts test/message-service.readme-contract.test.ts`.
  Exit 0, **15 files / 377 tests passed**, no skips. Includes compensation/setup/
  rollback, confirmed paid commit despite cleanup/observer rejection, replay
  coherence, sanitized failed replay, MSGA-01/02/03 recipient/principal/identity
  regressions, DTOs, rendering separation, route reuse, and the README lifecycle.
  Vite's existing native-config-loader advisory was non-failing.
- Formatting:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check packages/message-service/src/errors.ts packages/message-service/src/index.ts packages/message-service/src/message-service.ts packages/message-service/src/providers/payment.ts packages/message-service/src/types/template.ts packages/message-service/test/message-service.payment-configuration.mongodb.test.ts packages/message-service/test/message-service.packed-consumer.test.ts packages/message-service/README.md packages/message-service/DESIGN.md docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Final exit 0 for all ten paths; earlier table/test formatting suggestions were
  applied with `apply_patch` from read-only formatter output.
- Hygiene: `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm lint`
  passed repository-wide. `git diff --check` and
  `git diff --no-index --check /dev/null packages/message-service/test/message-service.payment-configuration.mongodb.test.ts`
  and
  `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  produced no whitespace diagnostics (the no-index commands include the new files).
- Status is **local MSGA-14 completion**, with no task-local blocker or additional
  material defect found. **Full V2 was not run and remains due at coherent batch
  integration**:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service test`.
  The full package/packed suite, bounded minimum/current peer/runtime matrix,
  final workspace `pnpm build`/`pnpm test`, and independent integration review
  remain MSGA-11/13 coordinator checks, not passing evidence from this task.

### Task MSGA-15: Add transport-independent action input and a durable host command example

Status: completed

Assigned: MSGA-15 implementation sub-agent (fresh session, sequential execution)

Kind: improvement

Priority: P2 — implement the maintainer-approved action-input boundary without coupling business handlers to Express.

Dependencies: MSGA-07

Primary ownership:

- `packages/message-service/src/types/template.ts` (`ActionContext`, `MessageAction`)
- `packages/message-service/src/message-service.ts` (authorized action execution)
- `packages/message-service/src/errors.ts`, `src/route-factory.ts`, root exports
- Direct/HTTP parser and real-MongoDB business-command integration regressions
- README/JSDoc/installed-consumer contracts

Finding:

MSGA-07 established that submitted action input currently reaches handlers only
through opaque `req` and can change across retries. The maintainer approved the
**host-owned store** option: explicit action input with optional pure parsing,
plus a durable host command/result-store specimen keyed by `actionAttemptId`.
Input binds at the first durable host reservation rather than the package claim.

References:

- MSGA-07 investigation and follow-up outline in this document
- `packages/message-service/src/message-service.ts` (`handleAction`, `releaseDeniedActionClaim`, `buildActionContext`)
- `packages/message-service/src/route-factory.ts` (action route)
- `packages/message-service/src/types/template.ts` (`MessageAction`, `ActionContext`)

Requirements:

1. Add `input?: unknown` to direct action data and `ActionContext`; HTTP supplies
   its body while retaining the exact original request for existing callbacks.
2. Add optional synchronous pure `parseInput`, selected from the authoritative
   claimed action after authorization and before handler effects. Reject invalid
   input with a root-exported typed 400 error; unexpected parser failures remain
   sanitized server errors. Do not treat presentation metadata as validation.
3. Release invalid fresh attempts through the fenced pre-handler release path;
   retries retain their stable attempt/action and conservative retryable state.
   Preserve ownership fencing when release races a takeover.
4. Demonstrate a durable host command/result store captured by a template factory,
   using stable normalized input and `actionAttemptId` deduplication, with explicit
   changed-input conflict behavior. Do not add generic business storage to the core.
5. Preserve legacy request callbacks, terminal archival, provider helpers, and the
   distinction between input and persisted message payload. Document validation,
   retry binding, legacy attempts, size/validation ownership, and limits on remote
   effect deduplication; keep external effects outside retryable transactions.

Acceptance criteria:

- Direct and HTTP calls deliver the same parsed input without requiring Express
  in the handler. Existing callbacks receive the original request unchanged.
- Invalid input runs no handler; fresh attempts return to active without an
  action restriction, while retries retain their ID/action. Unauthorized callers
  do not invoke parsers or learn attempt-specific data.
- Unexpected parser errors return sanitized 500; typed input errors return 400.
- Real-MongoDB host-store tests cover business success plus archival failure,
  same-command retry without another business mutation, and changed-command 409
  without replacing the original command/result.
- Public types, mixed-format errors, packed consumers, README, and runtime agree.

Verification: V1 parser/claims/route and real-MongoDB command-store regressions;
V2 and packed public contracts at coherent batch integration.

Completion evidence (2026-10-19, task-local implementation):

- **Approval:** the maintainer selected the host-owned command/result store.
  MSGA-07's earlier pending/conditional proposal is historical and superseded by
  that approval; its investigation text and all earlier completion/batch evidence
  are preserved.
- **Public contract:** additive `data.input?: unknown` / `ActionContext.input?: unknown`,
  raw HTTP `req.body` mapping with exact original `req`, and optional synchronous
  pure `MessageAction.parseInput` after authoritative claimed authorization/current
  action lookup. Root-branded `ActionInputValidationError` maps to fixed-message
  400; unexpected parser failures retain their diagnostic cause and map to sanitized 500. Promise/function/custom/async-then outputs never enter the handler or leak
  rejections. Existing fenced pre-handler release clears fresh reservations and
  retains retry/takeover attempt/action; lost-owner release preserves replacements.
- **Host protocol/docs:** the executable captured-service specimen atomically
  reserves a versioned command under MongoDB's unique attempt key, transactionally
  couples local business/result writes, reauthorizes cached reads, and preserves
  command/result under changed-command 409. Binding is at first host reservation,
  not package claim. README/JSDoc/DESIGN explain input versus both payloads,
  no-parser/legacy request compatibility, size/runtime validation ownership,
  legacy reconciliation, retention/versioning, and downstream deduplication for
  external effects. No core host-store abstraction or schema change was added.
- **Changed files (this task only):**
  - `packages/message-service/src/types/template.ts`
  - `packages/message-service/src/message-service.ts`
  - `packages/message-service/src/errors.ts`
  - `packages/message-service/src/route-factory.ts`
  - `packages/message-service/src/index.ts`
  - `packages/message-service/test/message-service.action-input.mongodb.test.ts`
  - `packages/message-service/test/message-service.action-command.mongodb.test.ts`
  - `packages/message-service/test/support/action-command-example.ts`
  - `packages/message-service/test/message-service.packed-consumer.test.ts`
  - `packages/message-service/README.md`
  - `packages/message-service/DESIGN.md`
  - `docs/tasks/20261018-185629-message-service-multi-app-adaptability.md` (MSGA-15 only)
- Environment: commands ran from `<repo-root>` with serialized builds/tests and
  `ASDF_NODEJS_VERSION=26.11.1` (`node --version`: `v26.11.1`). `ls -ld` verified
  the existing initially empty temp directory; `git check-ignore -v _tmp-msga`
  confirmed `.gitignore:8:_tmp*`. Build/test `TMPDIR` used its absolute path,
  represented below as `<repo-root>/_tmp-msga`. MongoDB tests used real replica-set
  transactions; no nested agents or concurrent build/test workers were used.
- Fail-before command:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.action-input.mongodb.test.ts -t 'delivers normalized'`.
  Exit 1: **2 failed / 38 skipped**; direct output lacked input, and HTTP's undefined
  handler output timed out (also a teardown timeout). Teardown now closes connections;
  the no-body fixture assertion follows actual middleware `req.body` (`{}` when supplied).
- Final build:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service... build`.
  Exit 0: **5 packages**, ESM/CJS plus `.d.ts`/`.d.mts`; public input/parser/error
  signatures and JSDoc were inspected and asserted in both packed declarations.
- Final V1:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.action-input.mongodb.test.ts test/message-service.action-command.mongodb.test.ts test/message-service.action-fencing.test.ts test/message-service.action-target-authz.test.ts test/message-service.authoritative-reads.test.ts test/message-service.permission-grants.test.ts test/route-factory.test.ts test/message-service.route-service-reuse.test.ts test/message-service.test.ts test/message-service.transaction-cleanup.test.ts test/message-service.readme-contract.test.ts`.
  Exit 0: **11 files / 209 tests passed**, no skips, including **50 new runtime
  regressions** (42 input/claims/HTTP, 8 host-store). Covers fresh/retry release
  races, denied claims, parser bugs/thenables, terminal/pending outcomes, archive
  failure replay through both transports and fresh connections/service closures,
  concurrent reservation, changed actor/target, and first-host-reservation binding.
- Final focused packed check:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.packed-consumer.test.ts -t 'MSGA-15|packs a release-like|keeps documented runtime|strict NodeNext'`.
  Exit 0: **4 passed / 10 name-filtered skips**. Installed README recipe compiles
  with strict NodeNext ESM/CJS and Bundler (`skipLibCheck: false`) and executes real
  MongoDB command/result replay plus mixed-format error/HTTP assertions through
  both runtime entrypoints. Release inventory and existing strict/root exports pass.
- Formatting:
  `ASDF_NODEJS_VERSION=26.11.1 pnpm exec prettier --check packages/message-service/src/errors.ts packages/message-service/src/index.ts packages/message-service/src/message-service.ts packages/message-service/src/route-factory.ts packages/message-service/src/types/template.ts packages/message-service/test/message-service.action-input.mongodb.test.ts packages/message-service/test/message-service.action-command.mongodb.test.ts packages/message-service/test/support/action-command-example.ts packages/message-service/test/message-service.packed-consumer.test.ts packages/message-service/README.md packages/message-service/DESIGN.md docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Passed. `ASDF_NODEJS_VERSION=26.11.1 pnpm lint` and `git diff --check` passed.
  These new-file checks also produced no whitespace diagnostics:
  `git diff --no-index --check /dev/null packages/message-service/test/message-service.action-input.mongodb.test.ts`;
  `git diff --no-index --check /dev/null packages/message-service/test/message-service.action-command.mongodb.test.ts`;
  `git diff --no-index --check /dev/null packages/message-service/test/support/action-command-example.ts`;
  `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
- Packed consumers self-cleaned; process inspection found no live MongoDB/Node
  workers. Generated MongoDB/cache fixtures were removed from the verified ignored
  temp directory, leaving it empty. Vite's existing config-loader advisory was non-failing.
- **Local MSGA-15 complete; no task-local blocker. Full V2 was not rerun** and is
  due after the MSGA-08 coherent batch. The earlier **27-file / 540-test V2** remains
  historical evidence for MSGA-01–06/14, not current MSGA-15 batch acceptance.

### Task MSGA-16: Reject explicit null action lease configuration

Status: completed

Assigned: MSGA-16 implementation sub-agent (fresh session, sequential execution; independent from MSGA-13 reviewer)

Kind: defect

Priority: P2 — silently defaulting malformed lease configuration contradicts the fail-fast public contract and can conceal deployment configuration errors.

Suggested agent: fresh implementation agent, separate from MSGA-13's reviewer

Dependencies: MSGA-08

Primary ownership:

- `packages/message-service/src/message-service.ts` (constructor action-lease defaulting)
- `packages/message-service/test/message-service.timing-validation.test.ts`
- Focused route/packed construction regressions and action-lease documentation

Finding:

The constructor evaluates `options.actionLeaseMs ?? ACTION_LEASE_MS` before its
numeric validator. Consequently an explicitly supplied null never reaches the
validator and both `new MessageService({ actionLeaseMs: null })` and convenience
`createMessageRoutes({ actionLeaseMs: null })` succeed with 30000 ms. The README
promises rejection of non-number values, the public type is optional number, and
the packed strict consumer explicitly rejects null. MSGA-08's eleven runtime
invalid-value cases omit null, so all current suites pass despite this gap. The
independent root-import assertion in MSGA-13 reproduced both failures without
modifying source. Omission/undefined should retain the documented default.

References:

- `packages/message-service/src/message-service.ts:398` (constructor defaulting), `1683-1700` (`validateDurationOption`)
- `packages/message-service/src/route-factory.ts:366-383` (convenience forwarding)
- `packages/message-service/README.md:779-788` (action-lease validation contract)
- `packages/message-service/test/message-service.timing-validation.test.ts:302-328` (missing null runtime case)
- `packages/message-service/test/message-service.packed-consumer.test.ts:206-209` (strict null rejection)

Requirements:

1. Default the new action lease only for omission/undefined. Explicit null must
   throw `InvalidMessageServiceOptionError` before model/template/provider effects
   in direct and convenience-route construction, matching the published contract.
2. Preserve the 30000-ms default, valid numeric bounds, configured claim durations,
   route forwarding/injection conflicts and existing takeover/fencing semantics.
   Keep the correction scoped to `actionLeaseMs`; do not incidentally change the
   older `clientRequest*` option compatibility contract.
3. Add fail-before/pass-after runtime coverage for null in both construction paths,
   with omitted/undefined controls. Extend the existing packed runtime harness so
   both ESM and CommonJS root imports exercise the rejection, alongside its strict
   type assertion. Keep public JSDoc/README explicit about undefined versus null;
   rebuild declarations rather than editing generated files.

Acceptance criteria:

- Both construction paths reject explicit null with the typed option error and
  zero resolver/effect calls; omission and undefined still use the default.
- Valid configured/default/min/max lease and stale-owner regressions remain green.
- Strict declarations, shipped guidance, and installed ESM/CJS runtime agree.

Verification: V1 timing validation, route-service reuse and action fencing; focused
packed consumer assertions, then V2. MSGA-13 must independently recheck the defect
and affected final integration evidence after the separate implementation lands.

Completion evidence (2026-10-19, MSGA-16 follow-up only):

- Changed only the constructor's action-lease fallback expression: omission or
  `undefined` uses 30000 ms; explicit `null` reaches the existing numeric validator
  and throws `InvalidMessageServiceOptionError`. Older `clientRequest*` nullish
  defaulting, valid numeric bounds, claim timing and ownership fencing are intact.
- Added **11 regressions**: two null-rejection and six omitted/undefined/explicit-
  default construction controls, two real-MongoDB HTTP omitted/undefined default
  cases, and one real-MongoDB direct omitted-default case. Construction assertions
  check zero model resolver, template lookup/preparation, handler and payment-provider
  calls. Persisted claims retain the 30000-ms default and live-claim protection;
  configured/minimum/maximum and stale-owner cases pass in V1.
- Extended the existing packed mixed-format error runtime with null rejection in
  both direct/convenience constructors through **ESM and CommonJS root imports**,
  cross-format typed-error checks, zero model lookups and all three default controls.
  The existing strict null type assertion remains. README migration guidance and
  option JSDoc now distinguish undefined from null; packed strict checks verify
  the shipped guidance and both declaration formats. Generated `.d.ts`/`.d.mts`
  were rebuilt and inspected, not edited.
- MSGA-16 changed paths (previous work preserved):
  - `packages/message-service/src/message-service.ts`
  - `packages/message-service/README.md`
  - `packages/message-service/test/message-service.timing-validation.test.ts`
  - `packages/message-service/test/message-service.route-service-reuse.test.ts`
  - `packages/message-service/test/message-service.action-fencing.test.ts`
  - `packages/message-service/test/message-service.packed-consumer.test.ts`
  - `docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
- Environment: fresh implementation session independent of MSGA-13, no nested
  delegation, serialized commands from `<repo-root>`.
  `ASDF_NODEJS_VERSION=26.11.1 node --version` returned **v26.11.1**.
  `ls -ld` verified the existing checkout/temp
  parent; `git check-ignore -v _tmp-msga` confirmed `.gitignore:8:_tmp*`. Every
  build/test used absolute TMPDIR, normalized below to `<repo-root>/_tmp-msga`.
  The existing Node 22.0.0 installation supplied V2's consumer runtime.
- Build before reproduction and after the fix: both exit **0**, five transitive
  packages including ESM/CJS and declarations:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service... build`.
- Fail-before/pass-after, regressions written before the source correction:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.timing-validation.test.ts -t MSGA-16`.
  Before: exit **1**, **2 failed / 6 passed / 17 skipped**, exposing null acceptance
  independently in both constructors. After: exit **0**, **8 passed / 17 skipped**.
- Focused packed error runtime, same command before/after:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.packed-consumer.test.ts -t 'loads ESM and CommonJS package-name imports from a freshly installed tarball'`.
  Before: exit **1**, **1 failed / 15 skipped**, missing the expected option error.
  After rebuilding: exit **0**, **1 passed / 15 skipped**. All skips above are
  outside their name filters; no prior work was reverted or stashed.
- V1: exit **0**, **3 files / 47 tests passed**, no skips:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.timing-validation.test.ts test/message-service.route-service-reuse.test.ts test/message-service.action-fencing.test.ts`.
- Full V2: exit **0**, **29 files / 622 tests passed**, no skips, including all
  **16 packed-consumer tests**, README, real MongoDB and strict declaration checks:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" MESSAGE_SERVICE_CONSUMER_NODE="$(asdf where nodejs 22.0.0)/bin/node" MESSAGE_SERVICE_EXPECT_NODE=22.0.0 pnpm --filter @web-ts-toolkit/message-service test`.
  The script rebuilt all five transitive packages; Vitest took **466.27 seconds**.
  Both minimum/current peer lanes passed with the asserted **Node 22.0.0** consumer,
  including the extended ESM/CJS rejection checks. Other packed probes used Node
  26.11.1. The existing Vite native-config-loader advisory was non-failing.
- Formatting: exit **0**:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check packages/message-service/src/message-service.ts packages/message-service/README.md packages/message-service/test/message-service.timing-validation.test.ts packages/message-service/test/message-service.route-service-reuse.test.ts packages/message-service/test/message-service.action-fencing.test.ts packages/message-service/test/message-service.packed-consumer.test.ts docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`.
  Repository lint passed with
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm lint`.
  `git diff --check` and
  `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  produced no whitespace diagnostics, including the untracked task document.
- Packed consumers cleaned themselves; the 13 newly created MongoDB fixture
  directories were removed, retaining all 14 pre-existing TMPDIR entries and the
  shared compile cache. Process inspection found no repo-local MongoDB/Vitest/
  Playwright worker. No task-local acceptance issue remains. **MSGA-13 remains
  blocked until an independent affected recheck and the coordinator's final
  document/diff reread**; this completion does not close independent integration review.

### Task MSGA-17: Restore frontend source-project typechecking and enforce it in builds

Status: completed

Assigned: MSGA-17 frontend implementation sub-agent (fresh session, sequential execution)

Kind: defect

Priority: P2 — the reference frontend's successful production build currently hides application source/type errors.

Dependencies: MSGA-10, MSGA-13

Primary ownership:

- `apps/react-vite/package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- `apps/react-vite/src/api.ts`, workspace-page hook integrations and organization panels
- Focused frontend integration regressions and app documentation if necessary

Finding:

MSGA-10 and the independent review established that the solution config has
`files: []`; `tsc --noEmit` without build mode does not check its referenced app
project. The explicit app-project check first rejects deprecated `baseUrl` under
TypeScript 6; bypassing that diagnostic reveals nine existing errors in workspace
response typing, obsolete mutation-hook calls and unused declarations. The
maintainer asked to continue after the coordinator recommended fixing this gap.
Earlier implementation and its completed evidence remain valid historical work.

References:

- `apps/react-vite/package.json:7-13` (current build/test scripts)
- `apps/react-vite/tsconfig.json:1-4` (solution references)
- `apps/react-vite/tsconfig.app.json:21-26` (deprecated option, alias, source/tests)
- MSGA-10 baseline and MSGA-13 independent validation evidence in this document
- `apps/react-vite/src/api.ts`, `src/pages/workspace-page.tsx`, `src/pages/workspace/organization-panels.tsx`

Requirements:

1. Reproduce the current source-project diagnostics before changing code and
   inspect the actual supported client/react hook contracts and host responses.
2. Remove or replace deprecated configuration while retaining alias resolution,
   strict compiler checks, source/test coverage and no-emission behavior.
3. Fix the application integration at its boundary: use current typed mutation
   hooks and accurately handle conservative/partial client results. Do not weaken
   library APIs, suppress errors with broad casts/ignores, or disable strict checks.
4. Add a reusable frontend typecheck script that checks both referenced app and
   tooling projects; make the production build run it before Vite.
5. Preserve message DTO/200/202 flows and add focused workspace mutation/response
   coverage where behavior changes. Demonstrate that a deliberate source type
   error makes the production build fail before bundling, using a temporary probe
   cleaned afterward rather than committing an invalid fixture.

Acceptance criteria:

- Explicit application and tooling project checks pass without deprecation bypass
  flags or the recorded nine diagnostics.
- The frontend typecheck and production build pass with strict checks enabled.
- Current create/update/delete/save hook integrations perform the intended typed
  operations; malformed membership responses cannot masquerade as complete records.
- A negative build-gate probe fails for a real source diagnostic and the corrected
  source passes; aliases and included frontend tests remain checked.
- Existing message/frontend suites and repository lint remain green.

Verification: serialized dependency builds if needed; frontend typecheck, V4 tests/
build, focused integration and negative gate probe, repository lint, formatting and
whitespace. The independent follow-up MSGA-18 verifies the final contract.

Completion evidence (2026-10-19, frontend implementation):

- **Contract:** `typecheck` explicitly runs both referenced projects with `tsc --noEmit -p`;
  `build` runs `pnpm typecheck && vite build`. Removed obsolete
  `baseUrl`, retaining config-relative `@/* -> ./src/*` paths. Both projects retain
  `strict`, `noUnusedLocals`, `noUnusedParameters` and `noEmit`; app coverage remains
  `src` plus `tests`, and tooling now includes both Vite and Vitest configs.
- **Integration/type safety:** inspected the installed/public client and React
  declarations plus their implementations, Node host schemas/permissions/manager
  normalization, and access-router's bare CRUD/root-batch response pipelines.
  Callers now use `useCreate`/`useUpdate`/`useDelete` and `mutate()`, narrowing the
  create callback's success union before reading `raw`. Member saving uses an
  explicit typed PATCH instead of calling `save()` on raw records. It sends only
  editable fields, uses `null` to clear a manager, and leaves cached records intact
  until successful refetch. Rejected mutation promises are consumed while hook
  errors remain visible in the workspace alert.
- Membership results remain conservatively partial in the shared client. A local
  Zod array/object parser validates every required member field, persisted ID and
  optional department/nullable manager before producing `OrganizationMember[]`;
  partial/malformed responses reject the workspace rather than being cast, defaulted
  or silently filtered. Removed the two unused declarations. Shared library APIs,
  strict checks and the existing MSGA-10 message contracts remain intact.
- **Changed files:** `apps/react-vite/package.json`,
  `apps/react-vite/tsconfig.app.json`, `apps/react-vite/tsconfig.node.json`,
  `apps/react-vite/src/api.ts`, `apps/react-vite/src/pages/workspace-page.tsx`,
  `apps/react-vite/src/pages/workspace/organization-panels.tsx`,
  `apps/react-vite/tests/workspace-contract.test.tsx`, and only this task's
  status/completion evidence in this document. Existing MSGA-01–16 work was inspected
  and preserved; tool versions and root CHANGELOG were not edited.
- **Environment:** all commands ran from `<repo-root>`, build/test processes
  serialized, using `ASDF_NODEJS_VERSION=26.11.1` (verified `node --version`:
  `v26.11.1`). `ls -ld <repo-root> <repo-root>/_tmp-msga` verified the existing
  directory; `git check-ignore -v _tmp-msga` confirmed `.gitignore:8:_tmp*`.
  Absolute `TMPDIR` is normalized below to `<repo-root>/_tmp-msga`. Existing workspace
  dependency outputs sufficed; no dependency rebuild was needed. No nested agents.
- **Before edits, exact compiler baseline:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite exec tsc --noEmit -p tsconfig.app.json`
  exited **2**, TS5101 at `tsconfig.app.json:21:5` (`baseUrl` deprecation).
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite exec tsc --noEmit -p tsconfig.app.json --ignoreDeprecations 6.0`
  exited **2**, reproducing exactly MSGA-10's **nine** diagnostics: `src/api.ts:86`
  TS2322; `src/pages/workspace-page.tsx:9` TS6196, `23`/`27` four TS2339, `100`
  TS7006, `160` TS2339; `src/pages/workspace/organization-panels.tsx:15` TS6133.
  The flag was used only for this initial reproduction.
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite exec tsc --noEmit -p tsconfig.node.json`
  exited **0** before edits.
- **After, all exit 0 without bypass flags:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite exec tsc --noEmit -p tsconfig.app.json`;
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite exec tsc --noEmit -p tsconfig.node.json`;
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite typecheck`.
  **Zero remaining baseline/compiler errors** in either project.
- **Inclusion/aliases:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite exec tsc --showConfig -p tsconfig.app.json`
  and
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite exec tsc --showConfig -p tsconfig.node.json`
  exited **0**, showing all **19 source / 4 test files**, both tooling configs,
  preserved strict/no-unused/no-emission settings, and the config-relative alias.
  The new tests import `@/storage` and `@/types`; compiler and HTTP/Vitest runs pass.
- **Focused fail-before/pass-after:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite test --fileParallelism=false tests/workspace-contract.test.tsx`.
  Before implementation: **20 failed / 2 passed**, exposing accepted partial
  records and obsolete hooks. One failure was an over-specific null-row error
  expectation: the client already rejects null rows before app validation; the
  final test asserts rejection. Harness refinements scoped duplicate headings and
  modeled refreshed session props to settle creation navigation/requests correctly.
  Final: **1 file / 24 passed**, no skips (**6.00 s**): 16 response-boundary cases
  and 8 actual UI mutation cases, using installed hooks/client/Axios against local
  HTTP fixtures with host-shaped responses. Includes create/invite/rename/delete,
  manager clearing, successful/403 saving, cache nonmutation and failed-create/delete
  notices without unhandled promise rejection or success refreshes.
- **Negative production gate, three separate temporary probes:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite build`
  exited **2** each time, before any Vite build banner/transforms: string value in
  `src/api.ts:124`'s numeric message-list params produced TS2322; string Vite server
  port at `vite.config.ts:14` produced TS2769 after the app check passed; numeric
  session token at `tests/workspace-contract.test.tsx:47` produced TS2322, also
  proving the aliased type/test source is checked. Each probe was inserted and
  removed with `apply_patch`; no invalid probe or tooling-source diff remains.
- **Full frontend verification:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite test --fileParallelism=false`
  exited **0**, **4 files / 43 passed**, no skips (**11.84 s**): all prior **19**
  tests plus 24 new regressions, including unchanged real-HTTP message/200/202 cases.
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter react-vite build`
  exited **0**, both real project checks then Vite assets/PWA generation.
- **Hygiene:**
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm lint` exited **0**.
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm exec prettier --check apps/react-vite/package.json apps/react-vite/tsconfig.app.json apps/react-vite/tsconfig.node.json apps/react-vite/src/api.ts apps/react-vite/src/pages/workspace-page.tsx apps/react-vite/src/pages/workspace/organization-panels.tsx apps/react-vite/tests/workspace-contract.test.tsx docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  passed; formatting edits used read-only formatter output and `apply_patch`.
  `git diff --check`,
  `git diff --no-index --check /dev/null apps/react-vite/tests/workspace-contract.test.tsx`
  and
  `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  produced no whitespace diagnostics, including both new files.
- HTTP servers/query clients self-cleaned. Removed this run's temporary generated
  PWA worker with `apply_patch`; pre-existing ignored fixtures/cache were preserved.
  Production outputs remain ignored. Known non-failing advisories: Vite's existing
  `__dirname`/future native-config-loader notice and >500 kB bundle notice.
  **MSGA-17 completed with no task-local blocker; MSGA-18 remains pending.** This
  verified result supersedes the earlier nine-error frontend limitation.

### Task MSGA-18: Independently verify the frontend typecheck follow-up

Status: completed

Assigned: MSGA-18 independent frontend review sub-agent (fresh session, sequential execution)

Kind: improvement

Priority: P2 — independently confirm that the build gate checks real source instead of only producing passing output.

Suggested agent: fresh frontend/integration reviewer, distinct from MSGA-17 implementer

Dependencies: MSGA-17

Primary ownership:

- This task document's follow-up completion evidence
- Delivered frontend configuration, workspace/message integration and affected tests

Finding:

Passing Vite output previously concealed source-project failures. The follow-up
needs independent evidence that both referenced projects and meaningful runtime
flows are checked without TypeScript suppression or public-library regressions.

References:

- MSGA-17 finding, requirements and delivered diff
- MSGA-10/MSGA-13 baseline evidence; `AGENTS.md` serialized verification rules

Requirements:

1. Review the actual MSGA-17 delta independently of its completion summary.
2. Verify project inclusion, aliases, strict options, both source/tooling checks,
   the fail-before-bundle probe, current mutation hooks and response validation.
3. Run affected frontend checks and lint serially; reuse unrelated package/workspace
   evidence when unchanged rather than repeating all library/provider suites.
4. Add a separately scoped follow-up for any material defect rather than fixing
   production code as the reviewer. Preserve historical baseline evidence.

Acceptance criteria:

- Fresh frontend typecheck, tests and production build pass; the gate demonstrably
  rejects a real source type error and checks both referenced projects.
- Workspace mutations and message UI contracts remain valid without weakened types.
- All new defects are resolved or recorded as blockers; the prior nine-error
  limitation is explicitly superseded only after current verification passes.
- The coordinator rereads final statuses/evidence and the delivered diff.

Verification: frontend typecheck, affected Vitest suites/build, negative gate probe
or independent reproduction, lint and documentation/whitespace review. Full root
build/test is required only if a broader change makes earlier evidence inapplicable.

Completion evidence (2026-10-19, independent frontend review):

- **Outcome:** no material defect or new follow-up. Fresh reviewer distinct from the
  MSGA-17 implementer; no nested agents. Independently inspected the actual tracked
  frontend diff, new workspace tests, public client/React exports, declarations and
  runtime implementations, and the Node host's schemas, routers and serializers.
  Final reviewer change is this task's status/evidence; temporary probes were removed.
- **Membership boundary:** `apps/react-vite/src/api.ts:69-110` validates every row before returning
  members. `apps/nodejs/src/models.ts:22-34` requires the seven persisted identity/
  presentation fields; `apps/nodejs/src/routers.ts:193-202` exposes them for list/read. The
  workspace batch requests sorting but no projection/population, and neither host
  defaults nor schemas add population. ObjectId relationships therefore serialize
  as strings; `managerMembershipId` is a string or default `null`, with omission
  also tolerated. Department is an optional string, including the host's default
  `''`; host input/preparation preserves that contract. Populated relationship
  objects are not this request's wire shape and are correctly rejected, not cast
  to IDs. Missing/invalid required fields reject the whole response. Zod parsing
  produces fresh plain members rather than mutating client/cache objects.
- **Mutations/errors:** installed/public `createModelHooks` exposes `useCreate`,
  `useUpdate`, `useDelete` and `mutate`. Its `assertSuccess` throws `ServiceError`
  for resolved client `success: false` results before success observers, and its
  mutation catch publishes `error` before rejecting. The workspace consumes that
  rejection while displaying hook errors at `apps/react-vite/src/pages/workspace-page.tsx:190-231`; unsuccessful
  API results do not trigger success refreshes or disappear into the wrapper.
  Saving PATCHes only editable fields, sends explicit manager `null`, and preserves
  cached records on failure. All eight delivered UI mutation regressions pass.
- **Message/public-contract preservation:** inspected the host's enveloped list
  (including populated parties), package bare create/action metadata/results and
  HTTP 202 pending-notification handling. The previous 19 frontend tests, including
  actual-Axios/HTTP message 200/202 flows, remain green. No shared library delta,
  broad production cast, TS ignore, suppression flag, strict weakening or broadcast
  was introduced by MSGA-17. Existing `skipLibCheck: true` is unchanged; the new
  test's scoped jsdom-global bridge does not bypass application response typing.
- **Environment:** commands below ran serially from `<repo-root>`, each prefixed
  with `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga"` (absolute TMPDIR).
  `ASDF_NODEJS_VERSION=26.11.1 node --version` returned `v26.11.1`.
  `ls -ld <repo-root> <repo-root>/_tmp-msga` verified the existing directory;
  `git check-ignore -v _tmp-msga` confirmed `.gitignore:8:_tmp*`. Existing dependency
  outputs sufficed. No concurrent builds/tests or dependency rebuilds were needed.
- **Fresh compiler commands, all exit 0 without bypass flags:**
  `pnpm --filter react-vite typecheck`;
  `pnpm --filter react-vite exec tsc --noEmit -p tsconfig.app.json`;
  `pnpm --filter react-vite exec tsc --noEmit -p tsconfig.node.json`.
  **Both projects have zero current compiler errors. This independently supersedes
  the historical nine-diagnostic frontend limitation in MSGA-10/MSGA-13 and the
  earlier coordinator record; those historical results remain preserved.**
- **Inclusion/aliases, both exit 0:**
  `pnpm --filter react-vite exec tsc --showConfig -p tsconfig.app.json`;
  `pnpm --filter react-vite exec tsc --showConfig -p tsconfig.node.json`.
  App includes **19 source / 4 test files**, `@/* -> ./src/*`, no `baseUrl`;
  tooling includes **both** `vite.config.ts` and `vitest.config.ts`. Both retain
  strict/no-unused/no-emission checks. Vite/Vitest aliases independently target
  `./src`; real HTTP workspace tests resolve `@/storage` and `@/types` successfully.
- **Independent negative gate:** separately invoked
  `pnpm --filter react-vite build` with each temporary probe:
  (1) `apps/react-vite/src/msga18-review-gate-probe.ts:3`, numeric assignment to aliased
  `SessionData['token']`: **exit 2 / TS2322**;
  (2) `apps/react-vite/vitest.config.ts:14`, numeric environment: **exit 2 / TS2769**, after the
  application check passed;
  (3) `apps/react-vite/tests/msga18-review-gate-probe.ts:3`, numeric assignment to aliased
  `SessionData['user']['email']`: **exit 2 / TS2322**.
  Every failure occurred before the Vite banner/transforms. All additions/restorations
  used `apply_patch`; final glob/diff checks found no probes or tooling-source delta.
- **Clean frontend verification after removing probes:**
  `pnpm --filter react-vite test --fileParallelism=false`: **exit 0 / 4 files /
  43 passed / no skips**, **12.06 s** (24 workspace plus 19 previous tests).
  `pnpm --filter react-vite build`: **exit 0**, both explicit compiler projects
  followed by Vite (**8325 modules**) and PWA output. Non-failing advisories remain
  the existing future native-config-loader `__dirname` notice and >500 kB chunk.
- **Hygiene:** `pnpm lint`: **exit 0**, repository-wide.
  `pnpm exec prettier --check apps/react-vite/package.json apps/react-vite/tsconfig.app.json apps/react-vite/tsconfig.node.json apps/react-vite/src/api.ts apps/react-vite/src/pages/workspace-page.tsx apps/react-vite/src/pages/workspace/organization-panels.tsx apps/react-vite/src/pages/messages-page.tsx apps/react-vite/src/types.ts apps/react-vite/tests/workspace-contract.test.tsx apps/react-vite/tests/message-contract.test.tsx docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`:
  **exit 0**. `git diff --check` and
  `git diff --no-index --check /dev/null apps/react-vite/tests/workspace-contract.test.tsx`
  and `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`:
  **exit 0**, no whitespace diagnostics, including both new files.
- HTTP/query fixtures self-cleaned; the review build's temporary PWA worker was
  removed with `apply_patch`. Prior ignored fixtures/cache and all pre-existing
  uncommitted work were preserved. No production fix, commit, push, stash, revert,
  root CHANGELOG or tool-version edit. **MSGA-18 completed; no new blocker.**
- **Limits/handoff:** runtime evidence uses jsdom and local host-shaped HTTP fixtures
  against real installed client/hooks; this review did not rerun a live MongoDB host
  or minimum-peer/runtime matrix. Unchanged backend/package results (**622**) and
  historical whole-workspace results (**13488 / 1 todo**) were not rerun or promoted
  to fresh results. No broader change justified a root build/test. Hosted CI remains
  undispatched. Coordinator owns the final status/evidence/diff reread.

## Decisions and consequential deferrals

No decision blocks starting MSGA-01, MSGA-02, or the bounded investigations.
Resolve these before their affected public-contract implementations:

- **Payment-code semantics (MSGA-04):** required session creation versus explicitly
  supported sessionless metadata; missing-recipient and item-override behavior.
  **Resolved by maintainer:** require sessions for nonempty effective codes even
  without recipients; typed server error for absent/null providers, retaining
  inheritance and completed replay. MSGA-14 implements the approved decision.
- **Action command ownership (MSGA-07):** parsing/validation, immutable retry input,
  and package versus host command storage. **Resolved by maintainer:** additive
  explicit input and optional pure parsing with a host-owned, attempt-keyed
  immutable command/result store. First durable host reservation binds the
  command; MSGA-15 implements the approved API and executable specimen. The
  earlier [investigation proposal](#msga-07-decision-and-approval) is retained as
  historical decision evidence.
- **Identity compatibility (MSGA-03):** supported schema recipe and normalization
  policy, including legacy idempotency scopes and case-sensitive opaque IDs.
  **Resolved in MSGA-03:** complete active/archive String overrides, trimmed
  storage and stored-type relationship comparison, with legacy textual request
  scopes preserved rather than silently merged.
- **Host validation outcomes (MSGA-09):** missing recipients and reservation behavior
  after invalid submissions. **Resolved in MSGA-09:** controlled 400 validation
  errors and 404 missing-recipient outcomes; fresh keyed failures retain failed
  reservations and require a new key after correction/reconciliation.

Keep these deliberately deferred unless a separate requirement activates them:

- **Shared-collection tenancy implementation:** MSGA-12 is investigation-only;
  independent applications remain the selected first target.
- **Action lease renewal/heartbeats:** MSGA-08 exposes duration while preserving
  existing semantics. Long-running recovery needs a distinct ownership protocol.
- **Durable transactional email and sender-notification reconciliation:** current
  session-bound email skipping and best-effort post-commit notification remain
  explicit. Recovery needs durable intent, deduplication, and concurrency handling.
- **Payment crash/ambiguous-provider recovery:** existing compensation handles
  observed failures and known sessions. A stable provider key alone is insufficient
  if an obsolete owner can expire a session retained by a replacement; a separate
  protocol investigation is required before claiming crash-safe creation.
- **Creation payload/payer fingerprint conflicts:** completed keys currently replay
  the first operation. Changing that needs canonicalization, bounds, and legacy
  reservation policy; current behavior is not a newly classified defect.
- **Nonterminal actions, conversations/read receipts, retention, cursor pagination,
  and general top-level schema extension:** each requires a concrete application
  requirement and its own lifecycle/query/public-data contract. Existing payload/
  display containers and explicit host DTO extensions remain available.
- **Joint business-write/archive transactions:** handlers currently execute before
  package archival. External effects must not be moved into automatically retried
  transaction callbacks as an incidental portability change.

## Definition of done

- Confirmed defects have meaningful regression evidence, including relevant
  direct/HTTP/document paths and real persistence behavior.
- Approved improvements work across independently configured apps and installed
  consumers with the declared, measured support matrix.
- Investigations record implement/defer/no-action recommendations and decision
  ownership. Approved follow-ups receive stable new IDs and are verified before
  final integration; deferred work retains rationale and residual limitations.
- Public types, emitted declarations, README/JSDoc, runtime behavior, and reference
  callers agree. Consumers can integrate using shipped documentation and root imports.
- Required checks and independent review pass with actual completion evidence.
  Task creation or code delivery alone is not completion.
- Evidence remains repo-scoped, session identifiers remain private, and the
  coordinator checks the complete task file and delivered changes at the end.

## Task-document verification

Historical creation-only verification is separate from implementation acceptance.
At task-file creation, all MSGA tasks were pending.

- Content review confirmed 13 stable task IDs: four defects, six improvements
  (including compatibility and independent review), and three investigations.
  Each has status, kind, priority, dependencies, ownership, findings/references,
  requirements, acceptance criteria, and verification. Dependencies resolve to
  defined tasks and are acyclic; future follow-ups are explicitly conditional.
- Reviewed source/history references and the separate-apps-first scope. Checked
  for machine-specific paths and private session identifiers; none were found.
- Whitespace check passed:
  `git diff --no-index --check /dev/null docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  (working directory: `<repo-root>`; checks the untracked document directly).
- Formatting check passed:
  `ASDF_NODEJS_VERSION=26.11.1 pnpm exec prettier --check docs/tasks/20261018-185629-message-service-multi-app-adaptability.md`
  (working directory: `<repo-root>`). The initial invocation without the environment
  override failed because the checkout-pinned Node 26.10.0 was unavailable. The
  retry used installed Node 26.11.1; repository tool-version configuration was
  not edited.
- During that formatting retry, pnpm automatically synchronized local
  `node_modules`. A subsequent `git status --short` showed only this new task
  document, and `git diff --stat` was empty: tracked manifests, lockfiles, and
  application/package source were unchanged.
- Library/runtime suites were not run for this documentation-only deliverable.
  V1-V6 describe future implementation acceptance, not completed backlog work.

## Implementation execution log

- The maintainer authorized implementation one task at a time using sub-agents,
  with live task-status updates. The coordinator confirmed revision `ffb9b1c`
  and a worktree containing only this untracked task document before starting.
- Each task uses a fresh sub-agent; no nested delegation or overlapping
  implementation/build/test processes. The independent reviewer runs after
  implementation and compatibility verification. Task-local aliases identify
  execution without publishing private operational identifiers.
- Use the installed Node runtime through `ASDF_NODEJS_VERSION=26.11.1` when the
  checkout-pinned runtime is unavailable; do not edit repository tool versions.
- No commits or pushes were requested. Investigation conclusions and required
  maintainer decisions will be recorded before any resulting public-contract
  implementation is authorized.

### First coherent package batch (2026-10-19, MSGA-01–06/14)

- After MSGA-06 focused checks, ran the first full V2 over the combined preserved
  MSGA-01/02/03/04/05/06/14 worktree, from `<repo-root>`, with serialized build/test
  execution and absolute, verified-ignored `TMPDIR` represented only as
  `<repo-root>/_tmp-msga`:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service test`.
- **Actual result: exit 0; 27 test files / 540 tests passed, no skips.** The script
  rebuilt all five transitive packages successfully (ESM/CJS and declarations),
  then ran the complete package suite with its existing `--fileParallelism=false`.
  Vitest duration was **316.69 seconds**, excluding the dependency build. Includes
  all real-MongoDB, README, packed ESM/CommonJS runtime, and strict declaration
  consumers, including the new MSGA-06 recipe and prior MSGA-03/05/14 cases.
- V1 (**7 files / 133 tests**) and the focused MSGA-06 packed case (**1 passed /
  12 name-filtered skips**) passed first; exact invocations and hygiene results are
  in MSGA-06 completion evidence. Vite's native-config-loader advisory was
  non-failing. No other task's defect surfaced and no prerequisite blocked V2.
- This establishes package integration for this batch. Bounded minimum/current
  peer/runtime compatibility, reference hosts, full workspace build/test, and the
  independent final review remain their separately scoped MSGA tasks; their
  statuses and historical task-local evidence are preserved.

### Second coherent core package batch (2026-10-19, MSGA-01–08/14/15)

- After MSGA-08 focused verification, ran full V2 from `<repo-root>` with serialized
  execution, `ASDF_NODEJS_VERSION=26.11.1` and absolute, verified-ignored `TMPDIR`
  represented only as `<repo-root>/_tmp-msga`:
  `ASDF_NODEJS_VERSION=26.11.1 TMPDIR="<repo-root>/_tmp-msga" pnpm --filter @web-ts-toolkit/message-service test`.
- **Actual result: exit 0; 29 test files / 609 tests passed, no skips.** All five
  transitive packages rebuilt successfully (ESM/CJS and declarations); Vitest took
  **383.22 seconds**, excluding the build. The complete package suite covers the
  preserved first batch plus MSGA-15 action input/host command storage and MSGA-08
  configurable leases, including real MongoDB, README and installed packed consumers.
- MSGA-08 V1 (**13 files / 243 tests**) and focused packed strict typings (**1 passed /
  13 name-filtered skips**) passed first; exact commands are in its completion evidence.
  No independent failures or new prerequisites surfaced. The existing Vite advisory
  was non-failing. This is current package integration evidence; reference hosts,
  bounded peer/runtime matrix, workspace integration and independent final review
  remain separately scoped coordinator tasks. Earlier evidence/statuses are retained.

## Coordinator final check (2026-10-19)

- Re-read the complete task document after the independent reviewer finished,
  including original findings, approval decisions, execution evidence, the
  historical MSGA-13 blocker, MSGA-16 correction, and independent recheck.
  **MSGA-01 through MSGA-16 are completed.** The three investigations have
  evidence-backed outcomes; approved payment/action-input decisions were delivered
  as MSGA-14/15, and the independently discovered lease defect as MSGA-16.
- Reconciled every current task status and dependency. All fifteen MSGA-13
  prerequisites are complete, dependencies resolve without cycles, and no new
  unresolved execution item was identified. Earlier pending/blocked statements
  inside dated evidence remain historical, superseded by the completion records.
- Checked `git status --short`, `git diff --stat`, tracked production changes and
  the new helper/host-command specimen against the delivered scope. The worktree
  contains 31 modified tracked paths and 13 intentional new paths: package source,
  focused tests/fixtures, Node/React examples, public documentation, compatibility
  CI, and this task document. Root manifests, lockfiles, tool-selection files,
  generated artifacts and root `CHANGELOG.md` have no tracked changes.
- Implementation tasks ran one at a time in separate task-local sub-agent sessions;
  MSGA-05 was resumed by a replacement after interruption. The independent reviewer
  did not implement the fixes and resumed its own review only after a separate
  MSGA-16 implementation. No overlapping delegated implementation/build/test run
  or nested delegation was used. No commits or pushes were made.
- Final affected-package evidence is **29 files / 622 passing tests**, including
  all 16 packed-consumer tests. The independent recheck rebuilt the package and
  corroborated null rejection, default/legacy controls, 47 affected tests and four
  packed cases. Actual Node **22.0.0** minimum/current lanes passed with
  Express/Mongoose **5.0.0/8.0.0** and **5.2.1/9.9.2**.
- Keep verification chronology explicit: the reviewer's successful whole-workspace
  lint/build/test run (**13488 passing test executions / 1 todo**) and host/browser
  results (**128 / 19 passing tests**, plus required builds/typecheck) predate the
  final narrow MSGA-16 correction. Fresh package/incremental checks supersede the
  affected package's older results; no new final-tree whole-workspace count is
  claimed and unchanged suites were not needlessly repeated.
- Known limitations remain explicit: supplemental frontend source-project
  typechecking has the same nine measured baseline diagnostics; required frontend
  test/build checks pass. Hosted compatibility CI was added/reviewed but not
  dispatched. Shared-collection tenancy and the other consequential feature
  deferrals remain outside the selected implementation scope.
- Coordinator whitespace check `git diff --check` passed; document/status/link
  evidence contains no machine-specific paths or private session identifiers.
  Finalization changes after the independent recheck are documentation-only.

### Frontend typecheck follow-up activation (2026-10-19)

- After the original sixteen tasks completed, the maintainer asked to continue
  following the recommendation to fix the frontend typecheck/build gap. MSGA-17
  implements that concrete follow-up; MSGA-18 independently reviews it. Earlier
  sixteen-task completion and known-limit statements above remain historical.
- Existing uncommitted library, Node/React example, compatibility and task changes
  were inspected before starting and are preserved. The new task scope does not
  activate deferred tenancy, delivery/recovery, fingerprints or lifecycle features.
- Use fresh sequential implementation/review sub-agents and keep live statuses
  and exact evidence. Hosted CI against local changes needs an uploaded revision;
  no commit/push/release action has been requested by this follow-up.

### Frontend follow-up coordinator final check (2026-10-19)

- Re-read MSGA-17 implementation evidence and MSGA-18's independent findings,
  acceptance review, current statuses and dependency links. Inspected the delivered
  frontend configuration/workspace diff and worktree after the reviewer finished.
  **All eighteen tasks are completed**; MSGA-18's coordinator-reread criterion is
  satisfied and no new material finding or pending implementation task remains.
- Confirmed the actual scripts check `tsconfig.app.json` and `tsconfig.node.json`
  before Vite, retaining strict/no-unused/no-emission settings, source/tests and
  aliases. Workspace callers use supported typed mutations and runtime-validated
  membership records; cached objects are not edited to perform a save.
- Current independent frontend evidence: **zero application/tooling compiler
  errors**, **4 files / 43 passing tests**, successful production/PWA build,
  repository lint, formatting/whitespace, and three negative source/tooling/test
  probes rejected before bundling. The historical nine-error limitation is
  resolved, rather than waived or hidden by the build.
- Earlier library/backend compatibility and workspace evidence remains attributed
  to its original revision/checkpoints. This frontend follow-up does not claim a
  new 622-test package run or whole-workspace test count; unchanged suites were not
  repeated. Hosted CI remains undispatched pending an uploaded revision.
- Existing library/Node/message-interface work was preserved, temporary probes
  were removed, and root manifests/lockfiles/tool-selection files remain without
  tracked changes. No commit, push or release was performed. Deferred library
  capabilities retain their recorded scope/decision boundaries.
- Coordinator `git diff --check` passed before final documentation-only recording;
  final document formatting/whitespace checks follow this update.
