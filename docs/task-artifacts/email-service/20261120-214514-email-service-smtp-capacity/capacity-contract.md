# SMTP-CAP-01 — Isolated SMTP capacity contract

Proposed for coordinator review. This is a design, not shipped behavior. It extends the
[V1 contract](../20261118-223259-email-service-package/v1-contract.md) only for a separately opted-in SMTP
namespace. [V1 timing evidence](v1-timing.md) supports a **conditional** serial target of 1,000, not an
unqualified promise to any relay. Do not change the target, deadline ranges, or SMTP protocol in this stage.

## Decision and installed surface

- No opt-in means **V1**, with exactly the same format, hashes, DTOs, store readiness/validators/indexes,
  50-recipient limit, and provider behavior (including SendGrid live and sandbox). No implicit V2 for a large
  message and no conversion of small V2 messages to V1. V2 is SMTP live only, even for one recipient.
- Trusted host code supplies the same explicit **`smtpCapacity: SmtpCapacity`** at each V2 factory. Proposed
  public type: `Readonly<{ format: 'smtp-v2'; namespace: string; maxRecipients: number }>`. `namespace` is a
  canonical lowercase UUIDv4, generated **once** by the host for one logical queue backing, stable across restarts
  and unique across logical queues even on different backends. It is not a tenant scope, secret, or credential.
  `maxRecipients` is a required safe integer in `51..1_000`, across To/Cc/Bcc combined. An opted-in namespace
  accepts `1..maxRecipients` if the byte limits also fit. Use V1 if 50 is sufficient (and enforce any lower
  relay limit in host policy); use a lower V2 cap if the relay or measured budget cannot support 1,000.
  No global switches, environment variables, request-level overrides, inherited settings, or silent
  clamping. Reject unknown keys, accessors, proxies, explicit `undefined` as opt-in, and unsupported
  combinations. Copy/freeze the exact tuple. The namespace's cap is immutable; changing it requires a new
  namespace, not a reconfiguration of a live one.
- Keep the four existing named-import entrypoints and add **opt-in overloads** only (new signature first, existing
  V1 signature last for V1 utility-type inference). Keep existing types V1, not widened unions. Export the opt-in
  `SmtpCapacity`, `SmtpV2*` DTOs/ports and the third-party store operation map from the root; document integration
  options at their existing adapter entrypoints. `smtpCapacity` must be absent on the V1 route; rule out mixed
  options even on typed variables (`smtpCapacity?: never` on the V1 overload). Root JS/types still have no
  optional-peer dependencies; `/smtp` retains Nodemailer `>=10.6.0 <11` for MIME only,
  `/mongoose` the caller-owned Mongoose `>=9.12.2 <10` connection, `/sendgrid` unchanged. Keep Node `>=24`.
  No new entrypoint, import-time I/O, or model registration.

| Factory (existing names) | Required V2 binding and behavior |
| --- | --- |
| `createEmailTemplateRegistry` | `smtpCapacity` option; just local/Handlebars definitions (an empty registry is valid for an outbox relay). `SmtpV2TemplateRegistry` exposes `smtpCapacity`, `prepareSmtpV2(scope, command, options?)` and `invalidate`. Reuse `defineLocalTemplate` and key-inferred command inputs; SendGrid commands are excluded by type and rejected by runtime guards. |
| `createEmailService` | `scope`, `smtpCapacity`, matching `SmtpV2Store` and `SmtpV2TemplateRegistry`, usual retry/retention. `enqueue` and `enqueuePrepared` admit/replay, never submit. Reject incompatible configuration before any registry callback or store primitive. |
| `createEmailWorker` | `scope`, `smtpCapacity`, matching `SmtpV2Store`, and 1–16 exact live `SmtpV2Provider` profiles, all advertising the same tuple, with unique keys. Existing `run`/`shutdown` and resolver/rate hooks. Missing a particular job's configured key is `profile_unavailable` before handoff, never provider fallback. |
| `createEmailBatchService` | `smtpCapacity` and matching V2 service/worker with equal scope, tuple and **store instance ID**. Require the same wired store handle in that composition, not merely a matching collection label. Prevalidate all static command envelopes/IDs; admit serially, with the same item-level replay rules and bounded time. `run` is scope-wide. |
| `createEmailAdmin` | `scope`, `smtpCapacity`, matching `SmtpV2Store`; same inspect/cancel/resolve/reconcile/cleanup operations, V2 redacted DTOs. Typed optional observer receives the V2 activity. No cross-format view or cursor conversion. |
| `createMemoryEmailStore` | `smtpCapacity`, optional clock and V2-bounded `maxJobs`; a separate map per handle, not an alternate view over V1. Non-durable, for development/test. |
| `createMongooseEmailStore` (`/mongoose`) | `smtpCapacity` is the only V2 option; reject combination with V1 collection/model overrides. Store owns the V2 physical name mapping described below and no models; the host still owns the connection. |
| `createSmtpProvider` (`/smtp`) | Current SMTP options plus `smtpCapacity`; `SmtpV2Provider` exposes `ref`, `smtpCapacity` and only `prepareSmtpV2(input)` returning a one-shot `submit` with SMTP-only normalized result type. Before creating a submission, revalidate the frozen snapshot, tuple, provider ref, IDs, and exact attachment correspondence. No network before `submit`; direct use has no queue guarantees and the host must limit its concurrency. |

