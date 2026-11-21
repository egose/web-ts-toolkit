# SMTP-CAP-01 — Approved implementation contract

This is the coordinator's implementation contract for SMTP-CAP-02 through SMTP-CAP-04. It adopts the
[capacity proposal's resource analysis](capacity-contract.md#resource-contract),
[verified-TLS timing decision](v1-timing.md#budget-for-1000-not-a-v2-measurement), and
[namespace-local rollout and rollback](capacity-contract.md#upgrade-rollback-and-retention).
The API and Mongo setup below replace the proposal's parallel V2 API and three-collection manifest. The
qualification is unchanged: 1,000 is a supported opt-in ceiling on a sufficiently fast relay, not a
guarantee at every deadline or a reason to change the serial SMTP protocol.

## Factory and request boundary

- Export a single new shared option type from the root:
  `SmtpCapacity = Readonly<{ format: 'smtp-v2'; namespace: string; maxRecipients: number }>`.
  Validate a canonical lowercase UUIDv4 namespace and a safe integer `maxRecipients` in 51–1,000.
  `smtpCapacity` is an optional, explicit trusted factory option; omit it for V1. With opt-in it applies
  to every message in that lane, including smaller ones. Use the same tuple across the registry, store,
  service, SMTP provider, worker, batch and admin. Reject malformed options, accessors and unknown fields
  and copy/freeze configuration. A capacity lane is SMTP live only; SendGrid and default SMTP stay V1.
- Keep the existing factories, method names and DTO `version: 1` types. An opt-in message or receipt has
  **additional required binding metadata at runtime**, `smtpCapacity`, in its prepared command, SMTP
  snapshot, durable logical job, job summary and activity. Their public types have the additive optional
  field; a V1 value never has it. This preserves existing TypeScript usage while explicitly separating the
  new storage format from the public DTO wire version. Select limits from trusted factory or store
  context, never from a raw DTO, and require exact equality of the tuple when decoding. Conversely, a
  V1 decoder must reject a tagged value. V1 hashes, shapes, and limits do not change.
- Store, registry, provider, service and worker ports advertise `readonly smtpCapacity?: SmtpCapacity`.
  The service checks matching registry and store; the worker checks matching store and SMTP profiles;
  admin checks its store; batch checks scope and matching service/worker binding. V1 structural ports
  remain supported without new fields. The same namespace must identify one logical backing; different
  logical backings (including independent memory stores) must use different UUIDs. Do not share a UUID
  across backings or use a mutable count under an existing Mongo namespace.
- **Fence all store primitives before lookup or mutation.** `StoreCall` carries an optional
  `smtpCapacity`; every core service/admin/worker call with the opt-in supplies the captured tuple.
  Every opted-in store primitive requires it and checks exact equality to its own binding before doing
  any work; a V1 call has no extra field. `ready()` uses the factory's own configuration and is not an
  admission/worker primitive. An old worker handed a new store in-process can call a method, but
  cannot claim, recover, expire or change a row: its calls lack the required binding. It must observe
  the normal safe store error, not a fake idle queue. Third-party stores stay V1 unless they implement
  and advertise the same tuple, operation fence and storage/budget semantics. Trusted ports bypassing
  the contract deliberately are outside the compatibility boundary.

## Persistence and codec requirements

- The Mongoose opt-in owns exactly `email_smtp_v2.<namespace>.jobs` and
  `email_smtp_v2.<namespace>.activities`; reject V1 collection/model overrides in opt-in.
  Names cannot alias a legal V1 name. Require the exact tuple in both validators (including the
  activity stub); the existing V1 physical validators/indexes stay byte-for-byte compatible. Prepare
  the jobs definition first, so concurrent initializers with different caps cannot establish different
  halves of the pair; check any existing counterpart definition before creating missing definitions.
  Reuse the exact catalog and index checks, acknowledged setup and readiness probes. As with V1,
  readiness installs only missing definitions; never rewrite a validator, convert old rows, or touch
  V1 collections on the opt-in path. Queue collections are private; destructive manual edits or
  partial restore are unsupported. Restore the pair together, offline, under its original tuple.
- Guard CAS operations and keyed reads within the bound namespace and verify the exact record
  binding on decode. Key indexes need not repeat the namespace, as each bound collection has exactly
  one tuple. The mandatory binding field and V2 namespace/validator identify the new record format
  without changing the public `version` literal. Include the tag on Mongo stubs/upserts as well as
  complete records. Reuse the current BSON mapping and atomic lifecycle. Enforce BSON ceilings with
  exact V2 collection validators and/or bounded size checks at the mapping boundary; prove them on
  the real Mongo fixture. No new Mongo runtime dependency.
- Preserve V1 hashing; add a V2 domain and the namespace/cap tuple to the admission fingerprint. Hash
  the full tagged snapshot with the expanded bounds. Validate staged/header/cap and hashes before
  insertion, and read back the original frozen envelope/content on each retry. Keep the established
  V1 idempotency semantics and prove collision/conflict handling within the namespace. No cross-queue
  replay or migration. An outbox must retain its original route; rolling back stops new routing, not
  conversion or replay of uncertain work.
- Select attempt evidence and projection digest limits using the bound context. V2 activities include
  redacted `recipientCounts` for context validation and cursor encoding binds to the tuple. Validate
  the same complete group/index recipient partition on the worker, authoritative record, retry
  comparison and admin sides. Keep the existing evidence semantics and order; do not add a second
  state machine. Preserve the real I/O cancellation, retry classification, handoff and finalization
  guarantees. No addresses, raw replies, body, refs or credentials in history.
- Retain the proposal's measured/derived upper bounds: 2 MiB / 4,096 values per snapshot, 64 KiB /
  4,096 values per attempt result and per activity, ≤11 attempt commits, ≤3 MiB normalized JSON /
  4 MiB BSON per job, ≤128 KiB BSON per activity, and default/max page sizes 8/16 with at most 17
  Mongo rows. Enforce exact snapshot and evidence byte budgets with canonical JSON. Structurally
  bounded validated fields and weight of nested roots can establish the job/page totals without
  reserializing an entire page or job at every call. Keep the stricter opt-in work caps from the
  proposal (worker concurrency at most 2, Mongo at most 4 in-flight and 4 due IDs, memory at most 16
  jobs, bounded admin and preparation/admission work) without narrowing V1.

## Delivery gates

- CAP-02 proves scope/namespace isolation, legacy store/worker refusal with **no unsafe mutation**,
  V1 compatibility and rollback against real Mongo, full-sized evidence through exact ACK/replay
  and history, the reachable 11-entry ledger, and aggregate byte rejection before submission.
- CAP-03 verifies the existing serial transport on synthetic verified TLS at 1,000 with representative
  delays and mixed outcomes, covers largest visible headers/attachments, and exercises uncertain
  wire and finish paths. It does not change deadlines, SMTP protocol or the target.
- CAP-04 ships installed documentation and runs the packed peer/module/type/floor matrix and the
  canonical serial package tests. No publication or downstream application changes are authorized.
