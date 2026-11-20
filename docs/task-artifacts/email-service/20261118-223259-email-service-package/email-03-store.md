# EMAIL-03 atomic store handoff

Companion to the [frozen V1 contract](v1-contract.md) and the [EMAIL-03 task](../../../tasks/20261118-223259-email-service-package.md#email-03--implement-atomic-store-contract-and-memory-conformance-adapter).
This phase implements the full `EmailStore` primitive contract in memory and the shared codec and decision port. It
does not implement a durable adapter, admission service, provider, worker, batch or application admin.

## Internal port for EMAIL-04

These are **source modules**, not published deep imports. The only new root runtime export is `createMemoryEmailStore`.

- [`src/internal/store-codecs.ts`](../../../../packages/email-service/src/internal/store-codecs.ts):
  `readStoreAdmission(scope, input)` yields `ValidatedAdmission` with a detached `validatePreparedCommand` result,
  frozen policies and the `encodeAdmissionKey` value. `readStoreId`, `readLeaseToken`, `readLeaseMs`, `readClaim`,
  `readFence`, `readFinish`, `readResolution`, `readRetryPolicy`, and `readRetentionPolicy` validate other boundaries.
  `readStoreCall(input, worker?)` accepts an actual `AbortSignal` and a bounded positive child budget; for non-worker
  operations it caps work at 5s. The adapter still owns driver RPC budgets. Reuse `validateAdmissionKey`,
  `encodeAdmissionKey`, `scopeToken`, `readCallOptions` and `unixMs` from the EMAIL-02 modules.
- [`src/internal/job-record.ts`](../../../../packages/email-service/src/internal/job-record.ts):
  `JobRecord`, `JobState`, `ActiveLease`, and `LedgerAttempt` are the logical V1 JSON. `readJobRecord(scope, input)`
  strictly decodes a detached mapped row; it bounds history, links ordinals and resolutions to state, checks
  frozen snapshot hash/metadata, independently recomputes the attempt decisions and activity digests, and rejects
  wrong versions or impossible rows with `store_incompatible`. `readStoredSnapshot(job, input)` reuses `validateSnapshot`.
  `jobSummary(job)` and `copyCommit(commit)` return detached frozen DTOs. Manual claim availability and usage follow
  from the one redrive record and ledger, not a second retry policy. Group counts survive pruning to validate recipient
  indexes without keeping addresses. A finished owner's **private** token digest permits exact finish replay; no
  token, digest or row revision enters summaries or activities.
- `jobSelectors(job): JobSelectors` separates logical JSON from physical indexes. Derive the queued `nextAt` and
  `queuedExpiresAt`, active `leaseEndsAt`, oldest unacknowledged `pendingAt`, and actual next eligible `nextCleanupAt`
  before updating indexes. Eligibility-time keys are absent when inapplicable. Use the required scoped simple-collation
  indexes, verify the physical keys against the decoded row, and map stored BSON/metadata separately; no Mongoose
  dependency belongs in these source modules.
- [`src/internal/job-transitions.ts`](../../../../packages/email-service/src/internal/job-transitions.ts):
  `newJob`, `claimJob`, `renewJob`, `markJob`, `finishJob`, `recoverJob`, `expireJob`, `cancelJob`, `resolveJob`,
  `reserveJobProjection`, `decideActivityPut`, `acknowledgeJobProjection`, and `cleanupJob` are the pure operations.
  Pass a validated input, current decoded row and a `DecisionTime` (`now` sampled from storage; fresh revision UUID).
  `recoverJob`/`cancelJob` also take a fresh operation UUID for any synthesized commit. `JobDecision<T>` carries
  a result and optional `JobWrite`. Do not return that result until the exact write is positively confirmed.

### Durable selection, fences and replay

- `newJob` checks skew/expiry **only on a genuinely new identity**. Validate request shape/hashes before using them,
  then check the current committed scoped admission key before new freshness/capacity. `insert` returns `duplicate`
  for a confirmed collision on that key, not as a successful replay. Read the committed winner and compare its
  fingerprint in the service; a changed snapshot hash is not a conflict by itself. A caller-supplied job ID that
  collides with an unrelated key is invalid, not proof of a scoped admission winner.
- Use indexed candidates in the V1 order: claims `(nextAt ASC, priority DESC, jobId ASC)`, maintenance by its eligible
  time then job ID. Scan at most 16 candidates; no more than three CAS submissions per primitive. For `JobWrite`,
  match `JobGuard`'s exact scope, job ID, old revision, processing state, active phase/fence/lease, and retiring flag.
  Compile `atOrAfter <= $$NOW` and `$$NOW < before` (when present) into the mutation. The lower bound is the
  decision's sampled server time and covers due/expiry/recovery predicates on an unchanged row; the upper bound
  protects live grants, applicable expiry, retry/redrive, and new projection windows. Use a fresh bounded decision
  after a proven guard miss. Confirm a current committed result with the V1 point-read strength. Do not report
  uncertainty as `null`, `none`, `not_found`, or a fresh admission miss. After a possibly dispatched write, timeout,
  cancellation, unavailability and ACK loss can still mean `write_unconfirmed`. Never fall back to memory.
- `finishJob` returns an existing owner commit without a write only for the same attempt, owner, phase, operation
  ID and evidence. It never overwrites another finalization, even after a new claim. A different winner can be
  read with `findAttempt`. Marking is one-way: a repeated marker on an already handed-off job is a definitive
  miss, not another grant. Lease renewal cannot shorten the prior live lease.
- All timestamps use bounded integer `UnixMs`. `timeAfter` returns no deadline if adding a full duration cannot
  fit. Unrepresentable configured grants/permits fail closed; an unrepresentable retention minimum never matures.
  Backoff alone saturates delay arithmetic; a computed retry at expiry or later is terminal `expired`. Memory
  rejects observed wall rewind and rechecks write guards immediately before its synchronous mutation. EMAIL-04
  must prove sampled primary time, server-time guard behavior and deadline/ACK classification with its own backend.

### Projection and retirement

- [`src/internal/activity-codecs.ts`](../../../../packages/email-service/src/internal/activity-codecs.ts):
  `activityFor`, `activityDigest`, `readActivity`, `readStoredActivity`, and `readProjectionPermit` encode/validate
  redacted projections; they are not a schema for Mongo stubs. `readActivityCriteria` yields normalized
  `ActivityCriteria`/`ActivityPosition`; query at most `limit + 1` **complete** rows in the required binary order
  (`compareActivity`), then call `activityPage`. It verifies order and filters and emits a canonical, versioned,
  scope/filter-bound cursor. Page size is not part of the filters; do not feed decoded bytes into a backend query.
- Reservation stamps a 60s nonexclusive permit on the first pending ordinal, plus a per-job high-water mark.
  A permit must match the issued attempt and canonical digest, and its deadline cannot extend that attempt's
  issuance high-water. Older overlapping permits remain valid for their own windows. This is a private adapter
  protocol, not bearer authentication. Read the source before checking the exact existing activity so a concurrent
  ACK cannot be mistaken for external deletion. `decideActivityPut` distinguishes a matching complete row from a
  new write or expired permit. For a new write, use the V1 conditional upsert and enforce the expiry **in** the
  activity write with `$$NOW`, preserving complete rows. Expired upserts into missing Mongo keys may only make
  stubs. Inspect the result/confirm exact digest and committed presence; never reconstruct missing ACKed history.
- `acknowledgeJobProjection` takes proof from the adapter's exact committed activity read, not the permit itself.
  CAS the ledger digest/ACK state as well as the job guard. An expired permit can ACK matching complete history;
  an already ACKed attempt stays ACKed, and no new permit is issued for it. Before the ACK, the committed complete
  row is already queryable; acceptance still comes from the authoritative ledger.
- Cleanup cannot prune unsettled or unprojected state. It returns one `payload_pruned`, `retirement_started`, or
  `purged` step. Retirement waits for all retention minima and the greatest permit deadline plus 31s. A `purge`
  plan supplies exact attempt IDs (at most eleven). Use journaled majority deletion of those scoped activities
  before deleting the still-retiring job by its CAS guard. The identity is replayable until that last delete.
  Retry partial deletion idempotently; no broad range deletion or TTL of complete rows. Bound server execution
  of the activity put as the V1 drain requires. Memory performs that final purge atomically; it does not prove
  the cross-collection protocol.

## Provider / worker / admin continuation

[`src/internal/attempt-codecs.ts`](../../../../packages/email-service/src/internal/attempt-codecs.ts) exports
`readAttemptResult`, `readProviderResult`, `assertEvidencePhase`, `assertEvidenceContext`, `recipientCounts`,
`smtpMessageId`, and `attemptEffect`. Use `readProviderResult(input, snapshot.provider, attemptId, snapshot.envelope)`
after invocation; turn invalid/throwing provider results into `unknown` / `transport_uncertain` at the worker
boundary. A store rejection of malformed evidence is not an authoritative provider result. SMTP success needs
all indexes reliably partitioned into accepted/rejected as appropriate, with an optional exact synthetic SMTP ID
from `smtpMessageId`; no guessed entries or raw provider response. SendGrid never supplies recipient indexes and
only live `sendgrid_accepted` may carry its bounded ID. Only throttle/deferral may supply a retry hint. The store
owns the deterministic backoff and attempt budgets; provider adapters must supply actual wire evidence.

Generate IDs with `randomUUID()` (canonical lowercase V4) and an independent lease secret, e.g.
`randomBytes(16).toString('base64url')`. `readLeaseToken` accepts bounded URL-safe opaque spellings, not UUIDs;
validation cannot prove entropy. An unconfirmed claim/renewal/marker grants no right to work or launch; never
authorize by reading a marker. `launch_window_closed` is permitted only after a confirmed marker with local proof
that `submit` was not called. Store fencing does not prove or revoke remote execution. Never call the operator's
`cancel` as a stale owner. `findAttempt`/same-operation finish are confirmation paths, never a provider replay.
Redrive needs explicit duplicate-risk acknowledgement and has only one non-retrying manual claim. Keep queue
payloads, fences, known result diagnostics and projection permits out of application routes and logs as appropriate.
EMAIL-09 should compose the existing projection/retention primitives, not create a second ledger.

## Maintained checks and limitations

Verified serially from `<repo-root>` on Node 26.12.1 and pnpm 11.24.0 with `TMPDIR` set to a fresh ignored,
repo-local `_tmp*` directory:

```sh
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service build:package
```

Vitest 4.1.12 passed 78 tests across eight files (36 new store tests); tsup 8.5.1 emitted the ESM/CJS
entrypoints and declarations. Both root declarations contain `createMemoryEmailStore(options?: MemoryEmailStoreOptions): EmailStore`.
Changed paths passed Prettier and the changed TypeScript paths passed ESLint.
The handoff links and changed-file whitespace were checked. No installed-tarball or live service lane ran.

- [`test/conformance/store-suite.ts`](../../../../packages/email-service/test/conformance/store-suite.ts) exports
  `registerStoreConformance(name, setup)`. EMAIL-04 can pass two ready-capable stores on separate caller connections
  pointing to the same isolated collections; `setup` supplies a primary server-time sampler (`now`) and optional
  teardown (`close`). The suite uses confirmed timestamps, ample lease windows and no sleeping/clock override.
  Use isolated collections per test and explicit live-lane hook/time budgets.
- [`test/conformance/exact-clock-suite.ts`](../../../../packages/email-service/test/conformance/exact-clock-suite.ts)
  exports `registerExactClockConformance(name, setup)`, additionally requiring `advanceTo`. Memory uses an
  injected clock. Do not fake the production Mongo clock to reuse this lane: prove reducer equality here, and
  separately test real server-time guards, contention and retention races with isolated fixtures/barriers in EMAIL-04.
- [`test/conformance/store-fixtures.ts`](../../../../packages/email-service/test/conformance/store-fixtures.ts)
  generates synthetic prepared DTOs and attempt evidence. `lostAck` either bypasses dispatch or discards a real
  adapter result and throws `write_unconfirmed`. That models caller-visible ambiguity, not a driver failure,
  server-side command interruption, or replica failover. `peer` is a second caller of the same memory instance
  in [`test/unit/memory-store.test.ts`](../../../../packages/email-service/test/unit/memory-store.test.ts),
  not another process. [`test/unit/job-record.test.ts`](../../../../packages/email-service/test/unit/job-record.test.ts)
  round-trips the V1 logical row and checks plan guards independent of storage. Memory indexes use binary searches
  plus bounded array shifts; there is no whole-queue materialization. The exact suite covers fixed millisecond
  boundaries, history budgets and retention/drain; memory tests cover capacity, abort/deadline, and clock rechecks.

No contract relaxation or blocker for EMAIL-04 was identified in this phase. Live Mongo concern/topology, indexed
selection, uncertainty, activity expiry-in-write, partial retirement and failover are outstanding durable checks.
Provider I/O, worker shutdown/deadline/ACK behavior, installed package acceptance, and workspace integration
are not verified here. All maintained fixtures are synthetic within this repository. No raw data, third-party
code, scratch inputs, generated output, or backing services are needed to reproduce the memory checks.
