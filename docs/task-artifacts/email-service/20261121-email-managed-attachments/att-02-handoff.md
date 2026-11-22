# ATT-02 — Common managed attachment implementation

The [ATT-01 contract](contract.md) is authoritative. The source entry
[`src/attachments.ts`](../../../../packages/email-service/src/attachments.ts) exposes the checked staging function
and public types only. It is not yet in the package export map. The root entrypoint, queue formats, provider and
worker behavior, schemas and test-runner wiring are unchanged. Proof is checked by calling the writer's assertion, not by
checking module, class or symbol identity. The V1 decoder detaches and freezes the staged value and preserves its
fields, fingerprint and snapshot hash; JavaScript object property order is not a wire requirement.

## Internal adapter port

See [`backing.ts`](../../../../packages/email-service/src/attachments/backing.ts) and
[`store.ts`](../../../../packages/email-service/src/attachments/store.ts). Factories capture the caller-owned
backing and validate binding configuration; creation and reads receive only an exact logical key. No port method
lists, deletes, replaces, resolves “latest,” or manages a client. `managedAttachmentBoundary(namespace)` is
`ma1/<namespace>/`; prepend the dedicated prefix for cloud only. Supply the actual stored `_id` from Mongo, or the
logical key of the exact cloud response; never stamp the requested metadata over the returned envelope. The common
reader validates `format`, resolver key, revision/deadline-derived version, filename, MIME, length and hash. It
verifies the stored body's own length/hash before comparing a candidate on confirmation.

| Operation                        | What the adapter reports                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conditional create               | `confirmed` only if the durable acknowledgement establishes those exact bytes and metadata without a read (Mongo). Unverifiable hold on a confirmed create is not a successful receipt. Report `confirm` on collisions, possible commit, and clean cloud ACKs (which still require a body GET).                                                                                                      |
| Create rejected / not dispatched | `incompatible` only for definite rejection or unusable configuration. `unavailable` is for known pre-dispatch unavailability. After handing work to the SDK the common layer treats unrecognized, malformed, or nondefinitive outcomes as possible dispatch, and may read once.                                                                                                                      |
| Strong exact-key read            | `found` with translated metadata and body, or `missing` for exact-key absence. `unavailable` includes recognized transient failures, interrupted reads, and S3 ambiguous `AccessDenied` for a possibly absent key. `invalid` means corrupt stored data (including an oversize BSON Binary omitted by projection); `incompatible` means definitive configuration/protocol trouble, not an absent key. |
| Lifetime evidence                | Supply `retainedThrough` only with backend evidence, conservatively reduced by the clock guard. The core requires `retainedThrough ≥ deliverBy + G`. Insufficient or missing evidence fails the producer check, not worker resolution.                                                                                                                                                               |

A `put` can run one create and at most one strong object read. Missing/unavailable confirmation or a stop after possible
dispatch without proof gives `write_unconfirmed`. A definitive bad stored object gives `store_incompatible`, not
`attachment_conflict`. Reaching the wall `deliverBy` prevents a create or new receipt and returns `expired`;
committed bytes can still be read during grace. These results do not trigger cleanup. Keep the original input for
replay. Business scope authorization and the exhaustive producer binding list belong to the host.

The [SeaweedFS addendum](seaweedfs.md) uses the optional internal `verifyRetentionPolicy(op)` hook. It runs only
for a producer, after exact body verification, candidate match and a sufficient per-object bound. It must use
`op.request(...)` for retention-policy/versioning RPCs and must affirm the bound with `true`; a missing or failed
proof cannot issue a receipt. The hook does not get another object read, create, slot, budget or worker permission.
If the caller cancels or its elapsed budget ends during policy verification, the object has already been
confirmed, so the stop remains `aborted`/`deadline`; a policy failure within budget is `attachment_retention`.

## Budget, request ownership and ATT-03

Use one [`createManagedAttachmentOperations()`](../../../../packages/email-service/src/attachments/operations.ts)
per adapter instance, shared with `createManagedAttachmentStore(binding, backing, operations)`. For readiness,
validate its own exact options (including `install`) and use `operations.run(call, task, accept)` with
`MANAGED_ATTACHMENT_CALL_BOUNDS`; call `op.request(...)` for each RPC. Commit readiness state only in `accept`
after topology/catalog verification. Each RPC calls `request.begin()` synchronously just before handing the work to
the SDK; use its remaining integer milliseconds plus `request.signal`, with no additional attempts.