V2 service, worker and admin expose `binding: { scope, smtpCapacity, storeInstanceId }`, not a top-level
V1 `scope` port. The instance ID is a non-secret UUIDv4 generated by the store handle (new on recreation),
not a backend identifier or an authority to send. This prevents accidental use with the old batch factory
and permits matching in mixed ESM/CJS without a registry, Symbol brand, class identity, or module-copy check.
The V2 registry and provider have no V1 `prepare` on their raw ports; a legacy binder fails immediately
instead of reaching preparation or using the V2 profile on a V1 queue. Do not add compatibility shims that
forward to V2 or impose new metadata requirements on V1 custom ports.

Shipped declarations and README must teach the exact setup: generate a stable namespace UUID once, reuse the
typed tuple with every factory above, await `store.ready()` before use, prepare with `prepareSmtpV2` for staging,
and keep the queue binding with each staged command and operator reference. Explain **V1 by omission**, local
TLS test setup, how to choose the cap, independent JSON and relay `SIZE` constraints, error codes, optional
peers, and upgrade/rollback. No deep imports or repository-only setup assumptions.

## Handshake before any claim

**The store boundary changes, not just the snapshot decoder.** In V1,
[`readWorkerConfig`](../../../../packages/email-service/src/internal/worker-config.ts) binds legacy methods
structurally and [`claimNext`](../../../../packages/email-service/src/worker.ts) mutates before it validates
the reply. A version field only in the reply, an optional brand, or separate collections alone does not protect
an in-process old worker that is handed a new store. The V2 handle is **not** an `EmailStore`:

```ts
interface SmtpV2Store {
  readonly smtpCapacity: SmtpCapacity;
  readonly instanceId: string;
  readonly ready: (options?: CallOptions) => Promise<void>;
  readonly executeSmtpV2: <K extends keyof SmtpV2Ops>(
    expected: SmtpCapacity,
    scope: EmailScope,
    request: SmtpV2Request<K>,
    call: StoreCall,
  ) => Promise<Readonly<{ smtpCapacity: SmtpCapacity; scope: EmailScope; value: SmtpV2Ops[K]['reply'] }>>;
}
```

`SmtpV2Request<K>` is a discriminated `{ op: K; input: SmtpV2Ops[K]['input'] }` map (omit `input` for
input-free operations); for the union form, distribute per `op` so input types cannot be interchanged.
The operation map uses these names (not methods on the handle) and V1 field semantics:

| `op` values | `input` | `value` |
| --- | --- | --- |
| `findAdmission`, `insert` | Admission key; store admission with V2 prepared command | Exact winner or null; inserted V2 summary or duplicate |
| `findJob`, `findAttempt` | `{ jobId }`; `{ jobId, attemptId }` | V2 summary or null; V2 attempt commit or null |
| `claimNext`, `renew`, `markHandoff`, `finish` | Claim request; `{ fence, leaseMs }` for renew and mark; finish request with V2 result | `StoreNext<SmtpV2Claim>`; lease/handoff grant or null; V2 commit or null |
| `recoverNext`, `expireNext` | Absent | `StoreNext` of V2 commit or V2 summary respectively |
| `cancel`, `resolveUnknown` | `{ jobId }`; existing resolution command | Existing status/decision form with V2 summary |
| `reserveProjection`, `putActivity`, `ackProjection` | Absent for reserve; V2 projection permit for put and ACK | `StoreNext` of permit; existing put/ACK status |
| `listActivities`, `cleanupNext` | Activity query; absent for cleanup | V2 activity page; `StoreNext<CleanupStep>` |

The V2 claim adds the authoritative `snapshotHash` and `recipientCounts`; the worker must recompute and
match both along with the binding, job metadata and exact returned fence **before preflight**. This is
consistency checking, not a signature. Preserve V1 atomic result/state commits, exact-operation ACK
comparison, half-open store-clock guards, and `none`/`contended` semantics.

