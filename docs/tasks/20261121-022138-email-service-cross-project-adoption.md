# Email service: cross-project adoption follow-up

Created: `2026-11-21T02:21:38-07:00` · Status: **completed**. EMAIL-ADOPT-01 through EMAIL-ADOPT-10 ran sequentially, with one active subagent at a time. The 03 and 09 follow-ups were resolved in order, then accepted by the independent reviewer.

## Objective and baseline

Make `@web-ts-toolkit/email-service` predictable for projects that produce, submit, or operate transactional email. Fix the case where eligible mail is stranded, make adapter mistakes visible before handoff, and let producers use the queue without configuring delivery. Keep business rules and scheduling in the host.

This is a new phase after the completed [package task](20261118-223259-email-service-package.md) and [SMTP capacity task](20261120-214514-email-service-smtp-capacity.md). The [adoption review](../task-artifacts/email-service/20261120-cross-project-adoption-review/README.md) records the evidence. Use the [V1 contract](../task-artifacts/email-service/20261118-223259-email-service-package/v1-contract.md) and [SMTP capacity contract](../task-artifacts/email-service/20261120-214514-email-service-smtp-capacity/implementation-contract.md) for existing behavior; record intentional changes as follow-ups rather than rewriting historical acceptance.

- **Reviewed baseline:** `39848121`; source, emitted declarations, installed examples, memory and disposable MongoDB 8.2.6, and synthetic providers. The review ran the package build/typecheck, 515 passing Vitest tests and 12 passing packed-consumer checks on Node 26.12.1; two optional extended SMTP timing tests were skipped. It did not measure a production fleet or live provider.
- **Preserve:** Scope isolation, frozen snapshots, replay before re-preparation, bounded work, exact profile matching, acknowledged handoff, redacted summaries, and no automatic resend after unknown or partial acceptance. Preserve both the default queue and the opt-in SMTP queue, including already-staged commands and retained identities.
- **Scope:** Package source, tests, and installed documentation. Additional providers/backends, campaigns, delivery webhooks, automatic failover, and downstream deployment are outside this phase.
- **Priorities:** P1 means intended mail can stall or permanently fail without a submission; P2 means an integration, diagnosis, or maintenance problem. Paths in ownership notes below are relative to `packages/email-service/`. Coordinate edits to the README and packed fixtures; run builds and test lanes serially in a checkout.

## Work items

### EMAIL-ADOPT-01 — Make bounded claims progress past expired jobs

Status: completed · Kind: defect · Priority: P1 (ready mail can be stranded) · Dependencies: none.

Owner: EMAIL-ADOPT-01 implementation session.

**Ownership/evidence:** [`stores/memory.ts`, `next`](../../packages/email-service/src/stores/memory.ts), [`stores/mongoose/operations.ts`, `next`](../../packages/email-service/src/stores/mongoose/operations.ts), `src/worker.ts`, `test/conformance/` and `test/lifecycle/`. Both selectors inspect a bounded prefix before `claimJob` rejects expired candidates. The [baseline worker sweep test](../../packages/email-service/test/unit/worker.test.ts), “recovers, then expires, then takes the oldest eligible job with bounded sweeps and no other scopes,” exercises two expired jobs, not a prefix larger than the candidate limit.

**Requirements:** Using the review fixture (26 expired V1 jobs ahead of one live, due job), prevent repeated runs from silently inspecting the same prefix. Prefer progress within the existing store/report contract. If that cannot remain bounded, specify a distinct, actionable maintenance signal and the host action that makes progress. `maintenanceLimit: 0` must not silently perform expiry mutations. Preserve eligible-job ordering, server-time and lease guards, and per-call candidate/write limits; a full scan behind a small result limit is not a fix. Any new public stop reason or Mongo index needs a compatibility and rollout note.

**Acceptance:** Reproduce `idle` in memory and `contended` in Mongo with zero claims on the old code. On both stores, repeated bounded calls, or the documented response to an explicit maintenance signal, reach the live job exactly once. Exercise zero and default maintenance, true idle, and an isolated foreign scope. Check the smaller opt-in limits with a fixture that fits that backing store. Show bounded candidate work on Mongo as well as returned row counts.

**Verify:** `test:unit`, `test:lifecycle`, `test:mongodb`; use the shared commands below.

