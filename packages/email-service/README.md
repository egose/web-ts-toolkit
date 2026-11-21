# `@web-ts-toolkit/email-service`

Typed email preparation, queue admission and bounded submission for Node.js 24 or later. Prepare local Handlebars
content for SMTP or validate SendGrid dynamic-template data. Preparation alone does not enqueue, and admission never
sends mail.

## Imports

Install with `pnpm add @web-ts-toolkit/email-service`. Use named imports (or destructure `require()` in CommonJS).
There is no default export. Preparation, admission, and the memory store need neither optional peer.

<!-- example: errors -->

```typescript
import { EmailError, type EmailErrorCode } from '@web-ts-toolkit/email-service';

const error = new EmailError('write_unconfirmed');
const code: EmailErrorCode = error.code;
// An unconfirmed write may have committed. Do not treat it as a definite failure.
console.log(code);
```

Compare `.code`, not class identity, if your application loads both builds.
`PreparedEmailCommand` describes the sensitive, versioned outbox payload. Treat it like queue data, not a log record.

## Prepare a local template

Render an SMTP snapshot without Nodemailer, a store, or a network connection:

<!-- example: local -->

```typescript
import { createEmailTemplateRegistry, defineLocalTemplate } from '@web-ts-toolkit/email-service';

const welcome = defineLocalTemplate({
  kind: 'handlebars',
  revision: 'v1',
  defaults: { from: { address: 'sender@example.invalid' } },
  subject: { kind: 'inline', content: 'Welcome, {{name}}' },
  html: { kind: 'inline', content: '<p>Welcome, {{name}}.</p>' },
  parseInput(input) {
    if (typeof input !== 'string' || !input.trim()) throw new Error('Expected a name');
    return input;
  },
  prepare(name) {
    return { to: [{ address: 'recipient@example.invalid' }], values: { name } };
  },
  parseData(data) {
    if (!data || typeof data !== 'object' || !('name' in data) || typeof data.name !== 'string') {
      throw new Error('Expected a name');
    }
    return { name: data.name };
  },
});

const registry = createEmailTemplateRegistry({ welcome });
const welcomeCommand = {
  templateKey: 'welcome',
  input: '<Example>',
  intent: { name: '<Example>' },
  key: { kind: 'single', idempotencyKey: 'welcome-1' },
  provider: { kind: 'smtp', key: 'standard-smtp', mode: 'live' },
} as const;
const prepared = await registry.prepare('example-app', welcomeCommand);
```

The snapshot has a plain-text subject and escaped HTML. `prepare` does not admit a job.

Keep `parseInput` and `parseData` synchronous. Preparation can be async and may run again after a crash; keep
side effects idempotent. `intent` is explicit, stable business meaning, not the generated message. Configure only
trusted sources and helpers. HTML values escape by default; this is not sanitization. To update advertised local
content, change its revision and create a new registry; `registry.invalidate(key?)` only refreshes the local cache.

## Prepare a SendGrid dynamic template

Register a template you already manage in SendGrid. For this example the input is a positive integer and the
template expects `{ hours: number }`. Neither registration nor preparation requires credentials.

<!-- example: sendgrid-template -->

```typescript
import { createEmailTemplateRegistry, defineSendGridTemplate } from '@web-ts-toolkit/email-service';

function requireHours(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Expected hours');
  return value;
}

const reminder = defineSendGridTemplate<number, { hours: number }>({
  kind: 'sendgrid',
  revision: 'v1',
  templateId: 'd-0123456789abcdeffedcba9876543210', // Synthetic ID; replace for your application.
  defaults: { from: { address: 'sender@example.invalid' } },
  parseInput: requireHours,
  prepare(hours) {
    return { to: [{ address: 'recipient@example.invalid' }], values: { hours } };
  },
  parseData(data) {
    if (!data || typeof data !== 'object' || !('hours' in data)) throw new Error('Expected hours');
    return { hours: requireHours(data.hours) };
  },
});

const sendGridRegistry = createEmailTemplateRegistry({ reminder });
const stagedReminder = await sendGridRegistry.prepare('example-app', {
  templateKey: 'reminder',
  input: 2,
  intent: { hours: 2 },
  key: { kind: 'single', idempotencyKey: 'reminder-1' },
  provider: { kind: 'sendgrid', key: 'validation', mode: 'sandbox' },
});
```