1. Factories validate the tuple and the correct method shapes synchronously. Missing/wrong capability is
   `invalid_config`. Never accept a V1-only `EmailStore` or rely on a worker limit to widen ingestion. Require
   the V2 store handle to be a frozen null-prototype object with exactly its four declared own data members.
   Reject a dual-shaped handle at wiring, without invoking any method. Never expose a separate legacy-method
   façade over V2 rows. A V1 worker given the very same V2 handle fails to bind; it cannot dispatch a claim,
   recovery or expiry. Coexisting V1 and V2 handles target disjoint storage.
2. Every V2 operation, **including all mutations, scans and maintenance**, checks successful readiness, the
   caller's equality of format/namespace/limit by value, scope and exact V2 request shape **before** any data
   lookup or transition. The expected tuple is captured from trusted factory configuration, not from the
   request DTO or a row. The adapter echoes its own validated tuple and the scoped identity; callers validate
   these and the reply rather than picking a codec from returned data. Absent readiness is
   `store_unavailable`; mismatched operation binding is `store_incompatible` before dispatch to storage.
   Once a mutation is dispatched, an unusable ACK is still `write_unconfirmed` unless a definite rejection
   is known (no send from that ACK).
3. V2 reads/updates require exactly the bound namespace, version, cap and scope, including candidate scans,
   point reads, every CAS, activity stubs/upserts and deletions. Recheck the durable fence, phase and time
   in the *mutation*, not just on read. Decode with the matched V2 codec, not a permissive V1/V2 fallback.
   Mismatched rows are not eligible; reject any surfaced malformed row, impossible counts, bad evidence,
   corrupt selectors/hashes or unbound prepared data. Never launch on an unmatched provider, incompatible
   record, or unconfirmed claim/marker.

Third-party stores must implement this dedicated typed port, durable namespace/cap binding, record shapes
and budgets, backend-time/fencing and no legacy route to these rows; they do not need the Mongo physical
schema or model names. Keep adapter internals private and expose the same narrow frozen handle. Keep V1 custom
stores working as-is on the V1 path. An option echo alone is not conformance: review a V2 adapter against
tests for pre-mutation refusal, concurrent insert/claim, lost ACK,
authoritative proof, projection, byte and read limits, restart, and retention. The host owns trusted in-process
ports and DB access; arbitrary code deliberately wrapping V2 calls in legacy methods or writing around the
adapter is outside this compatibility boundary, not an API or authorization feature.

### Mongo binding and initialization

Derive three private collection names exactly: `email_smtp_v2.<namespace>.format`, `.jobs`, `.activities`.
For example, `.jobs` replaces `.format` on the same prefix. They are deliberately **not legal V1 collection
options** (V1 allows letters, digits and `_` only). No legacy model reservation or shared V1 collection;
reject model aliases targeting any of these private collections. The scopes/index paths stay logical
V1 equivalents (`v2_*` indexes with simple collation): unique scoped job/admission and activity keys,
bounded due ranges, scoped/keyset activity ranges, and TTL for stubs only. Index the exact binding and scope
prefix on data access paths (not the single-field TTL or automatic `_id` indexes) so binding checks do not
turn due or page reads into unbounded scans.

- An adapter-controlled singleton `_id: 'format'` stores `{ version: 2, namespace, maxRecipients, state }`
  with `state: 'initializing' | 'ready'`. Bind the exact tuple into the `.format`, `.jobs` and `.activities`
  validators; V2 job and both activity forms require the V2 record header. Require SMTP live, bounded schema
  arrays/indexes and strict/error validation. V2 data validators include document-size predicates
  (`$expr`/`$bsonSize` with the BSON limits below) in addition to strict shape; logical codecs enforce the
  smaller canonical bounds and cross-field integrity. Mongo 8.x support for this exact contract is a CAP-02
  acceptance check, not an observed result here.
- On `ready()`, verify the same supported deployment, caller binding, document/index catalog and exact
  read semantics as V1. Catalog queries use the exact name (≤1 returned collection per query, ≤64
  returned index definitions per listing); use one-row exact probes and no data scan. A missing manifest
  may be installed only for a new namespace with **no payload collections**. Create the exact manifest
  collection and insert the singleton with journaled majority
  acknowledgement; after races or uncertain responses only a linearizable reread of the exact matching
  record authorizes progress. If payload collections appear during setup, reread the manifest and proceed
  only on an exact matching initializing/ready record; no adoption. An exact matching `initializing` state
  allows only missing exact definitions to be installed, not jobs or activities to be handled. Once both
  catalogs, indexes and bounded read probes pass, commit `initializing → ready` by exact CAS and prove
  the exact ready marker before use. Concurrent initializers with the same tuple can resume; a different
  limit fails without creating/mutating payload definitions. Interrupted initialization is not a usable queue.
