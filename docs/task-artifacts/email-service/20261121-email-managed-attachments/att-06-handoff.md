# ATT-06 — Mixed managed attachment delivery

The standalone `test:managed-delivery` lane runs five maintained scenarios in
[`delivery.test.ts`](../../../../packages/email-service/test/managed-delivery/delivery.test.ts).
It uses the source entries from ATT-01–05. No product source, public exports, dependencies, README,
canonical package runner, or CI workflow changed. The unit and lifecycle lanes do not start these fixtures.

## What reached the wire

The fixture starts a real MongoDB replica set for both the queue and a separate BSON attachment collection,
plus pinned SeaweedFS and Azurite. Queue writer and peer use separate Mongoose connections. Each managed
binding has separate producer and reader instances; SeaweedFS uses the fixture reader identity and Azurite uses
distinct `rw` and `r` SAS clients built with `createAzureAttachmentContainerClient` (see
[ATT-05](att-05-handoff.md#api-for-att-06-and-att-07)). The worker registry has the host's project resolver
beside the managed resolvers. Producer and worker roles are independent instances in one test process; the
suite is not a production IAM or multi-process qualification.

| Scenario                                                               | Producer PUT/insert attempts (Mongo / SeaweedFS / Azure)                | Worker resolver calls (Mongo / SeaweedFS / Azure / project) | Provider wire                                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Scheduled capacity SMTP, delayed outbox and uncertain admission        | 1 / 1 / 0                                                               | 1 / 1 / 0 / 1                                               | One complete MIME DATA, 51 RCPTs (49 To, 1 Cc, 1 Bcc)                         |
| SendGrid V1, same logical identities and different bytes in two scopes | 2 / 2 / 2                                                               | 2 / 2 / 2 / 2                                               | Two TLS POSTs, each with all four attachments, including a Unicode filename   |
| Shared files, queue payload prune, distinct orphan purge and redrive   | 1 / 3 / 0; one of the three is an explicit same-input PUT returning 412 | 3 / 3 / 0 / 3                                               | Three complete SMTP DATA captures, including one with a truncated final reply |
| Removed Azure bytes                                                    | 1 / 1 / 1                                                               | 1 / 0 / 1 / 0; Azure GET returned 404                       | No provider preparation, DNS, connection, or POST                             |
| Short expiry with longer shared file hold                              | 1 / 1 / 0                                                               | 2 / 2 / 0 / 2                                               | Two SendGrid POSTs: 503 for the short job and 202 for the still-eligible job  |

The counts come from driver `commandStarted` events, calls forwarded to the actual storage emulators,
and resolver entry/result traces, not from simulated storage or provider responses inside the worker.
For each S3 PUT the writer also made one exact body GET and one GET each for lifecycle and versioning.
Each Azure PUT made one writer confirmation GET; clean Mongo attachment inserts did not read back.
Provider tests compare ordered filenames, MIME types and decoded bytes with the original producer inputs.
SendGrid uses the production V1 request encoder, TLS checks and response parser. The fixture supplies loopback
DNS, remaps the port, and trusts a fixture CA while preserving SNI and hostname verification. SMTP uses
the real provider and parses its captured MIME, including omission of the Bcc header despite the Bcc RCPT.
The fixtures do not forward any mail.

### Cleanup and replay trace

1. The producer checked the frozen V1 SMTP-capacity DTO and saved only its JSON in a host-owned fixture
   outbox row. The relay read it on the peer connection after Mongo server time reached at least
   `preparedAt + 200 ms`; the schedule was still in the future. The wrong scope could not relay it.
2. On the first relay, the writer's queue RPC trace was `find → find → find → insert → find`.
   The driver returned `ok=1, n=1` without a write-concern error for the insert, but the fixture hid that
   reply from the queue store. The post-insert confirmation `find` used a one-shot real Mongo failpoint
   (`11601`), so the public call returned `write_unconfirmed`. This is injected loss at the driver boundary,
   not a claim of packet loss. The independent relay and `enqueue` of the original intent/key then made one
   queue `find` each and replayed the same row. No bytes were uploaded or resolved and no template was
   prepared again. The worker was idle before the schedule. After eligibility, exactly one DATA arrived;
   a subsequent replay and worker run added no preparation, storage traffic or mail.
3. In the sharing scenario, two jobs used the same Mongo/S3 attachments. After the first accepted send,
   reconciliation ACKed one activity and cleanup pruned exactly one snapshot, leaving its hash and
   replay identity. The second job's snapshot was still present. Privileged fixture code separately
   deleted a known distinct S3 orphan at its exact key (`HEAD 200 → DELETE → HEAD 404`). The pruned job
   replayed with no backing traffic or second DATA. The second job still read the shared bytes, sent
   complete DATA and got no complete final SMTP reply. No automatic resend occurred. An acknowledged
   manual redrive reused the frozen expiry and attachments; only that new attempt produced the third
   DATA and accepted result. Repeating the same resolution only replayed it. Only a subsequent
   explicit producer `put` added the S3 conditional PUT (412) and its confirmation calls.

The expiry case rejected an actual frozen expiry one millisecond past the receipt deadline. After a
shorter checked expiry passed, a late outbox miss inserted no row, unexpired file holds did not
authorize manual redrive, and a bounded worker sweep expired the queued short job with zero claims
for it. A later-expiring job using those same bytes still reached HTTPS. In the separate missing-file
case, a privileged deletion deliberately damaged a valid queued Azure ref: Mongo resolved first,
Azure was unavailable, later refs never ran, and a durable attachment-stage result had no handoff
marker. Persisted snapshots matched the staged hashes and ordinary seven-field refs; job summaries and
projected activities (including raw SendGrid activity rows) exposed neither bytes nor file/ref details.

## Verification

Linux x64, Node `26.12.1`, pnpm `11.24.0`, Vitest `4.1.12`, OpenSSL `3.0.13`. MongoDB `8.2.6` with
Mongoose `9.12.2` ran on the disposable replica set. The test used a copied and SHA-256-verified fixture
binary from the prior qualification (`08b192e3fcfe01ef1046c379e83e21ccdd20694fd49c816ef642dec6d9cf1882`).
The S3 runs downloaded and verified SeaweedFS `4.54` with AWS SDK `3.1167.0`. Azure used Azurite Blob
`3.38.0` (REST `2026-10-06`) with Blob SDK `12.34.0`.

Package commands use `pnpm --filter @web-ts-toolkit/email-service`. Wall times include package dispatch
and setup, measured to whole seconds. The test lanes ran serially, with fresh ignored scratch for each.

| Check                                  | Tests (files)                             | Vitest time | Wall time |
| -------------------------------------- | ----------------------------------------- | ----------- | --------- |
| `test:unit`                            | 311 (23)                                  | 4.37 s      | 10 s      |
| `test:lifecycle`                       | 41 (4)                                    | 39.95 s     | 41 s      |
| `test:smtp`                            | 65 (2), 2 timing cases skipped by default | 18.46 s     | 20 s      |
| `SMTP_CAPACITY_TIMING=1` / `test:smtp` | 67 (2), no skips                          | 97.42 s     | 99 s      |
| `test:sendgrid`                        | 91 (3)                                    | 2.79 s      | 5 s       |
| `test:mongodb`                         | 143 (10)                                  | 427.76 s    | 429 s     |
| `test:s3`                              | 68 (2)                                    | 31.25 s     | 34 s      |
| `test:azure`                           | 62 (1)                                    | 12.54 s     | 16 s      |
| `test:managed-delivery`                | 5 (1)                                     | 43.25 s     | 49 s      |

No skips except the default SMTP timing cases, which passed on the opt-in rerun. The package `typecheck`
(14 s), repo `pnpm lint` (53 s), targeted Prettier and diff checks passed. An initial mixed run also
passed all five tests; typecheck rejected the fixture's trace-disposer return type, which was corrected
without changing product code. The shared Mongo fixture keeps the same default arguments for existing
lanes; only the mixed lane passes `--nounixsocket`. In a separate negative probe with a nonexistent pinned
Mongo binary and runtime download disabled, the runner exited 1 with a failed setup, not a green skip.

## Reproduction and ATT-07 wiring

Run `pnpm --filter @web-ts-toolkit/email-service test:managed-delivery` on Linux x64 after a locked
workspace install. The [runner](../../../../packages/email-service/test/managed-delivery/run.mjs) uses
`test/scratch.mjs` to reuse a supplied ignored checkout-local `TMPDIR` or create one; Mongo has no Unix
socket outside scratch. It can use the isolated Mongo preflight binary at `MONGOMS_SYSTEM_BINARY`, or
download MongoDB `8.2.6` into scratch with checksum verification. SeaweedFS is downloaded and verified
by the [pinned fixture](seaweedfs.md); Linux x64, Git, curl, tar, HTTPS access to the public release,
OpenSSL, and the installed SDKs/Azurite are required. Tests fail on missing/broken setup rather than skip.

ATT-07 should add `test:s3`, `test:azure`, and `test:managed-delivery` to the package's canonical serial
[`test/run.mjs`](../../../../packages/email-service/test/run.mjs), ahead of packed-consumer checks.
Keep the existing unit/lifecycle includes separate and pass through the ignored `TMPDIR` and preflight
Mongo binary through the canonical runner. Do not reuse a live service or change missing-fixture failures
into skips. Optional package exports, tarball tests, and any required resource or CI wiring remain ATT-07.

These tests do not wait out real grace, TTL, or cloud lifecycle policy. The orphan deletion shortcuts
asynchronous storage cleanup only in the fixture; the missing-file deletion is a distinct failure
injection, not supported in-hold behavior. There is no live cloud or mail, production IAM evidence,
or installed-package qualification in ATT-06. Binaries, raw logs, database files, certificates,
fixture credentials and wire captures are not archived; the maintained tests and the summary above
are the reproduction inputs. See the [bundle index](README.md) for related handoffs.
