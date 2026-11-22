# ATT-03 — MongoDB BSON attachments

Source entry: [`src/attachments/mongoose.ts`](../../../../packages/email-service/src/attachments/mongoose.ts).
The isolated [Mongo helpers](../../../../packages/email-service/src/attachments/mongoose/) and
[replica-set suite](../../../../packages/email-service/test/mongodb/managed-attachments.test.ts) implement and
exercise the [ATT-01 contract](contract.md) against the unchanged [ATT-02 backing port](att-02-handoff.md).
ATT-03 did not change shared core, queue code, package exports, build, CI, or test-runner wiring.

## Operational handoff

- Use an already-open, explicit Mongoose connection. `ready()` validates; `ready({ install: true })`
  creates only missing matching attachment definitions. The default collection is `email_attachments`.
  The strict validator binds the namespace and resolver key, and only the built-in `_id_` plus
  `ma1_purge` (`{ purgeAt: 1 }`, `expireAfterSeconds: 0`) are allowed. There is no factory database
  I/O or model registration.
- Every create uses one ordered insert with majority, journaling, and bounded `wtimeout` and `maxTimeMS`.
  A clean singleton ACK needs no read. Duplicate or uncertain results get at most one primary
  linearizable `_id_` read with a bounded single batch and no host session. Mongo omits invalid or
  oversized Binary and caps the projected metadata before transmission. The adapter checks subtype 0;
  shared code independently verifies actual length and digest. Retry `write_unconfirmed` with the same input.
- `purgeAt = deliverBy + 86_521_000 ms`. The proof subtracts the 121,000 ms guard, so a receipt certifies
  `deliverBy + 24 h`, not TTL timing. A worker may drain a valid body even if a privileged mutation damaged
  only the hold evidence; that row cannot issue a new receipt.
- Re-run `ready()` after a connection loss, once the old commands have settled. A successful readiness
  pins the replica-set ID, database and collection UUID; connection generation changes cancel and fence old commands.
  An insert or exact read sends that UUID, so a dropped/recreated namespace cannot be used by the old store
  instance. TTL/index/validator edits on the same collection are not continuously audited; keep administrative
  mutations out of runtime roles, stop producers for any policy change, and revalidate. The operator clock
  and TTL-monitoring requirements remain those of ATT-01.
- Tested grants: cluster `serverStatus`, `replSetGetConfig`, `getCmdLineOpts`; database `listCollections`;
  collection `listIndexes` plus `find` for workers and `find`/`insert` for writers. A provisioner needs
  `createCollection` and `createIndex` separately. Use a journaled, unsharded MongoDB 8.x WiredTiger replica
  set. Use `maxAdaptiveRetries: 0` when both retry flags are enabled. Direct/load-balanced connections,
  auto-encryption, proxying, compression and OIDC reauthentication (which can resend a raw command)
  are not supported on this path.

## Proof and reproducibility

Linux x64, Node `26.12.1`, pnpm `11.24.0`, Mongoose `9.12.2`, driver `7.8.0`,
`mongodb-memory-server` and core `11.3.0`. The Mongo binary was fetched with MD5 verification
using the [ATT-01 recipe](contract.md#required-ci-qualification-route-and-att-01-evidence) and selected
explicitly: Ubuntu 24.04 x64 `8.2.6`, binary SHA-256
`08b192e3fcfe01ef1046c379e83e21ccdd20694fd49c816ef642dec6d9cf1882`.
From the checkout root, set `TMPDIR` to a fresh ignored absolute `'<repo-root>/_tmp-att03-run'`,
`MONGOMS_SYSTEM_BINARY` to the exact binary, `MONGOMS_VERSION=8.2.6` and `MONGOMS_RUNTIME_DOWNLOAD=false`.
Then run `pnpm --filter @web-ts-toolkit/email-service test:mongodb`.

The full Mongo lane passed **143 tests in 10 files** (429 s), with no skips. The focused lane passed **40 tests**
(12 common, 28 Mongo-specific). The initial full run had one new fixture failure: its assertion assumed
caller rejection meant the held driver work had settled. After fixing that assertion, both reruns passed.
Package `typecheck`, repo `pnpm lint`, targeted Prettier and whitespace checks passed. A source-only scratch
build emitted and loaded the named factory in both ESM and CommonJS and checked the matching `.d.mts`/`.d.ts`
declarations. It did not update `dist`, exercise the published package, or change the export map.

The replica-set suite includes all 12 common cases, the 2 MiB BSON boundary, exact wire commands,
server-side malformed/oversize rejection, a real TTL pass on a due row, role-denied operations, real
write-concern/read failpoints, socket cancellation, and reconnect/fencing. Lost successful ACK and slot
settlement also use driver-boundary reply barriers around real committed inserts; these are not claims
of physical packet loss. The fixture reduces only its own TTL monitor interval and inserts a time-shifted
orphan; it does not wait out a real 24-hour hold. The attachment reconnect case steps down and re-elects
the same member, not a different primary during an attachment write. No live providers or production
deployment were exercised. Scratch scripts, binaries, database files, generated bundles and raw logs are
omitted; maintained source/tests are the reproduction inputs.