- An already ready marker requires **both** collections, exact validators/indexes and healthy binding; if
  missing/mismatched, fail without repair. No `collMod`, deletion, copying, adoption of V1 definitions, live
  catalog edits, or writes bypassing validation. Application credentials must not bypass the adapter's
  invariants. The ready handle pins its caller DB/client binding; require explicit readiness after reconnect/
  replacement as in V1. The manifest is not reread on each primitive; immutable validators plus the
  pinned binding and exact per-operation guards enforce the format. Preserve the manifest with queue backups,
  including after normal queue cleanup. Never activate two restored/live backings with the same namespace.

## Frozen identity, lifecycle and redaction

- V2 staged command, snapshot, job, summary and activity carry `{ version: 2, namespace, maxRecipients }`;
  stubs carry the same binding privately. Internal data without its own header (result/ledger fields, grants,
  status and page envelopes) is decoded under the matched parent/port, never selected by size. An opted-in
  producer does not enqueue V1 snapshots and a V1 consumer does not decode V2. A header may corroborate but
  never select admission limits. Revalidate applicable fields, limits and hashes at every boundary: registry
  capture/render, normal or batch admission, `enqueuePrepared`, store insertion/authoritative reads, worker and
  provider preflight, finish/confirmation, projection and page decode. Reject over-count, aggregate byte
  failures or staged header/hash mismatch as `invalid_snapshot` before insertion (and before any provider
  call); scope, command or provider kind errors use the existing `invalid_command`/`provider_mismatch`
  boundaries. A valid envelope is original frozen order and content; no batching of recipients, truncation,
  or visibility changes.
- Namespace-local admission identity is `(namespace, scope, 'single', idempotencyKey)` or
  `(namespace, scope, 'batch', batchId, itemId)`, with unique backend keys scoped as before **within** the
  bound physical queue. `intentHash = SHA256(canonical(intent))` (same V1 intent budget);
  `fingerprint = SHA256(canonical([2, namespace, maxRecipients, scope, key, templateKey, provider, scheduleAt ?? null, intentHash]))`;
  `snapshotHash = SHA256(canonical(full V2 snapshot))`. Keep `intentHash`, fingerprint, snapshot hash,
  frozen provider/template/schedule, group counts and key after payload pruning, never raw intent or host
  input. An authoritative job read can rederive the fingerprint even after pruning and checks the snapshot
  hash whenever the snapshot exists. Retry and manual redrive use the original snapshot/hash, not current
  templates or a cross-namespace copy. V1 fingerprints and snapshots are neither recomputed in V2 nor rewritten.
- The initial committed lookup for direct/batch admission is before prepare, freshness and policy effects.
  Same fingerprint returns the prior summary without re-prepare even after expiry/pruning; conflicting
  intent is `idempotency_conflict`. On a valid staged relay, verify the matching headers/shape/hash before
  checking replay; the already-admitted snapshot wins if fingerprints match. Only a genuine miss may insert
  within expiry. Races/ambiguous admission ACK get one bounded current exact-key proof path, never a second
  independent command. Absent proof means `write_unconfirmed`: use the *same* scope, binding, key and intent.
- Keep V1 normalized outcomes and phase rules. V2 ports supply and store complete redacted group/index/status
  evidence as explicit objects in To, Cc, Bcc order and increasing zero-based index within each group. Bound
  array length by `maxRecipients` and index by `maxRecipients - 1` before reading entries, and then by each
  frozen group's count. A V2 decoder validates the full partition for SMTP success/partial and full RCPT
  refusal, rejects unordered, duplicate/out-of-range or impossible evidence, and does not invent outcomes for
  unacknowledged RCPTs. Retain known rejected subsets where applicable to negative DATA. A final positive DATA
  reply, not a RCPT reply, establishes acceptance.
  Preserve supported safe-transient cases only; partial/uncertain acceptance cannot auto-resend. No fallback
  relay, no new SMTP retry path, no additional handoff.
- Finish once per attempt with matching owner fence, operation ID and canonical result. The direct ACK and
  confirmation of the same operation must match that exact candidate. A point read may instead show a
  different authoritative winner, e.g. lease recovery; report that winner, never authorize a second send.
  Use the V2 result budget below for both store replay comparison and worker evidence comparison. Use the
  V2 activity budget for canonical projection digests; include the V2 header and frozen redacted
  `recipientCounts` in the activity digest and verify these on read. Authoritative ledger and redacted
  `getJob` exist before projection; page only complete activities.
  Only normalized evidence, group counts/index/status and synthetic permitted IDs plus existing redacted job
  metadata are exposed. No recipient addresses/names, message content, refs, credentials, tokens, raw
  replies/diagnostics, or hashes of private payloads in admin outputs. Correlation tokens remain host-supplied,
  non-PII, and subject to the V1 bounds. V2 cursor encoding is base64url of compact canonical
  `{ v: 2, n: namespace, c: maxRecipients, s: scope, j: jobId, f: from, b: before, p: [finishedAt, lastJobId, attemptId] }`
  (absent filters are `null`, same as V1). Cursors are not authorization or cross-namespace pagination.