The command needs a `sendgrid` provider ref (`live` or `sandbox`) and the prepared envelope needs at least one To
recipient. Preparation freezes the template ID and dynamic data, not SendGrid's active remote version.

## Enqueue or relay a job

Using `registry` and `welcomeCommand` from the local-template example:

<!-- example: admission -->

```typescript
import { createEmailService, createMemoryEmailStore } from '@web-ts-toolkit/email-service';

const store = createMemoryEmailStore(); // Non-durable; use the Mongoose store for persistence.
await store.ready();
const service = createEmailService({ scope: 'example-app', store, registry });
const first = await service.enqueue(welcomeCommand); // enqueued; nothing sent
const again = await service.enqueue(welcomeCommand); // replayed; no preparation
console.log(first.job.jobId === again.job.jobId); // true
```

- The service is bound to one scope; your application must authorize access. `intent` must describe every stable
  business difference that matters. A committed job with the same key and fingerprint returns its current summary
  without looking up the template, even after completion or payload expiry/pruning. Reusing the key for different
  intent fails with `idempotency_conflict`. Deduplication ends when the stored identity guard is purged.
- Simultaneous first calls can both prepare, but only the unique committed job wins. If admission returns
  `write_unconfirmed`, retry with the **same scope, key and intent** (or the same staged snapshot). The job may already
  exist; a missing acknowledgement does not prove rollback. Do not generate a new key to retry the same command.
- Both methods accept `{ signal?, timeoutMs? }` (default 10 seconds, override 50–60,000 ms). Lookup, preparation,
  insert and any confirmation share that budget. `retry` and `retention` are optional policy overrides frozen on the
  first insert; replay does not change them. Never put personal data or secrets into IDs or correlation tokens.

### Stage a host-owned outbox

Prepare before the business write. Pass `stagedReminder` from the SendGrid example as `email`. Your `commit`
implementation saves the business change and the versioned, sensitive `email` value in **one host transaction**.
Only after commit does your relay read that value and enqueue it on the caller-ready queue store:

<!-- example: outbox -->

```typescript
import {
  createEmailService,
  createEmailTemplateRegistry,
  type EmailStore,
  type PreparedEmailCommand,
} from '@web-ts-toolkit/email-service';

type CommitReminder = (row: { reminderId: string; email: PreparedEmailCommand }) => Promise<void>;

async function writeReminder(reminderId: string, email: PreparedEmailCommand, commit: CommitReminder) {
  await commit({ reminderId, email });
}

function relayReminder(store: EmailStore, email: PreparedEmailCommand) {
  const relay = createEmailService({ scope: 'example-app', store, registry: createEmailTemplateRegistry({}) });
  return relay.enqueuePrepared(email);
}
```

Relay validates the staged DTO, its hashes, and its scope. It does not join your transaction, rerender, refresh expiry,
or send. Mark your outbox row relayed only after `enqueued` or `replayed`. If an acknowledgement is lost, relay the
same persisted snapshot under the same scoped key and queue configuration; do not prepare a replacement. Keep the
relay within the idempotency window. Restrict access to the staged payload; the returned job summary contains
neither bodies nor addresses.

## Configure an SMTP profile

