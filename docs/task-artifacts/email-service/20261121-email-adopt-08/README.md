# EMAIL-ADOPT-08 investigation handoff

**Decision: defer `listUnresolvedUnknowns`.** The [host-recorded ID procedure](#recover-unresolved-submissions)
covers the reviewed integration; no host requirement for a queue-owned worklist was demonstrated.
[EMAIL-ADOPT-08](../../../tasks/20261121-022138-email-service-cross-project-adoption.md#email-adopt-08--decide-how-operators-discover-unresolved-submissions)
reviewed `39848121` plus the shared EMAIL-ADOPT-01–07 changes. No runtime, catalog, shipped README or task status
changed. EMAIL-ADOPT-09 can copy the procedure into
[Inspect results and maintain history](../../../../packages/email-service/README.md#inspect-results-and-maintain-history).

## What the current contracts guarantee

- [Handoff and finish](../../../../packages/email-service/src/contracts/store.ts#L125) are fenced writes. Only
  a timely positive handoff ACK permits submission. In the
  [lost-marker case](../../../../packages/email-service/test/unit/worker-fences.test.ts#L97), a committed marker
  with a lost ACK left a `handed_off` lease and an `unconfirmed` entry with zero provider calls. After lease
  expiry, worker recovery committed `unknown` / `post_handoff_lease_expired`. A
  [lost finish ACK](../../../../packages/email-service/test/unit/worker-fences.test.ts#L364) can instead follow
  provider acceptance; reconfirming or repeating the same finish never resubmits. A report is not the ledger.
- In the [shared admin trace](../../../../packages/email-service/test/conformance/admin-suite.ts#L415), an
  ambiguous submission produced a terminal `unknownOpen: true` job with attempt A visible in `getJob` before
  projection. `reconcile()` reserved, wrote and ACKed A's redacted activity without closing the hold. Redrive
  queued the same job and snapshot; the next worker claim used a distinct attempt B. B was also unknown. Exact
  dismissal closed B without rewriting either activity. A second redrive was rejected; replay of the old action
  returned the persisted decision and current job, not another claim.
- `unknownOpen` is [derived from terminal state](../../../../packages/email-service/src/internal/job-record.ts#L167),
  not an indexed selector. Both stores share [exact resolution](../../../../packages/email-service/src/internal/job-transitions.ts#L396)
  and [cleanup eligibility](../../../../packages/email-service/src/internal/job-record.ts#L121).
  The [admin contract](../../../../packages/email-service/src/contracts/admin.ts#L70) separates current point
  reads from complete projected activities (which can be visible before source ACK). Lease recovery is
  [a worker sweep before claims](../../../../packages/email-service/src/worker.ts#L150), not part of
  [admin reconciliation](../../../../packages/email-service/src/admin.ts#L221).

## Copy-ready README procedure

### Recover unresolved submissions

Use `createEmailAdmin` from `@web-ts-toolkit/email-service` on the original, caller-ready store and authorized
scope, with the same `smtpCapacity` binding if enabled. The host controls scheduling and access; IDs and
cursors are not authorization. Submission acceptance is not inbox delivery.

1. **Save IDs at admission and in reports.** For `enqueued` and `replayed`, persist `job.jobId`, original
   queue/scope and an opaque host reference before marking an outbox row relayed or acknowledging a host item.
   For `enqueueBatch`, record each successful item's `job.jobId` alongside its batch/item IDs. Resume an
   unconfirmed admission within the replay window on the original route with the same key and intent (same
   prepared command for a relay, same batch/item IDs and intents for a batch). Do not mint a new key or replay an
   old completed command to find its ID: after purge it can create a new job. From the worker run report's
   `items`, record scoped `jobId`, `attemptId` when present, operation, status and reason, including recoveries,
   `unknown` and `unconfirmed`. Keep `stop` and `counts.persistenceFailures` too: a lost claim ACK can have no
   item. Restrict access; don't log addresses, content, raw replies, or secrets.
2. **Check the current job.** `unconfirmed` means the worker could not confirm the stored outcome;
   `write_unconfirmed` means a write may have committed. Neither proves rollback or non-submission. `unknown` is
   durable and never automatically resends. A `handed_off` lease does not prove the provider was invoked;
   `providerInvoked: false` on recovery does not describe the old owner. Read `admin.getJob(jobId)` even without
   activities. Resolve only a terminal `unknown` with `unknownOpen: true` and `latestAttempt.outcome === 'unknown'`.
   Take `attemptId` from `latestAttempt`; require any candidate attempt ID from a report or activity to match.
   If still leased, wait for the owner or follow step 4. If the read fails, returns `null`, or shows a changed
   state or attempt, don't act on stale evidence. An absent job does not prove non-submission.
3. **If IDs are missing, find candidates, not a complete worklist.** Check retained host records first. Run a
   bounded `admin.reconcile({ limit: 4, timeoutMs: 10_000 })` before paging. This projects attempts in the scope;
   it neither recovers leases nor sends mail. Back off on contention, surface failures and schedule further
   bounded passes if needed. A projection can be visible before its ACK; `idle` and report counts don't certify
   completeness. `onActivity` is best effort: missed or skipped callbacks are not replayed. Don't scan or edit
   private store collections.

   Choose a fixed incident window on attempt `finishedAt` in Unix milliseconds (`from` inclusive, `before`
   exclusive), not admission or projection time. Page `admin.listActivities({ from, before, limit: 8 })` using
   `nextCursor` unchanged as `cursor` with the same route and filters, including `jobId` if supplied. Cap the
   pass by elapsed time (pass a shared abort signal with a deadline to the calls), pages and reads (e.g. three
   pages and 24 `getJob` reads). Filter for `activity.result.outcome === 'unknown'` locally, deduplicate by
   scoped job/attempt, and recheck `unknownOpen` and the exact current attempt with `getJob`. This pass
   identifies candidates; it does not resolve them.

   Bookmark the route, window and opaque cursor only after accounting for the page; if interrupted mid-page,
   resume at its start. Pages sort newest finish first, then job/attempt ID; a cursor is a position, not a
   snapshot or high-water mark. A later projection can sort ahead of the bookmark even inside the window; a
   timestamp-only bookmark can skip ties. Older holds can fall outside the window; settled history can be
   purged. Revisit overlapping or older windows from their first page after projection, within your budget.
   An empty or final page cannot rule out holds: some attempts may be unprojected or still leased. Report gaps
   and escalate if you need a complete inventory.

4. **Recover stale leases only once suspected old workers are quiesced.** Stop their schedules and verify
   runs and provider I/O have ended (`shutdown()` returns `stopped`, not `deadline`, or equivalent host
   confirmation). This cannot recall a submission. After store-time lease expiry, a healthy worker's
   bounded same-scope `run` with positive `maintenanceLimit` can recover the lease. Pre-handoff expiry can
   follow safe retry rules; post-handoff expiry becomes `unknown`. The run can also claim and submit unrelated
   mail, even with `limit: 1`. Do not start it for inspection if normal delivery isn't authorized; there is
   no recovery-only admin run. Re-read the job and review authorized provider evidence for the exact attempt;
   missing provider logs don't prove rejection.
5. **Resolve the exact open attempt.** Re-read just before acting. Leave the hold open if undecided.
   `admin.resolveUnknown({ jobId, attemptId, action: 'dismiss' })` closes it without sending, even after expiry.
   The outcome stays `unknown`; dismissal does not assert acceptance or rejection. Cancel cannot recall mail.

   Do not redrive confirmed acceptance. Only an authorized operator who has quiesced suspected old workers,
   reviewed the evidence and accepted possible duplicate submission should call
   `admin.resolveUnknown({ jobId, attemptId, action: 'redrive', acknowledgeDuplicateRisk: true })`. Admin does
   not send; it queues the same frozen snapshot for a future run with the matching profile and resolvers. Redrive
   requires a retained snapshot, store time before the original `expiresAt` and no previous redrive. It gives
   **one extra claim**, not a send guarantee, automatic retry or extension of expiry. A second unknown can
   only be dismissed. Never bypass these checks by enqueuing with a fresh key.

   Audit the actor, scoped attempt and decision. After `write_unconfirmed`, read `job.resolutions` for the
   exact attempt/action. If not recorded and still eligible, retry only the same authorized command within
   your retry budget. `resolved` confirms a new decision; `replayed` confirms the prior decision and returns
   the current job, which may have advanced. On `not_found`, `resolution_conflict` or `expired`, stop and re-read.

6. **Schedule projection and cleanup separately from delivery.** Open unknowns hold payload, history and replay
   identity even past expiry. The frozen minimum retention windows start at dismissal, or after redrive at a
   settled terminal result. Even settled payloads won't prune until all attempts have projection ACKs.
   Schedule bounded `admin.cleanup({ limit: 4 })` calls: prune eligible payloads; after all retention windows
   and projection drain, delete activities before purging the job and replay guard. A job can remain readable
   while its history is being removed. Cleanup does not clear an open hold.

## Residual risk and revisit trigger

A host can lose IDs or reports before persisting them or inherit older producers without a ledger. Bounded
history paging may miss holds, leaving sensitive payloads retained indefinitely. Report gaps through host
incident and retention processes; don't dismiss holds just to meet a cleanup target.

Revisit only for a concrete host requirement for a bounded per-scope inventory independent of projection,
for example if reliable ID capture is not possible and missed holds threaten a retention target. Specify a
redacted DTO (job/attempt IDs, open time, expiry, reason), opaque version/scope/binding-bound keyset pages
over `(openedAt, jobId)`, and fresh `getJob` checks; even live pages aren't snapshots. Index a selector derived
from authoritative transitions: bounded selection in memory and a scoped partial `(scope, openedAt, jobId)`
index for open holds on Mongo. Test open/resolve/reopen, scope isolation, concurrent paging and examined-key limits.

Version the store contract and both queue catalogs: [`ready()` rejects extra indexes and mismatched validators](../../../../packages/email-service/src/stores/mongoose/schema.ts#L85).
Prefer fresh versioned collection pairs and leave old jobs on the original route (not covered by the new query).
If retained rows must be covered, design a separately authorized, quiesced migration/rollback preserving
identity, expiry, holds and history. Test old/new readiness; no mixed binaries on changed collections, live
index additions, generic search or automatic redrive.

## Verification

Ran serially from the repo root on Node 26.12.1, pnpm 11.24.0 and Vitest 4.1.12 with a fresh, checkout-local
`_tmp*` `TMPDIR` verified by `git check-ignore`. Mongo used the
[disposable one-member replica-set fixture](../../../../packages/email-service/test/mongodb/fixture.ts#L18),
with a local MongoDB 8.2.6 executable supplied via `MONGOMS_SYSTEM_BINARY`, `MONGOMS_VERSION=8.2.6` and
`MONGOMS_RUNTIME_DOWNLOAD=false`.

```sh
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service test:mongodb \
  test/mongodb/admin.test.ts test/mongodb/retention.test.ts test/mongodb/uncertainty.test.ts --reporter=verbose
pnpm --filter @web-ts-toolkit/email-service test:lifecycle \
  test/lifecycle/memory.test.ts test/lifecycle/smtp-capacity.test.ts \
  -t 'preserves a peer recovery winner|needs explicit redrive|keeps proven SMTP refusal|preserves complete attempts, history' \
  --reporter=verbose
```

- Unit: 267 passed in 21 files, no skips.
- Targeted Mongo: 31 passed (10 admin, 6 retention, 15 uncertainty), no skips.
- Targeted memory lifecycle: 5 passed in 2 files; 27 filtered out by name.

Maintained scenarios checked against the procedure:

- **Capture and confirm:** [“checks serialized scope, binding and hashes first, then confirms and replays before store freshness”](../../../../packages/email-service/test/unit/admission-only.test.ts#L93)
  and [“keeps earlier writes, reports independent conflicts and failures, and counts only the persistence subset”](../../../../packages/email-service/test/unit/batch.test.ts#L238)
  confirm same-route relay/batch replay returns the retained job. The
  [lost claim ACK tests](../../../../packages/email-service/test/unit/worker-fences.test.ts#L19) show a report
  can lack a job item; [“preserves a peer recovery winner over a stale finish after real wire acceptance”](../../../../packages/email-service/test/lifecycle/fences.ts#L300)
  shows `unconfirmed` despite loopback acceptance, then an authoritative `unknown` on recovery. The
  [shutdown deadline test](../../../../packages/email-service/test/unit/worker-budget.test.ts#L401)
  confirms `deadline` can leave provider I/O active. Mongo's
  [driver-boundary lost-ACK cases](../../../../packages/email-service/test/mongodb/uncertainty.test.ts#L204)
  confirm a later exact read can see a committed handoff or finish after `write_unconfirmed`.
- **Discover and resolve:** [“pages only scoped, complete redacted activities with a half-open window and bound cursor”](../../../../packages/email-service/test/conformance/admin-suite.ts#L245),
  Mongo's [bounded index ranges across a large timestamp tie](../../../../packages/email-service/test/mongodb/admin.test.ts#L119)
  and the [activity keyset codec](../../../../packages/email-service/src/internal/activity-codecs.ts#L225)
  support bounded paging, not completeness. [“holds just one unresolved observer across sweeps and drops later events instead of retrying”](../../../../packages/email-service/test/unit/admin.test.ts#L186)
  and the [lost projection ACK scenario](../../../../packages/email-service/test/conformance/admin-suite.ts#L221)
  confirm an observer is not a worklist. The [scoped loopback scenario](../../../../packages/email-service/test/lifecycle/scopes.ts#L9)
  checks that reconcile leaves a handed-off lease alone.
  [“redrives an exact unknown once, preserves both attempts, and dismisses without changing history”](../../../../packages/email-service/test/conformance/admin-suite.ts#L415),
  [before/after-commit resolution ACK-loss cases](../../../../packages/email-service/test/conformance/admin-suite.ts#L366)
  and [“needs explicit redrive after ambiguous … wire results”](../../../../packages/email-service/test/lifecycle/outcomes.ts#L220)
  confirm there is no automatic resend. The
  [partial acceptance projection test](../../../../packages/email-service/test/conformance/admin-suite.ts#L55)
  confirms a failed projection neither authorizes redrive nor causes resubmission.
- **Retain and retire:** [“holds unresolved outcomes and starts the payload, history and replay windows at dismissal”](../../../../packages/email-service/test/unit/admin.test.ts#L326)
  denies redrive after expiry but starts the retention windows on exact dismissal. Mongo's
  [“holds unknown/pending rows; waits for drain, repeats partial purge, and cannot resurrect complete history”](../../../../packages/email-service/test/mongodb/retention.test.ts#L274)
  confirms pending/open holds and that a lost activity-delete ACK can leave the job/identity intact. The
  [capacity memory scenario](../../../../packages/email-service/test/lifecycle/smtp-capacity.test.ts#L329)
  checks opt-in redrive, cleanup and binding-bound cursors. The
  [capacity Mongo counterpart](../../../../packages/email-service/test/mongodb/smtp-capacity.test.ts#L193)
  and [extra-index readiness rejection](../../../../packages/email-service/test/mongodb/readiness.test.ts#L87)
  were reviewed by source, not rerun.

Providers were synthetic or loopback-only; no live mail or production data. No full Mongo, lifecycle or packed
matrix, build or runtime changes in this item. Raw command output, generated fixtures, databases, binaries and
dependencies are omitted. Reproduce with the maintained fixtures above, not this artifact alone.