## Resource contract

Binary units. Bytes are **compact canonical UTF-8 JSON**, not JS string length or heap, except the separate
physical BSON column. A value is each scalar, object or array, once (object keys are not values); depth uses
root zero. The caps below are inclusive and enforced at the boundaries of these roots. Use bounded strict
decoding (size/width checks before iteration/copying), then the existing canonical ordering, escape counting
and SHA-256; budget equality checks off the same normalized format. Do not keep a list of whole documents just
to count/compare them. Control envelopes for one store request/ACK add at most 1 KiB / 32 values beyond checked
payload roots; they carry validated tuple and operation/fence metadata only, and no independent content.

| V2 root | Max canonical bytes | Max values | Max depth | Mongo BSON ceiling |
| --- | ---: | ---: | ---: | ---: |
| Snapshot | 2 MiB (2,097,152) | 4,096 | 4 | In the job |
| Prepared/outbox wrapper, including snapshot | 2 MiB + 4 KiB (2,101,248) | 4,128 | 5 | N/A |
| Attempt result / commit / ledger entry (each including its nested evidence) | 64 KiB (65,536) | 4,096 | 3 / 4 / 5 | In the job |
| Authoritative job, including snapshot and 11-entry ledger (also bound for normalized physical mapping) | 3 MiB (3,145,728) | 50,000 | 7 | 4 MiB (4,194,304) |
| Redacted job summary | 4 KiB (4,096) | 128 | 3 | N/A |
| Claim payload including summary, snapshot, hash, fence/grant | 2 MiB + 8 KiB (2,105,344) | 4,352 | 5 | N/A |
| Redacted activity (or its normalized physical form incl. ID/digest/stub metadata) and projection permit (each as a root) | 64 KiB (65,536) | 4,096 | 4 (activity) / 5 (permit) | 128 KiB (131,072) per physical activity/stub |
| Public page (`items`, optional next cursor; max 16 activities) | 1 MiB + 1 KiB (1,049,600) | 65,539 | 6 | At most 17 rows / 2,228,224 BSON bytes plus command framing |

Capacity argument (conservative, over-approximates mutually exclusive fields/outcomes):