- Await real SDK settlement. Do not race it against a timer inside the port. The core handles the caller's race,
  aborts the per-request signal (also when a rejected SDK response never exposes a body), and retains one of eight
  instance slots until the work and all registered teardown settle.
- As soon as a Node `Readable` is exposed, call `request.ownStream(body)` **before** validating headers or checking
  the budget, including on late replies. The core destroys rejected/aborted streams and holds through `'close'`,
  not just `'end'`, an exception, or `.destroyed`. The port must supply a byte stream with close notification and
  no full-body collection or unbounded prefetch. A late body returned as `found` is covered too; a body not handed
  back must be registered by the backing.
- If SDK settlement does not cover teardown (especially a response rejected by the SDK before exposing its
  stream), register the real closure/teardown promise with `request.hold(...)` before the SDK work settles. A
  provider that cannot surface or await that completion must not be claimed to meet the slot guarantee. The
  shared fixture proves early rejection signals and tracked teardown, not that any SDK exposes that seam.
- **ATT-03:** implement conditional Mongo insert with journaled majority acknowledgement, exact primary
  linearizable single-batch verification, server-side `$type`/`$binarySize` bounds, strict attachment-only catalog
  and ready/reconnect fencing. Compute BSON Date `purgeAt = deliverBy + G + M` and supply the proven minimum
  `purgeAt − M`. Check BSON subtype/size before translating to `Uint8Array`; map oversized or malformed rows to
  `invalid`. Use the [backend obligations](contract.md#backend-and-operator-obligations) for precise durability,
  retention, and future cloud metadata and lifecycle policy, which this work does not implement.

For ATT-05, a supplemental loopback probe with `@azure/storage-blob` 12.34.0 found a public way to
observe the raw stream if the SDK rejects before returning its `BlobDownloadResponse`: add a
`RequestPolicyFactory` to the caller's `newPipeline(...).factories` **before** constructing
`ContainerClient`. A policy `await next.sendRequest(webResource)` saw the same native
`AbortSignal` passed to `download` and the `IncomingMessage` in `response.readableStreamBody`
even on a 200 without Content-Length (the outer SDK threw `RangeError`). Aborting closed the
raw response. A per-request tracker can therefore register `request.ownStream` in that policy;
prove the SDK wrapper and underlying stream both settle, and do not use private SDK fields or
claim that observing only the wrapper proves transport teardown. This was a disposable malformed
HTTP fixture, not an Azurite or live Azure run.

## Verification

On Node 26.12.1 / pnpm 11.24.0, `pnpm --filter @web-ts-toolkit/email-service typecheck`, `test:unit`
(311 tests, 23 files) and `test:lifecycle` (41 tests, 4 files) passed. The managed-only subset was 42 unit and
7 lifecycle cases, including the 12 reusable conformance cases. Targeted Prettier, ESLint and `git diff --check`
passed.

[`registerManagedAttachmentConformance`](../../../../packages/email-service/test/conformance/managed-attachment-suite.ts)
accepts independent writer/peer stores and disposable fixture hooks for ACK loss, corruption, expiry and simulated
orphan purge. Reuse it in each actual adapter lane; keep actual provider durability, transport teardown,
readiness and cleanup qualification additional. The shared lifecycle test observes one create, one confirmation
and one worker read, delivering a managed ref plus a project ref through existing preflight, then replaying the
same staged DTO after expiry without storage or provider work. This is in-memory backing verification, not a real
backend or provider payload test.

The maintained unit probe bundles the common entry, a fake adapter and the existing root separately, with
splitting disabled, and tests all four common/adapter ESM/CJS combinations. It does not build or modify `dist`,
publish a tarball or exercise optional peers. A source-only `tsup` scratch build also emitted matching
`attachments.d.mts` and `attachments.d.ts` with the five public types and checked staging function.
No production adapter, SDK service, external cloud or mail was used; the existing lifecycle suite uses loopback.
Generated bundles, scratch cache and raw logs are omitted.
