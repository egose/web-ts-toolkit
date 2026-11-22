# ATT-01 — Managed attachment contract

Design handoff for `packages/email-service`, baseline `13ca5acf`, 2026-11-21. This freezes the proposed first
release at the design stage; it is not adapter or production qualification. See the
[bundle index](README.md) for implementation and verification. The
[SeaweedFS addendum](seaweedfs.md) supersedes the MinIO target below. The
[S3 remediation](att-04-remediation.md#changes-for-re-review) and
[Azure handoff](att-05-handoff.md#api-for-att-06-and-att-07) record the final
dedicated client factories; use the installed README and declarations for current signatures.

## Public boundary

Named exports from `@web-ts-toolkit/email-service/attachments` (Node ≥24, no vendor SDK):

```ts
type PutManagedAttachmentInput = Readonly<{
  scope: EmailScope; id: string; revision: string; deliverBy: UnixMs;
  filename: string; contentType: string; bytes: Uint8Array;
}>;
type ManagedAttachmentReceipt = Readonly<{ ref: AttachmentRef; deliverBy: UnixMs }>;
type ManagedAttachmentStore = Readonly<{
  resolverKey: string;
  put: (input: PutManagedAttachmentInput, options?: CallOptions) => Promise<ManagedAttachmentReceipt>;
  resolve: AttachmentResolver;
  assertReceipt: (receipt: ManagedAttachmentReceipt, scope: EmailScope, expiresAt: UnixMs) => void;
}>;
type ManagedAttachmentBindingOptions = Readonly<{ resolverKey: string; namespace: string }>;
type ManagedAttachmentPreparationOptions = Readonly<{
  scope: EmailScope; stores: readonly ManagedAttachmentStore[]; receipts: readonly ManagedAttachmentReceipt[];
  smtpCapacity?: SmtpCapacity;
}>;
function checkManagedAttachmentRetention(
  prepared: PreparedEmailCommand, options: ManagedAttachmentPreparationOptions,
): PreparedEmailCommand;
```

> The original S3 signature below was amended after review: both S3 factories now come from the
> same `/attachments/s3` entry instance, and the store accepts only a dedicated, caller-owned
> client from `createS3AttachmentClient`. See [ATT-04 remediation](att-04-remediation.md).

`AttachmentRef`, `AttachmentResolver`, `EmailScope`, `UnixMs`, `CallOptions`, `PreparedEmailCommand`, and
`SmtpCapacity` remain root types. Fixed producer error codes use the existing `EmailError` convention; add
`attachment_conflict` (immutable content mismatch) and `attachment_retention` (cannot certify retention).

| Additional subpath (under `/attachments`) | Named factory and exported option type | Only optional peer |
| --- | --- | --- |
| `/mongoose` | `createMongooseAttachmentStore(connection: Connection, options: MongooseAttachmentStoreOptions): MongooseAttachmentStore`; options = binding options + `collection?: string` (default `email_attachments`). Store adds `ready(options?: CallOptions & { install?: boolean }): Promise<void>`. Default is validate only; `install: true` is for the provisioner. | `mongoose >=9.12.2 <10` |
| `/s3` | `createS3AttachmentStore(client: S3Client, options: S3AttachmentStoreOptions): ManagedAttachmentStore`; options = binding options + `bucket: string; prefix: string`. Same factory for AWS and qualified compatible endpoints. | `@aws-sdk/client-s3 >=3.1167.0 <4` |
| `/azure` | `createAzureAttachmentStore(container: ContainerClient, options: AzureAttachmentStoreOptions): ManagedAttachmentStore`; options = binding options + `prefix: string`. | `@azure/storage-blob >=12.34.0 <13` |

Factories use caller-owned clients; never connect, provision cloud resources, close shared clients, or discover
credentials. `.resolve` is detached/closure-bound: a worker can use the same factory with a read-only identity
and register `{ [store.resolverKey]: store.resolve }` beside project resolvers. No cloud or identity SDK in root,
the common subpath, the old `/mongoose` queue entry, `/smtp`, or `/sendgrid`; do not re-export adapters there.
Ship SDKs external as optional peers (pin dev versions for qualification); no peer for Azurite itself. Keep named
ESM/CJS and `.d.mts`/`.d.ts` subpaths aligned in ordinary and flattened tarballs. Receipts do not depend on class,
singleton or symbol identity shared across entrypoint bundles.

## Write once; retire the identity with its deadline

- Bind one stable `resolverKey` to one physical backing and namespace. `namespace` is a lower-case UUIDv4; prefixes
  are 1–128 ASCII bytes of slash-delimited V1 identifier segments with a final `/`, no empty segments. S3 takes
  a literal 3–63 character lowercase DNS label as bucket, not a URI or ARN. Mongo collection names follow
  `[A-Za-z][A-Za-z0-9_]{0,63}` and are dedicated, not queue collections. Trusted config only; no locator, raw path,
  or credential comes from a command. Host authorizes `scope`; worker scope comes from worker configuration.
- `revision` is the host's stable file-revision token. V1 `version` is the opaque managed revision
  `ma1.` + lowercase hex SHA-256 of UTF-8 `JSON.stringify(["email-managed-attachment",1,revision,deliverBy])`.
  This deliberately makes a **different deadline a different version**, not an extension or overwrite. The
  exact identity is `(logical backing, scope, id, version)`. Use `ma1/<namespace>/<scope>/<id>/<version>` as the
  Mongo `_id` or the suffix after the cloud `prefix`; the binding boundary is `prefix + "ma1/" + namespace + "/"`.
  Case-sensitive identifiers, no normalization or deduplication across scopes. Keep the original revision and
  `deliverBy` on retry. Do not repoint a resolver key, even to a backup; rotate using a new key and namespace,
  and preserve the old mapping while staged/queued work can use it.
- Exact input records and existing validators: scope ≤64 ASCII bytes, id/revision/resolverKey ≤128, opaque token
  syntax; filename ≤128 UTF-8 bytes, no controls, separators, empty, `.` or `..`; MIME lower-case `type/subtype`
  with no parameters, ≤127 bytes. Accept genuine `Uint8Array`/`Buffer` views only, not shared, detached, or
  spoofed views; 1 byte–2 MiB. Acquire a slot and copy the actual view synchronously before hash or first await.
  Compute length and SHA-256; no caller-supplied checksum. Five refs and 5 MiB total, SMTP leaf-part rules and
  SendGrid mapping remain message/provider checks, not backend-specific rules.
- Persist identity plus exact filename, MIME, length, SHA-256, revision and deadline in the same atomic create
  as bytes. Cloud metadata: `eamformat=1`, `eamresolver`, `eamrevision`, `eamdeliverby` and `eamlen` (canonical
  decimal), `eamsha256` (lowercase hex), `eamfilename` (canonical unpadded UTF-8 Base64url); MIME in `Content-Type`
  / `blobContentType`. This encoding is storage metadata only. Validate the stored envelope and recompute its
  version. Equality under one identity is **actual body SHA-256, actual length, filename, MIME**. For a collision
  or ambiguous response, verify the existing bounded body against its own metadata before comparing the candidate;
  matching user metadata, ETag, CRC, or MD5 alone proves nothing.
- `deliverBy` is an integer UTC Unix ms, strictly after writer wall time and ≤30 days from it; reject arithmetic
  overflow including the retention guard. Recheck before dispatch and before issuing a receipt. After `deliverBy`,
  the old version is retired even if the object is already absent or still present; retrying that original
  identity fails `expired` without creating it. Changing the deadline to pass the check creates a new physical
  identity; it cannot repopulate the old key (absent a SHA-256 collision). No tombstone/registry. Abort cannot
  undo a previously dispatched request; a pathologically late commit can only be an orphan, not a usable new
  receipt or eligible old job. Require synced clocks and bounded client/endpoint queues that cannot replay a
  dispatched create after the backing's earliest purge time.

## Certify the frozen expiry, not the template input

The minimum hold is through **`deliverBy + 24 hours`** (`G = 86_400_000 ms`). Operators must keep queue/writer/
storage clocks within ±60 s UTC; use `M = 121_000 ms` for cross-clock difference and a one-second boundary
margin. This is a retention guarantee under the backing preconditions below, not a promise of endpoint uptime
or a change to delivery/launch expiry.

1. Upload **outside** `prepare`; use `receipt.ref` as an ordinary attachment and set the template's explicit
   `expiresAt` (normally the same `deliverBy`, or the earliest across the managed refs). Keep validated
   business input/intent and configured binding stable. Do not put bytes, receipt, locator, or lifetime proof
   into `values`, outbox, jobs, or history.
2. Call `checkManagedAttachmentRetention(await registry.prepare(scope, command), { scope, stores, receipts,
   /* smtpCapacity only for that lane */ })` before committing the outbox row or first `enqueuePrepared`.
   Pass the exhaustive **trusted producer bindings** for this scope. The helper revalidates/detaches the V1
   command with the trusted scope/capacity and returns the checked, frozen DTO without rewriting hashes,
   expiry, refs or provider fields. Require each occurrence of a configured managed key to match a receipt
   exactly (all seven ref fields; identical repeated refs may use one receipt). Reject duplicate binding keys,
   missing/foreign or unused receipts (max five), and an empty managed check. Do not call storage or assert
   retention on any outside/project resolver. This is an explicit opt-in checked staging path, not a tax or a
   behavior change on legacy `prepare`/`enqueue`/relay; bypassing it does not certify a raw ref.
3. `assertReceipt` uses a **per-writer WeakMap** keyed by frozen, locally issued receipts to capture scope and
   proven hold. It does not accept JSON copies or receipts from a different writer instance with the same key.
   The actual `prepared.snapshot.expiresAt = E` must satisfy `E ≤ deliverBy` and `E + G ≤` the issuer's proven
   retention minimum; even the registry's default expiry cannot exceed the receipt window. Fail
   `attachment_retention` for invalid/missing/insufficient proof; bad configuration or V1 data still use
   `invalid_config`/`invalid_snapshot`. Freshness still belongs to the queue store. Persist and relay the checked
   DTO unchanged across processes with no receipt, SDK or new checks. If the receipt was lost **before**
   staging, repeat the original `put` to acquire one; after staging, replay the staged DTO, not the upload.

The seams are already present: [DTOs](../../../../packages/email-service/src/contracts/message.ts),
[registry capture and freeze](../../../../packages/email-service/src/templates/registry.ts#L140-L154),
[staged hash/scope checks](../../../../packages/email-service/src/internal/command-codecs.ts#L111-L162),
[replay before preparation/insert](../../../../packages/email-service/src/service.ts#L278-L327), and
[expiry on new admission](../../../../packages/email-service/src/internal/job-transitions.ts#L97-L105).
[Manual redrive](../../../../packages/email-service/src/internal/job-transitions.ts#L396-L434) cannot extend
expiry. Worker resolution is [before provider preparation](../../../../packages/email-service/src/internal/worker-preflight.ts#L44-L89);
SMTP and SendGrid still use [MIME](../../../../packages/email-service/src/providers/smtp/mime.ts#L49-L58) and
[request encoding](../../../../packages/email-service/src/providers/sendgrid/profile.ts#L34-L46) respectively.

## I/O and lifecycle decisions

One elapsed budget per call (put/readiness default 5,000 ms, caller range 50–30,000 ms; resolve respects the
existing worker signal across all refs plus a 30,000 ms adapter ceiling). Fixed eight concurrent operations per
instance, no unbounded wait queue: excess `put` returns `busy`. Keep slots until SDK work/body teardown settles,
even if rejecting the caller earlier. Use real transport signals; configure single SDK attempts (AWS
`maxAttempts: 1`, no region redirect; Azure `maxTries: 1` and `maxRetryRequests: 0`; Mongo bounded server
times, no adaptive retries). Check the budget before every dispatch and before returning a result. A `put` has
one create and at most one exact-key confirmation read under that budget; no automatic write retries.

`resolve` verifies key, scope, immutable metadata and actual length/hash, and returns a fresh byte copy only
for a match. Stream into at most the validated expected size (hard max 2 MiB); reject a contradictory transport
length immediately or count bytes to EOF, cancel/destroy on first overflow, abort or rejection. No full-body
SDK collectors, range resume, secondary, version fallback or "latest". S3 can consume a missing-length GET
under the stream bound. Azure's pinned Node SDK instead rejects missing length/ETag before exposing its stream;
abort the per-request signal on this path too so the underlying response closes. Keep worker `copyAttachmentBytes`
as an independent integrity check. `deliverBy` retires receipts and writes, not resolution of in-flight work
during grace; eligibility to send is still decided by the worker/queue.

An exact-key absence, recognized transient network/timeout/throttle/5xx, interrupted transport read, or busy
resolver returns `unavailable` (worker `attachment_unavailable`, safe transient). S3 may give an ambiguous
`AccessDenied` for an absent key without ListBucket; treat that read as unavailable, not as proved absence;
do not widen worker IAM just for 404. Wrong hash/length on a clean response, malformed identity/metadata,
missing backing or other definitive configuration failures reject with sanitized `invalid_snapshot` or
`store_incompatible` as appropriate. Repo `runHostCallback` redacts resolver rejections to the existing
nonretrying `attachment_resolver_error`; do not change legacy classification to special-case managed stores.
The worker's stage/outer abort retains its timeout/stopped semantics. No raw SDK causes, endpoints, keys,
filenames or credentials in errors or diagnostic events.

For `put`, use `invalid_input` for bad input, `invalid_config` for bad binding/call options, `expired` for a
passed deadline, and `store_incompatible` for definitive auth, unsupported protocol or invalid stored data.
Known temporary unavailability before dispatch is `store_unavailable`; unknown outcomes after possible dispatch
are `write_unconfirmed`. A confirmed stored object with missing/insufficient hold evidence is
`attachment_retention`, not proof that nothing was written.

| Case | Result / lifecycle decision |
| --- | --- |
| Identical put | Same immutable ref, new local receipt if still before deadline and hold verified; original creation age preserved. |
| Conflicting put | Verified differing bytes/digest, length, name or MIME → `attachment_conflict`; no replacement. Corrupt stored data is `store_incompatible`, not a reusable key. |
| Racing puts | One atomic winner; equal losers confirm that exact winner, different losers conflict. A race/409 followed by no readable winner is `write_unconfirmed`, never an unconditional retry. |
| Lost write ACK | If still in budget, confirm via one strong point read (metadata **and** body); otherwise `write_unconfirmed`. Caller retries the same input. No name search, deletion, or second create in the call. |
| Interrupted upload | Before dispatch, `aborted`/`deadline`, no write; after possible dispatch with no proof, `write_unconfirmed`, even on cancel/deadline. Provider writes whole object/row or none, never attach a partial. Definite auth/policy/format rejection issues no receipt. |
| Crash before admission | Orphan has the same fixed lifetime as a used file. Cleanup cannot infer non-use from the absence of a queue job. |
| Lost admission ACK | Retry original staged command, scoped key/intent and queue binding. Retained winner replays without upload, preparation, or resend. Do not change revision on uncertainty. |
| Delayed relay | Original frozen expiry/refs unchanged; before expiry eligible, at/after expiry a miss fails `expired` while a retained match can still replay. No new receipt or lifetime on relay. |
| Shared ref, later expiry | Sharing is fine if each checked `E ≤ deliverBy`. A later `E` requires a fresh managed version/upload; no extension or reference counting. |
| Purge / expired key | Provider cleanup is asynchronous and independent of jobs. No abort, cancel, send, redrive, queue purge, job-specific sweep, list-and-delete or eager deletes. A retired version cannot be reacquired after TTL. |

## Backend and operator obligations

| Backing | Creation/confirmation and proof used by `put` | Cleanup owner |
| --- | --- | --- |
| MongoDB 8.x | Separate strict collection, simple collation, unique `_id`. Store `_id`, `format: 1`, `resolverKey`, `revision`, `filename`, `contentType`, `byteLength`, `sha256`, `bytes` (BSON Binary subtype 0), and BSON Dates `deliverBy` and `purgeAt = deliverBy + G + M`. Insert with `w: "majority", j: true`, bounded `wtimeout`/`maxTimeMS`. On collision/ambiguity, or for resolution: exact `_id` primary linearizable single-batch read, simple collation/index, no host session. Use a server `$type`/`$binarySize` projection to omit oversize binary before it crosses the wire. | Primary TTL index `{ purgeAt: 1 }`, `expireAfterSeconds: 0`, no other TTL/index policy. Borrow [queue readiness patterns](../../../../packages/email-service/src/stores/mongoose/schema.ts#L74-L188), not queue schemas. Compare exact catalog (validator binds the namespace), confirm journaled WiredTiger replica set, and re-ready on a same-backing reconnect. |
| AWS S3 / MinIO target | Single `PutObject` `IfNoneMatch: '*'`, exact byte length, `ChecksumSHA256` (standard Base64 wire encoding), no multipart. Treat documented 412 and conditional 409 as confirm, not overwrite. After even a clean ACK, an exact body GET verifies the age anchor (`LastModified`) and `Expiration` (matching rule ID and date at least `anchor + 32d`). Require `min(anchor + 32d, header expiry) - M ≥ deliverBy + G`. | Host-managed native rule: enabled `Filter.Prefix = binding boundary`, `Expiration.Days = 32`; no other actions on the prefix. AWS rounds to next UTC midnight; proof does not spend that rounding. |
| Azure Blob | Single block `upload(bytes, length, { conditions: { ifNoneMatch: '*' }, ... })`, transactional Content-MD5 for transport only. Confirm 412 or 409 `BlobAlreadyExists`; after even a clean ACK, exact Blob GET verifies body plus service `createdOn` and block type. Under the audited age rule below, require `createdOn + 32d - M ≥ deliverBy + G`. No fallback to writer time or mutable access time. | Host-managed lifecycle rule: enabled `Lifecycle`, `filters: { blobTypes: ["blockBlob"], prefixMatch: ["<container>/<binding-boundary>"] }`, only `actions.baseBlob.delete.daysAfterCreationGreaterThan = 32`. Azure has no per-object proof of that account rule on this data-plane path. The operator check is mandatory. |

For cloud rules use the ID/name `emailattachmentsv1` plus the namespace UUID with hyphens removed. Time bases
are the original confirmed creation/immutable last modification, not retry time; provider age processing can
run late. Even at the 30-day delivery horizon, the 32-day age floor exceeds `30d + G + M`. Missing, too early,
or unverifiable deadline evidence issues no receipt (`attachment_retention`); existing reads may still drain.
Neither reading a policy once nor calculating a deadline is protection against administrator deletes, policy
changes, archive tiers, key disablement or loss of the backing.

**Required cloud deployment check (operator, not application credentials):** use fresh private S3 Standard or
Azure GPv2 flat-namespace/Hot backings. Gate producers on readback of the *effective* policy/settings at
deployment and every policy change; record the bound namespace, versioning state and sanitized policy digest.
For S3 compare `GetBucketVersioning` (never versioned, not suspended) and all `GetBucketLifecycleConfiguration`
rules. On Azure read the ARM storage account (no HNS), [blob service properties](https://learn.microsoft.com/en-us/cli/azure/storage/account/blob-service-properties#az-storage-account-blob-service-properties-show)
(no versioning or blob/container soft delete) and [management policy](https://learn.microsoft.com/en-us/cli/azure/storage/account/management-policy#az-storage-account-management-policy-show).
Require exactly the enabled rule in the table and reject other enabled intersecting/global rules even if
they have extra tag/size predicates. Exclude replication, snapshots, backups, holds and any external
delete/overwrite/tiering jobs for these backings. Keep ordinary roles away from control-plane changes and
deletion; audit drift and overdue cleanup via scoped inventory/metrics. Unreadable, missing or drifted
configuration blocks new stages; retain old bindings for reads and never shorten a live hold. Cloud orphans
are cleanup-eligible after 32 days of age, not guaranteed erased on day 32. Mongo TTL lag is also asynchronous;
monitor it. None of these deletions attests to removal of independent backups.

S3 Object Lock/versioned or suspended buckets and Azure versioned/soft-delete/snapshot deployments are **not
supported** in this release. Runtime rejects surfaced version tokens on writes/reads, not a substitute for
the operator check. A current S3 delete marker can hide old bytes without removing them; Azure previous
versions or snapshots may block lifecycle deletion and soft-deleted data can survive an apparent delete.
If discovered, stop new stages and audit existing holds, then inventory and explicitly retire all versions,
markers and snapshots only after draining those holds; don't just delete the current object or restore it as
"latest". See [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html),
[S3 lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html),
[Azure lifecycle](https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-policy-structure),
[Azure conditional headers](https://learn.microsoft.com/en-us/rest/api/storageservices/specifying-conditional-headers-for-blob-service-operations)
and [Mongo TTL](https://www.mongodb.com/docs/manual/core/index-ttl/).

Runtime grants: S3 exact-object Get and conditional Put only (Get alone on workers; enforce `If-None-Match`
on create with [AWS bucket policy](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html));
Azure blob read plus create-only where delegated create grants are available (read-only on workers), no broad
shared account key in production workers. Mongo scoped collection find/insert for producer, find for worker,
plus read-only readiness catalog/topology inspection; only the provisioner needs creation/index privileges.
No app principal needs attachment delete, list-all, ACL mutation, or lifecycle-management permissions.

## Required CI qualification route and ATT-01 evidence

Use the existing Linux x64 `ubuntu-24.04` [workspace job](../../../../.github/workflows/test.yml#L228-L248):
[CI setup](../../../../.github/actions/ci-setup/action.yml) already pins Node `26.12.1`/pnpm `11.24.0` and
installs with `--frozen-lockfile --ignore-scripts`. The
[email test runner](../../../../packages/email-service/test/run.mjs) must run `test:s3` and `test:azure`
serially and fail on missing fixtures, failed downloads/digests or startup. Do not skip, use live endpoints,
or depend on Docker/daemon/system DB. Keep fixture dependencies dev-only, all processes on `127.0.0.1`,
short startup/test deadlines, fixture-only randomized credentials, and scratch/state per suite with
teardown in `finally`. Use an ignored fresh `<repo-root>/_tmp*` directory as absolute `TMPDIR`.

| Required lane | Provisioning recipe and qualification boundary | Observed in ATT-01 |
| --- | --- | --- |
| MongoDB | Reuse the [CI isolated downloader](../../../../scripts/ci-test-workspace.mjs#L393-L445) and [package replica-set fixture](../../../../packages/email-service/test/mongodb/fixture.ts#L27-L38): `mongodb-memory-server`/core 11.3.0, `mongod` 8.2.6 WiredTiger. For a fresh local Ubuntu x64 binary: `MONGOMS_DISTRO=ubuntu-24.04` and `MONGOMS_USE_ARCHIVE_NAME_FOR_BINARY_NAME=true` with a scratch `MONGOMS_DOWNLOAD_DIR`, prefer-global false and checksum verification; `MongoBinary.getPath({version:'8.2.6'})`, then select that exact binary. | Fresh public MongoDB archive + MD5 downloaded. With Mongoose 9.12.2/driver 7.8.0, disposable replica set showed journaled insert, one duplicate `11000`, primary exact Binary read/hash and cross-scope miss, oversize BSON omitted by projection, and TTL deleting the due row but not another row (1 s test monitor). Not a failover test. |
| S3-compatible | Pin **MinIO Community `RELEASE.2025-09-07T16-13-09Z`**; download the [Linux amd64 release asset](https://github.com/minio/minio/releases/download/RELEASE.2025-09-07T16-13-09Z/minio.linux-amd64.RELEASE.2025-09-07T16-13-09Z) into scratch, check SHA-256 **`7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f`**, then `chmod u+x` and check `--version`. Run `minio server --address 127.0.0.1:<port> --console-address 127.0.0.1:<other-port> <fresh-data-dir>` with fixture `MINIO_ROOT_USER/PASSWORD`, `MINIO_BROWSER=off`, `MINIO_UPDATE=off`; wait for `/minio/health/ready`. Fixture creates private bucket and rule; SDK 3.1167.0 sets custom endpoint/`forcePathStyle: true`. Archive mirror under `dl.min.io` returned 410; use GitHub asset, not latest or mirror fallback. Archived MinIO is a **test fixture**, not production advice. | Checked binary hash/version, Put 200, sequential and racing 412s, a dropped-success/retry with actual GET SHA-256, interrupted a 2 MiB GET, read back the 32-day rule and matching expiry header, versioning unset. Separately recorded AWS regional HTTPS/default virtual-host addressing and `If-None-Match` through a no-network Smithy `requestHandler`. Not live AWS or wall-time purge. |
| Azure | Pin **Azurite `3.38.0`** as a locked dev dep and **`@azure/storage-blob` `12.34.0`** (REST `2026-10-06`, no `--skipApiVersionCheck`). Run `pnpm exec azurite-blob --blobHost 127.0.0.1 --blobPort <port> --location <fresh-data-dir> --disableTelemetry`, matching a random fixture `AZURITE_ACCOUNTS` key and SDK path-style `http://127.0.0.1:<port>/<account>`. Fixture creates private container. Use synthetic control-policy inputs for Azure hold/drift tests; no ARM creds in this lane. | Put 201; racing loser was 409 `BlobAlreadyExists`; exact readback included `createdOn`, Unicode filename metadata and body SHA-256; streamed GET cancelled. Separate chunked-response probe verified missing-length SDK rejection and that abort closes the response socket. No live Azure lifecycle, policy enforcement or previous-version cleanup verified. |

Registry reachability was checked by actual installs: downloaded and SHA-256 checked Node `24.22.3` from
nodejs.org; bootstrapped `pnpm@11.24.0` from the public npm registry. On Node 24 installed the three pinned
npm packages in standalone ignored scratch with `pnpm install --ignore-workspace --ignore-scripts
--registry=https://registry.npmjs.org --store-dir <scratch-store>` and repeated with `--frozen-lockfile
--offline`. Both installs and `pnpm exec azurite-blob --version` ran on pnpm `11.24.0`. Workspace Node
reported `26.12.1`; localhost HTTP bind/request passed. SDK/Mongo smoke probes used the downloaded Node 24.

On implementation, require the common conformance suite plus real SDK fixtures. Exercise equal/unequal races,
lost ACK after commit, faulted read/write, wrong digest/size despite matching metadata, no re-put after purge,
later-expiry rejection using the **actual** `E`, scoped mixed refs and delayed relay. Test age/guard arithmetic
at the boundary and negative policy/version fixtures; do not wait 32 days in CI or mistake an emulator for
provider enforcement. Separate, maintainer-authorized service qualification must verify actual effective
AWS/Azure settings, least-privilege roles, retained reads and timely-enough cleanup before production use.
No product code, required CI run, live cloud or mail was exercised here. Scratch scripts, downloads, DB files
and raw logs are omitted; the recipes and observed assertions above are the handoff, not a runnable probe archive.
