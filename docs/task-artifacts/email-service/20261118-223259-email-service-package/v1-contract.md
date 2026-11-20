# Email service V1 contract

EMAIL-00 design and handoff for the [email service task](../../../tasks/20261118-223259-email-service-package.md).
This is the implementation contract, not an implementation or a runtime test report. It was authored from the task
requirements and workspace conventions. There are no copied sources, scratch dependencies, raw data, or executable
artifacts to retrieve. The [failure matrix](#verification-matrix) specifies maintained tests to add in the package.

- Consumers: [package](#package-and-responsibility-boundaries), [templates](#typed-commands-and-prepared-snapshots),
  [admission and batch](#admission-staging-and-batches), [admin](#admin-activity-projection-and-retention).
- Implementers: [provider evidence](#outcomes-and-provider-contract), [state transitions](#job-state-machine),
  [worker budgets](#worker-deadlines-and-errors), [store primitives](#store-adapter-transaction-primitives).

## Package and responsibility boundaries

One `@web-ts-toolkit/email-service` package, Node `>=24`, named exports only:

<!-- prettier-ignore -->
| Export | Runtime and public surface |
| --- | --- |
| `.` | Registry and template helpers, admission service, worker, batch service, admin, memory store, and their types, including the provider/store contracts. Node built-ins and Handlebars only. |
| `./smtp` | `createSmtpProvider` and `SmtpProviderOptions`; optional Nodemailer peer, no Mongoose or SendGrid dependency. |
| `./sendgrid` | `createSendGridProvider` and `SendGridProviderOptions`; Node HTTPS, no SendGrid SDK/peer. Mail Send only, not template CRUD or activation. |
| `./mongoose` | `createMongooseEmailStore` and `MongooseEmailStoreOptions`; optional Mongoose peer, explicit caller-owned `Connection`, no provider dependency. |

Use `dist/{index,smtp,sendgrid,mongoose}.{mjs,js,d.mts,d.ts}` with `.js` CommonJS, `.mjs` real ESM and the corresponding
import/require declaration conditions per export. Align `main`, `module`, `types` with the root files; the export map
contains only the four advertised entries. Publish `README.md` and `dist`; verify the release packer's rewritten paths
as well as the regular tarball. `sideEffects: false`: no import-time I/O, models, timers, global registries, or global
credential changes. Use a Node-resolvable build (no unbundled extensionless imports). Handlebars 4.7 is a runtime dependency.
Use Mongoose 9 (`>=9.12.2 <10`, starting from the workspace lock) and the Nodemailer 7 transport API (`>=7 <8`);
install security-reviewed patches and set the actual published Nodemailer floor no lower than the tested supported
patch. Peers are optional in metadata and never in the root JS or declaration closure. Use `error.code`, not class
identity across separately loaded ESM/CJS builds. Ship JSDoc for the factories, typed command, provider/store contracts,
and unsafe-to-infer boundaries (outbox, retries, redrive, shutdown); teach named package imports in the installed README.

The host owns authorization for scope, enqueue, operations and operator actions, and schedules calls to bounded run
methods. Registry preparation is independently callable; the service only admits, the worker submits, and the admin
surface inspects/changes jobs and reconciles history. Inject only the capability an application needs. This separation
is not authentication or an HTTP API. There is no immediate unmanaged `service.send`, legacy compatibility, workflow
or campaign system, provider failover, queue fallback, inbox tracking, recall or exactly-once guarantee.

## Typed commands and prepared snapshots

Signatures below specify the consumer surface; `Readonly`/readonly fields should be preserved on DTOs in declarations.
`UnixMs` is integer UTC epoch milliseconds, `0..253402300799999`; timeouts are elapsed integer milliseconds.

```ts
type UnixMs = number;
type EmailScope = string;
type EmailJobId = string;
type EmailAttemptId = string;
type Awaitable<T> = T | PromiseLike<T>;
type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
type JsonObject = { readonly [key: string]: JsonValue };
type Correlation = Readonly<Record<string, string>>;
type Mailbox = { address: string; name?: string };
type EmailEnvelope = {
  from: Mailbox;
  to: readonly Mailbox[];
  cc: readonly Mailbox[];
  bcc: readonly Mailbox[];
  replyTo?: Mailbox;
};
type ProviderRef =
  | { kind: 'smtp'; key: string; mode: 'live' }
  | { kind: 'sendgrid'; key: string; mode: 'live' | 'sandbox' };
type EmailAdmissionKey =
  | { kind: 'single'; idempotencyKey: string }
  | { kind: 'batch'; batchId: string; itemId: string };
type TemplateIdentity = { key: string; revision: string };
type AttachmentRef = {
  resolverKey: string;
  id: string;
  version: string;
  filename: string;
  contentType: string;
  byteLength: number;
  sha256: string;
};
type PrepareContext = {
  scope: EmailScope;
  key: EmailAdmissionKey;
  templateKey: string;
  provider: ProviderRef;
  now: UnixMs;
  signal: AbortSignal;
};
type PreparedFields<D extends JsonObject> = Partial<EmailEnvelope> & {
  values: D;
  expiresAt?: UnixMs;
  priority?: number;
  attachments?: readonly AttachmentRef[];
  correlation?: Correlation;
};
type LocalSource =
  | { kind: 'inline'; content: string }
  | { kind: 'file'; path: string }
  | { kind: 'async'; load: (context: { signal: AbortSignal }) => Awaitable<string> };
type TemplateDefinition<I, D extends JsonObject> = {
  revision: string;
  defaults?: Pick<Partial<EmailEnvelope>, 'from' | 'replyTo'>;
  parseInput: (input: unknown) => I;
  parseData: (data: unknown) => D;
  prepare: (input: NoInfer<I>, context: PrepareContext) => Awaitable<PreparedFields<NoInfer<D>>>;
};
type LocalTemplateConfig = {
  kind: 'handlebars';
  subject: LocalSource;
} & ({ html: LocalSource; text?: LocalSource } | { html?: LocalSource; text: LocalSource });
type SendGridTemplateConfig = {
  kind: 'sendgrid';
  templateId: string;
};
type LocalTemplate<I, D extends JsonObject> = TemplateDefinition<I, D> & LocalTemplateConfig;
type SendGridTemplate<I, D extends JsonObject> = TemplateDefinition<I, D> & SendGridTemplateConfig;
// The never argument constrains callback assignability, not the public command input.
type TemplateMap = Readonly<
  Record<
    string,
    Omit<TemplateDefinition<never, JsonObject>, 'parseInput'> & {
      parseInput: (input: unknown) => unknown;
    } & (LocalTemplateConfig | SendGridTemplateConfig)
  >
>;
type TemplateCommand<T extends TemplateMap> = {
  [K in keyof T & string]: {
    templateKey: K;
    input: ReturnType<T[K]['parseInput']>;
    provider: Extract<ProviderRef, { kind: T[K]['kind'] extends 'handlebars' ? 'smtp' : 'sendgrid' }>;
    intent: JsonValue;
    scheduleAt?: UnixMs;
  };
}[keyof T & string];
type EmailCommand<T extends TemplateMap> = TemplateCommand<T> & { key: EmailAdmissionKey };
type SnapshotFields = {
  version: 1;
  template: TemplateIdentity;
  envelope: EmailEnvelope;
  preparedAt: UnixMs;
  expiresAt: UnixMs;
  priority: number;
  attachments: readonly AttachmentRef[];
  correlation: Correlation;
};
type EmailSnapshot = SnapshotFields &
  (
    | { kind: 'smtp'; provider: Extract<ProviderRef, { kind: 'smtp' }>; subject: string; html?: string; text?: string }
    | { kind: 'sendgrid'; provider: Extract<ProviderRef, { kind: 'sendgrid' }>; templateId: string; data: JsonObject }
  );
type PreparedEmailCommand = {
  version: 1;
  scope: EmailScope;
  key: EmailAdmissionKey;
  scheduleAt: UnixMs | null;
  intentHash: string;
  fingerprint: string;
  snapshotHash: string;
  snapshot: EmailSnapshot;
};
type CallOptions = { signal?: AbortSignal; timeoutMs?: number };
interface EmailClock {
  now(): UnixMs;
  monotonicNow(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}
type TemplateRegistryOptions = {
  clock?: EmailClock;
  cacheEntries?: number;
  maxPending?: number;
  helpers?: Readonly<Record<string, (...args: unknown[]) => unknown>>;
};
interface EmailTemplateRegistry<T extends TemplateMap> {
  prepare(scope: EmailScope, command: EmailCommand<T>, options?: CallOptions): Promise<PreparedEmailCommand>;
  invalidate(templateKey?: keyof T & string): void;
}
declare function defineLocalTemplate<I, D extends JsonObject>(definition: LocalTemplate<I, D>): LocalTemplate<I, D>;
declare function defineSendGridTemplate<I, D extends JsonObject>(
  definition: SendGridTemplate<I, D>,
): SendGridTemplate<I, D>;
declare function createEmailTemplateRegistry<const T extends TemplateMap>(
  definitions: T & {
    [K in keyof T]: TemplateDefinition<ReturnType<T[K]['parseInput']>, ReturnType<T[K]['parseData']>>;
  },
  options?: TemplateRegistryOptions,
): EmailTemplateRegistry<T>;
```

`parseInput`/`parseData` are synchronous; parse failures map to `invalid_input`/`invalid_data`. `parseData` receives
detached, frozen plain JSON and may return a new object to normalize it; both input and returned data must meet
the data limits. A preparer throw/rejection maps to `preparation_failed`; source/load and Handlebars failures map
to `template_source` and `template_render`. Preserve abort/deadline codes instead of exposing callback exceptions.
Host `input` can be nonserializable; only the host parser/preparer touches it. Copy validated configuration, prepared
JSON/data, envelopes and refs before any subsequent asynchronous step; return deep-readonly detached DTOs and
revalidate at storage and transport trust boundaries. For local templates, discard prepared values after rendering. No raw input, unbound paths,
serialized secrets, provider options or callback return object identities enter the store implicitly.

`from` is required after defaults; `replyTo` is optional. Prepared fields override only those defaults; missing recipient
lists become `[]`, correlation/attachments become empty, priority becomes `0`. Preserve To/Cc/Bcc order and visibility;
reject duplicate destinations across groups (case-insensitive ASCII comparison, preserve supplied spelling on wire).
Require at least one recipient; SendGrid requires nonempty To for its single personalization. SMTP permits Cc-only or
Bcc-only; use a separate explicit SMTP envelope with all recipients, and never serialize a Bcc header. No group
expansion, address-list strings, arbitrary headers, hidden per-recipient fan-out, or change to recipient lists on retry.

Sources and helpers are trusted configuration, not user-submitted content or a sandbox. Each registry has its own
Handlebars environment. Compile in strict mode; use default HTML escaping, plain subject/text (`noEscape`), no
prototype access or runtime-supplied helpers/partials. Trusted templates/helpers can explicitly bypass escaping; it is
not sanitization. No missing-template/source fallback. File sources are explicitly declared host paths; check the
opened file is regular, read at most the source byte bound plus one, decode strict UTF-8, and request closure on abort.
Wait for package-owned file descriptor cleanup before settling; a pending OS syscall can outlive the nominal deadline,
but must not start another stage. Never resolve a path from input. An async loader gets the preparation signal and
returns one string for its slot. Async loaders and preparers accept native promises or thenables with a data `then`
method. Wrap accessor-backed thenables in an async host callback; the package does not invoke accessors to detect them.
Cache only complete successful source sets/compilations, by key/revision, LRU 32 entries (`0..128`), not by input
or rendered output. `invalidate(key?)` evicts one/all and fences prior in-flight
loads from repopulating invalidated entries. In-flight renders may finish using their starting sources; update the
revision and use a new registry for a new advertised content release. No background reload or pre-opened descriptor.
Uncached concurrent prepares may independently load; a host editing multiple files in place cannot assume a
transactional source read. SendGrid freezes an ID and data, not the remote active version; hosts requiring
consistent content must not edit/switch the active remote template behind that ID.

### Serialization and fixed ceilings

- Strict plain JSON for intent/data/snapshots: dense arrays and plain own-data records (ordinary or null prototype),
  finite numbers (safe integers where integral), no `undefined`, non-enumerable properties, accessors, proxies, custom
  prototypes, symbol keys, `toJSON` hooks, cycles or unpaired surrogates. Reject `__proto__`, `prototype`, `constructor`,
  and keys containing `.`/`$`/NUL. Reject unknown structural fields; optional fields are absent, not `undefined` in
  persisted DTOs. Canonical JSON is compact UTF-8, recursively sorted object keys by JS code-unit order, array order
  preserved, ECMAScript JSON scalar spelling (`-0` becomes `0`). Canonical object serialization must sort even
  integer-looking keys; do not depend on ordinary property enumeration. Hashes are lowercase 64-hex SHA-256.
- Scope, template/profile/resolver keys, revision, idempotency/batch/item IDs and attachment ID/version: ASCII
  `[A-Za-z0-9][A-Za-z0-9._-]*`, max 64 bytes for scope, 128 for the rest. Job/attempt IDs are opaque random UUIDs and
  never Mongo IDs; IDs and cursors confer no authorization. SendGrid dynamic template ID is `d-` and 32 hex digits.
- JSON depth 12 (root depth 0), 2,048 total values per intent/data tree, 128 UTF-8 bytes per object key, canonical
  encoded intent max 16 KiB and prepared values max 64 KiB. No controls in header-like fields. From/reply-to and
  recipient mailboxes use ASCII dot-atom local part (max 64 bytes), ASCII DNS domain labels (punycode allowed),
  max 254 bytes total; no Unicode local parts, comments, literal IPs or quoted local parts. Display name max
  128 UTF-8 bytes. Max 50 recipients total. Reject CR/LF and C0/DEL in names, subject and filenames. Subject
  nonempty after trim check and max 512 UTF-8 bytes; do not trim its bytes. Allow line breaks in bodies.
- Each template source max 256 KiB; encoded output HTML max 512 KiB and text max 256 KiB, at least one nonempty
  part. Complete canonical snapshot max 1 MiB, independent of raw field limits. Correlation: <= 8 entries, safe
  host-chosen opaque tokens (same ASCII grammar, keys max 32 bytes, values max 96); no secrets or personal data.
  Output checks bound accepted/wire content, not the CPU or heap of arbitrary trusted synchronous helpers/rendering.
- `priority` integer `0..9` (higher wins a scheduling tie). Default expiry is `preparedAt + 24h`; explicit expiry
  must be `> preparedAt`, `<= preparedAt + 30d` and strictly after the optional scheduled instant. Defaulting is
  done once; no extension when staging, retrying, recovering or redriving. On new insertion, schedule at
  `max(storeNow, scheduleAt ?? storeNow)` and reject at/after expiry. `preparedAt` more than 60s ahead of store time
  is invalid for a new insertion. Multiple providers must not share a profile key in one worker; don't repoint a
  persisted key to another provider/account/behavior. By design credentials and provider infrastructure can rotate.

### Attachments (no inline attachments in V1)

At most 5 refs, nonempty attachments of <= 2 MiB each and <= 5 MiB total (checked on descriptors and actual bytes).
`filename` is a nonempty basename, max 128 UTF-8 bytes, no controls, slash, backslash or colon, not `.`/`..`;
`contentType` is a lower-case ASCII MIME `type/subtype` token pair, max 127 bytes, no parameters. `id`/`version`
are opaque within `resolverKey`, not paths/URLs. No files, URLs, streams, CIDs, MIME fragments or base64 contents
in the queued snapshot. Resolve refs sequentially per attempt, **before** handoff:

```ts
type AttachmentResolution = { status: 'found'; bytes: Uint8Array } | { status: 'unavailable' };
type AttachmentResolver = (
  ref: Readonly<AttachmentRef>,
  context: { scope: EmailScope; signal: AbortSignal },
) => Awaitable<AttachmentResolution>;
type ResolvedAttachment = { ref: Readonly<AttachmentRef>; bytes: Uint8Array };
```

Accept `Uint8Array` (including `Buffer`), reject shared backing memory and check length before copying the view to an
owned byte array. Check exact length and SHA-256 of the copy and release it after the provider call or pre-handoff
failure. A mutable backing source may become unavailable or fail integrity; no alternative bytes, implicit fetch,
or resend of altered content. Hosts keep versions
available through the delivery window. `unavailable` and resolver deadline are explicit transient evidence before
handoff; missing resolver, unverifiable data or thrown (unclassified) resolver errors are permanent. Send identical
attachment names/types/bytes as ordinary MIME attachment parts for SMTP and standard padded base64 with
`disposition: 'attachment'` for SendGrid. Provider payload mapping may be built and size-checked before handoff;
embedded credentials, remote template edits and MIME wire details are not part of the byte-integrity promise.

## Admission, staging and batches

```ts
type AdmissionResult = { status: 'enqueued' | 'replayed'; job: EmailJobSummary };
type RetryPolicy = { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
type RetentionPolicy = { payloadMs: number; historyMs: number; idempotencyMs: number };
interface EmailService<T extends TemplateMap> {
  readonly scope: EmailScope;
  enqueue(command: EmailCommand<T>, options?: CallOptions): Promise<AdmissionResult>;
  enqueuePrepared(command: PreparedEmailCommand, options?: CallOptions): Promise<AdmissionResult>;
}
declare function createEmailService<T extends TemplateMap>(options: {
  scope: EmailScope;
  store: EmailStore;
  registry: EmailTemplateRegistry<T>;
  retry?: Partial<RetryPolicy>;
  retention?: Partial<RetentionPolicy>;
}): EmailService<T>;
type EmailBatchItem<T extends TemplateMap> = { itemId: string; command: TemplateCommand<T> };
type EmailBatchResult = {
  batchId: string;
  items: readonly (
    | ({ itemId: string } & AdmissionResult)
    | { itemId: string; status: 'failed'; code: EmailErrorCode }
    | { itemId: string; status: 'not_started' }
  )[];
  counts: { enqueued: number; replayed: number; failed: number; notStarted: number; persistenceFailures: number };
};
interface EmailBatchService<T extends TemplateMap> {
  enqueueBatch(
    batch: { batchId: string; items: readonly EmailBatchItem<T>[] },
    options?: CallOptions,
  ): Promise<EmailBatchResult>;
  run(options?: EmailRunOptions): Promise<EmailRunReport>;
}
declare function createEmailBatchService<T extends TemplateMap>(options: {
  service: EmailService<T>;
  worker: EmailWorker;
}): EmailBatchService<T>;
```

- **Identity.** Scoped logical key is `(scope, 'single', idempotencyKey)` or `(scope, 'batch', batchId, itemId)`.
  Batch item collisions are within that batch and scope, not with standalone keys or other batches. `intent` is
  required: the host must include all stable business inputs that change meaning, plus any caller-controlled policy
  revision if desired. Never infer intent by serializing `input`. `intentHash = SHA256(canonical(intent))`;
  `fingerprint = SHA256(canonical([1, scope, key, templateKey, provider, scheduleAt ?? null, intentHash]))`;
  `snapshotHash = SHA256(canonical(snapshot))`. Persist the fingerprint and snapshot hash, not raw intent/input.
  Policies, generated values, template revision and the clock are not implicitly fingerprinted. A caller who wants
  a change to count as different intent includes it in `intent` and uses a new key. Hashes are equality checks,
  not encryption, signatures or proof of authorization.
- **No pre-prepare reservation.** Validate static command shape and fingerprint, then check the unique scoped
  identity with a fresh committed lookup before consulting templates or evaluating relative time limits. Existing
  same fingerprint returns the originally admitted job's current summary, even after expiry, terminal state,
  pruning the snapshot or rolling the registry. No prepare/rerender at all on that path. Different fingerprint
  throws `idempotency_conflict`. Concurrent misses may each prepare (even with differing fingerprints); only the
  unique durable insert wins. The loser rereads the durable winner and returns replay or conflict, never replaces
  it. If preparation fails after a lookup miss, this call reports its failure and makes no insert; a racing
  contender might have won in the meantime. A crash before insertion or an uncommitted/in-flight insert may
  lead to preparation again. Host callbacks
  with side effects must be idempotent or use host-owned outbox staging; preparation is not exactly once.
- **Lost admission ACK.** Inspect the exact identity for a committed winner, within the original call budget.
  If not provable, throw `write_unconfirmed` and replay the _same_ key/intent; absence does not disprove an in-flight
  commit. Do not issue another independent command. If committed before the replay's lookup, the stored row is
  returned without preparing; a later race after a genuine lookup miss is the concurrent-miss case above.
  The replay guarantee ends when retention permits purging the identity; don't replay a business command after
  its guard window expecting deduplication.
- **Outbox.** Call `registry.prepare(scope, command)` without the queue, store the versioned prepared command in
  the host's transaction with its business/source write, and relay with `enqueuePrepared`. The package neither
  joins the host transaction nor retains a host session. On relay check scope, schema, hashes, provider kind/mode
  and schedule; recompute the fingerprint using staged `intentHash`. Existing fingerprint wins regardless of the
  caller's new snapshot hash. A valid but aged-out snapshot cannot be newly admitted, and an already admitted one
  still replays. No callbacks, loaders, rerendering or remote template verification on relay; a registry can be empty
  for a relay-only process. Staged data has the same sensitivity as queue payloads.
- **Batch.** Require a matching bound scope for service/worker; the host wires them to the same underlying store.
  Validate the request envelope, static commands and unique item IDs up front (`1..100` items), without
  parsing business input or preparing. A malformed command envelope or duplicate item ID fails the request
  with zero writes. Enqueue sequentially in supplied order; one
  item's preparation, conflict or write failure reports that item independently and does not roll back earlier
  items. Stop starting items on abort/deadline; in-flight gets its actual confirmed result or safe error, remaining
  items are `not_started`. Replaying/reordering items uses the same admission rule and cannot reopen completed
  jobs. `enqueued` counts new queued inserts, `replayed` any existing state; these plus `failed` and `notStarted`
  partition the list. `persistenceFailures` is the subset of failed items with a store error. Batch `run` delegates
  the same scope-wide worker, with no batch filter/second delivery loop. Local `batchId` is never SendGrid `batch_id`.

## Outcomes and provider contract

```ts
type SubmissionOutcome = 'unsubmitted' | 'accepted' | 'partially_accepted' | 'rejected' | 'unknown' | 'validated';
type RetryClass = 'never' | 'safe_transient';
type SubmissionStage =
  | 'pre_handoff'
  | 'attachment'
  | 'rate_limit'
  | 'connect'
  | 'tls'
  | 'auth'
  | 'envelope'
  | 'data'
  | 'http';
type RecipientResult = { group: 'to' | 'cc' | 'bcc'; index: number; status: 'accepted' | 'rejected' };
type RetryHint = { delayMs?: number; notBefore?: UnixMs }; // Either or both; overflow saturates, never wraps.
type AttemptResult = {
  outcome: SubmissionOutcome;
  retry: RetryClass;
  stage: SubmissionStage;
  reason: AttemptReason;
  retryHint?: RetryHint;
  recipients?: readonly RecipientResult[];
  messageId?: string;
  providerMessageId?: string;
};
type ProviderResult = Omit<AttemptResult, 'stage' | 'reason'> & {
  stage: Exclude<SubmissionStage, 'pre_handoff' | 'attachment' | 'rate_limit'>;
  reason: ProviderReason;
};
type ProviderSubmission<M extends EmailSnapshot> = {
  jobId: EmailJobId;
  attemptId: EmailAttemptId;
  snapshot: M;
  attachments: readonly ResolvedAttachment[];
};
type ProviderCall = { signal: AbortSignal; timeoutMs: number };
type SmtpSnapshot = Extract<EmailSnapshot, { kind: 'smtp' }>;
type SendGridSnapshot = Extract<EmailSnapshot, { kind: 'sendgrid' }>;
interface PreparedEmailSubmission {
  submit(context: ProviderCall): Promise<ProviderResult>;
}
interface EmailProvider<M extends EmailSnapshot> {
  readonly ref: M['provider'];
  prepare(input: ProviderSubmission<M>): PreparedEmailSubmission;
}
type ConfiguredEmailProvider = EmailProvider<SmtpSnapshot> | EmailProvider<SendGridSnapshot>;

// ./smtp: a direct, non-pooled, one-request connection; no implicit configuration.
type SmtpProviderOptions = {
  key: string;
  host: string;
  port?: number;
  tls: 'implicit' | 'starttls';
  servername?: string;
  ca?: readonly string[];
  auth?: { user: string; pass: string };
};
declare function createSmtpProvider(options: SmtpProviderOptions): EmailProvider<SmtpSnapshot>;

// ./sendgrid: instance-owned credential and fixed HTTPS Mail Send endpoint.
type SendGridProviderOptions = { key: string; apiKey: string; mode?: 'live' | 'sandbox' };
declare function createSendGridProvider(options: SendGridProviderOptions): EmailProvider<SendGridSnapshot>;
```

Implement provider/test I/O seams behind these factories, not through public generic HTTP/SMTP option passthrough.
`prepare` validates identity and payload and constructs the one-shot submission without network I/O. Unmanaged
direct `prepare(...).submit(...)` by a caller gets no queue guarantees. At `submit`, disable implicit retry/redirect.
Every adapter makes at most one submission with an absolute I/O deadline and real abort/close, including a late
DNS/TLS callback that must not start submission after cancellation. No late outcome after the boundary; settle
only once no further send I/O is possible. TLS always verifies certificates (SMTP min TLS 1.2,
implicit default port 465, required STARTTLS default port 587; no plaintext fallback or pre-TLS auth).
Use Nodemailer (or its composer with a controlled transport); own/track the actual connection, including STARTTLS
and error paths. `Promise.race` around `sendMail`, a socket idle timeout, or unchecked `transporter.close()` is not
proof that I/O is stopped. Set `disableFileAccess`/`disableUrlAccess`; enable no transport logging. Use an explicit
envelope and ordinary MIME generation, not raw message overrides. The isolated test server uses a synthetic CA.

SendGrid POSTs `/v3/mail/send` at `api.sendgrid.com` with instance bearer authentication, a single personalization
with the exact approved To/Cc/Bcc and `dynamic_template_data`, top-level `template_id`, From, Reply-To and optional
attachments. Sandbox sets `mail_settings.sandbox_mode.enable: true`; mode must match the frozen snapshot. Send no
`batch_id`, scheduled provider send, arbitrary extra payload fields or secrets in metadata. Bound encoded request to
8 MiB and bound complete HTTP response to 64 KiB (no decompression of arbitrary bodies; use no response-body
diagnostic text). Validate metadata/status framing; a truncated/oversized/malformed response is not safe retry evidence.

**Normalized evidence allowlist.** These are the literal `ProviderReason` codes; each row limits the permitted
`outcome` and `retry`. Untrusted SDK error codes, the broad `5xx` HTTP class, response text, and exception messages
are never retry evidence. The worker validates the full normalized tuple, caps hints/result fields, and treats any
thrown, invalid or unsupported provider result after acknowledged handoff as `unknown` / `transport_uncertain`.

<!-- prettier-ignore -->
| `reason` | Required evidence | `outcome` / `retry` |
| --- | --- | --- |
| `smtp_accepted` | Final DATA success with reliable acceptance of every destination. | `accepted` / `never` |
| `smtp_partial` | Final DATA success and reliable accepted and rejected subsets that partition the envelope. | `partially_accepted` / `never` |
| `smtp_transient_reply` | Verified 4xx negative reply tied to the SMTP greeting/TLS/auth/MAIL stage, all-recipients-rejected RCPT stage (all transient), or DATA/final DATA stage with definitive nonacceptance of the entire message. | `rejected` / `safe_transient` |
| `smtp_permanent_reply` | Verified analogous 5xx refusal, or all recipients definitively rejected with any permanent RCPT refusal. | `rejected` / `never` |
| `sendgrid_accepted` | Complete, valid HTTPS live response with exact `202`. Request acceptance only. | `accepted` / `never` |
| `sendgrid_validated` | Complete, valid sandbox response with exact `200`. No eligible live submission. | `validated` / `never` |
| `sendgrid_throttled` | Complete, valid Mail Send `429` from the configured HTTPS endpoint. | `rejected` / `safe_transient` |
| `sendgrid_rejected` | Complete, valid Mail Send `400`, `401`, `403`, `404`, `405` or `413`. | `rejected` / `never` |
| `not_transmitted` | Provider knows from its own I/O phase that no DATA transfer began or no HTTP request could have been written, and the connection failure was transient. | `unsubmitted` / `safe_transient` |
| `provider_configuration` | Invalid provider input or positively identified permanent TLS/configuration failure, with no submission possible. | `unsubmitted` / `never` |
| `transport_uncertain` | Any other result: ambiguous stage, missing positive acknowledgment, unexpected HTTP status (including `5xx`), post-DATA `CONN`, mismatched sandbox/live success or malformed response. | `unknown` / `never` |
| `provider_timeout` / `provider_aborted` | I/O deadline/abort after invocation without positively proven safe evidence before the boundary. | `unknown` / `never` |

For SMTP, RCPT acceptance alone is not message acceptance; never retry all recipients after confirmed partial
acceptance. Use actual SMTP command/phase and validated numeric replies, not `CONN`, `ETIMEDOUT` or `EENVELOPE`
alone. At `data` stage, a definite negative response is different from an absent final response; the latter may
mean the server accepted the message before the connection died. SMTP acceptance is `data` stage, SendGrid
response evidence is `http`. Do not allow provider-specific reason codes on the other provider or sandbox as
ordinary acceptance. For SendGrid `429`, parse `Retry-After` delta
seconds/HTTP date and `X-RateLimit-Reset` epoch seconds if present; ignore malformed hints, use the later valid
floor, saturate valid out-of-range future times to the representable maximum, and do not shorten a valid floor.
Only `sendgrid_throttled` or `rate_deferred` can carry a hint.
No synchronous recipient outcomes for SendGrid. SMTP recipient entries use zero-based indexes in the _frozen_
group, unique and in range, not addresses; list only reliably known entries, no status inferred from a missing address. Full/partial
success requires confirmed accounting; if the transport cannot establish it, report `unknown`. Use a stable
synthetic RFC 5322 ID `<${attemptId}@email.invalid>` on SMTP for that attempt (not a deduplication key); expose it
only after confirmed success. Only on SendGrid `202`, keep one unambiguous `X-Message-Id` token matching
`[A-Za-z0-9][A-Za-z0-9._=-]{0,127}` as `providerMessageId`. Drop all other raw provider identifiers, headers and
responses. IDs are opaque correlation identifiers, not authentication, receipts or delivery evidence.

## Job state machine

```ts
type JobDisposition =
  | 'accepted'
  | 'partially_accepted'
  | 'validated'
  | 'rejected'
  | 'unknown'
  | 'failed'
  | 'expired'
  | 'cancelled';
type UnknownResolution = {
  attemptId: EmailAttemptId;
  at: UnixMs;
  action: 'dismiss' | 'redrive';
};
type EmailJobState =
  | { state: 'queued'; nextAt: UnixMs }
  | { state: 'leased'; phase: 'pre_handoff' | 'handed_off' }
  | {
      state: 'terminal';
      disposition: JobDisposition;
      terminalAt: UnixMs;
      terminalReason: AttemptReason | 'attempts_exhausted';
    };
type EmailJobSummary = EmailJobState & {
  version: 1;
  scope: EmailScope;
  jobId: EmailJobId;
  key: EmailAdmissionKey;
  provider: ProviderRef;
  template: TemplateIdentity;
  correlation: Correlation;
  scheduleAt: UnixMs | null;
  createdAt: UnixMs;
  updatedAt: UnixMs;
  expiresAt: UnixMs;
  priority: number;
  attemptCount: number;
  latestAttempt?: { attemptId: EmailAttemptId; outcome: SubmissionOutcome; reason: AttemptReason };
  unknownOpen: boolean;
  resolutions: readonly UnknownResolution[];
};
type CancelResult = { status: 'cancelled' | 'too_late'; job: EmailJobSummary } | { status: 'not_found' };
type ResolveUnknownCommand = { jobId: EmailJobId; attemptId: EmailAttemptId } & (
  | { action: 'dismiss' }
  | { action: 'redrive'; acknowledgeDuplicateRisk: true }
);
type ResolveUnknownResult = { status: 'resolved' | 'replayed'; job: EmailJobSummary };
```

`state` is queue processing; `disposition` is the reason processing ended; `outcome` describes only a finalized
attempt's submission evidence. Queued expiry/cancellation before any claim has no attempt and no submission
outcome. A retry-queued job can have evidence of a rejection/unsubmitted attempt. Nothing reports inbox delivery.
`AttemptReason` is `ProviderReason` from the evidence table plus:

<!-- prettier-ignore -->
| `reason` | `outcome` / `retry` | Stage or effect |
| --- | --- | --- |
| `attachment_unavailable`, `attachment_timeout` | `unsubmitted` / `safe_transient` | `attachment`; unavailable from resolver or budget elapsed. |
| `attachment_invalid`, `attachment_resolver_error` | `unsubmitted` / `never` | `attachment`; invalid/missing resolver, integrity failure, or an unclassified throw. |
| `rate_deferred`, `rate_timeout` | `unsubmitted` / `safe_transient` | `rate_limit`; use defer delay as a floor. |
| `rate_error` | `unsubmitted` / `never` | `rate_limit`; malformed/throwing limiter. |
| `profile_unavailable`, `provider_preflight_error` | `unsubmitted` / `never` | `pre_handoff`; missing/wrong kind or mode, or provider preparation failed (do not pick another profile). |
| `pre_handoff_timeout`, `worker_stopped`, `pre_handoff_lease_expired`, `launch_window_closed` | `unsubmitted` / `safe_transient` | `pre_handoff`; no invocation. The last code requires a confirmed marker and local proof `submit` was never called. |
| `post_handoff_lease_expired` | `unknown` / `never` | `pre_handoff` denotes lifecycle recovery, not wire phase. Durable marker exists; actual wire phase is unknowable. |
| `expired`, `cancelled` | `unsubmitted` / `never` | `pre_handoff`; stop without provider invocation. |

Only `safe_transient` + `unsubmitted`/`rejected` may auto-retry, and only with remaining ordinary budget. All timed
checks use strict half-open windows: `nextAt <= now` means due; `now >= expiresAt` means expired; `now >= leaseEndsAt`
means the owner lost the lease. Expiry is the latest launch time, not an interruption or recall of an already
started provider call. A final outcome after expiry is still recorded if the lease is live.

<!-- prettier-ignore -->
| Transition | Guard and atomic effect |
| --- | --- |
| Insert | Scoped unique key, valid snapshot/policies, fresh admission time. Start `queued`, no attempt. |
| Claim | Due `queued`, not expired, budget available. CAS installs `leased/pre_handoff`, fresh attempt ID + private token, ordinal and finite lease. Every confirmed/recovered claim consumes one attempt, including a claim with no provider call. |
| Renew | `leased/pre_handoff`, matching live fence and unexpired job. Extend lease; never revive an expired lease or reserve indefinitely. |
| Mark handoff | Same live pre-handoff fence and unexpired job. CAS advances to `handed_off`, stamps handoff time and grants a fresh lease of the configured duration. Cancellation cannot win after this update. Call provider only after a timely positive acknowledgment of this exact write. Never authorize a launch by reading a possibly committed marker after a lost acknowledgment. |
| Finish | Match job/attempt/token, expected phase and strictly live lease. Record the one authoritative finalized attempt and new queue state in the **same** job write, clear lease, mark projection pending. Pre-handoff accepts only proven `unsubmitted`; handed-off results follow the provider evidence table plus the local no-invocation case. Accepted/partial/validated/unknown are terminal. Permanent rejection is terminal `rejected`; permanent unsubmitted is terminal `failed` unless pre-handoff `expired` (which requires store time at/after expiry). Cancel and recovery evidence are written only by their dedicated transitions. |
| Backoff | On safe transient, terminal `expired` if already expired; otherwise `rejected` or `failed` with `attempts_exhausted` if no retry budget. Else schedule at `max(now + jitter, now + hint.delayMs, hint.notBefore)`, using saturating arithmetic. If that time reaches/passes expiry, terminal `expired`; otherwise `queued`. |
| Recover | On lease expiry (including equality), CAS the current fence. Pre-handoff: finalize `unsubmitted` with `pre_handoff_lease_expired`, using backoff/expiry rules. Handed-off: finalize terminal `unknown` with `post_handoff_lease_expired` even if the job also expired. No attempt can be finalized twice. |
| Expire | Due expiry on unleased `queued` becomes terminal `expired` without a synthetic attempt. Expiry blocks pre-handoff renew/mark immediately; an owned pre-handoff attempt may finish `expired`, or recovery will close it when its lease expires. |
| Cancel | CAS `queued` or `leased/pre_handoff` strictly before expiry. Clear lease and terminal `cancelled`; for an active claim finalize the `unsubmitted` attempt as `cancelled`. Repeated cancellation of `cancelled` returns `cancelled`; missing is `not_found`; all other cases, including a marker or equality at expiry, are `too_late`. A stale worker cannot use operator cancellation on behalf of its attempt or finalize over the cancellation. |
| Resolve unknown | Exact current unresolved terminal-unknown attempt ID. `dismiss` records the decision and closes the operational hold **without changing** the attempt/outcome or claiming nonacceptance. `redrive` requires explicit `acknowledgeDuplicateRisk: true`, unpruned snapshot and `now < expiresAt`. Close the previous hold and queue the **same** job immediately with **one** manual claim ever, without rerender, changing recipients or extending expiry. That claim never auto-retries; if it is unknown it can only be dismissed. Record resolution atomically; same attempt/action replay returns the persisted decision/current summary, conflicting/stale action fails. |

An ordinary exhausted budget is not reset; manual redrive is at most one additional attempt, distinct ID, old
attempts immutable. No redrive of accepted, partial, validated, rejected, failed, cancelled or expired jobs.
A missing job is `not_found`; a stale/opposite action or a second redrive fails with `resolution_conflict`;
an expired otherwise eligible redrive fails with `expired`. Operators must quiesce suspected old workers and
assess provider evidence before redrive; fencing the database cannot fence the remote provider. Redrive can
duplicate an accepted message, and neither dismissal nor cancellation is remote recall. Hosts can make a new
intent under a new key when appropriate.

`RetryPolicy` is frozen on insertion: `maxAttempts` default 3 (`1..10`), `baseDelayMs` 1,000 (`100..60,000`),
`maxDelayMs` 60,000 (`baseDelayMs..3,600,000`). For ordinal `n` use
`cap = min(maxDelayMs, baseDelayMs * 2 ** (n - 1))`; jitter is `floor(cap / 2)` plus the unsigned first four
big-endian bytes of `SHA256(UTF8(attemptId))` modulo `cap - floor(cap / 2) + 1`. This is deterministic dispersal
across stores, not a security token. Rate/resolver deferrals intentionally consume a claim/attempt; there is no
separate unbounded retries ledger or provider-side retry.

### Recovery when writes and results disagree

- Unconfirmed claim: do not work it, even if inspection finds your ownership token. Let expiry recover it. An
  unconfirmed renewal or loss of ownership also stops work; no lease possession by assumption. A definite fenced
  miss can be inspected for the winning commit, not retried with new ownership.
- Unconfirmed marker: do not send and do not reinterpret a read as authorization. Recovery sees either pre-handoff
  (safe unsubmitted) or handed-off (unknown). If the original timely ACK is positive but launch is locally withheld,
  the still-fenced owner may commit `launch_window_closed` with proof it never invoked the provider.
- Unconfirmed finish: keep the same candidate in memory; read the exact attempt's authoritative commit. A confirmed
  matching finish counts; a different winner (e.g. expiry recovery) is reported as that stored result. Otherwise a
  single retry of the _same fenced finish mutation_, same operation ID and evidence, is allowed in the bounded
  finish window. Never repeat the provider call, infer rejection from a write failure, let a delayed worker overwrite
  recovery, or release/rewind a handed-off lease. If still uncertain report unconfirmed; recovery eventually owns
  the decision.
- For cancellation/resolution with lost ACK, inspect or retry the exact action under the same scoped identity and
  expected attempt where applicable. A missing read does not disprove an in-flight write; unresolved writes are
  `write_unconfirmed`. Projection failure never changes an outcome/queue state.

## Worker, deadlines and errors

```ts
type EmailRateLimiter = {
  scope: 'worker' | 'shared';
  tryAcquire(request: {
    scope: EmailScope;
    provider: ProviderRef;
    signal: AbortSignal;
  }): Awaitable<{ status: 'granted' } | { status: 'deferred'; retryAfterMs: number }>;
};
type EmailWorkerLimits = {
  maxConcurrency: number;
  storeTimeoutMs: number;
  leaseMs: number;
  preHandoffTimeoutMs: number;
  attachmentTimeoutMs: number;
  rateTimeoutMs: number;
  providerTimeoutMs: number;
  finalizeGraceMs: number;
};
type EmailRunOptions = CallOptions & { limit?: number; concurrency?: number; maintenanceLimit?: number };
type EmailRunEntry = {
  operation: 'claim' | 'recover' | 'expire';
  jobId: EmailJobId;
  attemptId?: EmailAttemptId;
  status: JobDisposition | 'retry_scheduled' | 'unconfirmed';
  reason?: AttemptReason | 'attempts_exhausted';
  providerInvoked: boolean;
};
type MaintenanceStop = 'limit' | 'idle' | 'contended' | 'aborted' | 'deadline' | 'store_error';
type EmailRunReport = {
  stop: MaintenanceStop | 'shutdown' | 'callback_capacity';
  items: readonly EmailRunEntry[];
  counts: {
    claimed: number;
    recovered: number;
    expiredInSweep: number;
    providerCalls: number;
    submitted: number;
    retryScheduled: number;
    accepted: number;
    partiallyAccepted: number;
    validated: number;
    rejected: number;
    unknown: number;
    failed: number;
    expired: number;
    cancelled: number;
    unconfirmed: number;
    persistenceFailures: number;
  };
};
type EmailShutdownReport = { status: 'stopped' | 'deadline'; activeRun: boolean; pendingCallbacks: number };
interface EmailWorker {
  readonly scope: EmailScope;
  run(options?: EmailRunOptions): Promise<EmailRunReport>;
  shutdown(options?: Pick<CallOptions, 'timeoutMs'>): Promise<EmailShutdownReport>;
}
declare function createEmailWorker(options: {
  scope: EmailScope;
  store: EmailStore;
  providers: readonly ConfiguredEmailProvider[];
  attachmentResolvers?: Readonly<Record<string, AttachmentResolver>>;
  rateLimiter?: EmailRateLimiter;
  clock?: EmailClock;
  limits?: Partial<EmailWorkerLimits>;
}): EmailWorker;
```

- No polling loop/timer on construction or between runs. One `run` per instance (`busy` on overlap, `closed` after
  shutdown); use multiple instances to share a queue. Recover expired leases first, then expire queued jobs,
  up to `maintenanceLimit` **each** (default 10, `0..100`); run at most `limit` claims (default 20, `1..100`).
  `concurrency` defaults to configured `maxConcurrency` (4, `1..16`), cannot exceed it. Scheduling is bounded,
  not a snapshot of everything due; an empty bounded scan is `idle`, a lost CAS window is `contended`.
  Stop claiming on limits, capacity, bounded-scan stop, abort, shutdown or the first operational store error.
  A limit/capacity/scan stop lets acknowledged claims proceed within their deadlines. A store error, timeout,
  external abort or shutdown also forbids new launches for that run and aborts in-flight I/O on abort/deadline/
  shutdown; settle without assuming a failed operation did nothing.
- Mandatory provider preparation/payload validation, rate policy and resolver work happen within the pre-handoff
  envelope; no provider I/O during it. Check profile, resolve attachment refs, then obtain rate permission right
  before handoff (after `provider.prepare`). No rate limiting by default. A `'worker'` limiter applies only to that instance; a `'shared'`
  limiter is host-supplied and must enforce the actual quota across processes/accounts, including keys that share
  quota. A permit authorizes one call; no implicit refund, wait loop or distributed quota collection. A deferral
  uses a positive integer delay (max 30 days) as a retry floor.
- Start the pre-handoff budget from claim dispatch (conservatively includes the claim RPC). While owned, renew
  pre-handoff at or before `floor(leaseMs / 3)` between confirmed grants, measured from each RPC's dispatch on the
  monotonic clock. Serialize owner writes, never renew after handoff or after the pre-handoff budget, and do not
  start a handoff if abort/deadline/ownership is already lost. Clamp every subsidiary operation to its parent
  budget. The store rechecks expiry and fence on the marker CAS; the worker checks again after positive ACK and
  immediately before invoking `submit`.
- After ACK compute monotonic launch bounds from the marker RPC dispatch:
  `expiryLaunchEnd = markStart + (expiresAt - handoffAt) - 1000` and
  `leaseSafeEnd = markStart + (leaseEndsAt - handoffAt) - 1000`. Never invoke at/after `expiryLaunchEnd`,
  the pre-handoff deadline, or stop. Cap the I/O budget by
  `min(providerTimeoutMs, runDeadline - now, leaseSafeEnd - now - finalizeGraceMs)` on the monotonic clock.
  If no positive launch window remains, either finish `launch_window_closed` under the confirmed fence or
  let recovery own it. Expiry doesn't erase in-flight results; cancellation can't win post-marker. A remote
  acceptance cannot be revoked by process suspension, database failover, abort or local deadline.
- Budget host callbacks (including async loader, resolver and rate policy) with deadlines and signals. They are
  trusted in-process code: promises that ignore cancellation can be abandoned but not forcibly interrupted,
  and synchronous blocking cannot be preempted. Prevent further callback steps, admission/handoff or use of late
  values; retain a bounded occupied slot until the actual callback settles (registry preparation slots and at
  most `maxConcurrency` worker item slots, including across runs). If none are available, preparation is `busy`
  or run stops `callback_capacity`. Provider I/O must actually abort/close, not use this abandonment rule.
  A nonconforming injected provider cannot justify reporting `stopped` while its call is still pending.
- On external abort or shutdown, abort preflight and in-flight provider I/O, stop new writes that would authorize
  sends, and settle already-started attempts (no new claims) with a separate finish signal/grace that is not
  cancelled with the run. A confirmed result captured before abort is still eligible to finish. Settle reads
  and same-operation writes share the one grace, not a new timeout for each retry. `run` resolves by nominal
  deadline plus finish grace for cooperative I/O. `shutdown` is irreversible and idempotent; wait for the active
  run up to its own deadline, never close the caller's Mongo connection. `stopped` means no active run or provider
  I/O; `pendingCallbacks` separately counts abandoned host callbacks still occupying slots. On shutdown
  `deadline` the worker stays closed and a repeat call can wait/report again; it does not authorize reuse
  of a lease or claim remote recall.

Counts use confirmed evidence: one item per acknowledged claim, recovery or queued-expiry write; `providerInvoked`
means `submit` was invoked (not that bytes were accepted). Per-status counters partition `items`; `submitted`
is `accepted + partiallyAccepted`, never sandbox. `claimed`, `recovered` and `expiredInSweep` partition `items`
by operation. `unconfirmed` means a claimed item's authoritative finish could not be shown, not a stored
`unknown`. A lost claim/recovery/expiry ACK does not invent an item; `persistenceFailures` counts calls that
report a persistence error (including unconfirmed writes, even if a later read proves a commit), not failed sends.
Stop precedence is shutdown, abort, deadline, store error, contention, callback capacity, claim limit, then idle.
An empty or limited result is not proof the entire queue is empty.

<!-- prettier-ignore -->
| Budget | Default and accepted range (integer ms unless stated) |
| --- | --- |
| `prepare` / registry slots | 5,000 (`50..30,000`); `maxPending` 8 (`1..32`). |
| Enqueue / enqueuePrepared / admin / ready | 10,000 (`50..60,000`) per call. |
| Enqueue batch / `run` | 30,000 (`50..120,000`) entire call, not per item. |
| Worker `storeTimeoutMs` | 5,000 (`50..30,000`); non-worker primitives also cap individual work at 5,000. |
| `leaseMs` / `preHandoffTimeoutMs` | 60,000 (`5,000..300,000`); 8,000 (`50..60,000`). |
| Total `attachmentTimeoutMs` / `rateTimeoutMs` | 5,000 (`50..30,000`) per attempt, not per ref; 500 (`10..5,000`). |
| `providerTimeoutMs` / `finalizeGraceMs` | 15,000 (`50..60,000`); 10,000 (`100..30,000`). |
| Shutdown wait | 15,000 (`50..60,000`), distinct from provider timeout. |

Validate `leaseMs >= max(3 * storeTimeoutMs + 1000, storeTimeoutMs + providerTimeoutMs + finalizeGraceMs + 1000)`.
Production defaults use `Date.now`, monotonic elapsed time and abortable sleep. Do not use wall time for elapsed
budgets. Deterministic tests inject an `EmailClock`; durable transitions use store time, not a worker's wall timer.
At the deadline boundary stop starting work; a success already confirmed before the boundary is not rewritten.
The range floors apply to user overrides, not to shortened internal budgets.

```ts
type EmailErrorCode =
  | 'invalid_config'
  | 'invalid_command'
  | 'invalid_input'
  | 'invalid_data'
  | 'invalid_snapshot'
  | 'preparation_failed'
  | 'template_not_found'
  | 'template_source'
  | 'template_render'
  | 'provider_mismatch'
  | 'expired'
  | 'idempotency_conflict'
  | 'not_found'
  | 'resolution_conflict'
  | 'store_capacity'
  | 'store_unavailable'
  | 'store_incompatible'
  | 'write_unconfirmed'
  | 'invalid_cursor'
  | 'aborted'
  | 'deadline'
  | 'busy'
  | 'closed';
declare class EmailError extends Error {
  readonly code: EmailErrorCode;
  constructor(code: EmailErrorCode);
}
```

Fixed safe messages/codes, no cause/transport response or host exception in diagnostics. `store_unavailable` means
read/known store failure, not that a dispatched write failed to commit. Use `write_unconfirmed` wherever a mutation
may have committed. `store_capacity`, `store_unavailable`, `store_incompatible`, `write_unconfirmed` are the
batch persistence-error subset. Invalid API request/options reject before work; expected runtime worker outcomes
use reports, public single admission uses typed errors, and cancel/resolution use their typed action results.

## Admin, activity projection and retention

```ts
type EmailActivity = {
  version: 1;
  scope: EmailScope;
  jobId: EmailJobId;
  attemptId: EmailAttemptId;
  ordinal: number;
  provider: ProviderRef;
  template: TemplateIdentity;
  correlation: Correlation;
  startedAt: UnixMs;
  handedOffAt?: UnixMs;
  finishedAt: UnixMs;
  result: Omit<AttemptResult, 'retryHint'>;
  disposition: JobDisposition | 'retry_scheduled';
};
type EmailActivityQuery = { jobId?: EmailJobId; from?: UnixMs; before?: UnixMs; limit?: number; cursor?: string };
type EmailActivityPage = { items: readonly EmailActivity[]; nextCursor?: string };
type MaintenanceOptions = CallOptions & { limit?: number };
type ReconcileReport = {
  stop: MaintenanceStop;
  reserved: number;
  acknowledged: number;
  permitsExpired: number;
  persistenceFailures: number;
  observerStarted: number;
  observerSkipped: number;
};
type CleanupReport = {
  stop: MaintenanceStop;
  payloadsPruned: number;
  retirementsStarted: number;
  jobsPurged: number;
  persistenceFailures: number;
};
interface EmailAdmin {
  readonly scope: EmailScope;
  getJob(jobId: EmailJobId, options?: CallOptions): Promise<EmailJobSummary | null>;
  cancel(jobId: EmailJobId, options?: CallOptions): Promise<CancelResult>;
  resolveUnknown(command: ResolveUnknownCommand, options?: CallOptions): Promise<ResolveUnknownResult>;
  listActivities(query?: EmailActivityQuery, options?: CallOptions): Promise<EmailActivityPage>;
  reconcile(options?: MaintenanceOptions): Promise<ReconcileReport>;
  cleanup(options?: MaintenanceOptions): Promise<CleanupReport>;
}
declare function createEmailAdmin(options: {
  scope: EmailScope;
  store: EmailStore;
  onActivity?: (activity: EmailActivity) => Awaitable<void>;
}): EmailAdmin;
```

The authoritative result is the job ledger; `getJob` returns its latest outcome while projection is pending.
Activities are immutable redacted copies, not a queue or an input to delivery decisions. The host schedules
`admin.reconcile()` and `admin.cleanup()`; worker runs never wait on an activity write, and cleanup never
triggers a send. Page only complete projected activities, including durable upserts whose source ACK is
pending. Query exact scoped `jobId` optionally and a half-open `from <= finishedAt < before` window. Limit
defaults 25 (`1..100`), read at most `limit + 1` rows in `(finishedAt DESC, jobId ASC, attemptId ASC)` order.
The cursor is versioned base64url canonical JSON (max 512 bytes), binding scope, normalized filters and
the last tuple; decode/validate strictly, not as a Mongo filter or auth token. Pages are not snapshots across
concurrent projection/deletion. No addresses/names in any result or observation; no rendered body, URLs from
templates, dynamic data, attachment refs/content, credentials, retry internals or leases in summaries/activities.
No provider dumps or raw exception logging; metric labels should use fixed enums/reasons, not IDs or correlation.
The optional observer sees only the committed DTO after projection ACK; best effort, max one unresolved
callback per admin, with no wait/retry. Rejections are swallowed safely; `observerStarted`/`observerSkipped`
count invocations/skips due to that slot, not completed/failed callbacks.

**Projection protocol.** Finalize into the bounded job ledger with `projectionAckAt` absent. `reserveProjection`
CAS selects a pending attempt and issues a server-timed 60s write permit, also setting the per-job
`projectionPermitUntil` high-water mark. It is a write window, not an exclusive lock. Upsert the immutable
canonical activity, keyed by `(scope, jobId, attemptId)`, with its digest; an existing matching digest is success,
a different digest fails closed. After positive proof of majority-presence, CAS the ledger attempt's digest
and its ACK marker. Dispatched-but-unacknowledged writes do not count as projected; same immutable upsert/ACK
on a later reservation is harmless. ACK is append-only; if an operator deletes a confirmed activity externally
that is out-of-band corruption, not a delivery or reconstruction trigger.

Retirement must not race a delayed projector. Enforce permit expiry **in the activity write**, not just before
a client call. With Mongo, use a unique-key conditional update pipeline: preserve existing complete rows,
write a full row only before `permitUntil`, and, on an expired upsert into a missing key, allow at most an
empty identity stub. Stubs are never returned, carry only key/expiry, and are TTL eligible at creation + 60s;
a valid new upsert can promote a stub, atomically clearing its TTL field. Memory may simply no-op an expired
insert. CAS retirement requires all attempts ACKed and a drain window of `projectionPermitUntil + 31s` (30s
maximum store command budget plus 1s clock margin) before activity deletion. No new permits after ACK or
retirement. This prevents a stale caller/operation from recreating complete history after purge without a
cross-collection transaction; no correctness decision waits on the stub TTL monitor.

**Retention policy.** Freeze `payloadMs` 7d (`0..30d`), `historyMs` 30d (`1..90d`), `idempotencyMs` 30d
(`1..90d`) on insertion (a day is 86,400,000ms). These are minimum windows from a settled terminal transition,
not upper bounds; an unresolved unknown holds all retention. Dismissal starts retention at dismissal time.
Redrive restarts no retention before the new terminal decision and never decreases a prior retention promise.
Until settled and all activities are durably ACKed, don't prune a snapshot or delete the job/activities.
Then prune the payload at its own deadline while keeping summary, hashes and idempotency. At the **latest**
of payload/history/idempotency deadlines and projection drain, CAS to a private retiring flag, still replayable.
Delete its at-most-eleven scoped activity records by exact identity, with majority ACK, then CAS-delete the
retiring job/identity guard. A crash or lost ACK resumes deletion idempotently in that order, not through
inferred success. The longer common deletion window can retain activities beyond the history minimum.
Do not TTL live jobs, unknowns, full activities or idempotency guards. Bounded sweeps never load the whole
queue, and cleanup at equality is eligible. Hosts restrict/encrypt the queues and staged outboxes, rotate
credentials separately and control backups; user callbacks must not put PII/secrets in diagnostics/correlation.

`reconcile`/`cleanup` each default limit 20 (`1..100`) sequential operations. One reservation can ACK one
attempt; `acknowledged` includes an idempotent confirmed ACK for that reservation, `permitsExpired` counts
expired puts and neither count includes uncertainty. A cleanup step confirms one prune, retirement mark or
complete purge. Errors stop further maintenance and contribute to `persistenceFailures`; no row/count is
invented when completion is unknown. These counts report work by the call, not a global queue inventory.

## Store adapter transaction primitives

These are lifecycle primitives for adapters and tests, not an application-facing CRUD surface. Services accept
an `EmailStore`; callers must not expose it or its private payload/fence DTOs as APIs. Every row operation
accepts and enforces the exact scope. Only storage uses its own clock when selecting/committing transitions.

```ts
type StoreCall = { signal: AbortSignal; timeoutMs: number };
type StoreNext<T> = { status: 'applied'; value: T } | { status: 'none' | 'contended' };
type StoreAdmission = {
  command: PreparedEmailCommand;
  jobId: EmailJobId;
  retry: RetryPolicy;
  retention: RetentionPolicy;
};
type LeaseToken = string;
type OwnerFence = { jobId: EmailJobId; attemptId: EmailAttemptId; token: LeaseToken };
type LeaseGrant = { grantedAt: UnixMs; leaseEndsAt: UnixMs };
type HandoffGrant = LeaseGrant & { handoffAt: UnixMs };
type ClaimedEmail = {
  job: EmailJobSummary;
  snapshot: EmailSnapshot;
  fence: OwnerFence;
  lease: LeaseGrant;
  ordinal: number;
  manual: boolean;
};
type AttemptCommit = {
  jobId: EmailJobId;
  attemptId: EmailAttemptId;
  ordinal: number;
  operationId: string;
  startedAt: UnixMs;
  handedOffAt?: UnixMs;
  finishedAt: UnixMs;
  result: AttemptResult;
  disposition: JobDisposition | 'retry_scheduled';
  reason: AttemptReason | 'attempts_exhausted';
  retryAt?: UnixMs;
};
type ProjectionPermit = { activity: EmailActivity; digest: string; permitUntil: UnixMs };
type CleanupStep = 'payload_pruned' | 'retirement_started' | 'purged';
interface EmailStore {
  ready(options?: CallOptions): Promise<void>;
  findAdmission(
    scope: EmailScope,
    key: EmailAdmissionKey,
    call: StoreCall,
  ): Promise<{
    job: EmailJobSummary;
    fingerprint: string;
  } | null>;
  insert(
    scope: EmailScope,
    admission: StoreAdmission,
    call: StoreCall,
  ): Promise<{ status: 'inserted'; job: EmailJobSummary } | { status: 'duplicate' }>;
  findJob(scope: EmailScope, jobId: EmailJobId, call: StoreCall): Promise<EmailJobSummary | null>;
  findAttempt(
    scope: EmailScope,
    jobId: EmailJobId,
    attemptId: EmailAttemptId,
    call: StoreCall,
  ): Promise<AttemptCommit | null>;
  claimNext(
    scope: EmailScope,
    claim: { attemptId: EmailAttemptId; token: LeaseToken; leaseMs: number },
    call: StoreCall,
  ): Promise<StoreNext<ClaimedEmail>>;
  renew(scope: EmailScope, fence: OwnerFence, leaseMs: number, call: StoreCall): Promise<LeaseGrant | null>;
  markHandoff(scope: EmailScope, fence: OwnerFence, leaseMs: number, call: StoreCall): Promise<HandoffGrant | null>;
  finish(
    scope: EmailScope,
    finish: {
      fence: OwnerFence;
      phase: 'pre_handoff' | 'handed_off';
      operationId: string;
      result: AttemptResult;
    },
    call: StoreCall,
  ): Promise<AttemptCommit | null>;
  recoverNext(scope: EmailScope, call: StoreCall): Promise<StoreNext<AttemptCommit>>;
  expireNext(scope: EmailScope, call: StoreCall): Promise<StoreNext<EmailJobSummary>>;
  cancel(scope: EmailScope, jobId: EmailJobId, call: StoreCall): Promise<CancelResult>;
  resolveUnknown(scope: EmailScope, command: ResolveUnknownCommand, call: StoreCall): Promise<ResolveUnknownResult>;
  reserveProjection(scope: EmailScope, call: StoreCall): Promise<StoreNext<ProjectionPermit>>;
  putActivity(scope: EmailScope, permit: ProjectionPermit, call: StoreCall): Promise<'present' | 'permit_expired'>;
  ackProjection(
    scope: EmailScope,
    permit: ProjectionPermit,
    call: StoreCall,
  ): Promise<'acknowledged' | 'already_acknowledged' | 'stale'>;
  listActivities(scope: EmailScope, query: EmailActivityQuery, call: StoreCall): Promise<EmailActivityPage>;
  cleanupNext(scope: EmailScope, call: StoreCall): Promise<StoreNext<CleanupStep>>;
}
declare function createMemoryEmailStore(options?: { clock?: EmailClock; maxJobs?: number }): EmailStore;

// ./mongoose only, Connection is the caller's Mongoose type.
type MongooseEmailStoreOptions = {
  jobsCollection?: string;
  activitiesCollection?: string;
  jobsModelName?: string;
  activitiesModelName?: string;
};
declare function createMongooseEmailStore(connection: Connection, options?: MongooseEmailStoreOptions): EmailStore;
```

- **The source record.** Format version 1: opaque job ID, scope, tagged admission key plus injective indexed
  encoding (`s:<id>` or `b:<batchId>:<itemId>`), fingerprint, snapshot/hash (hash survives pruning), immutable
  policies, safe summary, private CAS revision, optional active lease (attempt ID, ordinal, token, granted/end
  times, optional handoff time), finalized ledger (`AttemptCommit` plus optional `projectionAckAt`), manual-claim
  availability/usage, resolutions, projection permit high-water and private retirement/scheduling fields.
  `attemptCount` counts claims, including the currently active one. Allowed max is ten ordinary plus one
  manual; no history trimming to make room. Rev/operation IDs are random opaque UUIDs; ownership token is an
  independent cryptographically random secret of at least 128 bits. `markHandoff` is deliberately one-way:
  already handed off is a definitive null, not a second positive grant. `finish` can return the stored commit
  on the same operation ID, never overwrite it; a different winner is available through `findAttempt`.
- **One decision table.** Core provides strict validators/codecs and a shared bounded transition reducer
  (takes current doc, action and store time, produces guard and next doc/commit). Memory applies it atomically;
  Mongo uses revision CAS, including exact owner/phase/lease/time and scope guards. Select the oldest due
  `nextAt` then highest priority then job ID; maintenance picks oldest due work then job ID and first pending
  attempt by ordinal. Fixed max 16 inspected candidates and 3 CAS submissions per primitive (point ops max
  3 CAS submissions); a definitely exhausted CAS window gives `contended` for `StoreNext` or `busy` for admin
  actions. Null on owned writes means a _definite_ failed guard, not lost acknowledgement. Do not turn driver
  errors into null, no-result, or in-memory writes. `insert` checks expected scope, v1 hashes and policies;
  duplicate is confirmed uniqueness competition, not a substitute for reading the committed winner.
- **Authoritative time and concurrency.** Memory clock is injected; Mongo decisions use sampled primary
  server time, not process/worker wall time. Recheck boundary predicates against server `$$NOW` in the
  targeted mutation (`$expr` or conditional update) and use revision CAS to fence concurrent changes. One
  implementable pattern: sample primary `hello.localTime`, run the shared reducer with that time, and
  use that sample for timestamps and lease grants, but enforce correct timing guards again in CAS (e.g. no
  clock rewind, still due/fresh, old and proposed leases still live where applicable, retry/redrive still
  inside expiry). A failed time/revision
  guard has no transition. Retry the bounded decision with a fresh time; don't silently move a deadline or
  commit a timestamp earlier than the previous write's timestamp.
  Admission checks freshness at the insert's sampled decision time; an ACK may arrive after expiry, and a
  committed row at that point is never launchable. A lagging selection scan is harmless because it cannot
  authorize a mutation. Assume replica clocks are synchronized within the 1s timing margin and don't step
  beyond it during an operation; lease fences still disallow stale writes after takeover. If observed timing
  or readiness is unsafe, fail closed, not extend a lease.
- **Read/write strength.** MongoDB 8.x, a writable WiredTiger replica-set primary (not standalone, secondary,
  sharded/mongos, open host transaction, or a weakened compatibility path). One member is suitable for tests,
  not production failover. Use journaled majority writes (including upsert, ACK and cleanup), primary majority
  selection/list reads, and bounded primary **linearizable point reads** on exact unique identities for
  admission replay, job/attempt confirmation and any proof of committed activity before ACK. Majority alone
  doesn't guarantee a current committed view across clients. An unsupported read/write guarantee, stale
  primary or timed-out read is an error, not a miss. Every operation must have finite client/driver/server
  deadlines; bound server-side projection put execution as required by the retirement drain. A write that may
  have reached Mongo and lost its ACK remains `write_unconfirmed` even on client abort/timeout. No
  cross-collection transactions; don't use caller sessions, buffer writes, weaken concerns, or retry unknown
  lifecycle mutations with new IDs. Driver protocol retries for the _same_ retryable write are not a new send.
- **Readiness and schema.** Require successful explicit `ready()` before use; do not implicitly connect or kick
  off asynchronous setup. Validate topology/version/concerns, collections, v1 metadata/validators and required
  indexes (binary/simple collation); validate every touched row with core codecs. Initialize missing collections
  and indexes explicitly, but fail on incompatible pre-existing definitions; don't silently drop or migrate.
  Defaults: `email_jobs`, `email_activities`, connection-local model names `EmailJobV1`, `EmailActivityV1`.
  Collection and model name pairs must each be distinct and match `[A-Za-z][A-Za-z0-9_]{0,63}`.
  Assembly may use internal schema factories on the caller's connection, disabling auto-index/create and buffer
  behavior; never take over a colliding caller model, use global registration, mutate/close the connection,
  or expose models/documents. Use controlled collection operations for atomic writes, not Mongoose hooks.
  An empty store or no local registry/provider does not relax durability requirements.
- **Indexes.** Jobs: scoped unique job ID and scoped unique admission encoding; scoped indexes on
  `(state, nextAt, priority DESC, jobId)`, `(state, expiresAt, jobId)`, `(state, leaseEndsAt, jobId)`,
  `(pendingAt, jobId)` and `(nextCleanupAt, jobId)` with absent eligible-time fields excluded in selector
  indexes. Pending time is the oldest unacknowledged attempt; cleanup time reflects the next actually
  eligible step. Activities: `(scope, jobId, attemptId)` unique; complete-only scoped page indexes for
  `(finishedAt DESC, jobId, attemptId)` and its job-filtered variant `(jobId, finishedAt DESC, attemptId)`;
  a TTL index on `stubDeleteAt` (BSON Date), never populated on a complete activity. Use bounded ordered
  range reads, not an unbounded filter/collection scan followed by a small page.
- **Memory.** Same validation, guards, ledger, deterministic time and safe result contracts; node-process
  only, restart loss, no production durability or implicit fallback. Use bounded candidate work as above.
  `maxJobs` defaults 256 (`1..4096`) across all scopes; duplicates bypass capacity check. At capacity reject
  new jobs with `store_capacity`, never evict a protected row. Projection and cleanup still run at capacity.
  There are at most eleven activities per resident job; data copies are isolated on input and output.

## Verification matrix

All checks below are planned for dependent tasks; no execution evidence is implied. Use maintained fixtures,
barriers/failpoints rather than sleeps for races, clocks for exact time boundaries, and actual isolated
connections where the behavior is a backend/network guarantee. Assert exact provider call count and durable
ledger/activity/state in failure tests, not only returned promises.

<!-- prettier-ignore -->
| Later package lane | Scenarios and acceptance invariant |
| --- | --- |
| `typecheck` and `test:unit` | Both template kinds infer input/data for the key; malformed intent/data/proxies/serialization and limits fail; rendering escapes correctly, no replay renderer calls, sources/cache invalidation isolated; outbox replay uses unchanged staged data. Check absent optional peers at the root, validation errors redacted, stable fingerprint vectors including Unicode and numeric keys, underlying mutations do not change snapshots. |
| `test:unit` (store harness, also shared with Mongo) | Concurrent same/differing-key insert after overlapping preparation, pre-insert crash versus committed replay, lost insert ACK on both sides of commit, reordered/partial batch and batch-vs-single/tenant collisions, capped history and capacity. Assert exact schedule/expiry/lease equality, two workers compete, stale renew/mark/finish, cancel/mark CAS race, cancellation/expiry without attempts, redrive replay/opposing action/second ambiguous manual attempt. |
| `test:unit` (injected worker faults) and `test:mongodb` (durable boundaries) | At claim, renewal, marker and finish separately inject dispatch failure, commit-then-lost ACK and pre-commit interruption. First no-network invariant: only timely confirmed marker may call provider. Marker-before-call crash and post-call timeout/crash recover as unknown. Unconfirmed finish reads/retries *only the fenced write*; old owner after recovery cannot override. Test lease/expiry/run races, already-known result on abort, shutdown at resolver/rate/sockets, hung host callbacks across runs, rate hints/backoff exhaustion, scan/concurrency/lagged counts. |
| `test:smtp` | Real loopback SMTP and synthetic TLS cert: exact MIME/envelope To/Cc/Bcc including Bcc-only, attachments and implicit access denied; 4xx vs 5xx stage replies, all RCPT rejected, partial accepted never retried, TLS/auth and real pre-/post-DATA disconnects. Peer observes actual socket close on deadline/shutdown; no external address or live delivery. |
| `test:sendgrid` | Fake HTTPS/controlled request boundary, two credentials/profiles isolated; exact JSON/template/envelope/base64/sandbox mapping, mode mismatch before wire, valid 202 vs sandbox 200, confirmed nonacceptance allowlist and 429 hints, malformed/truncated/oversized result and generic 5xx ambiguous, abort destroys I/O. Never invent recipient outcomes or rely on a live account. |
| `test:mongodb` | Run real isolated Mongo replica set with separate caller connections; topology/read/write policy and readiness/index/version conflicts fail closed. Exercise conformance and both providers through the durable worker using local/fake boundaries. Include genuine replica failover/command interruption to prove limits, using a multi-member fixture for failover, not the one-member smoke. Separate truly observed server behavior from store-seam lost-ACK injection. |
| `test:unit` + `test:mongodb` (history) | Attempt finalization succeeds while projection fails; crash between upsert/ACK; repeat concurrent projections, privacy and stable scoped cursors. Retention equality, pending/unknown protection, partial retirement failures, expired projection permit and paused/late upsert during purge cannot resurrect a complete record. No duplicate history or sends. |
| `test:packed-consumer` | Install ordinary and release-shaped packages outside their source tree in ignored repo-local scratch. Node ESM and CJS from all paths; strict NodeNext and bundler TS resolution; core-only install without peers, each optional peer independently, and complete install. Run public README examples and verify JSDoc/declaration closures and minimum Node 24.0.0 and advertised peer floor separately from toolchain-default smoke. |

The [task verification section](../../../tasks/20261118-223259-email-service-package.md#verification-and-working-rules)
owns executable lane commands and scope authorization; these cases stay in package tests, not in this handoff.
A missing required tool, version, isolated backend or consumer dependency blocks its lane, not a skipped pass.
Use the package's `mongodb-memory-server` fixture and `MONGOMS_VERSION`/prepared binary when pinning MongoDB 8.x;
start fresh one-member and three-member replica sets for the respective smoke/failover cases, never a host's
application database. Record exact Node, MongoDB, driver, Mongoose and Nodemailer versions exercised.
