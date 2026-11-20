# EMAIL-08 batch verification and EMAIL-09 handoff

Evidence for [EMAIL-08](../../../tasks/20261118-223259-email-service-package.md#email-08--export-batch-service).
The [V1 batch contract](v1-contract.md#admission-staging-and-batches) is unchanged. The implementation,
tests and README example were present in the checkout when this verification resumed. All passes below are
from fresh runs; no result from the interrupted attempt is assumed.

## Implementation review

- The root named `createEmailBatchService` and its public types compose an admission service and a worker
  with the same scope. The host must wire them to the same underlying store. The
  [facade](../../../../packages/email-service/src/batch.ts) validates all 1–100 envelopes, including static
  command metadata and unique item IDs, before the first lookup or preparation. Only opaque business input
  stays by reference. Admission is in input order and is not atomic across items.
- A local service reuses the [07A parsed admission path](email-07a-admission.md#08-batch-reuse) and the one
  batch budget. The tagged key is scoped by batch and item ID, not array position. Replay of the same intent
  returns a committed job's current redacted summary; it does not prepare again or reopen a terminal job.
  An independent item failure does not roll back prior items. After an abort/deadline, later items are
  `not_started`; an in-flight write can still have a confirmed result or be `write_unconfirmed`. Retry
  uncertainty under the same IDs and intent, within the identity guard's retention window.
- For a structural service or another loaded build, the fallback calls public `enqueue` with the detached
  command, the remaining time clamped to that API's 50–60,000 ms range, and the original batch signal.
  The signal can stop work below the override floor. It waits for settlement rather than abandoning an
  invoked write. Cooperative cancellation and timely I/O settlement are requirements of the supplied
  service, not guarantees the facade can impose on arbitrary host code. The facade validates and copies
  successful replies, including scope and command metadata; it relies on the service to have checked
  the durable fingerprint. Malformed replies or unknown errors become `write_unconfirmed`, not proof of
  noncommit. Only allowlisted codes and redacted job summaries reach admission results, not the raw reply,
  exception, intent, or snapshot. As elsewhere, caller-supplied identifiers and correlation must not
  contain secrets or personal data.
- `run` calls the same worker, with its clock, work limits, rate policy, finish grace, and shutdown behavior.
  It is scope-wide, not a batch filter or a second delivery loop. The built-in worker reports fixed codes,
  opaque IDs and counters, not provider replies, payloads or fence tokens. A custom worker is a trusted
  dependency: its report and errors are forwarded unchanged, not sanitized or remapped by the batch.
  `worker.shutdown()` stops runs, not parallel admission; pass a separate admission signal.
  The [shipped README](../../../../packages/email-service/README.md#enqueue-and-resume-a-batch) now states
  these boundaries. The review found no runtime regression requiring a change.

## Verification

Serial package-only runs on 2026-11-20. Host: Node 26.12.1, pnpm 11.24.0, npm 11.20.0, TypeScript 6.0.3,
Vitest 4.1.12 and tsup 8.5.1. Test integrations: OpenSSL 3.0.13, Nodemailer 10.6.0, Handlebars 4.7.10,
Mongoose 9.12.2 with MongoDB driver 7.8.0, and `mongodb-memory-server` 11.3.0.

- **Package typecheck:** passed, including per-template command inference and readonly/redacted batch result checks.
- **Unit:** 202 tests (17 files) passed; 24 batch cases cover prechecks, ordering and bounds, partial progress and
  replay, abort/deadline and lost-ACK classification, defensive admission DTO decoding, and worker counters and limits.
- **Memory lifecycle:** 26 tests (1 file) passed, including the mixed-provider batch on the real single-process store.
- **Mongo lifecycle and store:** 83 tests (6 files) passed on isolated MongoDB 8.2.6 WiredTiger replica sets, including
  the shared batch scenario with two independent Mongoose clients. Existing Mongo interruption and failover cases also
  ran; those are not batch-specific faults.
- **Package build:** passed; root ESM/CJS and both declarations expose the named factory and batch types, not internal
  clock or admission seams. No new entrypoint or peer.
- **Installed ordinary tarball:** one passing test on each of Node 26.12.1 and Node 24.0.0. The fixture installs with
  no peers, Mongoose 9.12.2 alone, and Nodemailer 10.6.0 alone; checks strict NodeNext ESM/CJS and bundler declarations,
  runtime entrypoints and the peer-free root; and runs batch admission/replay in both ESM/CJS mixing directions.
  Node 24 was used for installed runtime/type fixtures, not the Mongo or lifecycle lanes.
- **Changed paths:** targeted ESLint and Prettier, whitespace (including new files), local evidence links and
  nonignored destinations passed.

The [shared lifecycle batch case](../../../../packages/email-service/test/lifecycle/batches.ts) injects one
noncommit at the store seam, not on the Mongo wire. The first worker submits two batch items and one unrelated
same-scope job; the second worker admits and submits only the missing item when the list is reordered. Peer
reads check stable terminal jobs, the scheduled item, and a different scope. Loopback peers verify unchanged
SMTP To/Cc/Bcc and SendGrid personalization, no local `batch_id` on the wire, and exactly two observed
submissions of each kind across the scenario (including the unrelated SMTP job). The shared limiter fixture
observes calls from both workers; it does not establish a distributed quota. Batch unit tests exercise abort,
deadline and persistence-count reporting; actual peer-observed shutdown/deadline I/O closure is exercised by
the existing worker lifecycle cases in the same lanes, not by an injected custom batch service.

From `<repo-root>`, using a fresh verified ignored directory and prepared local binaries:

```sh
export TMPDIR='<repo-root>/_tmp-email-08-repro'
mkdir "$TMPDIR"
git check-ignore -- "$TMPDIR"
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service test:lifecycle

export MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false
export MONGOMS_SYSTEM_BINARY='<absolute path to prepared mongod 8.2.6>'
pnpm --filter @web-ts-toolkit/email-service test:mongodb
pnpm --filter @web-ts-toolkit/email-service build:package
pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
EMAIL_SERVICE_CONSUMER_NODE='<absolute path to Node 24.0.0>' pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
```

No skipped tests in the listed lanes. No standalone provider lanes rerun, live mail, release-shaped tarball,
additional peer/runtime combinations, workspace suites/build/lint, or CI. The installed fixtures do not run
against real Mongo or submit mail. The maintained fixtures and commands are the reproduction inputs; no raw
logs, binaries, database contents, dependencies, tarballs or generated consumers are archived. The reviewed
scratch directory held only disposable Node compile cache at handoff.

## Continuation for EMAIL-09

- Start from the [V1 admin, activity and retention contract](v1-contract.md#admin-activity-projection-and-retention)
  and the [memory](email-03-store.md) and [Mongoose](email-04-mongoose.md#next-phase) store handoffs.
  The [store port](../../../../packages/email-service/src/contracts/store.ts) already has the scoped
  `reserveProjection`, `putActivity`, `ackProjection`, `listActivities` and `cleanupNext` primitives.
  No new ledger or delivery work is needed to reconcile a result.
- The authoritative fenced attempt is committed by the worker before projection. Admission and run reports
  summarize only their call, and `unconfirmed` in a run is not a stored `unknown`. Reconcile from the ledger
  through the existing store primitives, not from a batch report. Keep projection or observer failure
  independent of acceptance and retry decisions; do not rerun delivery to produce an activity. Batch IDs
  remain admission identity, not a new activity or campaign lifecycle.
- EMAIL-09 remains pending. This checkpoint establishes neither a public admin factory nor end-to-end
  admin query, observer, or reconciliation behavior.
