# EMAIL-07B worker core verification and handoff

Worker/unit checkpoint for [EMAIL-07](../../../tasks/20261118-223259-email-service-package.md#email-07--implement-job-service-and-worker-lifecycle)
and the [frozen V1 worker and deadline contract](v1-contract.md#worker-deadlines-and-errors). EMAIL-07 remains
`in_progress`: EMAIL-07A admission and EMAIL-07B worker core/unit are verified; EMAIL-07C owns the real
store/provider lifecycle evidence. No second queue, scheduler, immediate-send API, provider retry or adapter fix
was added here.

## Design and boundary choices

- The root named [`createEmailWorker`](../../../../packages/email-service/src/worker.ts) binds one ready `EmailStore`,
  scope and immutable profile refs/settings. It recovers due leases, then expires due queued jobs, then coordinates
  claims through one bounded loop. An explicit bounded scan contention stops that run instead of treating the scan
  as empty or polling; maintenance hitting its own cap does not consume the claim limit. A full set of held slots
  outranks a claim limit/idle report. The first operational store failure closes the gate for new claims, renewals
  and launches, but does not cancel an already-invoked transport solely because a store call failed. External abort,
  run deadline and shutdown signal that active I/O. Persistence failures count invoked store calls that fail, including
  a timeout, incompatible reply or adapter `busy` (an error rather than an explicit `StoreNext.contended`). A stopped
  budget before port invocation does not count as a persistence failure.
- [`worker-config.ts`](../../../../packages/email-service/src/internal/worker-config.ts) detaches config and captures
  data methods; trusted provider/store/limiter receivers retain their own implementation state. The resolver table is
  private. A worker limiter should be instantiated per worker; a shared limiter coordinates wherever the host
  implements its quota. No internal refund, waiting for a future permit, or extra limiter service.
- [`worker-attempt.ts`](../../../../packages/email-service/src/internal/worker-attempt.ts) anchors preflight at
  claim dispatch, including a cap on the claim RPC. Renewal is scheduled at `floor(leaseMs / 3)` from the last
  dispatch, with monotonic rechecks and no attempt to catch up after a stale grant. The worker joins an actual
  in-flight renewal before any marker or finish for that owner. [`worker-evidence.ts`](../../../../packages/email-service/src/internal/worker-evidence.ts)
  checks token, attempt, phase, ordinal, snapshot metadata, duration and store date consistency. Renewal must extend
  the preceding grant; a no-op echo cannot extend the local authorization window even if an adapter retained that
  same lease. A marker's elapsed interval is checked against the previous confirmed grant with the 1s margin.
  V1 `HandoffGrant` carries dates, not a fence or write ID: it is evidence only as the exact reply of a conforming
  store called with the already confirmed fence. A wholly fabricated but structurally plausible ACK by a malicious
  adapter is not distinguishable from a real one by a worker. There is no positive path from `findJob`/`findAttempt`
  back to submission, and the store's timestamps, not worker wall time, decide expiry at the marker and finish.
- [`worker-preflight.ts`](../../../../packages/email-service/src/internal/worker-preflight.ts) awaits each resolver
  sequentially in one attachment stage, verifies exact byte length and SHA-256 on owned memory, then synchronously
  prepares/captures `submit`, then awaits one rate permit. The subsidiary stages have their own caps within total
  preflight. An earlier outer deadline takes precedence over a stage deadline. Only trusted host promises may be
  abandoned, with slots held until actual settlement. An injected `prepare` must not perform transport I/O;
  rejecting an asynchronous `prepare` cannot undo side effects of nonconforming host code.
- A single positive marker ACK can launch once, only inside the post-ACK expiry, preflight, run and lease/grace
  windows. Malformed or thrown post-invocation evidence becomes `transport_uncertain`; late results do not
  establish positive or safe retry evidence. The worker rechecks exact SMTP success partitions; for an SMTP
  envelope refusal with recipient evidence, only a complete rejected partition can represent all RCPTs refused.
  A MAIL refusal may still have no recipient entries. Capture before a subsequent abort means capture in the
  worker's first timely provider completion observer. V1 has no independently verifiable provider-side capture
  timestamp, so an injected result received for the first time after stop cannot claim earlier success. The worker
  awaits transport settlement rather than racing it against cancellation. Only `shutdown` can stop waiting after
  its own finite deadline; it then reports `deadline` while the run remains active. An abandoned host callback is
  different from still-active transport work.
- [`worker-finish.ts`](../../../../packages/email-service/src/internal/worker-finish.ts) uses the exact attempt
  fence and an independent absolute grace, never beyond the nominal run deadline plus grace. A failed/malformed
  finish ACK does not imply noncommit. Where an effect is unconfirmed, one retry of the identical operation is
  permitted if the window and known lease allow, plus exact point reads. A valid stored winner (for example
  cancellation or lease recovery) is reported even if it differs from the local candidate. No owner mutation after
  an unconfirmed renewal or marker; a definite guard miss may be inspected for the exact attempt but never authorizes
  a mutation or send. Attempt effects, retry floors, expiry and one manual redrive stay in the shared store reducer.

## Maintained evidence

All inputs are repository-local synthetic fixtures. The memory/store-seam tests check eventual stored phases and
commits, invocation counts and report privacy. Lost ACKs and wall/monotonic divergence are deliberate injections,
not observations of real replication, clock skew or socket closure. No mail was sent.

Ran serially from `<repo-root>` with a fresh, verified gitignored repo-local `TMPDIR`, Node 26.12.1, pnpm 11.24.0,
TypeScript 6.0.3, Vitest 4.1.12 and tsup 8.5.1:

```sh
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service build:package
pnpm exec eslint packages/email-service/src/{index,worker}.ts \
  packages/email-service/src/internal/{activity-codecs,attempt-codecs,budget,callbacks,store-call,worker-*}.ts \
  packages/email-service/test/unit/worker*.ts
```

All checks passed: **178 unit tests in 14 files** (73 new worker tests). Both emitted root declaration conditions
retain the named worker factory and its JSDoc; no optional-peer import was added to the root. Changed-path Prettier,
local links, whitespace and nonignored handoff destination were checked. No MongoDB runtime, real SMTP/SendGrid
adapter, installed consumer or workspace suite/build/lint ran. No package manifest, lockfile or CI work in 07B.

- [`worker.test.ts`](../../../../packages/email-service/test/unit/worker.test.ts): frozen configuration, limits,
  scheduling/maintenance order, contention, competing workers, scoped claims, sandbox/partial counters and no
  rerender/reopen of terminal admissions.
- [`worker-fences.test.ts`](../../../../packages/email-service/test/unit/worker-fences.test.ts): before/after lost ACKs,
  corrupt grant/finish/recipient evidence, cancellation, same-operation convergence, peer takeover, manual redrive and
  a run-wide store fault racing a positive marker ACK.
- [`worker-budget.test.ts`](../../../../packages/email-service/test/unit/worker-budget.test.ts) and
  [`worker-preflight.test.ts`](../../../../packages/email-service/test/unit/worker-preflight.test.ts):
  manual clocks and barriers for absolute bounds, renewal serialization, provider settlement, attachment/rate
  validation and held capacity, independent finalization grace, stop precedence and repeated shutdown.

## 07C fixture/reuse plan

1. Add a maintained integrated lifecycle fixture shared by the memory and Mongo worker lanes. Use the public
   `createEmailService`/`createEmailWorker` path, ordinary ready stores, and independent clients for the Mongo
   variant. Reuse [`test/mongodb/fixture.ts`](../../../../packages/email-service/test/mongodb/fixture.ts) for separate
   ready-capable stores, a fresh isolated namespace, `serverNow`/`waitForTime`, and command/failpoint barriers.
   Use store time for scheduling and recovery; never substitute a fake clock into the real Mongo protocol. Keep
   verify/replay assertions against the peer's scoped `findAttempt`/`findJob`, not only the run report.
2. Reuse the [SMTP loopback scripts and TLS generator](email-05-smtp.md#reuse-for-sendgrid-and-the-worker) and the
   [SendGrid private HTTPS/DNS seam and synthetic CA](email-06-sendgrid.md#reuse-for-email-07). Run both real adapters
   through both stores, with no routed mail or HTTP outside loopback. Count SMTP DATA and HTTPS requests at the
   server; assert exact envelope/content/validation behavior and peer-observed close at shutdown/deadline. Pause
   worker `markHandoff` after a real commit but before worker ACK and assert no wire activity across that barrier.
3. Reuse [`lostAck`](../../../../packages/email-service/test/conformance/store-fixtures.ts) for both sides of each
   store seam; label this as simulated response loss, not a network failure. Pair it with the maintained real
   [Mongo interruption/failover fixture](email-04-mongoose.md#verification-and-limits) at selected boundaries.
   Prioritize late/missing marker ACK, an active provider followed by a failed finish ACK, same-operation winner
   confirmation, and recovery/takeover that cannot be overwritten. One unchanged replay of a terminal admission
   must not rerender or submit a second time. Use the worker's finish call boundary as the barrier for a result
   already captured before abort.
4. Retain the [07A Mongo admission duplicate/confirmation follow-up](email-07a-admission.md#07b--07c-continuation);
   that concrete adapter path was read but not modified in 07B. Do not infer real adapter acceptance from unit
   results. 07C should explicitly record real vs injected evidence and remaining gaps before completing EMAIL-07.

No credentials, raw data, temporary probes, generated files or runtime dependencies are archived here.
