# EMAIL-ADOPT-07 implementation handoff

Implementation for [EMAIL-ADOPT-07](../../../tasks/20261121-022138-email-service-cross-project-adoption.md#email-adopt-07--reject-unsendable-smtp-attachment-types-before-new-admission) on `39848121` plus the shared EMAIL-ADOPT-01–06 changes. Task status stays with the coordinator.

## Behavior and migration

- One [SMTP-only ref check](../../../../packages/email-service/src/internal/smtp-attachments.ts) rejects validated `message/*` and `multipart/*` refs with `invalid_snapshot`. The [registry](../../../../packages/email-service/src/templates/registry.ts) runs it before rendering. The [shared service/relay insert path](../../../../packages/email-service/src/service.ts) runs it on a validated, scoped miss before calling any store insert, including for injected registry output.
- The [shared new-job transition](../../../../packages/email-service/src/internal/job-transitions.ts) also protects direct inserts into the bundled stores, after their scope, binding, duplicate and job-ID checks. Freshness guards remain in place. The [SMTP composer](../../../../packages/email-service/src/providers/smtp/mime.ts) uses the same rule in direct preflight.
- No historical codec, hash, DTO version, Mongo catalog, or worker change. Retained exact-key matches still return their original row's current summary; conflicting intent still fails. The declarations describe old staged misses and retained replay. The [installed README](../../../../packages/email-service/README.md#stage-a-host-owned-outbox) adds migration guidance: rejection on a miss does not disprove an earlier uncertain commit. Existing SendGrid mapping and ordinary SMTP leaf parts are unchanged.

## Reproduction and regression coverage

The focused tests ran first with the shared pre-fix runtime sources unchanged. With the `smtp-attachment-admission` file filter, the [unit](../../../../packages/email-service/test/unit/smtp-attachment-admission.test.ts) file had 24 expected failures and 3 passes: both queue modes prepared or inserted the two composite types instead of rejecting them, while retained-key and SendGrid controls passed. The [Mongo](../../../../packages/email-service/test/mongodb/smtp-attachment-admission.test.ts) file had 2 expected failures: both lanes read and replayed the retained row, then incorrectly enqueued a staged miss in another scope. The focused [direct SMTP](../../../../packages/email-service/test/smtp/smtp.test.ts) (`-t 'validates snapshot/profile/IDs'`) and [SendGrid wire](../../../../packages/email-service/test/sendgrid/https.test.ts) (`-t 'keeps two concurrent profiles'`) controls passed on baseline (one selected test each).

After the fix, the focused files passed all 27 unit and 2 Mongo tests. The unit tests verify no rendering for bad newly prepared refs, no insert port call for any of the service/relay routes, no new row from a raw insert, leaf admission and unchanged replay precedence. The Mongo tests use the maintained logical transition and BSON mapper to seed an exact historical shape in each isolated fixture database: a settled expired job with its original composite ref and recomputed snapshot hash still present. This is test-only DML; there's no production migration or old-build dependency. Both queue modes read the old payload-bearing row, replay it with `enqueue` and both `enqueuePrepared` APIs, and preserve conflict, scope, binding, hash and duplicate checks. Driver traces show a single scoped exact-key read and no write on the staged miss, and two further queue reads and no write when calling the raw store primitive. The only row is the unchanged legacy document.

## Serial verification

Node 26.12.1, pnpm 11.24.0, TypeScript 6.0.3, Vitest 4.1.12, Nodemailer 10.6.0, Mongoose 9.12.2 (MongoDB driver 7.8.0), and `mongodb-memory-server` 11.3.0 with a local MongoDB 8.2.6 binary. Run from the repository root with a fresh ignored checkout-local `TMPDIR`, `MONGOMS_SYSTEM_BINARY` pointing to that executable, `MONGOMS_VERSION=8.2.6`, and `MONGOMS_RUNTIME_DOWNLOAD=false`.

Run each script as `pnpm --filter @web-ts-toolkit/email-service <script>`:

- `typecheck`: passed.
- `test:unit`: 267 passed in 21 files.
- `test:lifecycle`: 34 passed in 3 files.
- `test:smtp`: 65 passed in 2 files; 2 opt-in implicit TLS timing scenarios (25 ms and 50 ms synthetic replies) were skipped without `SMTP_CAPACITY_TIMING=1`.
- `test:sendgrid`: 91 passed in 3 files.
- `test:mongodb`: 103 passed in 9 files (395.49 s) on disposable MongoDB 8.2.6, including the two retained-row tests and the existing three-member failover test.
- `build`: passed; attachment and replay JSDoc is present in both emitted declaration formats. `npm pack --dry-run --offline` contained 22 expected files, including all four entrypoints, declaration chunks and README, with no fixtures.

The initial combined command hit a 480-second outer timeout during the Mongo lane before a result. It does not count as a pass. The successful standalone rerun used `test:mongodb --reporter=verbose`, a second fresh ignored `TMPDIR`, and a 1,200-second outer timeout; no test or hook budgets changed.

Repository `pnpm lint`, touched-file formatting, handoff links, and `git diff --check` passed. The packed-consumer matrix and other Node versions were not rerun. No live mail was sent. Raw logs, generated builds, binaries, and database files are omitted; use the maintained fixtures linked above to reproduce the checks.
