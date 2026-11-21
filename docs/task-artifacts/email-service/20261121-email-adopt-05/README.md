# EMAIL-ADOPT-05 implementation handoff

Implementation for [EMAIL-ADOPT-05](../../../tasks/20261121-022138-email-service-cross-project-adoption.md#email-adopt-05--support-batch-producers-and-outbox-relays-without-delivery-dependencies) on `39848121` plus the shared EMAIL-ADOPT-01–04 changes. Task status and completion links remain with the coordinator.

## Public API

Both factories are [named root exports](../../../../packages/email-service/src/index.ts) in ESM and CommonJS. The [public contracts](../../../../packages/email-service/src/contracts/service.ts) expose:

- `createEmailBatchAdmission<T>(options: EmailBatchAdmissionOptions<T>): EmailBatchAdmission<T>` takes `{ service, smtpCapacity? }`. The bound service can be a regular `EmailService<T>` or a structural port with `scope`, `enqueue`, and `smtpCapacity` for opt-in. The returned object exposes only `enqueueBatch`. The producer still needs template preparation on an admission miss, not a worker or a delivery profile.
- `createEmailRelay(options: EmailRelayOptions): EmailRelay` takes `{ scope, store, smtpCapacity?, retry?, retention? }`. The store may be a full `EmailStore` or a port with `findAdmission`, `insert`, and `smtpCapacity` for opt-in. The host readies the underlying store. The returned object exposes only `enqueuePrepared`; there is no registry, worker, or credential option.

The existing service and combined batch factory signatures are unchanged. The combined factory validates the worker's scope and binding, not whether two arbitrary store ports share a backing. The [installed README](../../../../packages/email-service/README.md) uses one ready memory store for both the service and worker. `batch.run()` still runs the configured worker across the whole scope, including unrelated jobs. Worker activation rules, persisted formats, and dependencies are unchanged.

## Semantics and coverage

- Both batch factories use the [same batch admission handler](../../../../packages/email-service/src/batch.ts). It validates 1–100 items up front and processes them in order under one budget (30 seconds by default; 50–120,000 ms override). Wrapped or cross-build services get a 50–60,000 ms clamped timeout plus the batch's original signal, which can expire sooner. An opted-in facade still accepts one in-flight batch. Work already dispatched can commit after cancellation, so `write_unconfirmed` must be retried with the same batch/item IDs and intent, not a new key.
- Both `enqueuePrepared` surfaces use the [same scoped store admission code](../../../../packages/email-service/src/service.ts). The command and hashes are validated against the configured scope and binding before the read. Exact-key replay precedes store freshness checks; a miss cannot insert an expired stage. The whole-call default is 10 seconds (50–60,000 ms override), with a 5-second ceiling per store primitive and four concurrent admissions per opted-in relay instance. An uncertain insert can only be confirmed by reading the same key; retry the persisted snapshot unchanged.
- The [unit cases](../../../../packages/email-service/test/unit/admission-only.test.ts) check scope/binding drift, including an opted-in service, the one-in-flight batch limit, serialized foreign stage and hash rejection before store I/O, exact-key confirmation after a committed write loses its ACK, and replay at expiry versus rejection on a miss. The [source type fixture](../../../../packages/email-service/test/unit/template-types.ts) checks existing factory `ReturnType`, inference and excess-property behavior, and the two narrower surfaces.
- The [no-peer installed runtime fixture](../../../../packages/email-service/test/packed-consumer/fixtures/admission-runtime.mjs) runs both ESM/CJS directions, with and without SMTP capacity opt-in. It calls the mixed-build service directly and through a narrow wrapper. For both new routes, it injects a postcommit lost ACK with an aborted confirmation budget, then verifies the retained job ID on same-key replay without a second insert. The existing scope-wide lifecycle and packed combined tests are unchanged.

## Serial verification

Node 26.12.1, pnpm 11.24.0, and TypeScript 6.0.3. Run each script as `pnpm --filter @web-ts-toolkit/email-service <script>` with a fresh, short, verified-ignored repository-local `TMPDIR`.

- `typecheck`: Passed.
- `test:unit`: 238 passed in 20 files.
- `test:lifecycle`: 34 passed in 3 files.
- `build`: Passed; the new names and JSDoc are present in both declaration formats.
- `test:packed-consumer`: 12 passed, none skipped. Ordinary and flattened-release tarballs each passed four optional-peer profiles, with strict NodeNext ESM/CJS and Bundler ESM fixtures. All 16 installed README examples compiled per tarball with both peers; the core examples also compiled and ran without peers.

The packed lane used the warm pnpm store (`EMAIL_SERVICE_CONSUMER_OFFLINE=1`) and disposable loopback replica sets from a local MongoDB 8.2.6 executable (`MONGOMS_SYSTEM_BINARY`, `MONGOMS_VERSION=8.2.6`, `MONGOMS_RUNTIME_DOWNLOAD=false`). Repository lint, targeted formatting, handoff link checks, and `git diff --check` passed.

The standalone SMTP, SendGrid, and MongoDB lanes and other Node versions are outside this verification. No live mail was sent. Raw logs, tarballs, dependencies, and database files are omitted; the linked maintained fixtures are the reproduction inputs.