**Completion evidence (baseline `39848121` plus EMAIL-ADOPT-01):** The claim-only `StoreClaimNext` and worker report now return `expiry_maintenance_required` when all candidate slots are confirmed expired. This does not mutate jobs or imply a live job exists; a same-scope run with positive maintenance clears the backlog. The README and declarations explain the new exhaustive-switch case and mixed-version in-process limitation. No Mongo catalog change. The regression first reproduced the old `idle`/`contended` results, then verified once-only submission, scope isolation, default/zero maintenance and both capacity modes. Mongo execution stats showed at most 16 docs/17 keys in V1 and 4 docs/5 keys with capacity, plus one exact read per candidate and no blocked-claim writes. `typecheck`, build, unit (231), memory lifecycle (34), Mongo (101, 8.2.6), lint, formatting, pack dry-run and `git diff --check` passed. The initial Mongo invocation hit the harness timeout; the subsequent serial run passed.

### EMAIL-ADOPT-02 — Document safe worker rollouts for a shared scope

Status: completed · Kind: improvement · Priority: P1 (a valid job can fail during a profile rollout) · Dependencies: none.

Owner: EMAIL-ADOPT-02 implementation session.

**Ownership/evidence:** `README.md` worker section, `src/contracts/worker.ts`; [scope-only claim](../../packages/email-service/src/worker.ts#L41) and [preflight profile lookup](../../packages/email-service/src/internal/worker-preflight.ts#L124). Missing profiles are deliberately terminal. Even a **nonempty** worker can claim another profile's job; the [mismatched-mode test](../../packages/email-service/test/unit/worker-preflight.test.ts#L284) confirms the outcome.

**Requirements and acceptance:** Add a two-worker deployment example: install the new profile and required resolvers on every worker sharing the scope **before** producers use it; retain old profiles until their work drains. Show separate scopes/queues for fleets that cannot share configuration. Explain that `profile_unavailable` means no submission, but replay of the same key does not reopen the job. Do not imply startup can discover other processes' configuration or change the no-substitution rule.

**Verify:** Compare the example with the existing mismatch test and replay contract. Check any new executable README example using the packed lane.

**Completion evidence:** The shipped README and `EmailWorker`/`EmailWorkerOptions` JSDoc now give a two-worker rollout, original-route drain rules and isolation guidance. A synthetic two-worker probe and existing mismatch coverage confirmed no submission or substitution and terminal same-key replay after the worker configuration was repaired. Typecheck, build/declarations, unit (231), memory lifecycle (34), pack dry-run, targeted lint and formatting passed. No new executable fence or runtime change; no live rollout.

### EMAIL-ADOPT-03 — Make provider result types agree with accepted evidence

Status: completed · Kind: defect · Priority: P2 (a compiling adapter can create an operator hold) · Dependencies: none.

Owner: EMAIL-ADOPT-03 implementation session.

**Ownership/evidence:** [`src/contracts/provider.ts`, `ProviderResult`](../../packages/email-service/src/contracts/provider.ts), [`internal/attempt-codecs.ts`, evidence table](../../packages/email-service/src/internal/attempt-codecs.ts), adapter implementations, `test/unit/` and `test/packed-consumer/fixtures/`. Baseline strict TS accepted `{ outcome: 'accepted', retry: 'never', stage: 'data', reason: 'smtp_accepted' }` without recipients. At runtime the worker recorded `unknown / transport_uncertain`.

**Requirements and acceptance:** Discriminate results by reason so outcome, retry class, stages and required evidence match the runtime contract. Packed TS consumers must reject that example and invalid reason/retry combinations, and accept complete SMTP success/partial and SendGrid live/sandbox results. Keep runtime checks for envelope coverage, mode, malformed JavaScript and late results; invalid post-handoff evidence must still produce `unknown`, never permission to resend. Include a valid adapter example and a migration note for custom TypeScript providers. Do not change persisted outcomes.

**Verify:** `typecheck`, `test:unit`, `test:smtp`, `test:sendgrid`, and built packed-consumer fixtures.

**Initial implementation evidence:** A reason-discriminated `ProviderResult` requires SMTP recipient evidence and rejects invalid retry/stage/metadata combinations. A compile-time check matches both directions against the existing evidence table; persisted `AttemptResult` and runtime guards are unchanged. Worker regressions confirm invalid post-handoff results remain `unknown` without resend. The installed README and its tested custom provider example describe the TypeScript tightening. See the [implementation handoff](../task-artifacts/email-service/20261121-email-adopt-03/README.md): typecheck/build, unit (235), lifecycle (34), SMTP (65; two optional timing cases skipped), SendGrid (91), packed consumer (12), lint and formatting passed. The standalone Mongo lane was not run for this item.

**Reopened at independent review:** Require nonempty full-acceptance evidence and both accepted/rejected statuses for partial evidence. Provide a checked, order-preserving way to construct results from dynamic lists. The [review](../task-artifacts/email-service/20261121-email-adopt-10/README.md#findings-to-resolve-before-acceptance) reproduced both invalid results against the installed tarball. Add negative packed regressions; keep dynamic envelope coverage and malformed JavaScript checks at runtime.

**Follow-up verification:** Both invalid shapes are now rejected by packed TypeScript declarations. The root `createSmtpAcceptanceResult` validates and freezes dynamic evidence in supplied order, choosing the full or partial branch without a runtime marker. Per-reason `Extract` works for transport reasons. Worker/packed regressions preserve safe `unknown` for invalid raw or context-specific evidence. See the [reopened handoff](../task-artifacts/email-service/20261121-email-adopt-03-reopened/README.md): typecheck/build, unit (269), lifecycle (34), SMTP (65; two optional timing skips), SendGrid (91), packed consumer (12), lint and formatting passed.

### EMAIL-ADOPT-04 — Preserve template inference in shared TypeScript code

Status: completed · Kind: defect · Priority: P2 (reusable helpers reject valid SMTP commands) · Dependencies: none.

Owner: EMAIL-ADOPT-04 implementation session.

**Ownership/evidence:** [`src/contracts/template.ts`, `TemplateCommand`](../../packages/email-service/src/contracts/template.ts), [`templates/registry.ts`, `prepareParsed`](../../packages/email-service/src/templates/registry.ts), [`test/unit/template-types.ts`](../../packages/email-service/test/unit/template-types.ts), packed type fixtures. At baseline, the conditional type selected only SendGrid for a widened `TemplateMap`. Also, command `input` is the _output_ type of `parseInput`, although the parser runs on the supplied input.

**Requirements and acceptance:** Fix the kind mapping so the widened map admits either supported provider, while a concrete local or hosted key still rejects the wrong provider and wrong business input. Cover both cases in strict type fixtures and show `satisfies TemplateMap` for preserving literal keys. Document `parseInput` as validating the command's declared input shape; demonstrate normalization in `prepare`, rather than making callers cast a string to its parsed object. A separate raw-input generic is deferred unless a consuming project needs transforming parsers.

**Verify:** `typecheck`, `test:unit`, and built packed-consumer fixtures.

**Completion evidence:** The indexed mapping accepts both providers for `TemplateCommand<TemplateMap>` while preserving per-key input and provider checks. Typecheck, unit (235), build, and packed consumer (12, including the installed README and disposable MongoDB 8.2.6) passed; all eight runtime bundles were byte-identical. See the [EMAIL-ADOPT-04 handoff](../task-artifacts/email-service/20261121-email-adopt-04/README.md) for coverage and verification limits.

### EMAIL-ADOPT-05 — Support batch producers and outbox relays without delivery dependencies

Status: completed · Kind: improvement · Priority: P2 (independent processes require dummy dependencies) · Dependencies: none.

Owner: EMAIL-ADOPT-05 implementation session.

**Ownership/evidence:** [`src/contracts/service.ts`](../../packages/email-service/src/contracts/service.ts), [`src/service.ts`](../../packages/email-service/src/service.ts), [`src/batch.ts`](../../packages/email-service/src/batch.ts), `src/index.ts` if needed, batch/service and packed tests. At baseline, the relay example needed an empty registry and batch enqueue needed a worker. Two default stores with the same scope can yield `enqueued` in one store and an idle `batch.run()` against the other.

**Requirements and acceptance:** Provide an additive producer-only form for batch admission and a registry-free form for prepared relay. Their types expose only the supported operations; no dummy registry, worker, credentials, optional peer, or deep import is needed. Reuse existing admission, deadlines, stable item identities and confirmation behavior. Test replay after an uncertain write, scope/capacity mismatch and the mixed ESM/CJS path. Existing combined callers continue to work; their `run()` still serves the entire scope. In the combined example, construct service and worker from the same backing configuration rather than promising store identity can be inferred.

**Verify:** `typecheck`, `test:unit`, `test:lifecycle`, and built packed-consumer fixtures.

**Completion evidence:** Named ESM/CJS root exports `createEmailBatchAdmission({ service, smtpCapacity? })` and `createEmailRelay({ scope, store, smtpCapacity?, retry?, retention? })` reuse common admission and expose only their respective enqueue operation. Existing combined APIs and scope-wide runs remain. No-peer packed tests cover mixed builds, both queue bindings, and retained-key replay after a committed write loses its acknowledgement. The [implementation handoff](../task-artifacts/email-service/20261121-email-adopt-05/README.md) records typecheck/build, unit (238), lifecycle (34), packed consumer (12), lint and formatting passes.

### EMAIL-ADOPT-06 — Reject delivery workers with no configured providers

Status: completed · Kind: improvement · Priority: P1 (one misconfigured worker can terminally fail many jobs) · Dependencies: EMAIL-ADOPT-02, EMAIL-ADOPT-05.

Owner: EMAIL-ADOPT-06 implementation session.

**Ownership/evidence:** [`internal/worker-config.ts`, `readProfiles`](../../packages/email-service/src/internal/worker-config.ts#L59), `test/unit/worker.test.ts`, [`test/unit/batch-fixture.ts`](../../packages/email-service/test/unit/batch-fixture.ts) and [mixed-build batch fixture](../../packages/email-service/test/packed-consumer/fixtures/batch-runtime.mjs#L36). The default queue permits `providers: []`; the opt-in queue rejects it. Existing enqueue-only callers have a migration path after EMAIL-ADOPT-05.

**Requirements and acceptance:** In both modes, constructing a delivery worker with an empty list fails `invalid_config` before a claim or provider call. Verify a queued job remains untouched. Migrate enqueue-only fixtures to the producer API, retain combined-worker coverage with a valid test profile, and document the intentional compatibility change. This guard does not solve disjoint nonempty fleets; their deployment rule remains EMAIL-ADOPT-02.

**Verify:** `test:unit`, `test:lifecycle`, and built packed-consumer fixtures.

**Completion evidence:** Empty delivery profiles fail synchronously with `invalid_config` in both queue modes. Regression tests verify no store, timer, or provider calls and that a valid worker later submits the untouched queued job exactly once. Admission-only fixtures migrated to `createEmailBatchAdmission`; combined coverage retains a valid synthetic worker. The [implementation handoff](../task-artifacts/email-service/20261121-email-adopt-06/README.md) records the reproduced V1 failure, migration note, and successful typecheck/build, unit (240), lifecycle (34), packed consumer (12), lint and formatting.

### EMAIL-ADOPT-07 — Reject unsendable SMTP attachment types before new admission

Status: completed · Kind: defect · Priority: P2 (deterministic input errors surface as failed jobs) · Dependencies: none.

Owner: EMAIL-ADOPT-07 implementation session.

**Ownership/evidence:** [`internal/message-codecs.ts`, attachment validation](../../packages/email-service/src/internal/message-codecs.ts#L127), `src/templates/registry.ts`, the new-insert boundary for staged relay, and [`providers/smtp/mime.ts`](../../packages/email-service/src/providers/smtp/mime.ts#L47). `message/rfc822` can be enqueued but never sent by the bundled SMTP adapter. The [direct adapter test](../../packages/email-service/test/smtp/smtp.test.ts#L209) already rejects composite MIME at preflight.

**Requirements and acceptance:** Reject `message/*` and `multipart/*` for newly prepared or newly admitted SMTP mail with `invalid_snapshot`, before persistence or byte resolution. Test regular enqueue and an older staged command on an admission miss. Preserve exact-key replay and readability of previously admitted rows, SMTP preflight defense, valid leaf attachments, and existing SendGrid behavior. Do not tighten the common historical decoder in a way that makes an old job unreadable.

**Verify:** `test:unit`, `test:lifecycle`, `test:smtp`, `test:sendgrid`; run `test:mongodb` for the staged/replay case.

**Completion evidence:** A shared SMTP-only validator rejects composite refs during new preparation and new insert (ordinary service, both prepared APIs, and bundled store ports). Direct SMTP preflight retains the guard; historical decoders, hashes and catalogs stay unchanged. Both queue modes replay retained legacy jobs. Mongo traces show one exact scoped read and no write on a staged miss. Baseline defects reproduced; typecheck/build, unit (267), lifecycle (34), SMTP (65; two optional timing skips), SendGrid (91), Mongo (103), lint and pack dry-run passed. See the [implementation handoff](../task-artifacts/email-service/20261121-email-adopt-07/README.md), including the initial timed-out invocation and standalone Mongo pass.

### EMAIL-ADOPT-08 — Decide how operators discover unresolved submissions

Status: completed · Kind: investigation · Priority: P2 (unresolved holds retain payloads) · Dependencies: none.

Owner: EMAIL-ADOPT-08 investigation session.

**Ownership/evidence:** [`src/contracts/admin.ts`, `getJob`/`listActivities`](../../packages/email-service/src/contracts/admin.ts#L38), [`src/admin.ts`, observer behavior](../../packages/email-service/src/admin.ts#L62), `src/internal/job-record.ts`, `src/stores/mongoose/schema.ts`, and `test/conformance/admin-suite.ts`. Activities describe past attempts; notifications may be skipped. Neither gives an authoritative list of currently open holds.

**Requirements and acceptance:** Trace one unknown through projection, dismissal and redrive. Document a usable procedure with host-recorded IDs and authoritative `getJob` reads, including what happens if the host lacks those IDs. Decide whether that procedure suffices or a consumer needs a bounded, scoped `listUnresolvedUnknowns` query. If recommending the query, specify redacted output, paging, both-store behavior, and rollout for the exact Mongo index catalog. Record implement/defer and residual risk; this investigation does not require a new query, automatic redrive or an admin UI.

**Verify:** Check the procedure against existing admin/retention scenarios; record the scenario names and conclusion in the handoff.

**Completion evidence:** Defer `listUnresolvedUnknowns` absent a concrete requirement for a queue-owned worklist. The [operator handoff](../task-artifacts/email-service/20261121-email-adopt-08/README.md) traces authoritative reads, projection, exact resolution and cleanup; it provides guidance for missing IDs and explains why bounded activity paging cannot prove completeness. Unit (267), targeted Mongo admin/retention/uncertainty (31) and targeted memory lifecycle (5) passed. No runtime or catalog change.

### EMAIL-ADOPT-09 — Make the installed README sufficient for a first integration

Status: completed · Kind: improvement · Priority: P2 (consumers currently assemble the happy path from separate examples) · Dependencies: EMAIL-ADOPT-01, EMAIL-ADOPT-03, EMAIL-ADOPT-04, EMAIL-ADOPT-06, EMAIL-ADOPT-07, EMAIL-ADOPT-08.

Owner: EMAIL-ADOPT-09 implementation session.

**Ownership/evidence:** [`README.md`](../../packages/email-service/README.md), public JSDoc, [`test/packed-consumer/readme.mjs`](../../packages/email-service/test/packed-consumer/readme.mjs) and its runtime fixtures. Every advertised TypeScript fence is compiled from the installed README. Keep the detailed capacity and operations reference below the common path.

**Requirements and acceptance:**

- Put one standalone example first: define a template → `ready()` the store → enqueue with stable key/intent → run a matching worker → inspect its redacted summary. Execute the installed example with a synthetic provider and no network mail. Show the producer-only variants and how a host shares one capacity binding when opting in.
- Add a concise support/limits table: local Handlebars via SMTP vs hosted SendGrid via HTTPS; optional peers; memory vs the documented Mongo topology/privileges; provider vs store adapter obligations. Link a versioned store contract accessible to installed readers. Always show `ready()`; explain the default memory store's legacy leniency.
- Show a seven-day reminder with an explicit later expiry (default 24 hours from preparation, maximum 30 days). State that default `maxAttempts: 3` counts claims: three rate deferrals can exhaust it with zero provider calls. Preserve frozen expiry, explicit business intent and no automatic resend of uncertainty.
- Show error handling for `catch (error: unknown)` using the stable code: a subpath can throw an error that is not `instanceof` the root `EmailError` even within one module format. Include the recovery procedure from EMAIL-ADOPT-08 and distinguish submission acceptance from inbox delivery.

**Verify:** `typecheck` and built packed-consumer tests for ordinary and release-shaped tarballs, ESM/CJS and optional-peer combinations.

**Initial implementation evidence:** The installed README leads with a standalone, no-peer queue example that records one synthetic acceptance and reads a redacted result without sending. The support table links pinned historical store contracts and identifies current overrides. Tested examples cover frozen scheduling, claim-counted quota deferrals, prepared relay, batch admission and error-code handling across entrypoints. The operator procedure distinguishes a candidate from an authoritative open hold. Typecheck, build, packed consumer (12; all 18 README TypeScript fences mapped), lint, formatting and link checks passed; all eight runtime bundles remained byte-identical. See the [implementation handoff](../task-artifacts/email-service/20261121-email-adopt-09/README.md).

**Reopened at independent review:** Document fixed `EHLO email.invalid` before and after STARTTLS and distinguish it from remote TLS `servername`. No transport or option change.

**Follow-up verification:** The [reopened handoff](../task-artifacts/email-service/20261121-email-adopt-09/README.md#reopened-resolution--fixed-smtp-client-greeting) records the README and both declaration formats, with no wire/option change. Typecheck/build, packed consumer (12), SMTP (65; two optional timing skips), lint, formatting and links passed. All existing runtime bundles and all 18 README example bodies were unchanged.

### EMAIL-ADOPT-10 — Verify package compatibility and close the adoption review

Status: completed · Kind: improvement · Priority: P2 (integration across queue, adapters and published types) · Dependencies: EMAIL-ADOPT-09.

Owner: EMAIL-ADOPT-10 independent review session.

**Ownership:** This task record, the package runner and installed-consumer evidence. If implementation is delegated, use a reviewer other than the primary implementer for final acceptance.

**Requirements and acceptance:** Check each criterion against the final tree. Confirm bounded progress on both stores, no profile substitution or duplicate submission, old staged/retained data behavior, isolated optional peers, and the documented installation examples. Record changes, commands, results, intentional compatibility changes, and deferred decisions. A passing suite alone does not close a finding. A missing required check leaves the relevant task blocked with its prerequisite.

**Verify:** Run the final serial package check below; inspect emitted declarations and the packed results. Record any skipped timing cases separately from passes.

**First review (not accepted):** The [independent report](../task-artifacts/email-service/20261121-email-adopt-10/README.md) records a passing serial suite (560 Vitest tests and 12 packed checks, plus 12 packed checks at Node 24.0.0), but found gaps in the provider result types, SMTP profile docs and targeted formatting. The 03 and 09 owners address their follow-ups before the independent reviewer reruns acceptance.

**Completion evidence (accepted):** The [independent re-review](../task-artifacts/email-service/20261121-email-adopt-10/re-review.md) confirmed the published type fixes, checked and ordered SMTP evidence, the greeting documentation, and the existing queue/retained-data guarantees. The final serial package run passed build, typecheck and **562 Vitest tests** (269 unit, 34 lifecycle, 65 SMTP, 91 SendGrid, 103 MongoDB 8.2.6). The two optional SMTP timing cases were skipped. All 12 packed checks passed on Node 26.12.1 and again at the Node 24.0.0 consumer floor. Lint, touched-file formatting, whitespace and link checks passed. The full suite did not run at the floor; no workspace gates, live mail, publication or rollout.

## Verification and handoff

All commands run from the repository root. Use Node ≥24, the workspace-pinned pnpm and installed dependencies (`pnpm install` if needed). Mongo lanes require a disposable 8.x replica-set fixture; the default binary is 8.2.6. SMTP/HTTPS tests use loopback fixtures. Packed installation needs the required dependencies available to pnpm. Replace `<repo-root>` before executing:

```sh
cd '<repo-root>'
set -e
scratch="$(mktemp -d "$PWD/_tmpXXXXXX")"
git check-ignore -q -- "$scratch"
export TMPDIR="$scratch"
```

Run each named script as `pnpm --filter @web-ts-toolkit/email-service <script>` (replace `<script>` with its name). Before a standalone `test:packed-consumer` run, run `build` to refresh the emitted JS and declarations. The [package runner](../../packages/email-service/test/run.mjs) already sequences build, typecheck, and all test lanes:

```sh
pnpm --filter @web-ts-toolkit/email-service test
git diff --check
```

Use `pnpm lint` for implementation changes. If work expands into shared test scripts or CI wiring, apply the [repository checks](../../AGENTS.md) for those paths; do not run competing builds or groups concurrently. The baseline counts come from the preceding review; the per-item and final acceptance evidence above covers this implementation. Preserve further useful verification notes per the [artifact conventions](../task-artifacts/README.md).

**Deferred unless a consumer demonstrates the need:** A third provider/backend (requires a versioned adapter contract and conformance evidence); profile-filtered claims or separate quota-deferral budgets (change scheduling semantics); configurable SMTP EHLO `clientName` (today it is `email.invalid`); passing `scheduleAt` into `PrepareContext` (useful for expiry derived from a variable schedule); and enforcing `ready()` in legacy memory (changes existing tests/apps). The shipped guidance should identify the applicable limitation without promising these features.
