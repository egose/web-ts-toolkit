# EMAIL-09 admin, result history and retention

Evidence for [EMAIL-09](../../../tasks/20261118-223259-email-service-package.md#email-09--implement-result-history-and-reconciliation).
The [V1 admin contract](v1-contract.md#admin-activity-projection-and-retention) and
[EMAIL-08 handoff](email-08-batch.md#continuation-for-email-09) are unchanged. No results are inferred from
the reported launch error preceding this implementation.

## Public boundary

- The root named [`createEmailAdmin`](../../../../packages/email-service/src/admin.ts) binds one scope
  to a caller-ready `EmailStore`. It has no dependency on a provider, worker, renderer or batch report.
  `getJob` reads the authoritative latest attempt even if no activity exists yet. Cancellation and
  resolution call the exact scoped mutations; they never contact a provider. Dismissal leaves the
  unknown result intact. Redrive explicitly requeues the same eligible job for one manual claim by a
  future worker, with a literal duplicate-risk acknowledgement. It neither launches work nor changes
  the old history. After an unconfirmed action, check the job or repeat the exact same action.
- The [activity codec](../../../../packages/email-service/src/internal/activity-codecs.ts) validates
  selectors and canonical, scope/filter-bound cursors before I/O. It also checks the adapter's reply
  for bounded size, ordering, tuple/filters and redacted shape, then returns frozen copies. Pages are
  not snapshots. An already committed complete activity is visible even before its ledger ACK;
  expired-permit identity stubs are never returned. Recipient indexes and normalized submission
  evidence are not delivery receipts. Correlation and IDs must not contain host secrets or PII.
- Each reconciliation step reserves at most one pending attempt, requires confirmed complete
  presence, and then ACKs that digest. A `permit_expired` put consumes a step; a `stale` ACK stops
  as `contended`. An `already_acknowledged` result counts as a confirmed ACK but only a new
  confirmed ACK can notify the observer. One unresolved observer per admin is allowed; later events
  are skipped, not queued or retried. Throws and rejections do not affect storage or retry decisions.
  Observer delivery is best effort, not durable, and synchronous in-process code cannot be preempted.
- `reconcile` and `cleanup` cap sequential steps at 20 by default (1–100). All admin calls share one
  elapsed budget per call, with a five-second cap per store primitive. An invoked store mutation
  is allowed to settle; late or missing evidence is not a confirmed step. Custom stores must honor
  the passed abort signal and timeout. Cleanup delegates the existing protected prune, retirement,
  and activity-before-identity purge; no retention policy, schema, or backend semantics changed.
  The host schedules maintenance independently of delivery.

The [shipped README](../../../../packages/email-service/README.md#inspect-results-and-maintain-history)
and public declarations document these limits. No dependency, peer, package script or entrypoint
was added beyond the named root factory.

## Verification

Package-only checks on 2026-11-20 used Node 26.12.1, pnpm 11.24.0, npm 11.20.0, TypeScript 6.0.3,
Vitest 4.1.12 and tsup 8.5.1. Mongo used a cached 8.2.6 WiredTiger binary via
`mongodb-memory-server` 11.3.0, Mongoose 9.12.2 and MongoDB driver 7.8.0. Existing loopback lifecycle
fixtures used Nodemailer 10.6.0 and OpenSSL 3.0.13.

- **Typecheck, build and changed-path checks:** passed. Emitted ESM/CJS and both declaration
  conditions expose the named admin factory and public contracts without optional peers or the
  internal test clock seam. Targeted ESLint, Prettier, whitespace and evidence links were checked.
- **Unit:** 222 tests across 19 files passed. The new
  [memory admin](../../../../packages/email-service/test/unit/admin.test.ts) and
  [timing](../../../../packages/email-service/test/unit/admin-budget.test.ts) cases exercise
  malformed requests and replies, sequential/callback bounds, elapsed deadlines, confirmed
  progress under cancellation, expired permits, and exact retention and drain boundaries.
- **Memory lifecycle:** 26 tests passed using the existing isolated SMTP and HTTPS peers.
- **MongoDB:** 89 tests across 7 files passed; the focused admin and retention rerun passed all 11
  tests. The [shared admin suite](../../../../packages/email-service/test/conformance/admin-suite.ts)
  uses two independent connections in the durable lane, confirms visibility before ACK and one
  activity under competing projectors, preserves unknown/partial recipient evidence, and tests
  cancellation, one manual redrive and immutable history. Upsert/ACK response-loss cases are
  store-seam injections after real writes, not dropped TCP responses. A counted synthetic provider
  verifies that projection, cleanup and observation never cause a second submission.
  The [Mongo retention suite](../../../../packages/email-service/test/mongodb/retention.test.ts)
  exercises real server-time expiry and late upsert, shadows one successful delete response at
  the driver seam, and verifies the identity guard survives partial purge. Its aged synthetic
  rows avoid a day-long wait; Mongo uses its real clock. The full lane also includes the existing
  replica failover, interruption and loopback worker cases.
- **Ordinary installed tarball:** passed offline on Node 26.12.1 and 24.0.0 (one test each).
  The fixture checks strict NodeNext ESM/CJS and bundler declarations with no optional peers
  at the root, installs exact peer floors separately, and calls admin methods over the other
  module format's store without a mail provider.

Run from `<repo-root>` with a fresh ignored scratch directory and prepared local binaries:

```sh
export TMPDIR='<repo-root>/_tmp-email-09-repro'
mkdir "$TMPDIR"
git check-ignore -- "$TMPDIR"
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service test:lifecycle

export MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false
export MONGOMS_SYSTEM_BINARY='<absolute path to cached mongod 8.2.6>'
pnpm --filter @web-ts-toolkit/email-service test:mongodb
pnpm --filter @web-ts-toolkit/email-service build:package
PNPM_CONFIG_OFFLINE=true pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
PNPM_CONFIG_OFFLINE=true EMAIL_SERVICE_CONSUMER_NODE='<absolute path to cached Node 24.0.0>' \
  pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
```

No live mail, standalone provider lanes, release-shaped tarball, workspace checks, CI changes,
commits or EMAIL-10 implementation. The maintained fixtures are synthetic. Raw logs, disposable
formatting probes, dependencies, binaries, database files, tarballs and generated consumers are
not archived; reproducing the offline checks needs the prepared toolchain and dependency cache.
