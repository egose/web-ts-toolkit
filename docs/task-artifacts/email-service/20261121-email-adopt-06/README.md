# EMAIL-ADOPT-06 implementation handoff

Implementation for [EMAIL-ADOPT-06](../../../tasks/20261121-022138-email-service-cross-project-adoption.md#email-adopt-06--reject-delivery-workers-with-no-configured-providers) on `39848121` plus the shared EMAIL-ADOPT-01–05 changes. Task status stays with the coordinator.

## Behavior and migration

[`createEmailWorker`](../../../../packages/email-service/src/worker.ts) throws `invalid_config` synchronously for `providers: []` before claiming, invoking a store or provider method, scheduling a timer, or opening a connection. The [profile validator](../../../../packages/email-service/src/internal/worker-config.ts) already did this for `smtp-v2`; the same check now applies to default V1. [`EmailWorkerOptions.providers`](../../../../packages/email-service/src/contracts/worker.ts) stays a readonly array so callers can pass dynamically assembled profiles.

The [shipped README](../../../../packages/email-service/README.md#run-a-worker) and factory JSDoc point enqueue-only batches to `createEmailBatchAdmission({ service })` (include the matching `smtpCapacity` if opted in) and prepared outbox relays to `createEmailRelay` in the README. No persisted change, profile-filtered claiming, or profile substitution. Nonempty fleets must still share all exact kind/key/mode matches and required resolvers for their scope.

## Regression and fixture audit

- [Worker unit regression](../../../../packages/email-service/test/unit/worker.test.ts): with a due job in each ready memory queue mode, empty construction throws the stable code. Store and timer spies stay silent and the job summary is unchanged. A correctly configured synthetic SMTP worker then accepts that same job with one claim and one submission; a second run is idle. Before the fix, the focused run failed on V1 (did not throw) and passed for `smtp-v2`.
- [Unit batch fixtures](../../../../packages/email-service/test/unit/batch-fixture.ts) and [budget tests](../../../../packages/email-service/test/unit/batch-budget.test.ts) now use the batch-admission path with the internal manual-clock seam. Enqueue-only structural replies and [the foreign-scope lifecycle producer](../../../../packages/email-service/test/lifecycle/batches.ts) also use admission without a worker. Combined unit and lifecycle tests still exercise configured workers.
- [Mixed ESM/CJS fixture](../../../../packages/email-service/test/packed-consumer/fixtures/batch-runtime.mjs): no-peer producer admission and replay in both directions, V1 empty construction rejection with the job unchanged, then combined enqueue and one successful synthetic submission. The installed runtime guard prohibits mail connections. [Packed declaration checks](../../../../packages/email-service/test/packed-consumer/packaging.test.mjs) require the new worker documentation in both formats.
- After searching source, fixtures and docs, active `providers: []` uses are deliberate negatives: the worker regression, mixed packed runtime, and existing SMTP-capacity negative. The service unit and type fixtures reject `providers` as an extra option rather than constructing workers. The README describes migration; baseline review/task notes remain historical.

## Serial verification

Node 26.12.1, pnpm 11.24.0, TypeScript 6.0.3. Run the scripts below in order as `pnpm --filter @web-ts-toolkit/email-service <script>` with a fresh, verified-ignored repo-local `TMPDIR`.

- `typecheck`: passed.
- `test:unit`: 240 passed in 20 files.
- `test:lifecycle`: 34 passed in 3 files.
- `build`: passed; the migration note and unchanged readonly array type are visible in both declaration formats.
- `test:packed-consumer`: 12 passed, none skipped. Ordinary and flattened-release tarballs passed all four peer profiles and the installed README checks. Used the warm pnpm store with `EMAIL_SERVICE_CONSUMER_OFFLINE=1` and disposable loopback replica sets with `MONGOMS_SYSTEM_BINARY` pointing to a local MongoDB 8.2.6 executable, `MONGOMS_VERSION=8.2.6`, and `MONGOMS_RUNTIME_DOWNLOAD=false`.

Repository lint, targeted formatting, handoff links, and `git diff --check` passed. No live mail was sent. Standalone SMTP, SendGrid, and MongoDB lanes and other Node versions were not run. Raw logs, packed artifacts, dependencies, and database files are omitted; use the linked maintained fixtures to reproduce the checks.