Install `nodemailer@">=10.6.0 <11"` to import the SMTP runtime entry. Its profile `key` must match the prepared snapshot.
The default is 50 total To/Cc/Bcc recipients; see [SMTP capacity opt-in](#opt-in-to-larger-smtp-envelopes) for a separate
queue that can admit larger envelopes.

<!-- example: smtp-profile -->

```typescript
import { createSmtpProvider } from '@web-ts-toolkit/email-service/smtp';

const smtp = createSmtpProvider({
  key: 'standard-smtp',
  host: 'smtp.example.invalid',
  tls: 'starttls',
});
```

- `starttls` (default port 587) requires a successful TLS upgrade; `implicit` (465) starts with TLS. Both require TLS 1.2+
  and verify the certificate against `servername` (if specified) or `host`, including IP SAN verification for literal
  IPs. `ca` accepts one PEM CA certificate per array entry and replaces Node's default trust roots. `auth: { user, pass }`
  uses advertised ESMTP PLAIN or LOGIN only over verified TLS; there is no plaintext fallback.
- Use an ASCII DNS host or a literal IP. The adapter uses a cancellable DNS resolver (not OS hosts-file aliases) and
  dials one address. It does not pool, retry or select another server after a failure.
- `prepare` validates and copies the snapshot and attachment bytes without network I/O. SMTP sends visible To/Cc,
  envelope-only Bcc and no implicit path or URL inputs. Attachments are ordinary MIME leaf parts, not nested message
  or multipart MIME structures.
- `submit({ signal, timeoutMs })` consumes the prepared submission on a valid call. It closes its connection on abort
  or timeout and never waits indefinitely for a peer. Neither closing the connection nor an `unknown` result means
  the relay discarded the message. `accepted` and `partially_accepted` require a final DATA acknowledgement and mean
  SMTP submission, not inbox delivery. Result diagnostics are fixed codes and recipient indexes, not addresses or raw
  replies. Direct submission is unmanaged and does not provide durable queue or retry guarantees.

## Configure a SendGrid profile

No SendGrid SDK or peer is required. Supply an explicit Mail Send key from your host's secret configuration.
Use the profile's `ref` in a command for a template registered with `defineSendGridTemplate`.

<!-- example: sendgrid-profile -->

```typescript
import { createSendGridProvider } from '@web-ts-toolkit/email-service/sendgrid';

function validationProfile(apiKey: string) {
  return createSendGridProvider({ key: 'validation', apiKey, mode: 'sandbox' });
}
```

- `mode` defaults to `'live'`. `'sandbox'` only validates a request; keep it distinct from a live profile. The
  prepared snapshot's provider kind, key and mode must match. `prepare` does no network I/O and maps the
  frozen envelope, dynamic data and verified attachment bytes to a single personalization with the requested
  template ID. This entrypoint does not manage templates or pin their active SendGrid versions.
- `submit({ signal, timeoutMs })` makes at most one POST to `https://api.sendgrid.com/v3/mail/send` over
  verified TLS 1.2+. No endpoint override, redirects, implicit retries or connection sharing. The JSON body is
  capped at 8 MiB and the complete HTTP response at 64 KiB. Abort or deadline closes the connection; it cannot
  recall a request SendGrid may already have accepted.
- Complete live `202` means `accepted` and may include one sanitized `providerMessageId`. Complete sandbox `200`
  means `validated`, not `accepted`. Neither outcome reports inbox delivery or per-recipient status. A complete
  `429` reports throttled rejection and may carry a retry floor; `400`, `401`, `403`, `404`, `405` and `413` are
  permanent rejections. Other statuses (including `5xx`), incomplete or invalid HTTP, and uncertain transport
  failures do not authorize a retry. The adapter never schedules a retry. Direct submissions are unmanaged and
  provide no durable queue guarantees. Keep raw HTTP tracing off around credentials and message data.

## In-process store for tests and development

<!-- example: memory -->

```typescript
import { createMemoryEmailStore } from '@web-ts-toolkit/email-service';

const memoryStore = createMemoryEmailStore({ maxJobs: 32 });
await memoryStore.ready();
```

Share the same instance to exercise competing callers. Each instance loses its state on restart and does not share
state across processes. The V1 job limit (default 256) is shared across scopes; a full store rejects new jobs instead of
evicting retained ones. This is not a fallback for durable persistence. The `EmailStore` methods are private lifecycle
primitives for adapters and tests, not application-facing routes. Claims include sensitive snapshots and ownership
tokens; do not log or expose them. Store operations alone never contact a provider.

## Run a worker

Bind a caller-ready store to the same scope as the admission service. Pass the configured provider instances, not
credentials in a queue payload. The profile's key, kind and mode must match the frozen snapshot.

<!-- example: worker -->

```typescript
import {
  createEmailWorker,
  type ConfiguredEmailProvider,
  type EmailStore,
  type EmailWorker,
} from '@web-ts-toolkit/email-service';

function makeWorker(store: EmailStore, profiles: readonly ConfiguredEmailProvider[]) {
  return createEmailWorker({ scope: 'example-app', store, providers: profiles });
}

function runDue(worker: EmailWorker, signal: AbortSignal) {
  return worker.run({ limit: 20, concurrency: 4, maintenanceLimit: 10, signal });
}
```

- Your host calls `await runDue(worker, signal)` to do a bounded run.
  Those are the V1 default work limits; set lower limits when appropriate. `timeoutMs` defaults to 30 seconds for the
  whole run, with a separate bounded finish grace. There is no polling or automatic connection management.
  One run per instance is allowed. Different instances can share a queue. `idle` is not a whole-queue inventory.
- The worker prepares the provider payload, validates attachment bytes through your `attachmentResolvers`, and asks
  the optional `rateLimiter` for one permit before making a durable handoff. A worker limiter should be instantiated
  per worker; a shared limiter must enforce the actual shared quota outside the worker. The worker does not wait for
  a deferred permit, refund permits, rerender snapshots, or choose an alternate profile.
- A missing or late handoff acknowledgement never permits a send. A finish write error is not evidence of rejection.
  `unconfirmed` means the worker could not prove the stored attempt outcome; `unknown` is a stored result that is
  never automatically retried. `submitted` counts full and partial acceptance, not sandbox validation or inbox
  delivery. An application that explicitly redrives unknown work must accept possible duplicates.
- `await worker.shutdown({ timeoutMs: 15_000 })` permanently closes the worker, not the store. `stopped` means no
  run or provider I/O is active; `pendingCallbacks` counts host promises still held after cancellation. Injected
  stores and providers must honor call deadlines, abort actual I/O and wait for it to settle. A timed-out shutdown
  can be awaited again, and it does not recall bytes already sent.

## Enqueue and resume a batch

Use `createEmailBatchService` with a service and worker bound to the **same scope and underlying store**.
Each item is a template command without a standalone `key`. Using `welcomeCommand`, `service`, `store`, `smtp`
and `makeWorker` from the preceding examples:

<!-- example: batch -->

```typescript
import { createEmailBatchService } from '@web-ts-toolkit/email-service';

const { key: _singleKey, ...command } = welcomeCommand;
const worker = makeWorker(store, [smtp]);
const batch = createEmailBatchService({ service, worker });
const request = { batchId: 'welcome-run-1', items: [{ itemId: 'notice-1', command }] };
const admission = await batch.enqueueBatch(request);
const resumed = await batch.enqueueBatch(request); // Same item identity; replays without preparing again.
// When the host is ready to process due jobs, call batch.run({ limit: 10, concurrency: 2 }).
```

- An enqueue call validates all 1–100 item envelopes and unique IDs before any lookup or preparation. It admits in
  order under one `timeoutMs` (default 30 seconds, override 50–120,000 ms) and optional `signal`. Business input
  is still parsed by the template on a miss; hold it stable until the call settles.
- Items can be `enqueued`, `replayed`, `failed` with a safe code, or `not_started` after abort or deadline. Earlier
  writes aren't rolled back. Use the **same batch ID, item IDs and intents** to resume even in a different order;
  `write_unconfirmed` may have committed. A committed match returns its current summary without preparing or
  rendering again. Changing intent under the same ID reports `idempotency_conflict`; replay does not reopen
  completed jobs. The counts distinguish failed items from the subset with a persistence error.
- With a wrapped service or one from another build (such as mixing ESM and CommonJS), the batch calls its public
  `enqueue`. It passes the remaining time within that API's 50–60,000 ms range and a signal that can stop work
  sooner. The batch waits for a started item to settle rather than assuming a write was cancelled. A custom
  service must honor these limits and settle its I/O; one that does not cooperate can keep the batch pending.
- `batch.run` is the configured worker's **scope-wide** run, with the same bounds, limiter and report. It can
  process unrelated due jobs in that scope. It neither filters by batch ID nor rewrites envelopes; the local
  grouping ID is not SendGrid's `batch_id`.
- Call `worker.shutdown()` to stop delivery runs. This does not stop `enqueueBatch`; pass its own `signal` to
  cancel admission. Supply a trusted worker: `batch.run` forwards its report and errors unchanged, so a custom
  worker is responsible for redacting them and actually stopping its I/O.

## Inspect results and maintain history

Supply the caller-ready store and an admitted `jobId` (for example, `first.job.jobId`). Bind the admin to the same scope:

<!-- example: results -->

```typescript
import { createEmailAdmin, type EmailStore } from '@web-ts-toolkit/email-service';

async function inspectResults(store: EmailStore, jobId: string) {
  const admin = createEmailAdmin({ scope: 'example-app', store });
  const job = await admin.getJob(jobId); // Latest authoritative outcome, even before projection.
  const projected = await admin.reconcile({ limit: 20 }); // Schedule this and cleanup separately from delivery.
  const page = await admin.listActivities({ jobId, limit: 10 });
  const next = page.nextCursor ? await admin.listActivities({ jobId, limit: 10, cursor: page.nextCursor }) : undefined;
  const cleaned = await admin.cleanup({ limit: 20 });
  return { job, projected, page, next, cleaned };
}
```

- Authorize requests in your application; a scope or cursor is not authentication. Results contain only redacted
  metadata, fixed diagnostic codes, and reliably known recipient indexes, never queue snapshots, addresses, provider
  responses or ownership tokens. Activities are submission history, not inbox delivery receipts or inputs to a resend.
- Lists contain complete committed projections, including those pending acknowledgement on the job. They order
  newest finish first, then by job and attempt ID. `from` is inclusive; `before` is exclusive. Keep the same scope
  and filters when passing `nextCursor`; page size can change (V1 default 25, range 1–100). Pages are not snapshots.
- `reconcile` and `cleanup` do sequential work (V1 default 20 steps, range 1–100); their counts describe only
  confirmed progress in that call. All admin methods accept `signal` and one whole-call `timeoutMs` (default 10 seconds,
  override 50–60,000 ms). A persistence failure can leave work committed; a later maintenance call safely resumes it.
  An optional `onActivity` runs after a new confirmed projection ACK, without waiting for its returned promise.
  If one callback is already pending, later notifications are skipped, not queued or retried.
- `cancel(jobId)` cannot recall mail after handoff. `resolveUnknown({ jobId, attemptId, action: 'dismiss' })` closes
  the hold without changing the outcome. Explicit `'redrive'` with `acknowledgeDuplicateRisk: true` can requeue an
  eligible unknown job once for a future worker run. Quiesce suspected old workers and review provider evidence
  first: redrive can duplicate an accepted submission, and the admin never submits the message itself. After
  `write_unconfirmed`, read the current job or repeat the exact same action; do not assume it rolled back.
- Retention is frozen at admission (default 7 days for payloads and 30 days each for history and idempotency).
  Cleanup holds unresolved unknowns and unacknowledged history, prunes settled payloads when eligible, and only
  removes the replay guard after all retention windows and the projection drain, once activities have been deleted.

## Durable store with Mongoose

Install `mongoose@">=9.12.2 <10"` alongside the package. Supply an open connection (not the global default)
to a writable MongoDB 8.x WiredTiger replica set with journaled majority enabled.

<!-- example: mongoose -->

```typescript
import { createConnection } from 'mongoose';
import { createMongooseEmailStore } from '@web-ts-toolkit/email-service/mongoose';

// The host supplies the replica-set URI and credentials; the store never logs either.
async function openStore(replicaSetUri: string) {
  const connection = createConnection(replicaSetUri, { maxAdaptiveRetries: 0 });
  try {
    await connection.asPromise();
    const store = createMongooseEmailStore(connection);
    await store.ready();
    return { connection, store, close: () => connection.close() };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
```

- `ready()` must succeed before any store call. It checks server status, replica-set config and startup
  options, reads the collection/index catalog, and installs only missing V1 definitions. The principal needs
  `serverStatus`, `replSetGetConfig`, `getCmdLineOpts`, collection/index inspection and creation as applicable,
  and read/write access to the two private collections. Unsupported topology, validators, collations, model
  aliases and conflicting or extra indexes are not adopted or repaired.
- `jobsCollection` and `activitiesCollection` default to `email_jobs` and `email_activities`.
  `jobsModelName` and `activitiesModelName` reserve connection-local names (defaults `EmailJobV1` and
  `EmailActivityV1`); no models are registered. Keep both collections private to this adapter: no manual
  DML, host schemas/hooks, outside TTL, or live catalog changes. There is no migration.
- Do not use direct connections, mongos/load balancing, driver compression, SOCKS proxies, or automatic
  encryption on this connection. Disable adaptive retries as shown (or disable driver read or write retries).
  The store does not borrow caller sessions, change connection settings, or close the connection. Call
  `ready()` again after an explicit reconnect or serving topology change.
- Writes use journaled majority. Exact point reads are primary and linearizable; indexed scans use primary
  majority. Each instance limits in-flight calls and each data primitive to at most five seconds (`ready()`
  has its own budget). Keep replica clocks in sync within one second. `write_unconfirmed` means the
  write may have committed: **do not work an unconfirmed claim or launch after an unconfirmed handoff**.
- Snapshots and staged outboxes may contain addresses, rendered bodies and tokens. Restrict access, use
  storage/backup encryption and secure credentials separately. The activity projection contains only redacted
  result data; a provider accepting a submission would not establish inbox delivery. Host driver command
  monitoring can see private BSON; don't enable raw command logging in production.

## Opt in to larger SMTP envelopes

Omit `smtpCapacity` for V1: **50 total To/Cc/Bcc recipients**, unchanged default SMTP and SendGrid live/sandbox
behavior, and the existing store definitions. The opt-in is for live SMTP only. It accepts one complete envelope
per message; it never splits or truncates the envelope. To/Cc stay visible; Bcc stays envelope-only.

Choose one **canonical lowercase UUIDv4** for the logical store and an integer `maxRecipients` from **51 to 1,000**.
Keep that binding in trusted host configuration and pass it as `smtpCapacity` to every factory in that queue:
registry, store, admission service, each SMTP profile, worker, batch facade and admin. They compare the tuple by
value and take frozen copies. Do not read it from request data or infer it from a snapshot or a worker setting.
Factory mismatches fail with `invalid_config`. There is no new environment setting; the host still supplies relay
credentials separately.

This example uses both optional peers and an already open [Mongoose connection](#durable-store-with-mongoose).
It queues 51 synthetic addresses and does not run the worker. Replace the example UUID with one assigned to your
store; do not generate a new UUID on startup.

<!-- example: smtp-capacity -->

```typescript
import type { Connection } from 'mongoose';
import {
  createEmailAdmin,
  createEmailBatchService,
  createEmailService,
  createEmailTemplateRegistry,
  createEmailWorker,
  defineLocalTemplate,
  type SmtpCapacity,
} from '@web-ts-toolkit/email-service';
import { createMongooseEmailStore } from '@web-ts-toolkit/email-service/mongoose';
import { createSmtpProvider, type SmtpProviderOptions } from '@web-ts-toolkit/email-service/smtp';

const smtpCapacity: SmtpCapacity = {
  format: 'smtp-v2',
  namespace: '6d36e018-b27f-4f3d-88d1-9b10ad86aaff',
  maxRecipients: 51,
};

async function configureCapacityLane(connection: Connection, relay: Omit<SmtpProviderOptions, 'smtpCapacity'>) {
  const scope = 'example-app';
  const store = createMongooseEmailStore(connection, { smtpCapacity });
  await store.ready();
  const notice = defineLocalTemplate({
    kind: 'handlebars',
    revision: 'v1',
    defaults: { from: { address: 'sender@example.invalid' } },
    subject: { kind: 'inline', content: 'Example notice' },
    text: { kind: 'inline', content: 'Synthetic message' },
    parseInput: () => null,
    parseData: () => ({}),
    prepare: () => ({
      to: Array.from({ length: 51 }, (_, i) => ({ address: `recipient-${i}@example.invalid` })),
      values: {},
    }),
  });
  const registry = createEmailTemplateRegistry({ notice }, { smtpCapacity });
  const service = createEmailService({ scope, store, registry, smtpCapacity });
  const smtp = createSmtpProvider({ ...relay, smtpCapacity });
  const worker = createEmailWorker({ scope, store, providers: [smtp], smtpCapacity });
  const batch = createEmailBatchService({ service, worker, smtpCapacity });
  const admin = createEmailAdmin({ scope, store, smtpCapacity });
  const admission = await service.enqueue({
    templateKey: 'notice',
    input: null,
    intent: 'synthetic-notice',
    key: { kind: 'single', idempotencyKey: 'notice-1' },
    provider: smtp.ref,
  });
  return { admission, admin, batch, worker };
}
```

For development, use `createMemoryEmailStore({ smtpCapacity })` and still await `store.ready()`. Separate backings
(including independent memory stores) need different UUIDs, even in one process. For local SMTP tests, run a TLS relay
with a fixture certificate signed by a test CA. For example, supply `host: '127.0.0.1'`, the fixture `port`,
`tls: 'implicit'`, `servername: 'smtp.loopback.invalid'` (matching the certificate's DNS SAN) and `ca: [fixtureCaPem]`.
`ca` explicitly trusts the fixture CA instead of the default roots; it does not bypass hostname verification.
Both implicit TLS and required STARTTLS verify the peer; plaintext mail and plaintext authentication are not supported.

### Envelope, queue and relay limits

- Count and size checks both apply. The canonical snapshot is capped at **2 MiB and 4,096 JSON values** in the
  opted-in queue (V1 uses a 1 MiB snapshot limit). Envelope fields, metadata, attachment references, and rendered
  bodies share the snapshot budget, including JSON escaping. The individual **512 KiB HTML** and **256 KiB text**
  allowances do not increase. Up to five attachments may supply separate bytes (2 MiB each, 5 MiB total).
  An over-limit snapshot fails with `invalid_snapshot` before insert or provider preflight. On-wire MIME is a
  different size from the snapshot: allow for headers, encoding and attachments when checking the relay's limits.
- Opted-in workers default to one concurrent job (max two). `run()` defaults to four claims and four maintenance
  steps (each max 16). Admin history pages default to eight activities (max 16); reconciliation and cleanup default
  to four steps (max 16). A bound memory store defaults to eight jobs (max 16); a bound Mongo handle permits at
  most four in-flight primitives. Do not copy larger V1 settings into a capacity queue.
- Relay recipient limits, reply latency, message size limits and throughput may require choosing a lower cap.
  The adapter waits for each `RCPT TO` reply, even if the relay advertises PIPELINING. For planning, multiply the
  recipient count by a conservative per-reply latency and add time for DNS, connection, TLS, other commands,
  MIME transfer and the final acknowledgement. Leave reserve for jitter and worker/store operations too. At
  60 ms per reply, 1,000 RCPT replies alone use the entire 60-second provider maximum.

On verified-TLS loopback, a single 1,000-recipient transaction with 8.18 MiB of synthetic MIME took **5.851 s**
with 5 ms added per RCPT (15 s provider budget), **26.004 s** with 25 ms, and **50.980 s** with 50 ms (60 s budget).
These are single samples, not production latency estimates or a guarantee for another relay. The worker's
`limits.providerTimeoutMs` defaults to 15,000 ms and cannot exceed 60,000 ms; the effective call is further
clipped by the remaining run and lease windows, including finalization grace and clock margin. Defaults are
a 30 s run, 60 s lease and 10 s finalization grace. The two extended samples used
`limits: { providerTimeoutMs: 60_000, leaseMs: 90_000 }` and a 75,000 ms `run({ timeoutMs })` budget, not just a
higher provider timeout. Measure with representative envelopes and keep headroom; timeouts are not a flow-control
strategy.

After a partial acceptance there is no automatic resend, including to the rejected subset. Only definitive safe
transient nonacceptance authorizes a submission retry. Timeout or missing acknowledgement can leave an `unknown`
result; closing a socket does not prove that the relay discarded the message. `write_unconfirmed` is not a rollback.
Job and activity reads remain redacted. Opted-in activities include group counts and, when known, group/index
outcomes, not recipient addresses, message content, attachment references, credentials or raw SMTP replies.

### Storage, rollout and rollback

- `format: 'smtp-v2'` selects a separate **storage** format; the public DTOs still have `version: 1`.
  Every opted-in prepared command, SMTP snapshot, job summary and activity carries its `smtpCapacity` metadata,
  even below 51 recipients. The field is optional in TypeScript so the types still describe V1 data, where it
  must be absent. Neither queue will accept the other's staged values.
- On MongoDB the binding owns exactly `email_smtp_v2.<namespace>.jobs` and
  `email_smtp_v2.<namespace>.activities`; V1 collection/model name overrides cannot be supplied with this option.
  Call `ready()` before use. It checks both definitions and installs missing collections/indexes; it does not
  alter existing validators, rewrite rows or touch V1 collections. A conflicting cap for an existing namespace
  fails readiness. Keep the pair private and restore it together, offline, under its original binding.
- Keep the namespace and cap fixed for the lifetime of the backing queue. To change the cap, provision a fresh
  namespace, verify readiness, and change routing for **new** work. Keep older and newer queues separate, each
  with its own matched worker and admin. Third-party stores stay V1 unless they implement the bound storage and
  limits, including checking the exact `StoreCall.smtpCapacity` before each primitive.
- To roll back, stop routing new work to the opt-in queue. Keep already staged outbox values and jobs on their
  original route. Drain (or park) that lane with matching code and binding for recovery, inspection and retention;
  keep V1 traffic on its existing queue. Do not point an older, V1-only runtime at the opted-in store. Do not retag,
  copy or replay jobs across queues or automatically redrive uncertain work. The original lane's idempotency and
  retention still apply.

## Integration entrypoints

The integration types have their own entrypoints:

<!-- example: entry-types -->

```typescript
import type { SmtpProviderOptions } from '@web-ts-toolkit/email-service/smtp';
import type { SendGridProviderOptions } from '@web-ts-toolkit/email-service/sendgrid';
import type { MongooseEmailStoreOptions } from '@web-ts-toolkit/email-service/mongoose';
```

<!-- prettier-ignore -->
| Entry | Current surface | Optional peer |
| --- | --- | --- |
| `@web-ts-toolkit/email-service` | `EmailError`, `createEmailTemplateRegistry`, `defineLocalTemplate`, `defineSendGridTemplate`, `createEmailService`, `createEmailWorker`, `createEmailBatchService`, `createEmailAdmin`, `createMemoryEmailStore`, and shared contracts including `SmtpCapacity` | None |
| `@web-ts-toolkit/email-service/smtp` | `createSmtpProvider`, `SmtpProviderOptions` | Nodemailer `>=10.6.0 <11` (runtime only) |
| `@web-ts-toolkit/email-service/sendgrid` | `createSendGridProvider`, `SendGridProviderOptions` | None (Node HTTPS) |
| `@web-ts-toolkit/email-service/mongoose` | `createMongooseEmailStore`, `MongooseEmailStoreOptions` | Mongoose `>=9.12.2 <10` (declarations and caller connection) |

The root has no runtime or declaration dependency on the optional peers. A type-only SMTP import does not require
Nodemailer. The Mongoose runtime module can load without Mongoose, but its declarations reference the peer and
the factory needs a caller-owned Mongoose connection. No entrypoint opens a connection, registers a model, starts
a timer, or submits mail when imported.
