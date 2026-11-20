# EMAIL-10 failure-boundary audit and operational evidence

Evidence for [EMAIL-10](../../../tasks/20261118-223259-email-service-package.md#email-10--complete-robustness-and-failure-boundary-coverage).
This reviews the [frozen V1 verification matrix](v1-contract.md#verification-matrix) and its underlying lifecycle and
I/O guards. Prior stages remain authoritative for their fixtures. EMAIL-10 adds evidence where a boundary previously
had only layer-local checks or lacked a pressure/race case; it does not change the public API, package wiring, or the
Nodemailer peer decision from [EMAIL-01](email-01-packaging.md).

## Audited boundaries

<!-- prettier-ignore -->
| Boundary | Maintained evidence and interpretation |
| --- | --- |
| Command identity, serialization, preparation and staging | The [template/codecs stage](email-02-templates.md#verification) covers both typed template kinds, canonical hash vectors (Unicode/numeric keys), malformed/oversized/proxy/accessor DTOs, per-field and aggregate byte bounds, deep mutation isolation, explicit file/loader errors, strict rendering, escaping, registry isolation and cache invalidation. [Admission](email-07a-admission.md#verification-and-limits) covers replay before callbacks, immutable policies, staged-scope/hash/provider checks, aging without refresh, competing preparations and replay after pruning. Crashes before an insert are modeled, not actual process death. |
| Admission uncertainty and batch | [Lifecycle fences](../../../../packages/email-service/test/lifecycle/fences.ts) exercise both sides of lost insert acknowledgements. [Mongo duplicate confirmation](email-07c-lifecycle.md#scoped-mongo-duplicate-confirmation-fix) observes a real `11000` and interrupted exact reads; one exact recheck only, no second insert. [Batch evidence](email-08-batch.md#verification) covers invalid requests with zero writes, stable tagged IDs, partial progress/reordering, abort/deadline, foreign scopes, no SendGrid `batch_id`, and worker/shared rate policy. A shared limiter is host-owned, not a package-distributed quota. |
| Claim, scheduling, lease time, expiry and cancellation | [Exact-clock conformance](../../../../packages/email-service/test/conformance/exact-clock-suite.ts) checks skew, due/expiry/lease equality, bounded retry delays and attempt exhaustion. The [shared store suite](../../../../packages/email-service/test/conformance/store-suite.ts) exercises active fences, competing claims, cancellation versus one-way mark, duplicate finishes, and cancel/recover/redrive eligibility. Mongo uses real primary time and guarded `$$NOW`, including when a planned marker reaches Mongo after expiry; equality vectors are deterministic memory tests, not simulated server time. |
| Claim, renewal and marker uncertainty | [Worker faults](email-07b-worker.md#maintained-evidence) and [both-store lifecycle fences](email-07c-lifecycle.md#maintained-scenarios) omit the write or discard its confirmed reply at each seam. A late, missing or unusable marker cannot authorize I/O even if another client sees `handed_off`. Pre-marker recovery is unsubmitted; a marker without a confirmed finalized outcome recovers as unknown, even if `submit` might never have started. Only a timely ACK plus local non-invocation proof can finish `launch_window_closed`. |
| Post-handoff evidence, finish and worker stop | [Worker evidence/budgets](email-07b-worker.md#maintained-evidence) cover malformed or thrown provider results, captured evidence versus late results after abort, independent finish grace, fenced same-operation retry and checked counters. [Real-adapter lifecycle](email-07c-lifecycle.md#maintained-scenarios) includes truncated `202` and post-DATA reset, provider timeout/shutdown with peer-observed socket closure, and an independent recovery winner that the old finish cannot overwrite. [Worker sweep tests](../../../../packages/email-service/test/unit/worker.test.ts) now discard confirmed recovery/queued-expiry replies and check zero invented items or provider calls, followed by independent progress. |
| Attachment/rate/resolver/source/observer work | [Worker preflight](../../../../packages/email-service/test/unit/worker-preflight.test.ts) checks sequential refs under one attachment deadline, missing/unavailable/throwing resolvers, exact copied bytes (length/hash/shared memory), mode mismatch, and deferrals/invalid or stalled rate policy. It now holds two timed-out items across runs and proves that settling one opens only that slot, without processing the late bytes. [Template deadlines](../../../../packages/email-service/test/unit/template-budget.test.ts), [file tests](../../../../packages/email-service/test/unit/local-files.test.ts) and [admin tests](../../../../packages/email-service/test/unit/admin.test.ts) cover stuck preparers/loaders, descriptor cleanup and one unresolved observer with no retry queue. |
| SMTP wire evidence | The [loopback SMTP suite](../../../../packages/email-service/test/smtp/smtp.test.ts) covers To/Cc/Bcc including Bcc-only, exact MIME/attachments, no file/URL inputs, TLS/auth and downgrade failures, SMTP 4xx/5xx and RCPT accounting, pre-/post-DATA disconnect, and real socket shutdown. New DATA reply pressure checks 16,384 versus 16,385 bytes with all lines within 512 bytes including CRLF. Partial acceptance cannot be automatically resubmitted. |
| SendGrid wire evidence | The [HTTPS suite](../../../../packages/email-service/test/sendgrid/https.test.ts) checks concurrent per-instance keys, exact JSON/template/envelope/Base64, sandbox versus live, status allowlist, `429` hints, ambiguous `5xx`, malformed/truncated/oversize frames, and abort/deadline with peer closure. The [profile](../../../../packages/email-service/test/sendgrid/profile.test.ts) and [retry hint](../../../../packages/email-service/test/sendgrid/retry-hint.test.ts) tests cover no-wire preflight, one-shot invocation, and capped/saturating floors. No synchronous recipient results. |
| Independent scopes and workers on a shared backend | The [scope lifecycle case](../../../../packages/email-service/test/lifecycle/scopes.ts) runs two independent registries, services and overlapping workers with the same key in scopes differing only by case. The HTTPS peer holds its response while the other worker commits/projects a complete SMTP `451` after DATA. A second client/worker then exhausts that job's two-attempt budget without rerendering. The other worker receives a **truncated** HTTPS `429` with a retry header: stored terminal `unknown`, no retry hint, no second POST or implicit failover. Independent admin queries see only their attempts. Exactly two full SMTP transactions and one HTTPS POST; both stores run the same case. |
| Mongo topology, uncertainty and actual interruption | [Readiness/command evidence](email-04-mongoose.md#verification-and-limits) includes real WiredTiger, unsupported standalone/nonjournaled configurations, index/validator conflicts, scoped bounded majority/linearizable reads and journaled majority writes. The [store uncertainty](../../../../packages/email-service/test/mongodb/uncertainty.test.ts), [worker killOp](../../../../packages/email-service/test/mongodb/lifecycle.test.ts) and [three-member election](../../../../packages/email-service/test/mongodb/failover.test.ts) are separate from lost-response injection. |
| Projection, observation and admin action ACKs | The [shared admin suite](../../../../packages/email-service/test/conformance/admin-suite.ts) covers failure between authoritative finish and projection, committed upsert before ACK, reply loss, stable redacted pages, overlapping projectors, observation and immutable redrive/dismiss history. [Unit admin tests](../../../../packages/email-service/test/unit/admin.test.ts) reject malformed filters, noncanonical/foreign cursors and incompatible or unredacted replies before exposing them. New before/after-commit cancellation and exact dismissal cases use the shared suite on memory and two Mongo clients. A missing reply stays `write_unconfirmed`; repeating the exact action confirms a single result/decision. |
| Retention and bounded work | [Exact-clock retention](../../../../packages/email-service/test/conformance/exact-clock-suite.ts) protects pending/unresolved state at equality. [Mongo retention](../../../../packages/email-service/test/mongodb/retention.test.ts) verifies expiry inside the activity write, drain, TTL stubs, partial purge replay and a stale deletion against a re-admitted identity. [Mongo admin pressure](../../../../packages/email-service/test/mongodb/admin.test.ts) and the full-ledger retention case measure actual commands and index work; limits below. No projector/cleanup can send mail. |
| Installed consumers/workspace | [Prior packaging](email-01-packaging.md#boundary-for-the-next-tasks) and [EMAIL-09](email-09-admin.md#verification) provide earlier ordinary tarball, peer-free import and minimum-Node evidence, not a new EMAIL-10 pass. Release-shaped and installed documentation verification, complete optional-peer coverage, and workspace activation are owned by [EMAIL-11](../../../tasks/20261118-223259-email-service-package.md#email-11--verify-installed-package-docs-and-workspace-integration). |

## What the pressure tests measure

- **Projection:** 19 pending jobs in one scope plus one in another. A limit-two admin run performs two indexed majority
  ID-only candidate reads (limit/batch size 16, single batch), two complete activity upserts and two confirmed ACKs.
  With 17 still pending in the target scope, a peer changes the revision before each CAS; the server really rejects
  all three CAS attempts. A requested limit of 100 still stops `contended` after one candidate read, three CAS
  submissions and no activity writes. The CAS trigger is injected; the conflicts and command limits are real.
- **Lookup:** 128 synthetic rows are seeded directly to get 120 same-millisecond complete activities, an older tail,
  out-of-window rows, a foreign scope with the same tuple, and an identity stub. Capture exact range commands,
  and independently execute their filter, sort, hint and limit with Mongo `explain('executionStats')` on the unchanged
  fixtures. Scoped pages use at most three commands, job pages at most two, no `getMore`, collection scan or
  blocking sort. For page sizes 100, 18 and 3, the measured complete-row totals are 101, 19 and 4 across all ranges
  (including lookahead). Each range examines at most its requested limit plus one index key and fetches only the
  returned docs. This is tested plan behavior for those indexed shapes, not a throughput/SLA or a snapshot guarantee.
- **Ledger and cleanup:** 10 ordinary claims plus one manual claim are recorded using the actual store with synthetic
  attempt outcomes. Mongo rejects a twelfth ledger entry at the validator (`121`). Project 3 then 8 and hold the
  payload until all are ACKed. After the real prune, shift the coherent terminal/permit timeline back by one day
  plus 120 seconds in the fixture, not the Mongo clock. During real purge the adapter reads each activity identity
  to pin the physical ID and again to confirm absence. The trace shows 22 scoped point reads, 11 exact
  single-document deletes by scoped tuple and physical ID in one activity command, then one fenced job delete.
  A row with the same job and attempt IDs in another scope remains readable. The aged fixture avoids waiting a day;
  it does not exercise a day's wall-clock operation.
- **Other work limits already maintained:** worker default 20 claims and 10 operations in each of its two sweeps,
  up to 100 each, at most 16 active/held item slots per worker (default 4); registry 8 slots by default, up to 32;
  admin steps sequential, default 20 and max 100; page default 25 and max 100; one observer in flight per admin.
  Memory has a shared job capacity of 256 by default (1–4,096). Mongo has 32 active calls per store instance and
  normal data primitives have a five-second driver budget plus explicit server command bounds. Page lookahead,
  per-primitive 16 candidate / 3 CAS caps, and the 60s permit plus 31s additional drain are separate from the worker's
  concurrency. The body and attachment tests maintain 16 KiB intent, 64 KiB prepared data, 1 MiB canonical snapshot,
  five refs of at most 2 MiB each / 5 MiB in total; SendGrid wire ceilings are 8 MiB request and 64 KiB response.
  See the [V1 budget table](v1-contract.md#worker-deadlines-and-errors) and
  [store rules](v1-contract.md#store-adapter-transaction-primitives) for elapsed-clock and time-margin assumptions.

## Two verified regressions fixed

1. A method-based thenable used to pass the fulfilled DTO to a native Promise resolver. That consulted the DTO's
   `then` getter before validation, even for a resolver settling after timeout, and deferred copying until after
   a synchronous fulfiller could mutate it. [Callback handling](../../../../packages/email-service/src/internal/callbacks.ts)
   now captures only the first raw fulfillment without assimilating untrusted DTOs, checks the budget before capture,
   and holds the slot until actual settlement. The [registry regression](../../../../packages/email-service/test/unit/registry.test.ts)
   rejects the accessor-bearing payload and proves mutation/repeated-fulfillment isolation; the worker slot test
   proves timeout fencing and bounded capacity. A host's own native Promise resolver still applies native
   assimilation before the package sees a value; the fix guards the package's data-method boundary, not JS
   executed by the host. No public callback type changed.
2. A complete live SendGrid `202` used to drop a message ID only if it exactly equaled the API key. An otherwise
   valid token containing the same credential as a substring was returned. The
   [response classifier](../../../../packages/email-service/src/providers/sendgrid/response.ts) now omits that optional
   ID but preserves acceptance. The real HTTPS case verifies this with a synthetic credential. This is not general
   redaction of arbitrary encoded secrets or host-chosen correlation values.

## Evidence strength and operating limits

- SMTP TCP (including real RST), TLS negotiation, SMTP replies/MIME, SendGrid HTTPS request framing, truncated
  responses and peer-observed close are real isolated loopback interactions with a synthetic CA. SendGrid DNS/port
  routing and test trust are redirected at its private fixture seam; no SendGrid account, external service, routed
  mail, inbox delivery, or remote-template version pinning is tested. Provider socket destruction cannot recall bytes
  already sent; missing positive evidence after handoff is not nonacceptance.
- MongoDB uses fresh WiredTiger replica sets and two independent caller connections in one test process. There
  is genuine pre-update `killOp` (`11601`), an active driver abort/socket close, a server command time limit (`50`),
  and a three-member primary stepdown/new primary. Claims on a one-member set are not failover tests; the election
  case has no provider call. Omitting a write, suppressing its response at the store/driver boundary after commit,
  a held response/late callback, simulated wall/monotonic divergence, and stale/forged port data are controlled
  injections. They are not a post-commit TCP ACK drop, simultaneous backend and provider outage, process/host crash,
  partition, power-loss durability, cross-host clock skew, or production performance evidence.
- Unsupported: weaker/unready/sharded Mongo paths, noncooperating store/provider I/O, untrusted template/helper
  execution, process-distributed memory queues, and implicit provider failover. Ordinary package-owned provider I/O is
  aborted/closed; cancellation cannot preempt arbitrary trusted synchronous JS or some OS calls. Host callbacks that
  ignore abort occupy a slot until settlement; code started by the host outside its callback return value is not
  supervised. A custom store that fabricates plausible grants is outside the trust boundary; a custom provider
  that bypasses preflight/abort cannot inherit the built-in transport guarantees.

For an unconfirmed admission, replay the same scope/key/intent; do not create a replacement key. For an unconfirmed
claim, renewal or marker, do not submit from a later read—let the lease recover. `unconfirmed` in a run is not a stored
result: use the authoritative scoped job summary and allow recovery to establish the outcome; idempotent finish is a
store-operation retry, never a second provider call. Retry a cancellation/resolution only as the exact scoped action.
Treat `accepted`, `partially_accepted` and sandbox `validated` as distinct submission results, not delivery. Explicit
redrive of `unknown` requests one more attempt and risks duplication; quiesce stale workers before authorizing it.
Run reconciliation and cleanup separately from delivery and never re-enqueue to repair an absent activity. Keep queue,
outbox and backups restricted, and keep provider credentials, recipient data and payloads out of identifiers,
correlation and tracing.

## Reproduce the package checks

Toolchain: Node 26.12.1, pnpm 11.24.0, TypeScript 6.0.3, tsup 8.5.1, Vitest 4.1.12, Prettier 4.0.0-alpha.13
and ESLint 10.12.0. Integrations: Handlebars 4.7.10, Nodemailer 10.6.0, Mongoose 9.12.2, MongoDB Node driver
7.8.0, `mongodb-memory-server` 11.3.0, MongoDB 8.2.6 WiredTiger, OpenSSL CLI 3.0.13, and Node TLS linked
against OpenSSL 3.5.9.

The serial sequence passed typecheck, build, 228 unit tests (19 files), 27 memory lifecycle tests (1 file),
51 SMTP tests (1 file), and 91 SendGrid tests (3 files), all unfiltered. A process check immediately before
the sole package build found no competing `tsup` or Vitest writer. The combined execution's five-minute outer
watchdog stopped the first MongoDB invocation before a result; it does not count as a pass. A subsequent unfiltered
`pnpm --filter @web-ts-toolkit/email-service test:mongodb --reporter=verbose --no-color` in a fresh, verified ignored
`TMPDIR` and with a separate 540-second outer watchdog passed **95 tests in 7 files** in 297.90 seconds on MongoDB
8.2.6, including the real three-member election. No skipped tests in any of the five full suites (492 passing tests).
The Mongo test/hook timeouts were unchanged. Changed-path formatting, ESLint, whitespace, links/anchors, artifact
privacy and nonignored destinations passed.

From `<repo-root>` (replace placeholders before running), with existing dependency installs and a prepared
MongoDB 8.2.6 binary for the local platform. Do not use a shared application database or run another build
against this package's `dist`:

```sh
export TMPDIR="$(mktemp -d '<repo-root>/_tmp-email-10-repro-XXXXXX')"
git check-ignore -- "$TMPDIR"
export MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false
export MONGOMS_SYSTEM_BINARY='<absolute path to prepared mongod 8.2.6>'
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service build:package
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service test:lifecycle
pnpm --filter @web-ts-toolkit/email-service test:smtp
pnpm --filter @web-ts-toolkit/email-service test:sendgrid
pnpm --filter @web-ts-toolkit/email-service test:mongodb
```

Changed-path formatting and lint commands (Bash):

```sh
base=packages/email-service
task=docs/tasks/20261118-223259-email-service-package.md
report=docs/task-artifacts/email-service/20261118-223259-email-service-package/email-10-robustness.md
code=(
  "$base"/src/{internal/callbacks,providers/sendgrid/response}.ts
  "$base"/test/unit/{registry,worker,worker-preflight}.test.ts
  "$base"/test/conformance/admin-suite.ts
  "$base"/test/lifecycle/{fixture,memory.test,scopes}.ts
  "$base"/test/mongodb/{admin,lifecycle,retention}.test.ts
  "$base"/test/{smtp/smtp,sendgrid/https}.test.ts
)
pnpm exec prettier --check "${code[@]}" "$task" "$report"
pnpm exec eslint --max-warnings=0 "${code[@]}"
```

Also check `git diff --check -- "$task"` (tracked change), `git diff --no-index --check /dev/null <file>` for each
untracked changed file, and local links/anchors, nonignored destinations and privacy. No root validators,
root build/test/lint scripts, installed/release consumer, publication, commits, CI or live mail.

The fixture inputs are maintained synthetic repository code; there are no imported third-party test fixtures.
No raw test logs, network captures, DB data, generated keys, binaries, builds, installed dependencies, consumers or
scratch trees are archived. Reproduction requires the toolchain and prepared Mongo binary, not a prior scratch path.