- The V1 mailbox grammar stays unchanged: ASCII addr-spec ≤254 bytes (cannot contain `"` or `\`),
  optional name ≤128 UTF-8 bytes (≤256 after JSON escaping). `{"address":"","name":""}` takes 24 bytes;
  with the comma allowance, each mailbox costs at most **535 bytes / 3 values**. From/Reply-To cost the
  same but do not count as recipients. Up to 1,000 names allocated in **any** mix of To/Cc/Bcc cost at most
  535,000 bytes. With both body parts present, there are at most **`78 + 3N = 3,078` values**, including
  the five seven-field refs, eight correlation fields, envelope arrays and V2 header. Reserve 12 KiB
  (12,288 bytes) for nonrecipient, non-body overhead: ≤1,080 for From/Reply-To; ≤1 KiB per attachment
  descriptor; ≤1,152 for correlation; ≤1,056 for subject (512 UTF-8 bytes, ≤1,024 escaped) and its field;
  ≤2 KiB for the remaining header, provider/template/times, keys and punctuation. Thus both full
  **512 KiB HTML + 256 KiB text** with no JSON escape expansion and the widest recipient fields together
  take at most `786,432 + 535,000 + 12,288 = 1,333,720` bytes. Body content can need up to 6 encoded bytes
  per raw byte (e.g. NUL), so independently valid part sizes need not fit together. Check the exact 2 MiB
  aggregate in preparation/staging and before insert, not by reducing the audience or body. Intent/data
  remain at V1's 16/64 KiB and 2,048 values each, depth 12; template source and raw body caps are unchanged.
- A worst-width `{"group":"bcc","index":999,"status":"rejected"}` takes 47 bytes (same for `accepted`),
  plus at most one separator byte per recipient, and 4 values including the object. A 1,000-outcome list
  costs at most 48,002 bytes including brackets. Result metadata including optional retry hint and the
  fixed synthetic 52-byte SMTP message ID is below 1 KiB; at most `4N + 10 = 4,010` values. The commit
  adds at most 11 values and the ledger wrapper at most 5; neither adds even 1 KiB. An activity adds at
  most 32 values outside the result, excluding three physical scalar fields; its metadata (including
  max-width correlation, keys, and optional wrapper/digest) is below 4 KiB. This reserves room for a full
  mixed result in **every** encoding, equality, storage and projection path. There is no V2 SendGrid ID.
- The full job reserves `2 MiB + 11 × 64 KiB + 8 KiB = 2,826,240` bytes and
  `4,096 + 11 × 4,096 + 256 = 49,408` values, including metadata, resolutions (≤2), lease and physical
  selectors. It stays under both job caps even budgeting a maximum-size result in all 11 slots. A
  reachable cap test is nine full transient RCPT refusals, an ordinary unknown, then one explicitly
  acknowledged manual redrive with full mixed result; not eleven successful attempts. Ordinary max
  is still 10, manual max 1, and attempts are immutable once committed.
- On the selected Mongo mapping, for normalized objects with these scalar types, canonical bytes plus
  **`15 × values + 5`** bounds BSON: allow one type byte, a cstring terminator, up to three decimal array
  index digits and up to eight extra scalar/embedded-header bytes per value, plus root framing. Object
  key and raw string bytes are already counted in compact JSON. Stub dates are normalized to bounded epoch
  integers for the check. Thus a cap-sized job is ≤3,895,733 BSON bytes, and a physical activity ≤126,981,
  below their physical ceilings; neither accepted success nor a later projection can fail *because it
  outgrows these budgets*. Validate actual BSON size when mapping records before writing and use the exact
  V2 validator at rest. A DB administrator who bypasses validation can make the driver decode an oversized
  corrupt row before the application rejects it; the budget is not a guard against a privileged or nonconforming
  server.
- Pages default to **8**, range `1..16`, and reject a greater limit rather than truncate an activity.
  Return complete items in `(finishedAt DESC, jobId ASC, attemptId ASC)` order, and a cursor if the extra
  row exists. `16 × 64 KiB + 1 KiB` covers framing and the ≤512 ASCII-byte cursor; `16 × 4,096 + 3`
  covers items, array, outer object and cursor. Check requested scope/filters/order and cursor re-encoding
  as well as byte/shape limits. A page is not a snapshot across concurrent maintenance.

As a design arithmetic check only, a stand-in JSON shape with 334 To, 333 Cc and 333 Bcc, 254-byte
addr-specs, 128-byte backslash names, both full raw body parts and five refs serialized to 1,330,029 bytes
and 3,078 values. Replacing 153,424 HTML characters with NUL and three text characters with backslash
reached exactly 2,097,152 bytes at the same raw sizes; one more backslash added one byte. A stand-in
1,000-entry alternating result was 47,172 bytes / 4,007 values; its activity was 49,181 bytes / 4,039
values and measured 58,543 BSON bytes with storage metadata. This is serialization arithmetic
(`JSON.stringify` sizes, value counts, and the installed BSON size calculator), not a V2 codec,
queue or MongoDB test. The limits above derive from the shape bounds, not these particular samples.

### Work and reads

- V2 registry `maxPending` defaults to 2 (`1..4`); template cache defaults to 8 (`0..16`) entries.
  V2 service allows up to 4 concurrent admissions per instance (including staged); one in-progress request
  per batch facade, one item prepared/admitted at a time, existing max 100 items and static intent caps.
  Batch can hold 100 detached intent trees (≤1,638,400 canonical bytes and 204,800 values combined), not
  100 prepared snapshots; opaque inputs are referenced, not traversed or copied by the batch facade.
  V2 admin allows one in-progress operation per instance; reconciliation and cleanup default to 4 steps,
  range `1..16` each, with at most one unsettled observer. Overlap/cap exhaustion is `busy`; retain bounded
  callback slots until settlement on ignored cancellation, as in V1. Do not indefinitely queue waiting calls.
- V2 worker defaults to 1 active claim slot per instance (`1..2`, run concurrency may only reduce it).
  One run per worker, claim limit default 4 (`1..16`), each maintenance sweep default 4 (`0..16`) with
  one coordinator. Held slots include unresolved callbacks from prior runs; no extra claim for a late
  callback. One unpooled socket/transaction per active SMTP attempt. Package-owned copied attachment bytes
  are bounded by two sets (resolver capture and provider validation), each ≤5 MiB total, refs ≤5 and each
  ≤2 MiB; load serially pre-handoff and stream MIME with backpressure, not a buffered wire message.
  These limits bound accepted data and work, not arbitrary host callback allocation, engine RSS, or the
  number of process instances the host creates. Schedule and separately limit aggregate workers/relay
  traffic across instances/processes.
- V2 Mongo handle allows at most **4** simultaneous data primitives, across all scopes; max 5 s per
  primitive and one absolute budget across its RPCs, same journaled majority/linearizable point/majority
  range semantics as V1. Due scan uses one indexed `singleBatch` of at most **4 projected job IDs**
  and then at most 4 exact full-job reads, sequentially, with at most 3 CAS submissions. A point mutation
  uses at most 3 exact full-job reads and CAS submissions. Don't return a full replacement for a job write
  ACK (ID/revision proof only). Admission insert has at most 4 exact job reads including duplicate proof;
  service-level lookup and post-insert recheck add at most two. Finishing retains the two-attempt same-write
  retry and at most two exact confirmation reads under a single grace. Projection put reads one job and
  processes up to three activity rows including its write reply and proof; ACK at most three point pairs
  (job/activity). Cleanup can add one job recheck and at most `2 × 11` exact activity reads per purge CAS
  (pin/check absence), so absolute cleanup primitive bounds are 7 job rows and 66 activity rows,
  processed serially, not held as a batch (≤36.25 MiB cumulative BSON, excluding framing).
  Enforce the limit and remaining time before each RPC.
- Page selection reads **at most 17 total full activities** across at most three disjoint indexed keyset
  ranges, with residual row limit, `singleBatch`, no `getMore`, full-scope scans, or N+1 lookups to jobs.
  The four-call handle cap applies to simultaneous page reads as well. V2 memory store `maxJobs` defaults
  to 8 (`1..16`, across scopes); at cap it returns `store_capacity`, no eviction or fallback. At most
  176 complete activity rows plus 16 jobs, ≤59 MiB in aggregate canonical root bounds (not heap/index
  size). A replacement memory handle has no deduplication/retention state; treat it as a fresh development
  namespace, not recovery of the old one. Durable total retained count/disk is a host concern: monitor
  occupancy, backpressure and maintenance, especially indefinitely held unknowns and projection lag;
  per-call caps are not disk quotas.

## SMTP/time decision

Keep verified TLS 1.2+ (implicit or required STARTTLS), socket/DNS/stream cancellation, exact one message and
To/Cc headers/Bcc envelope-only. Reuse V1 serial `RCPT TO`, reply/frame limits and anchored absolute deadlines.
Do not negotiate new features, pipeline, extend timeout ranges, or add retries in the transport for capacity.
Do not equate canonical snapshot bytes with relay message size: serialized names/headers grow with recipients
(only visible groups add recipient headers; all groups add RCPT exchanges); accepted raw parts are up to
786,432 body bytes + 5,242,880 resolved attachment bytes. For each of up to seven parts of `n` raw bytes,
base64 needs `b = 4 × ceil(n/3)` bytes plus up to `2 × ceil(b/76)` for line framing; together under 8 MiB
for part lines. In the current composer, a display name is at most four ≤64-byte encoded words, then a
≤254-byte address and bounded punctuation/folds; allow 544 bytes per visible mailbox (including From and
Reply-To). Reserve 9 MiB for planning DATA transfer, including remaining headers and MIME framing, not as
a configured acceptance rule; CAP-03 must verify maximum-width payload/headers on the supported composer.
There is no new `SIZE` negotiation or relay acceptance guarantee. Hosts qualify their relay's recipient,
message and header limits with realistic content and throughput: 9 MiB at 10 Mbit/s takes ~7.5 s before
other costs.

Default/max provider deadlines remain **15 s / 60 s**. At launch the effective window is the minimum of
configured provider timeout, remaining run time, and conservative lease time left minus finish grace, after
timely handoff ACK and strict pre-handoff/expiry checks. Do not extend expiry or renew after handoff to get time.
For example, at 60 s provider timeout, 5 s store timeout and 10 s finish grace, configuration requires a
lease of at least 76 s (includes the 1 s safety margin); plan `leaseMs: 90_000` and a run with enough budget
(e.g. `{ limit: 1, timeoutMs: 90_000 }`, not the 30 s default) plus expiry headroom. Actual elapsed time may
still shorten the window. Positive acknowledgements, safe retries and unknown outcomes retain V1 semantics.

Use the [measured serial model](v1-timing.md#budget-for-1000-not-a-v2-measurement): for a measured effective
per-recipient wait `L` and reserved non-RCPT work/jitter `R`, pick the largest `N` satisfying
`N × L + R < effectiveWindow`, the relay's limits and the fixed 1,000 cap. Account for tails across the **whole
transaction**, not just average network RTT. With an illustrative 5 s reserve, 1,000 needs less than 10 ms per
recipient at the default window or less than 55 ms at the full maximum. Both assumptions require CAP-03
validation. If the supported relay class cannot fit, pause for a decision (lower cap or separately reviewed
deadline/protocol design), not a hidden fallback or an optimistic release.

## Upgrade, rollback and retention

1. Keep the V1 service, worker, maintenance and admin on existing namespaces unchanged. Install new runtime
   and prepare an **empty** V2 namespace with its agreed immutable cap and V2 readers/workers configured.
   Test readiness and exact profiles before routing new eligible SMTP intents. Old workers may continue
   concurrently with new workers on **V1**; none can touch V2. SendGrid stays V1.
2. Persist the chosen route with the original host/outbox transaction (`format`, backend/namespace and
   scope plus command/key). Admission/replay/ACK recovery are strictly namespace-local; one logical command
   goes to **one** namespace even during a deployment. An equal external key submitted in two namespaces
   can admit twice; the package has no cross-queue lookup/guard and a miss elsewhere is never evidence of
   nonacceptance. Keep old staged payloads in their original format/namespace, do not re-stage or dual-write
   them across the cutover. Same for operator references/cursors. Let queued, leased, retrying, unknown,
   and terminal V1 work continue under V1 semantics until settled/retained; no in-place row migration.
3. Roll back by stopping **new V2 routing**, not by downgrade conversion. Quiesce outgoing V2 senders with
   `shutdown` and track unresolved I/O if shutdown cannot confirm `stopped`. Either retain a known-compatible
   V2 runtime to drain original work (relay already-staged commands only on the original route), or stop V2
   admission and park the original outbox and namespace read-only/offline until a compatible runtime resumes
   recovery, expiry, inspection and maintenance. A pre-handoff lost lease is recoverable using the normal
   safe evidence; a handed-off lease/ambiguous finish is not a fresh send. Staged work that expires while
   parked is still subject to normal expiry/replay checks. Never requeue an unresolved V2 command into V1,
   including smaller ones or after an unconfirmed write. Only genuinely new compatible intents route to V1.
   If rollback can no longer accept a large envelope, tell the host, don't alter it.
4. Keep V1 and V2 retention rules frozen per job (7 d payload, 30 d history/identity defaults, same ranges).
   Unresolved unknown and pending projection hold pruning; cleanup proceeds in the original format using
   store-timed 60 s projection permits and the high-water drain (`permitUntil + 31 s`). Retire and confirm
   deletion of projections before removing the idempotency guard, not before the latest retention window.
   Only incomplete identity stubs are TTL-eligible (60 s); never TTL jobs or complete activities. Explicit
   duplicate-risk redrive is limited to the original, unexpired snapshot and one manual attempt in that
   namespace. Back up and protect queues, manifests and outboxes, including during rollback.
   Keep compatible V2 readers until retention and investigation are resolved; never drop or replace format
   collections to force cleanup or change the cap. If changing capacity, repeat the parallel-namespace
   procedure with a fresh UUID and distinct route.

## Gate for later stages

- **CAP-02:** Implement with explicit format context through existing codec/transition bodies, not a second
  delivery state machine or a widening of V1's 8 KiB digest/equality and 50-recipient limits. Prove 50/51
  isolation, V2 1,000/1,001, mixed maximum-width field and exact aggregate
  boundary/plus-one cases, the 11-entry reachable ledger, complete projection, replays and redacted/wrong
  cursor rejection. Test two differently configured V2 consumers plus V1 (same scope/key and same process);
  give an actual old V1 runtime the new V2 store handle via JS, assert **no claim/maintenance dispatch,
  revision or lease change** even for a small V2 row. Also test wrong version/namespace/cap and unready stores
  before any transition, not merely before SMTP, and reject a dual-shaped custom handle at wiring.
  In disposable real Mongo, verify catalog/binding/size
  guards, same/different-cap initializer races, interrupted readiness, old/new physical isolation, retention
  and rollback with real outstanding/staged work and unconfirmed ACK; V1 validators and old rows remain usable
  byte-for-byte without upgrades. Cover mismatches with third-party V1 and conformance for a V2 adapter.
- **CAP-03:** Confirm 1,000 with the maintained verified-TLS synthetic loopback at measured delays, including
  authenticated STARTTLS, both body parts/attachments, max-width visible headers, definitive mixed refusals,
  reply ordering, delayed/missing final ACK, abort and lease recovery on both sides of handoff, uncertain
  finish without resend, and default/max *effective* budgets. No independent work on pipelining or timeout
  changes is authorized by this design.
- **CAP-04:** Verify packed strict TS, ESM/CJS (including a mixed-module handshake), Node floor, existing
  imports/optional peers and V1 SendGrid suites. Inspect emitted declarations for opt-in JSDoc and README
  example discoverability through installed imports. No release work is included.
