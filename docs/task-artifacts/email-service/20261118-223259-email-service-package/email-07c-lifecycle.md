# EMAIL-07C isolated service and worker lifecycle

Evidence for [EMAIL-07](../../../tasks/20261118-223259-email-service-package.md#email-07--implement-job-service-and-worker-lifecycle),
following the [07B fixture plan](email-07b-worker.md#07c-fixturereuse-plan) and the
[V1 state machine](v1-contract.md#job-state-machine). The worker, service, provider APIs and retry policies are
unchanged. This phase does not implement batch or result projection.

## Maintained scenarios

The [memory lane](../../../../packages/email-service/test/lifecycle/memory.test.ts) and
[Mongo lane](../../../../packages/email-service/test/mongodb/lifecycle.test.ts) share the
[outcome](../../../../packages/email-service/test/lifecycle/outcomes.ts) and
[fence](../../../../packages/email-service/test/lifecycle/fences.ts) suites. They admit with the public
`createEmailService` and run public `createEmailWorker` instances against ready stores. Memory uses a fresh
single-process queue and its ordinary wall clock. Mongo uses a fresh database per case on a one-member
WiredTiger replica set, two independent ready Mongoose connections, and primary `hello.localTime` for waits.
Neither lane fakes worker time. Peer checks use exact scoped `findJob` and `findAttempt`; the report alone
does not count as proof of a stored outcome.

- **Real providers on loopback.** The [fixture](../../../../packages/email-service/test/lifecycle/fixture.ts)
  uses the SMTP factory with implicit TLS and the SendGrid adapter with only DNS, port and CA remapped by its
  private fixture seam. TLS verification and the production HTTPS authority/path are unchanged. The servers
  count SMTP `DATA`/completed MIME transactions or complete HTTPS requests, alongside `submit` invocations.
  They verify exact SMTP commands, rendered subject, text and escaped HTML, Bcc only on the envelope, and
  decoded attachment bytes; HTTPS checks the exact JSON bytes, grouping, template ID, attachment and sandbox
  flag. A staged sandbox validation counts as `validated`, not `submitted`, and has no provider message ID.
  Likewise, no synchronous recipient results are invented for SendGrid. SMTP full and partial acceptance
  preserve exact recipient indices. Report and ledger assertions exclude payload, addresses, credentials,
  private fence tokens and raw replies.
- **One authorized submit.** Two workers enter the claim boundary on the same scoped job; exactly one claims
  and gets the real marker. Holding its reply before the worker sees it shows the independent reader sees
  `handed_off`, no finalized attempt and cancellation `too_late`, while submit and wire counts are zero.
  Release allows one submission; a terminal replay of the unchanged admission does not prepare, render or
  submit again. Another scope can admit the same key and stays untouched. Before the marker, a peer
  cancellation can win, in which case the worker confirms the stored `cancelled` attempt without I/O.
- **Simulated response loss, not a network failure.** Both sides of insert, claim, renew, marker and finish
  are tested at the store port: before-commit omits the write, after-commit lets the real store succeed then
  discards the reply. The injected late positive marker waits past the worker's store-call deadline and
  authorizes nothing. Missing claim/renew replies leave either no claim or an unworked pre-handoff lease.
  After a missing marker, the peer worker waits for store-observed lease expiry: absence of a marker allows
  one later due attempt with the same snapshot; a committed marker recovers `unknown` without any send.
  Stale renew and mark cannot change either outcome.
- **Captured outcomes and recovery.** At the first finish call, the provider already returned acceptance.
  Aborting the run there leaves the finish signal live. After simulated noncommit the worker writes only the
  identical finish object, and after simulated commit it confirms only the exact attempt; neither path sends
  again. With both finish writes omitted by the seam after one wire acceptance, the run reports
  `unconfirmed`, not `unknown` or success. Live store time eventually makes peer recovery authoritative:
  it commits terminal `unknown`, and a fresh fixture call with the old finish request cannot overwrite it.
- **Outcome and socket boundaries.** A SendGrid `429` produces a stored 2s retry floor; nothing sends early,
  and the due attempt sends the same JSON bytes without preparation. Scheduled queued expiry makes no
  synthetic attempt. A genuine post-DATA SMTP reset and a truncated HTTPS `202` both leave `unknown` without
  automatic retry; one explicitly acknowledged redrive uses a fresh attempt and the same snapshot, preserves
  old evidence, and cannot be repeated. For each adapter, shutdown and the absolute run deadline close a
  real peer stalled after its request/message. The fixture observes server-side socket close before teardown
  and the stored result is `unknown`, not remote recall.
- **Actual MongoDB command interruption.** The worker's marker reaches `hangBeforeFindAndModifyPerformsUpdate`
  in real MongoDB. The second client identifies that CAS, issues `killOp`, and observes driver error `11601`
  on the first client. The worker sees an unconfirmed marker; the peer observes `pre_handoff`, no finalized
  attempt until it cancels, and no SMTP traffic. The separate
  [three-member store lane](../../../../packages/email-service/test/mongodb/failover.test.ts) exercises a real
  election during a marker and confirms committed evidence on the new primary, without provider I/O in that case.

## Scoped Mongo duplicate-confirmation fix

[`MongoOperations.insert`](../../../../packages/email-service/src/stores/mongoose/operations.ts) now classifies a
failed confirmation read as `write_unconfirmed` **only** after the insert reply reports duplicate key `11000`.
This is not proof of a winner or noncommit. Service admission can use its existing one exact scoped read to
prove replay or a conflicting fingerprint, never a second insert. A proven unrelated job-ID collision still
reports `invalid_command`; a failed pre-insert read still reports `store_unavailable` and sends no insert.

The [public-service regression](../../../../packages/email-service/test/mongodb/lifecycle.test.ts) lets another
client commit after the loser's optimistic lookups. It checks a real wire insert reply with `n: 0` and key code
`11000`, then uses server `failCommand` to return `11601` for the internal confirmation read. One working service
read proves either `replayed` or `idempotency_conflict`; failure of both reads returns `write_unconfirmed`, and
the peer can still replay the single stored winner. Command monitoring proves a single insert and the same
linearizable admission selector on each lookup. The
[adapter regressions](../../../../packages/email-service/test/mongodb/uncertainty.test.ts) also exercise failure
in the fallback job-ID lookup, proven unrelated ID, ordinary duplicate, and a pre-insert read failure.

To reproduce the unfixed behavior during review without changing checkout source, a disposable Vitest transform
replaced just the duplicate-confirmation catch with the two uncaught point reads. On real MongoDB all three
selected public cases then failed with `store_unavailable`. With the catch present, all three passed. This was an
in-memory test variant, not a source revert or emulated driver response.

## Reproduction and limits

Use Node 26.12.1, pnpm 11.24.0, TypeScript 6.0.3, Vitest 4.1.12, tsup 8.5.1, OpenSSL 3.0.13, Nodemailer 10.6.0,
Mongoose 9.12.2 with MongoDB Node driver 7.8.0, `mongodb-memory-server` 11.3.0, and a prepared MongoDB 8.2.6
binary. From `<repo-root>` with a fresh, verified ignored `TMPDIR`:

```sh
export TMPDIR='<repo-root>/_tmp-email-07c-repro'
mkdir "$TMPDIR"
git check-ignore -- "$TMPDIR"
export MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false
export MONGOMS_SYSTEM_BINARY='<absolute path to prepared mongod 8.2.6>'
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service test:lifecycle
pnpm --filter @web-ts-toolkit/email-service test:smtp
pnpm --filter @web-ts-toolkit/email-service test:sendgrid
pnpm --filter @web-ts-toolkit/email-service test:mongodb
pnpm --filter @web-ts-toolkit/email-service build:package
```

The package checks above passed serially on 2026-11-20: **178 unit tests (14 files), 25 memory lifecycle tests
(1 file), 50 SMTP tests (1 file), 90 SendGrid tests (3 files), and 82 MongoDB tests (6 files)**, with no skips in
the unfiltered runs. Mongo includes the 25 shared lifecycle cases, four Mongo-only lifecycle cases, five
store-level duplicate/pre-write regressions, and the existing conformance and replica-set lanes. Package
typecheck/build, changed-path ESLint and Prettier, local links and whitespace also passed.

This evidence does not demonstrate live delivery, inbox receipt, exactly-once guarantees, a socket cut after
commit during election, production clock skew, or power-loss durability. Store-seam failures and late replies
do not simulate actual process death; the real `killOp`, election, TCP reset, HTTP truncation and server-side
socket close are separately observed. No external DNS resolution or routed mail/HTTP was used. The packed
consumer, minimum-Node/peer matrix, release, workspace and CI lanes were not exercised. No runtime dependency,
lockfile, workspace registration or canonical workspace `build`/`test` change. All test data are maintained
synthetic fixtures; no raw protocol logs, keys, DB contents, binaries, output builds, dependencies or temporary
transform are archived.
