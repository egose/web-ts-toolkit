# EMAIL-04 Mongoose store handoff

Companion to the [EMAIL-04 task](../../../tasks/20261118-223259-email-service-package.md#email-04--implement-mongoose-persistence-and-schema-factories),
[V1 store contract](v1-contract.md#store-adapter-transaction-primitives) and [EMAIL-03 handoff](email-03-store.md).
This is the durable persistence phase only. No admission service, providers, worker, admin, migration,
release/CI registration, or mail submission was implemented or exercised here.

## Design and operational envelope

- The named factory in [`src/mongoose.ts`](../../../../packages/email-service/src/mongoose.ts) accepts a caller-owned,
  open Mongoose `Connection` and returns the core `EmailStore`. `ready()` is explicit. The adapter uses the connection's
  public native driver, not Mongoose queries, hooks, buffered writes, or a host session. It neither creates models nor
  accepts arbitrary schemas; both configurable model names are reserved against local collisions. It does not close or
  mutate the connection and does not need Mongoose at import time. The subpath's declaration uses the real `Connection`
  type. The root runtime and declaration closure remain peer-free.
- [`schema.ts`](../../../../packages/email-service/src/stores/mongoose/schema.ts) and
  [`records.ts`](../../../../packages/email-service/src/stores/mongoose/records.ts) own internal V1 server validators,
  exact simple-collation catalog definitions, and strict record mapping. Readiness initializes only missing definitions;
  it does not take over an incompatible or extra index, collation, validator, model alias, view, or nonordinary
  collection. It requires a writable, persistent 8.x WiredTiger replica-set primary, committed reads, a journaled
  majority default, and an actual linearizable probe for each unique key. It rejects `mongos`, shard/config-server
  roles, and unsupported client modes. The host supplies the documented admin/catalog privileges and must dedicate the
  collections to the adapter. Readiness is not a full historic-data scan or privilege audit: touched data is decoded
  using the shared logical codecs; do not bypass the validators or change schema or topology behind the adapter.
- [`connection.ts`](../../../../packages/email-service/src/stores/mongoose/connection.ts) uses primary `hello.localTime`,
  rejects observed rewind and a sample taking at least 1s, and never uses the process wall clock for lifecycle
  decisions. [`operations.ts`](../../../../packages/email-service/src/stores/mongoose/operations.ts) maps shared
  `JobWrite`/`JobGuard` to a revision CAS including scope/identity, state and exact lease, phase and retiring marker.
  The ACK additionally checks exact pending attempt/digest. The server evaluates half-open guards against `$$NOW`.
  All stored times come from the sampled decision except the server-created stub TTL; only that TTL is BSON `Date`.
  Inserts use sampled admission time as V1 permits, and may land too late to be claimable. Use replica clocks within 1s;
  this does not turn `$$NOW` into a clock that changes during a command. It is MongoDB's operation-stable time.
- Exact indexed `find` uses primary + linearizable, restricted to a unique equality with `limit: 1` and `singleBatch`.
  Candidate/history ranges are primary + majority; the candidate scan projects IDs only. The current exact row and
  guard control any commit. The query ceiling is 16 candidate IDs and three submitted CAS plans per primitive.
  History uses at most three disjoint, bounded index ranges for the cursor suffix with at most `limit + 1` rows
  collectively. If a bounded claim window was filled with expired or contended candidates, it may stop `contended`;
  drive queued expiry separately as the worker contract requires.
- **Driver constraint:** the locked Mongoose 9.12.2 driver is MongoDB Node driver 7.8.0, where CSOT `timeoutMS` is
  a no-op. Data primitives use at most 5s, sharing one monotonic `AbortSignal` across selection, checkout and actual
  driver socket operations plus explicit per-command `maxTimeMS` and `wtimeout`. `ready()` has its own call budget
  and each command has a server cap at 30s. There are 32 active call slots per store and one exclusive readiness
  call. `Db.command` does not inherit host concerns. No `Promise.race` abandonment at this boundary. Use a finite
  driver `connectTimeoutMS`, normal replica-set routing, no driver compression/proxy or automatic encryption, and
  `maxAdaptiveRetries: 0` (or disable driver retry reads or retry writes). This excludes known unsafe retry or
  deferred-dispatch paths without altering the caller's client. Shared pool/monitor and background connection
  establishment remain caller-owned; abort can destroy a checked-out socket, not shut down the pool. MongoDB
  deadline enforcement is cooperative at interrupt points. A dispatched write may commit after the caller aborts:
  no independent retry of an uncertain action and no fallback.
- Only a timely exact acknowledged `findAndModify` grants ownership, renewal or handoff. Unknown after maybe
  dispatch stays `write_unconfirmed`; inspecting a marker never authorizes launch. An exact attempt point read or
  same fenced finish operation may confirm a result, not cause submission. A journaled insert collision must be
  checked through the current exact admission identity before reporting `duplicate`. Scope and validated DTO scalars
  are passed only as values, and replacements/upsert fields are literalized.
- Complete activities and their digests are immutable. The verified single-key bounded `findAndModify` pipeline
  preserves existing complete rows and promotes a stub only in the issued server-time window. An expired upsert
  can leave only an identity/TTL stub; TTL is not needed for correctness. Proof for ACK is an exact committed
  activity read. After prune and retirement CAS, cleanup collects at most eleven exact activity keys, deletes
  with journaled majority, proves complete rows absent, then deletes the still-retiring job by revision CAS.
  Partial deletes leave the admission guard in place. Cleanup pins private per-activity physical IDs plus the
  retiring source revision so a delayed cleaner cannot affect a re-admitted logical identity. There is no
  cross-collection transaction. The unchanged 31s drain covers a command that sampled `$$NOW` while the permit
  was live; a command evaluated after the window can only retain an existing complete row or write a stub.

The [package README](../../../../packages/email-service/README.md#durable-store-with-mongoose) records connection
requirements and an example using only public names.

## Verification and limits

Maintained fixtures are in [`test/mongodb`](../../../../packages/email-service/test/mongodb). They use fresh
synthetic namespaces, independent Mongoose clients, and child `mongod` processes through the existing workspace
test dependency `mongodb-memory-server` (11.3.0); no manifest dependencies or lockfile resolutions were added.
To reproduce, use an existing ignored repo-local `TMPDIR`, a prepared MongoDB 8.2.6 binary for the local platform,
and the following package commands from `<repo-root>`:

```sh
export TMPDIR='<repo-root>/_tmp-email-04-repro'
export MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false
export MONGOMS_SYSTEM_BINARY='<absolute path to prepared mongod 8.2.6>'
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service test:mongodb
pnpm --filter @web-ts-toolkit/email-service build:package
pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
```

Results on MongoDB 8.2.6, Mongoose 9.12.2, driver 7.8.0, Node 26.12.1, pnpm 11.24.0 and Vitest 4.1.12:
typecheck passed; 78 unit tests (8 files) and 48 MongoDB tests (5 files) passed without skips;
tsup 8.5.1 built the package; the ordinary installed-tarball test passed using TypeScript 6.0.3.
The targeted final retention and failover rerun passed all four selected cases. Changed paths passed
Prettier, ESLint (code), whitespace and local-link checks; this artifact is not ignored.

<!-- prettier-ignore -->
| Evidence | What it establishes |
| --- | --- |
| Shared store conformance against a real one-member replica set | Scoped admission/duplicate and competing lease ownership, one-way handoff/cancel contention, finish replay, redrive, immutable activity/ACK, scope and pages. The shared before/after ACK fixtures are simulations, not socket faults. |
| Real catalog, command monitoring and controlled clock barriers | Binary equality and selectors, linearizable exact versus majority range commands, explicit journaled majority writes despite weaker client defaults, BSON validators and manipulated logical corruption, bounded CAS/driver slots, real server time crossing the marker/permit predicate. The retention fixture ages coherent synthetic rows for the day-long windows; it does not alter MongoDB's clock or the contract minima. |
| Focused driver-call injection | Lose a real committed insert, claim, renewal, handoff, finish, projection or activity-delete response before the adapter sees it. Prove what a peer reads, recovery and same-operation replay, no independent mutation, and partial-purge ordering. Not actual lost TCP acknowledgements. |
| Actual backend interruptions | External abort of a real active command closes the socket; checkout waiters abort without a request. `killOp` interrupts a paused pre-update marker. A `failCommand` pause with a shorter wire limit than client watchdog lets the server produce code 50 for projection. The captured full stale activity update also runs after retirement and can create only a stub, never a result. |
| Real three-member election | Step down the actual primary during an in-flight pre-update marker. That write is unconfirmed and not resubmitted. A new primary serves exact linearizable reads; the old primary rejects the same point read even though it can serve majority data. Previously committed handoff/finish/activity/ACK survive and finalization on the new primary still uses the fence. No provider action is part of the store lane. |

Not established here: actual power-loss/fsync durability, all interruption points including a post-commit TCP
cut during election, cross-host clock skew/steps, real sharded/in-memory test deployments, TLS/proxy network
faults, or behavior on every advertised MongoDB/Mongoose patch. The failpoint that deliberately blocks before
`findAndModify` need not wake on `maxTimeMS` until the next interrupt check; the adapter's caller still stops at
its driver watchdog and must not interpret the delay as definite noncommit. The server-side projection
timeout test uses an interruptible failpoint and verifies the actual server error/no result, not a proof of
preemptibility in arbitrary server/kernel stalls. No test claims exactly-once, worker quiescence, or inbox delivery.

The ordinary installed-tarball lane checks absence of optional peers at the root and strict ESM/CJS/Bundler
declarations with the exact Mongoose dev floor in a separate consumer. Generated declaration chunks are
private files under `dist`, not extra export paths. Release-shaped packaging and the wider optional peer matrix
belong to EMAIL-11. No repo-wide build/test/lint, workspace test activation, live CI or provider call was run.

All inputs are maintained, synthetic and repository-local except for the ordinary toolchain and MongoDB binary.
No raw command/DB output, temporary probe, DB files, credentials, downloaded binary, installed consumers, or
generated package is preserved. This handoff and maintained tests are the durable evidence.

## Next phase

EMAIL-05 owns SMTP only. Reuse the normalized result rules and `smtpMessageId` from EMAIL-03; this phase
adds no SMTP interfaces or provider dependency. For EMAIL-07, the durable adapter is ready to compose:
inspect/replay only the exact admitted identity or fenced finish; never recover an unconfirmed marker as
permission to submit. For EMAIL-09, use the existing reserve/put/ACK and cleanup steps rather than introducing
another ledger. EMAIL-11 still owns workspace test registration and release-shaped consumer verification.
