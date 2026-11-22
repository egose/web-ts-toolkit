# `@web-ts-toolkit/email-service`

Typed email preparation, queue admission and bounded submission for Node.js 24 or later. Prepare local Handlebars
content for SMTP or validate SendGrid dynamic-template data. Preparation alone does not enqueue, and admission never
sends mail.

## Quickstart: enqueue and inspect a synthetic submission

Install with `pnpm add @web-ts-toolkit/email-service`. Use named imports (or destructure `require()` in CommonJS).
There is no default export. This standalone example uses no optional peers, credentials, or network. Save it as
`receipt.mts` and run `node receipt.mts`, or compile it as an ES module with TypeScript's `NodeNext` settings.
The provider is a test double for this one-recipient template: it **fabricates acceptance** and never sends mail.

<!-- example: quickstart -->

```typescript
import {
  createEmailAdmin,
  createEmailService,
  createEmailTemplateRegistry,
  createEmailWorker,
  createMemoryEmailStore,
  defineLocalTemplate,
  type EmailProvider,
  type SmtpSnapshot,
} from '@web-ts-toolkit/email-service';

const receipt = defineLocalTemplate({
  kind: 'handlebars',
  revision: 'v1',
  defaults: { from: { address: 'sender@example.invalid' } },
  subject: { kind: 'inline', content: 'Payment received' },
  text: { kind: 'inline', content: 'Thank you for your payment.' },
  parseInput(value) {
    if (value !== null) throw new Error('Expected null');
    return value;
  },
  parseData: () => ({}),
  prepare: () => ({ to: [{ address: 'buyer@example.invalid' }], values: {} }),
});
const registry = createEmailTemplateRegistry({ receipt });
const store = createMemoryEmailStore();
await store.ready();

const queue = { scope: 'example-app', store };
const service = createEmailService({ ...queue, registry });
const ref = { kind: 'smtp', key: 'receipt-test', mode: 'live' } as const;
const eventId = 'order-paid-6042'; // A stable, opaque ID from the host's business event, not a new ID on retry.
const admission = await service.enqueue({
  templateKey: 'receipt',
  input: null,
  key: { kind: 'single', idempotencyKey: `receipt-${eventId}` },
  intent: { purpose: 'receipt', eventId },
  provider: ref,
});

const syntheticSmtp: EmailProvider<SmtpSnapshot> = {
  ref, // Match the frozen kind, key and mode exactly.
  prepare() {
    return {
      async submit({ signal }) {
        signal.throwIfAborted();
        return {
          outcome: 'accepted',
          retry: 'never',
          stage: 'data',
          reason: 'smtp_accepted',
          recipients: [{ group: 'to', index: 0, status: 'accepted' }],
        };
      },
    };
  },
};
const worker = createEmailWorker({ ...queue, providers: [syntheticSmtp] });
try {
  const report = await worker.run({ limit: 1 });
  const job = await createEmailAdmin(queue).getJob(admission.job.jobId);
  console.log(JSON.stringify({ admission: admission.status, submitted: report.counts.submitted, job }));
} finally {
  const shutdown = await worker.shutdown();
  if (shutdown.status !== 'stopped') throw new Error('Worker shutdown deadline elapsed');
}
```

Expect `enqueued`, one synthetic submission and a redacted job with `latestAttempt.outcome: 'accepted'`.
With a real provider, acceptance confirms submission to that provider, not inbox delivery. SendGrid sandbox
validation is not submission.

The host owns business rules, scheduling and authorization. Use `createEmailService` or
[`createEmailBatchAdmission`](#enqueue-and-resume-a-batch) in producers, [`createEmailRelay`](#stage-a-host-owned-outbox)
for prepared outboxes, `createEmailWorker` for delivery, and `createEmailAdmin` for operations. They can run in
separate processes using the same backing queue and authorized scope, with the same binding when
[opting into SMTP capacity](#opt-in-to-larger-smtp-envelopes).

## Support and limits

<!-- prettier-ignore -->
| Choose | Entrypoint / optional peer | Support and limits |
| --- | --- | --- |
| Local Handlebars → SMTP | Root `defineLocalTemplate`; `/smtp` `createSmtpProvider` needs Nodemailer `>=10.6.0 <11` at runtime | Verified TLS, live only. 50 total To/Cc/Bcc by default; [opt in](#opt-in-to-larger-smtp-envelopes) for 51–1,000. |
| Hosted SendGrid → HTTPS | Root `defineSendGridTemplate`; `/sendgrid` `createSendGridProvider`, no SDK or peer | Mail Send live or sandbox, V1 queue only. Freezes the template ID and data, not the active remote template version. |
| Memory queue | Root `createMemoryEmailStore`, no optional peer | Single instance, one process, non-durable. V1 defaults to 256 total jobs across scopes; no eviction to make room. |
| Durable MongoDB queue | `/mongoose` `createMongooseEmailStore`, caller-owned Mongoose `>=9.12.2 <10` connection | Writable MongoDB 8.x WiredTiger replica set with journaled majority; [topology and catalog privileges](#durable-store-with-mongoose) and private collection read/write access. |
| Project-owned attachments (default) | Root `AttachmentRef` and `AttachmentResolver`, no optional peer | Supply immutable, versioned refs; your project owns the bytes and their retention. |
| [Managed attachment staging](#manage-delivery-attachments) | `/attachments` `checkManagedAttachmentRetention`, no optional peer | Producer checks the actual frozen expiry plus a 24-hour file hold. Works with the existing refs, queues and providers. |
| Managed BSON bytes | `/attachments/mongoose` `createMongooseAttachmentStore`, Mongoose `>=9.12.2 <10` | Separate collection on a journaled MongoDB 8.x WiredTiger replica set; tested with 8.2.6 and Mongoose 9.12.2. |
| Managed S3 objects | `/attachments/s3` `createS3AttachmentClient`, `createS3AttachmentStore`; `@aws-sdk/client-s3` `>=3.1167.0 <4` | Private, never-versioned bucket. Tested at SDK 3.1167.0 with SeaweedFS 4.54 and a loopback AWS wire fixture, not live AWS. |
| Managed Azure blobs | `/attachments/azure` `createAzureAttachmentContainerClient` and `createAzureAttachmentStore`, `@azure/storage-blob` `>=12.34.0 <13` | Private Hot block blobs, operator-audited policy. Tested at SDK 12.34.0 with Azurite Blob 3.38.0, not live Azure. |
| Custom provider | Root `EmailProvider` | Supported protocols only. No I/O in `prepare`; one-shot, deadline- and abort-aware `submit` with [normalized evidence](#implement-a-custom-provider), not raw replies. |
| Custom store | Root `EmailStore` | Scoped, bounded, atomic operations on store time. Enforce durable handoff and lease fencing, write confirmation, projection and retention; see [V1 transaction primitives][store-v1]. |

Always `await store.ready()` on the queue store before use. Default V1 memory still allows legacy callers to skip
it; SMTP-capacity memory and MongoDB require it. Do not substitute memory when a durable store is unavailable.

The [V1 Store contract][store-v1] and [SMTP opt-in compatibility contract][store-smtp] are pinned historical
baselines. Use the installed declarations and this README for the current contract: the
[`StoreClaimNext` expiry signal](#run-a-worker) and [new-only SMTP attachment check](#configure-an-smtp-profile)
override the historical claim and insert rules. For opt-in stores also enforce the
[exact `StoreCall.smtpCapacity` binding and smaller bounds](#storage-rollout-and-rollback). For the public API,
the current peer ranges above and the template and provider typing, producer-only APIs and nonempty worker
requirements below supersede the corresponding historical examples.

[store-v1]: https://github.com/egose/web-ts-toolkit/blob/39848121d8b5746960078cac83949caaf26a9d9c/docs/task-artifacts/email-service/20261118-223259-email-service-package/v1-contract.md#store-adapter-transaction-primitives
[store-smtp]: https://github.com/egose/web-ts-toolkit/blob/39848121d8b5746960078cac83949caaf26a9d9c/docs/task-artifacts/email-service/20261120-214514-email-service-smtp-capacity/implementation-contract.md#factory-and-request-boundary

## Handle errors by code

Check a known `.code` on a caught `unknown`, not `instanceof EmailError`. A subpath can throw a different
class than the root even within the same module format (all ESM or all CommonJS).

<!-- example: errors -->

```typescript
import type { EmailErrorCode } from '@web-ts-toolkit/email-service';
import { createSendGridProvider, type SendGridProviderOptions } from '@web-ts-toolkit/email-service/sendgrid';

function hasEmailCode(error: unknown, code: EmailErrorCode): boolean {
  if (typeof error !== 'object' || error === null) return false;
  try {
    return Object.getOwnPropertyDescriptor(error, 'code')?.value === code; // Read only an own data property.
  } catch {
    return false; // A thrown proxy can reject property inspection.
  }
}

function configureSendGrid(options: SendGridProviderOptions) {
  try {
    return createSendGridProvider(options);
  } catch (error: unknown) {
    if (hasEmailCode(error, 'invalid_config')) {
      return null; // Report a configuration failure without logging the options or the exception.
    }
    throw error; // Unexpected failure; do not assume it is a retryable package error.
  }
}
```

## Prepare a local template

Render an SMTP snapshot without Nodemailer, a store, or a network connection:

<!-- example: local -->

```typescript
import { createEmailTemplateRegistry, defineLocalTemplate, type TemplateMap } from '@web-ts-toolkit/email-service';

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
    return { to: [{ address: 'recipient@example.invalid' }], values: { name: name.trim() } };
  },
  parseData(data) {
    if (!data || typeof data !== 'object' || !('name' in data) || typeof data.name !== 'string') {
      throw new Error('Expected a name');
    }
    return { name: data.name };
  },
});

const templates = { welcome } satisfies TemplateMap;
const registry = createEmailTemplateRegistry(templates);
const welcomeCommand = {
  templateKey: 'welcome',
  input: '  <Example>  ',
  intent: { name: '<Example>' },
  key: { kind: 'single', idempotencyKey: 'welcome-1' },
  provider: { kind: 'smtp', key: 'standard-smtp', mode: 'live' },
} as const;
const prepared = await registry.prepare('example-app', welcomeCommand);
```

The snapshot has a plain-text subject and escaped HTML. `prepare` does not admit a job.

Use `satisfies TemplateMap` instead of annotating the definitions as `TemplateMap`. This keeps literal keys and their
input and provider types for the registry, service and batch. A widened `TemplateCommand<TemplateMap>` accepts either
provider, but cannot check keys or inputs against a specific registry.

`parseInput` synchronously validates the command's declared input shape at runtime. Its return type is the type callers
must supply as `command.input`. Normalize prepared values in `prepare` (here, `name.trim()`), rather than using
`parseInput` to convert from a different raw input shape.

Keep `parseData` synchronous too. Preparation can be async and may run again after a crash; keep
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

### Schedule a seven-day reminder

`scheduleAt` is the earliest eligible time, not a timer. Both it and `expiresAt` are Unix milliseconds.
Expiry defaults to **24 hours from preparation**, so a seven-day schedule needs an explicit later expiry.
Set `expiresAt` in `prepare`: it must be strictly after preparation and `scheduleAt`, and at most **30 days
from preparation**. This example reuses `reminder` from the SendGrid template example and a caller-ready V1
store. It admits a sandbox reminder when the booking is recorded, without starting a worker:

<!-- example: scheduled-reminder -->

```typescript
import {
  createEmailService,
  createEmailTemplateRegistry,
  defineSendGridTemplate,
  type EmailStore,
} from '@web-ts-toolkit/email-service';

const dayMs = 86_400_000;
const sevenDayReminder = defineSendGridTemplate({
  ...reminder,
  async prepare(hours, context) {
    return { ...(await reminder.prepare(hours, context)), expiresAt: context.now + 8 * dayMs };
  },
});
const scheduledRegistry = createEmailTemplateRegistry({ reminder: sevenDayReminder });

function enqueueSevenDayReminder(store: EmailStore, booking: { eventId: string; recordedAt: number }) {
  const service = createEmailService({ scope: 'example-app', store, registry: scheduledRegistry });
  return service.enqueue({
    templateKey: 'reminder',
    input: 7 * 24,
    key: { kind: 'single', idempotencyKey: `seven-day-reminder-${booking.eventId}` },
    intent: { purpose: 'booking-reminder', eventId: booking.eventId, daysAfterBooking: 7 },
    scheduleAt: booking.recordedAt + 7 * dayMs,
    provider: { kind: 'sendgrid', key: 'validation', mode: 'sandbox' },
  });
}
```

Pass the original event ID and timestamp on replay, not a fresh `Date.now()`; the schedule is part of the
fingerprint. `PrepareContext` provides `now`, not `scheduleAt`; if your expiry depends on a variable schedule,
pass the needed timestamp in your validated input. The expiry is frozen in the prepared snapshot: relay,
same-key replay, worker retries, and redrive do not extend it. Expiry prevents a new launch; it cannot recall
one already in progress.

### Stage a host-owned outbox

Prepare before the business write. Pass `stagedReminder` from the SendGrid example as `email`. Your `commit`
implementation saves the business change and the versioned, sensitive `email` value in **one host transaction**.
Only after commit does your relay read that value and enqueue it on the caller-ready queue store. The relay process
does not need a template registry, worker, or delivery credentials. Treat `PreparedEmailCommand` like queue data,
not a log record:

<!-- example: outbox -->

```typescript
import { createEmailRelay, type EmailRelayOptions, type PreparedEmailCommand } from '@web-ts-toolkit/email-service';

type CommitReminder = (row: { reminderId: string; email: PreparedEmailCommand }) => Promise<void>;

async function writeReminder(reminderId: string, email: PreparedEmailCommand, commit: CommitReminder) {
  await commit({ reminderId, email });
}

function makeReminderRelay(store: EmailRelayOptions['store']) {
  const relay = createEmailRelay({ scope: 'example-app', store });
  return (row: { email: PreparedEmailCommand }) => relay.enqueuePrepared(row.email);
}
```

Create the relay once and call the returned function for each committed outbox row. It validates the snapshot,
hashes, scope and binding before looking up the key. A retained match replays even after snapshot expiry; an
expired snapshot for a new job is rejected. Relay does not join your transaction, rerender, refresh expiry, or
send. `createEmailService` also exposes the same `enqueuePrepared` method if your process already has a registry.

Older staged SMTP snapshots with `message/*` or `multipart/*` attachments still replay a retained match, but fail
with `invalid_snapshot` on a new admission. Treat this as an outbox validation error, not a transient send failure
or proof that an earlier uncertain write did not commit. Resolve any uncertain admission under the original key.
For an unadmitted entry, use your outbox recovery process to fix the attachment format and stage it again.
Previously admitted rows stay readable but the bundled SMTP adapter still rejects those attachments. Replay
neither changes their snapshots nor reopens terminal jobs for delivery.

Mark your outbox row relayed only after `enqueued` or `replayed`. If an acknowledgement is lost, relay the same
persisted snapshot under its original scoped key and queue binding; do not prepare a replacement. Keep the relay
within the idempotency window. Restrict access to the staged payload; the returned job summary contains neither
bodies nor addresses.

## Configure an SMTP profile

Install the [optional Nodemailer peer](#support-and-limits) to import the SMTP runtime entry. Its profile `key`
must match the prepared snapshot.

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
- The client greeting is fixed: `EHLO email.invalid` before and after the required STARTTLS upgrade, or once over
  implicit TLS. `servername` is for remote TLS SNI and certificate verification; it does not change EHLO.
  Relays requiring a different EHLO name are not supported.
- Use an ASCII DNS host or a literal IP. The adapter uses a cancellable DNS resolver (not OS hosts-file aliases) and
  dials one address. It does not pool, retry or select another server after a failure.
- `prepare` validates and copies the snapshot and attachment bytes without network I/O. SMTP sends visible To/Cc,
  envelope-only Bcc and no implicit path or URL inputs. Attachments are ordinary MIME leaf parts.
  Both SMTP queue modes reject `message/*` and `multipart/*` refs with `invalid_snapshot` during new registry
  preparation or admission, before they can be persisted or resolved by a worker. Direct SMTP preparation still
  refuses these types. SendGrid behavior is unchanged.
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
state across processes. The `EmailStore` methods are private lifecycle primitives for adapters and tests, not
application-facing routes. Claims include sensitive snapshots and ownership tokens; do not log or expose them.
Store operations alone never contact a provider.

## Run a worker

Bind a caller-ready store to the same scope as the admission service. Pass at least one configured provider, not
credentials in a queue payload. The profile's key, kind and mode must match the frozen snapshot.

**Migrating an empty V1 worker:** `providers: []` now throws `invalid_config` at construction, as it already did
with `smtpCapacity`. No queue or provider work starts. If you only enqueue batches, replace the empty worker and
combined facade with [`createEmailBatchAdmission({ service })`](#enqueue-and-resume-a-batch) (pass `smtpCapacity`
if configured). For already prepared commands, [`createEmailRelay`](#stage-a-host-owned-outbox) needs no worker
or template registry.

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
- On `report.stop === 'expiry_maintenance_required'`, the entire bounded claim window was filled with expired
  queued jobs. There may be live work behind them. Schedule another run for the **same scope** with a positive
  `maintenanceLimit` (or omit it for the default: 10 in V1, 4 with `smtpCapacity`). Keep scheduling bounded runs
  if the backlog takes more than one sweep. `maintenanceLimit: 0` skips both recovery and queued expiry; repeatedly
  running with zero maintenance won't clear the expired prefix. A follow-up run can submit eligible mail as usual.
- This stop is new for both bundled queues. Handle it in exhaustive switches on `EmailRunReport.stop` (including
  `batch.run()`); direct `EmailStore.claimNext()` consumers can use `StoreClaimNext` and call bounded `expireNext()`
  in the same scope before retrying. Existing custom stores can keep returning the previous `StoreNext` statuses.
  Pair updated bundled stores with updated workers when passing store objects in-process: older workers report
  the new result as a store error. There is no persisted-data or Mongo catalog migration.
- The worker prepares the provider payload, validates attachment bytes through your `attachmentResolvers`, and asks
  the optional `rateLimiter` for one permit before making a durable handoff. A worker limiter should be instantiated
  per worker; a shared limiter must enforce the actual shared quota outside the worker. The worker does not wait for
  a deferred permit, refund permits, rerender snapshots, or choose an alternate profile.
- `retry.maxAttempts` defaults to **3 claims**, not three provider calls. Three rate deferrals can end in
  `attempts_exhausted` with zero provider calls. For safe transient results with claims left, the retry time is the
  later of jittered exponential backoff (default base 1 s, cap 60 s) and any valid limiter or provider retry floor.
  No retry is scheduled at or after expiry. Pace worker runs for your quota; there is no separate deferral budget.
- A missing or late handoff acknowledgement never permits a send. A finish write error is not proof of rejection.
  `submitted` counts full and partial acceptance, not sandbox validation. Neither partial nor unknown outcomes
  automatically resend; see [recovery](#recover-unresolved-submissions).
- `await worker.shutdown({ timeoutMs: 15_000 })` permanently closes the worker, not the store. `stopped` means no
  run or provider I/O is active; `pendingCallbacks` counts host promises still held after cancellation. Injected
  stores and providers must honor call deadlines, abort actual I/O and wait for it to settle. A timed-out shutdown
  can be awaited again, and it does not recall bytes already sent.

### Roll out a provider profile in a shared scope

Workers on the same queue and scope compete for eligible jobs. Claims do not filter by profile, even when every
worker has providers configured. Each worker needs an exact match for every active provider reference (kind, key
and mode) and an `attachmentResolvers` entry for every `resolverKey` its jobs can reference. Startup checks only
the local configuration; the host must verify that all workers on the route have what they need.

For example, workers A and B share the `example-app` scope on one queue. Existing jobs use a live `smtp` profile
with key `standard-smtp` and may reference the `files-v1` resolver. New jobs will use a live `smtp` profile with
key `next-smtp` and the `files-v2` resolver. Use a distinct profile key so the two profiles can coexist.

1. Replace worker A with one configured for **both** profiles and resolvers. B still has only the old
   configuration, so producers must continue using `standard-smtp` and `files-v1`.
2. Replace worker B with the same dual configuration. Confirm that no worker still claiming in `example-app`
   lacks either profile or resolver.
3. Only now switch producers of new work to `next-smtp` and `files-v2`. Keep both routes on both workers while the
   old work drains, including access to its referenced attachment versions.
4. Remove `standard-smtp` and `files-v1` only after nothing still needs them. Account for scheduled jobs, retries,
   in-flight claims, staged outbox entries that can still be relayed, and any eligible `unknown` jobs you intend to
   explicitly redrive. A run reporting `idle` does not prove the old work has drained.

If the fleets cannot share configuration, keep one on `example-app` and route the other to `example-app-next` in
the same store, or use separate backing queues. Bind each fleet's producers, relays and workers to the matching
scope and queue. Leave already staged and admitted work on its original route.

A missing or mismatched profile is a terminal pre-handoff failure: `failed` with reason `profile_unavailable`
and no provider submission on that attempt. The worker does not retry the job or switch profiles. After you
fix the configuration, replaying the same scoped command under the same key returns `replayed` with the existing
failed job while its identity is retained; it does not reopen the job. Changing the command's provider reference
under that key results in `idempotency_conflict`.

### Implement a custom provider

Use `EmailProvider<SmtpSnapshot>` or `EmailProvider<SendGridSnapshot>` to implement one of the supported
protocols. Keep `prepare` synchronous and free of I/O. This SMTP test double matches the `standard-smtp` profile
from the local template example. Use it only with an isolated test queue: it records synthetic acceptance and
sends nothing.

<!-- example: custom-provider -->

```typescript
import {
  createSmtpAcceptanceResult,
  EmailError,
  type EmailProvider,
  type ProviderResult,
  type SmtpSnapshot,
} from '@web-ts-toolkit/email-service';

const syntheticSmtp: EmailProvider<SmtpSnapshot> = {
  ref: { kind: 'smtp', key: 'standard-smtp', mode: 'live' },
  prepare({ snapshot: { envelope } }) {
    const recipients = (['to', 'cc', 'bcc'] as const).flatMap((group) =>
      envelope[group].map((_, index) => ({ group, index, status: 'accepted' as const })),
    );
    let submitted = false;
    return {
      async submit({ signal }): Promise<ProviderResult> {
        if (submitted) throw new EmailError('closed');
        submitted = true;
        if (signal.aborted) {
          return { outcome: 'unknown', retry: 'never', stage: 'connect', reason: 'provider_aborted' };
        }
        return createSmtpAcceptanceResult(recipients);
      },
    };
  },
};
```

For the test queue above, pass `[syntheticSmtp]` to `makeWorker(store, profiles)` in place of a real SMTP adapter.
A real `submit` must be one-shot, honor `signal` and `timeoutMs`, and settle only once it cannot perform more
send I/O. Report SMTP acceptance or partial acceptance only after the final DATA acknowledgement, with one
entry per envelope recipient (group and zero-based index; use To/Cc/Bcc order with `smtpCapacity`). If you
cannot establish what happened, report `unknown`, not a safe retry.

**Migrating custom TypeScript providers:** `ProviderResult` now ties `outcome`, `retry`, `stage`, and metadata to
`reason`. Return a complete result in each branch rather than assembling those fields independently or casting
from `AttemptResult`. Annotate `submit` with `Promise<ProviderResult>` as above or use `satisfies ProviderResult`
on a result literal. A literal `smtp_accepted` result needs a nonempty tuple of accepted recipients. For a dynamic
list or any `smtp_partial` result, call `createSmtpAcceptanceResult(recipients, messageId?)` from the root
(no optional peer). It copies and freezes the evidence without reordering it, and returns `smtp_partial` only
when both statuses are present. Empty, all-rejected, or malformed evidence throws `invalid_command`; an
all-rejected list is not acceptance. Omit `messageId` unless it is `<${attemptId}@email.invalid>` for this attempt.
Only live `sendgrid_accepted` can include `providerMessageId`, and only `sendgrid_throttled` can include a
provider `retryHint` (`delayMs`, `notBefore`, or both). Sandbox success is `sendgrid_validated`, not
`sendgrid_accepted`.

This tightens the TypeScript contract without changing stored formats or submission semantics. The worker still
checks evidence against the actual envelope and profile mode. Invalid evidence after handoff becomes `unknown` with reason
`transport_uncertain`; it never authorizes an automatic resend.

## Enqueue and resume a batch

Use `createEmailBatchAdmission` in a producer process. It takes the bound admission `service` from the enqueue
example and only exposes `enqueueBatch`. No worker, delivery credentials, or optional peer is needed for the memory
example. Each item is a template command without a standalone `key`. Using `welcomeCommand` from above:

<!-- example: batch-admission -->

```typescript
import { createEmailBatchAdmission } from '@web-ts-toolkit/email-service';

const { key: _singleKey, ...command } = welcomeCommand;
const batch = createEmailBatchAdmission({ service });
const request = { batchId: 'welcome-run-1', items: [{ itemId: 'notice-1', command }] };
const admission = await batch.enqueueBatch(request);
const resumed = await batch.enqueueBatch(request); // Same item identity; replays without preparing again.
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

### Combine batch admission and delivery

If the same process also runs delivery, `createEmailBatchService` adds the configured worker's `run` to the same
`enqueueBatch` operation. Build both components from the same backing configuration, using a single store instance
for memory or matching durable queue settings. Matching scope and capacity do not prove two stores share a backing.
This is an alternative to the producer example, using `registry`, `welcomeCommand` and `smtp` from above:

<!-- example: batch -->

```typescript
import {
  createEmailBatchService,
  createEmailService,
  createEmailWorker,
  createMemoryEmailStore,
} from '@web-ts-toolkit/email-service';

const store = createMemoryEmailStore();
await store.ready();
const queue = { scope: 'example-app', store };
const service = createEmailService({ ...queue, registry });
const worker = createEmailWorker({ ...queue, providers: [smtp] });
const batch = createEmailBatchService({ service, worker });
const { key: _singleKey, ...command } = welcomeCommand;
const request = { batchId: 'welcome-run-1', items: [{ itemId: 'notice-1', command }] };
const admission = await batch.enqueueBatch(request);
const resumed = await batch.enqueueBatch(request);
// When the host is ready to process due jobs, call batch.run({ limit: 10, concurrency: 2 }).
```

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

- Results contain redacted metadata, fixed diagnostic codes and reliably known recipient indexes, never queue
  snapshots, addresses, raw responses or ownership tokens. Activities describe past attempts, not current holds.
- Lists contain complete committed projections, including those pending acknowledgement on the job. They order
  newest finish first, then by job and attempt ID. `from` is inclusive; `before` is exclusive. Keep the same scope
  and filters when passing `nextCursor` as `cursor`; page size can change (V1 default 25, range 1–100).
- `reconcile` and `cleanup` do sequential work (V1 default 20 steps, range 1–100); their counts describe only
  confirmed progress in that call. All admin methods accept `signal` and one whole-call `timeoutMs` (default 10 seconds,
  override 50–60,000 ms). A persistence failure can leave work committed; later bounded maintenance can resume it.
  `onActivity` is best effort after a newly confirmed projection ACK: if one callback is pending, later
  notifications are skipped, not queued or retried.

### Recover unresolved submissions

Use the original caller-ready store, authorized scope and `smtpCapacity` binding (if enabled). The host
authorizes reads and actions; IDs and cursors are not credentials. There is no API that lists all current holds.

1. **Record IDs.** Persist the original queue/scope, opaque host reference and `job.jobId` from `enqueued` or
   `replayed` before acknowledging the host item or marking an outbox row relayed. For batches, save successful
   jobs alongside their batch/item IDs. Resume uncertain admissions only within the replay window and on the
   original route with the same key and intent (same staged command for a relay; same batch/item IDs and intents
   for a batch). Don't replay completed commands to find an ID: after purge they can enqueue anew. Record scoped
   job/attempt IDs (when present), operation, status and reason from worker `items`, including recovery and uncertainty. Keep `stop` and
   `counts.persistenceFailures`: a lost claim ACK may have no item. Restrict access and omit private payloads.
2. **Read current state.** `unconfirmed` means the worker could not confirm the stored outcome;
   `write_unconfirmed` means a write may have committed. Neither proves rollback or non-submission. A `handed_off`
   lease does not prove provider invocation, and `providerInvoked: false` on recovery says nothing about the old
   owner. Read `admin.getJob(jobId)` even before projection. Act only on a terminal `unknown` with `unknownOpen: true`
   and `latestAttempt.outcome === 'unknown'`. Take the ID from `latestAttempt` and match it to any candidate attempt
   from a report or activity. On a changed attempt, failed read or `null`, do not act on stale evidence. A missing
   job does not prove non-submission.
3. **If IDs are missing, look for candidates, not a complete worklist.** Check host records first. Run bounded
   `admin.reconcile({ limit: 4, timeoutMs: 10_000 })` passes before paging. They project attempts without recovering
   leases or sending; back off on contention and surface failures. Set a fixed `finishedAt` window in Unix ms
   (`from` inclusive, `before` exclusive), then page `admin.listActivities({ from, before, limit: 8 })`.
   Use a shared deadline signal and cap passes, pages and reads (e.g. three pages and 24 `getJob` calls).
   Filter for `activity.result.outcome === 'unknown'`, deduplicate by scoped job/attempt and recheck the exact
   open attempt with `getJob`.
   Save the route, filters and opaque cursor after accounting for a whole page; resume an interrupted page from
   its start. Cursors mark positions, not snapshots or watermarks. Later projections can appear before your
   bookmark and older holds outside the window; history can also be purged. Revisit overlapping or older
   windows from the first page within budget. Idle reconciliation or an empty/final page cannot rule out holds
   (e.g. unprojected attempts or leases); report gaps and escalate if you need a complete inventory.
4. **Let a healthy worker recover an expired lease only if delivery is authorized.** If still leased, wait for
   the owner or quiesce suspected old workers: stop scheduling and verify no runs or provider I/O remain
   (`shutdown()` returns `stopped`, not `deadline`, or equivalent host confirmation). After store-time lease
   expiry, run a bounded worker in the original scope with positive `maintenanceLimit`. Pre-handoff recovery
   can safely retry within policy; post-handoff recovery records `unknown`. Even `limit: 1` can send unrelated
   mail; there is no recovery-only admin run. Re-read the job and check authorized provider evidence for that
   attempt. Missing provider logs do not prove rejection.
5. **Resolve the exact open attempt, or leave it open.** Re-read immediately before acting.
   `admin.resolveUnknown({ jobId, attemptId, action: 'dismiss' })` closes the hold without sending or changing
   the outcome, even after expiry. Dismissal does not assert acceptance or rejection; cancellation cannot recall mail.
   Do not redrive confirmed acceptance. Only after quiescing suspected old workers, reviewing evidence and
   accepting the risk of duplicate submission should an authorized operator call
   `admin.resolveUnknown({ jobId, attemptId, action: 'redrive', acknowledgeDuplicateRisk: true })`.
   Redrive requires a retained snapshot, store time before the original `expiresAt`, and no previous redrive.
   It requeues the same snapshot with **one extra claim**, not a send guarantee, automatic retry or expiry
   extension. A future worker needs the matching profile and resolvers. A second unknown can only be dismissed;
   never bypass the guards with a fresh key. Audit the actor and exact scoped decision. On `write_unconfirmed`,
   read `job.resolutions` for the same attempt/action; if absent and still eligible, retry only that exact
   authorized command within budget. `resolved` confirms a new decision; `replayed` confirms the prior decision
   and returns the current job, which may have advanced. On `not_found`, `resolution_conflict` or `expired`,
   stop and re-read.
6. **Schedule projection and cleanup separately from delivery.** Open unknowns retain payload, history and
   identity even after expiry. Frozen retention minimums (defaults: payload 7 days, history and idempotency
   30 days each) start at dismissal or a settled terminal result after redrive. All attempts need projection
   ACKs before payload pruning. Schedule bounded `admin.cleanup({ limit: 4 })` calls: after the retention windows
   and projection drain, cleanup deletes activities before purging the job and replay guard. It never clears an
   open hold.

## Durable store with Mongoose

Install the [optional Mongoose peer](#support-and-limits) and open a caller-owned connection
(not the global default) to the supported replica set:

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
  options, reads the collection/index catalog, and installs only missing definitions for the selected format.
  The principal needs `serverStatus`, `replSetGetConfig`, `getCmdLineOpts`, collection/index inspection and
  creation as applicable, and read/write access to the two private collections. Unsupported topology, validators,
  collations, model aliases and conflicting or extra indexes are not adopted or repaired.
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
registry, store, admission service, prepared relay, batch admission or combined batch service, each SMTP profile,
worker and admin. They compare the tuple by value and take frozen copies. Do not read it from request data or infer
it from a snapshot or a worker setting. Factory mismatches fail with `invalid_config`. There is no new environment
setting; the host still supplies SMTP credentials separately where delivery runs.

This example uses both optional peers and an already open [Mongoose connection](#durable-store-with-mongoose).
It prepares and relays a snapshot for 51 synthetic addresses without running the worker. In production,
[stage and commit the snapshot in the host outbox](#stage-a-host-owned-outbox) before relaying. Replace the
example UUID with one assigned to your store; do not generate a new UUID on startup.

<!-- example: smtp-capacity -->

```typescript
import type { Connection } from 'mongoose';
import {
  createEmailAdmin,
  createEmailBatchAdmission,
  createEmailBatchService,
  createEmailRelay,
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

async function configureCapacityLane(connection: Connection, transport: Omit<SmtpProviderOptions, 'smtpCapacity'>) {
  const store = createMongooseEmailStore(connection, { smtpCapacity });
  await store.ready();
  const queue = { scope: 'example-app', store, smtpCapacity };
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
  const service = createEmailService({ ...queue, registry });
  const relay = createEmailRelay(queue);
  const batchAdmission = createEmailBatchAdmission({ service, smtpCapacity });
  const smtp = createSmtpProvider({ ...transport, smtpCapacity });
  const worker = createEmailWorker({ ...queue, providers: [smtp] });
  const batch = createEmailBatchService({ service, worker, smtpCapacity });
  const admin = createEmailAdmin(queue);
  const staged = await registry.prepare(queue.scope, {
    templateKey: 'notice',
    input: null,
    intent: 'synthetic-notice',
    key: { kind: 'single', idempotencyKey: 'notice-1' },
    provider: smtp.ref,
  });
  const admission = await relay.enqueuePrepared(staged);
  return { admission, admin, batchAdmission, batch, worker };
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

## Manage delivery attachments

Storage is a choice **per file**, independent of the queue and the mail provider. You can keep using your own
`AttachmentRef` and `AttachmentResolver` for every file, or mix project refs with managed MongoDB, S3 or Azure
refs in one job. Existing consumers need no migration, new storage or SDK. Cloud attachments do not need a Mongo
registry. All modes share the same limits: **1 byte–2 MiB per file, up to five refs and 5 MiB total**; SMTP still
requires MIME leaf parts. The worker checks bytes before submission. This storage is for delivery, not user
downloads or a permanent archive.

### Upload, check and stage one mixed job

For example, configure `writers.pdf` with the Mongo recipe below and `writers.csv` with AWS S3, SeaweedFS or
Azure. Keep `terms` as an existing ref under `project-terms`. The host authorizes the scope, selects configured
writers, and saves stable file revisions and deadlines as part of its business intent. Do not let callers supply
a backing, path, credentials or unverified managed refs.

<!-- example: managed-producer -->

```typescript
import {
  createEmailTemplateRegistry,
  defineLocalTemplate,
  type AttachmentRef,
  type PreparedEmailCommand,
} from '@web-ts-toolkit/email-service';
import {
  checkManagedAttachmentRetention,
  type ManagedAttachmentStore,
} from '@web-ts-toolkit/email-service/attachments';

const invoice = defineLocalTemplate({
  kind: 'handlebars',
  revision: 'v1',
  defaults: { from: { address: 'billing@example.invalid' } },
  subject: { kind: 'inline', content: 'Your invoice' },
  text: { kind: 'inline', content: 'Your invoice and terms are attached.' },
  parseInput(input) {
    if (
      !input ||
      typeof input !== 'object' ||
      !('refs' in input) ||
      !Array.isArray(input.refs) ||
      !('expiresAt' in input) ||
      typeof input.expiresAt !== 'number'
    )
      throw new Error('Expected attachment refs and an expiry');
    // This is an internal command; the registry validates each ref when freezing the snapshot.
    return { refs: input.refs as readonly AttachmentRef[], expiresAt: input.expiresAt };
  },
  parseData: () => ({}),
  prepare({ refs, expiresAt }) {
    return { to: [{ address: 'buyer@example.invalid' }], values: {}, attachments: refs, expiresAt };
  },
});
const invoiceRegistry = createEmailTemplateRegistry({ invoice });

async function stageInvoice(
  scope: string,
  files: {
    eventId: string;
    revision: string;
    deliverBy: number;
    expiresAt?: number;
    pdf: Uint8Array;
    csv: Uint8Array;
    terms: AttachmentRef;
  },
  writers: { pdf: ManagedAttachmentStore; csv: ManagedAttachmentStore; all: readonly ManagedAttachmentStore[] },
  commit: (email: PreparedEmailCommand) => Promise<void>,
) {
  const { eventId, revision, deliverBy, terms } = files;
  const expiresAt = files.expiresAt ?? deliverBy;
  const identity = { scope, revision, deliverBy };
  const pdf = await writers.pdf.put({
    ...identity,
    id: `invoice-${eventId}`,
    filename: 'invoice.pdf',
    contentType: 'application/pdf',
    bytes: files.pdf,
  });
  const csv = await writers.csv.put({
    ...identity,
    id: `details-${eventId}`,
    filename: 'details.csv',
    contentType: 'text/csv',
    bytes: files.csv,
  });
  const staged = await invoiceRegistry.prepare(scope, {
    templateKey: 'invoice',
    key: { kind: 'single', idempotencyKey: `invoice-${eventId}` },
    intent: {
      eventId,
      revision,
      deliverBy,
      expiresAt,
      pdfStore: writers.pdf.resolverKey,
      csvStore: writers.csv.resolverKey,
      terms: { ...terms },
    },
    provider: { kind: 'smtp', key: 'standard-smtp', mode: 'live' },
    input: { refs: [pdf.ref, csv.ref, terms], expiresAt },
  });
  await commit(checkManagedAttachmentRetention(staged, { scope, stores: writers.all, receipts: [pdf, csv] }));
}
```

- `deliverBy` is an absolute Unix-ms deadline, strictly in the future and at most 30 days from upload. A receipt
  certifies the backing's minimum hold through `deliverBy + 24 hours` under the deployment requirements below.
  Set `expiresAt` to the earliest deadline across managed files, or earlier. The checker verifies the **actual
  frozen** `snapshot.expiresAt`, not the requested input or default: it must be no later than each matching
  receipt's `deliverBy`, with **at least 24 hours of hold past expiry**. Grace does not extend eligibility to send
  or redrive.
- Pass every trusted managed binding for the scope in `writers.all` (once per key), even if a particular job
  uses only some. For each managed ref supply its original local receipt from that writer instance. Do not
  pass receipts for unused files or JSON copies of receipts. For the SMTP-capacity lane pass the same
  `smtpCapacity` to the registry, checker, queue and worker; this example uses V1. The helper performs no I/O
  and certifies nothing about external refs. A raw ref used with ordinary `prepare`/`enqueue` is **not** a checked hold.
- `commit` saves the returned `PreparedEmailCommand` unchanged in your [host outbox](#stage-a-host-owned-outbox).
  Without an outbox, give that checked value to `enqueuePrepared` directly. Persist the ordinary seven-field refs
  in the snapshot, never bytes, Base64, receipts, locators, signed URLs, credentials or SDK objects. Job and
  activity summaries expose no attachments. Relays need no storage SDKs just to admit the staged command.
- If `put` gives `write_unconfirmed` or you lose an upload acknowledgement before staging, repeat the **original**
  scope, backing, file ID, revision, deadline, bytes, filename and MIME. An identical write can issue a new local
  receipt; changed content under that identity fails `attachment_conflict`. `attachment_retention` is not proof
  that no bytes were written. A new deadline creates a new managed version; it does not extend the old file hold.
  Once `deliverBy` passes, the original version cannot be put again, even after purge.
- `put(input, { signal, timeoutMs })` accepts an optional abort signal and an elapsed budget (default 5 seconds,
  50–30,000 ms). A create and any exact-key confirmation share that budget. Each store instance allows eight
  in-flight operations; excess puts fail `busy` instead of waiting. Abort cannot undo a dispatched write.
- If staging or **queue admission** may already have committed, check the host outbox or replay the **same** staged
  DTO, scope, key, intent and queue binding. Do not re-upload, rerender, change expiry, choose another backing or
  resend on a retained replay. Use the original staged refs for retries and eligible redrive. A queue miss after
  expiry is rejected. A crash between upload and staging can leave an orphan; do not delete it on uncertainty.

### Build resolvers in the worker process

In each independent worker process, use the recipes below with its own read-only clients/connection for every
managed binding the queue can reference. Use the same physical backing, `resolverKey`, lowercase UUIDv4 `namespace`
and collection or prefix. The queue store must also point at the original queue; separate processes need a durable
queue, not separate memory stores. No writer, upload receipt, or producer credentials cross into the worker.

<!-- example: managed-worker -->

```typescript
import { createEmailWorker, type AttachmentResolver, type EmailWorkerOptions } from '@web-ts-toolkit/email-service';
import type { ManagedAttachmentStore } from '@web-ts-toolkit/email-service/attachments';

function makeInvoiceWorker(
  queue: Pick<EmailWorkerOptions, 'scope' | 'store' | 'providers' | 'smtpCapacity'>,
  readers: readonly ManagedAttachmentStore[],
  resolveProjectTerms: AttachmentResolver,
) {
  const resolvers = new Map([['project-terms', resolveProjectTerms]]);
  for (const reader of readers) {
    if (resolvers.has(reader.resolverKey)) throw new Error('Duplicate attachment binding');
    resolvers.set(reader.resolverKey, reader.resolve);
  }
  return createEmailWorker({ ...queue, attachmentResolvers: Object.fromEntries(resolvers) });
}
```

Never repoint a resolver key to a different backing or fetch “latest.” Rotate with a new key and namespace;
deploy readers for both before switching new writes, and keep the old binding while staged, scheduled, retried,
in-flight or eligible redrive work can still use it. Do not delete attachments on send, cancellation, failed
admission, queue cleanup, or for one job sharing a file with another. Backend TTL/lifecycle owns both used
files and orphans. Missing or transiently unavailable bytes stop an attempt before provider handoff; malformed
data or definitive resolver failures are not grounds to fetch a substitute.

### MongoDB attachment backing

Install `mongoose` (tested floor `9.12.2`). Supply an open, explicit caller-owned connection (e.g.
`createConnection(uri, { maxAdaptiveRetries: 0 }).asPromise()`) in each role. Replace the example binding values
once per backing; keep them stable. Run `createMongooseAttachmentStore(provisionerConnection, mongoAttachmentBinding)`
and `await store.ready({ install: true })` once with provisioner credentials. Runtime readiness only validates:

<!-- example: managed-mongoose -->

```typescript
import type { Connection } from 'mongoose';
import {
  createMongooseAttachmentStore,
  type MongooseAttachmentStore,
  type MongooseAttachmentStoreOptions,
} from '@web-ts-toolkit/email-service/attachments/mongoose';

const mongoAttachmentBinding: MongooseAttachmentStoreOptions = {
  resolverKey: 'invoice-pdfs',
  namespace: '391ce5d7-3a7a-425a-8c90-1fb1f41b4b30',
  collection: 'email_attachments', // The default; dedicated to this binding.
};

async function bindMongoAttachments(connection: Connection): Promise<MongooseAttachmentStore> {
  const store = createMongooseAttachmentStore(connection, mongoAttachmentBinding);
  await store.ready();
  return store;
}
```

- Use a journaled, unsharded MongoDB 8.x WiredTiger replica set. No direct/load-balanced connection,
  auto-encryption, proxy, compression or OIDC reauthentication. Set `maxAdaptiveRetries: 0` if both retry
  flags are on. The adapter does not manage the connection or join a caller session. Re-run `ready()` after
  a disconnect/reconnect on the same backing, once outstanding work settles.
- Runtime roles need cluster `serverStatus`, `replSetGetConfig`, `getCmdLineOpts`, database `listCollections`,
  and collection `listIndexes` and `find`; add `insert` for the producer. Only the provisioner adds
  `createCollection` and `createIndex`. Do not grant attachment update or delete.
- The collection holds BSON Binary and immutable metadata. Keep its strict binding validator, simple collation,
  `_id_` and zero-second TTL index `ma1_purge` on `{ purgeAt: 1 }`, with no other indexes or TTL. The adapter
  stores `purgeAt` as a BSON Date at `deliverBy + 24 h + 121 s`. TTL is asynchronous. Audit the catalog, stop
  producers and revalidate on changes; readiness is not continuous drift detection. Neither this collection
  nor its TTL changes any queue collection.

### AWS S3 and SeaweedFS

Install `@aws-sdk/client-s3` (tested floor `3.1167.0`). The host provisions a dedicated, private, **never-versioned**
general-purpose bucket (S3 Standard on AWS) and a literal slash-delimited prefix ending in `/`.
Import both factories from the **same** `/attachments/s3` entry instance (both ESM or both CommonJS). An ordinary
`S3Client` is rejected: use `createS3AttachmentClient` with explicit region and credentials, or a bounded SDK
credential provider. This dedicated client uses one attempt, no region redirects and a native Node HTTP/1.1
transport. It verifies complete response headers under a 16 KiB byte cap and holds each operation's slot until
its native requests and bodies have closed, including cancellation before headers. Do not modify its SDK
configuration or middleware, or reuse it for provisioning or other SDK operations. Call `client.destroy()`
after its stores are done.

<!-- example: managed-aws -->

```typescript
import {
  createS3AttachmentClient,
  createS3AttachmentStore,
  type S3AttachmentClientConfig,
  type S3AttachmentStoreOptions,
} from '@web-ts-toolkit/email-service/attachments/s3';

function bindAwsAttachments(bucket: string, config: S3AttachmentClientConfig) {
  const client = createS3AttachmentClient(config);
  const binding: S3AttachmentStoreOptions = {
    bucket,
    prefix: 'delivery/',
    resolverKey: 'invoice-details-aws',
    namespace: 'b6f95fc4-6594-4382-a892-631dcc9de100',
  };
  return { client, store: createS3AttachmentStore(client, binding) };
}
```

For AWS, pass `{ region, credentials }` and omit `endpoint` to use the regional SDK endpoint. Only an explicit
`endpoint` overrides that address. Use HTTPS for deployed endpoints; for private trust roots you can supply `ca`
without disabling certificate verification. A custom endpoint can have a service path, not URL credentials, a
query, or a fragment.

Expiration-header mode (the default) requires the confirmed object's `LastModified` and an expiration header with the
matching rule ID and a date no earlier than `LastModified + 32 days`, with no credit for UTC day rounding.
SeaweedFS 4.54 was tested with a custom endpoint and path-style access. It does not supply that header.
Explicitly choose `bucket-policy`; a custom endpoint does not change the default.

<!-- example: managed-seaweedfs -->

```typescript
import {
  createS3AttachmentClient,
  createS3AttachmentStore,
  type S3AttachmentClientConfig,
} from '@web-ts-toolkit/email-service/attachments/s3';

function bindSeaweedAttachments(
  endpoint: string,
  bucket: string,
  region: string,
  credentials: S3AttachmentClientConfig['credentials'],
) {
  const client = createS3AttachmentClient({
    endpoint,
    region,
    credentials,
    forcePathStyle: true,
  });
  const store = createS3AttachmentStore(client, {
    bucket,
    prefix: 'delivery/',
    resolverKey: 'invoice-details-weed',
    namespace: '039d0ded-5239-45a6-9bc9-03893702c370',
    retention: 'bucket-policy',
  });
  return { client, store };
}
```

Use the actual configured prefix and namespace in `Filter.Prefix` and the same namespace with hyphens removed in
the rule ID. The dedicated bucket needs exactly this enabled lifecycle rule, with no other actions or filters:

```json
{
  "Rules": [
    {
      "ID": "emailattachmentsv1<namespace-without-hyphens>",
      "Status": "Enabled",
      "Filter": { "Prefix": "delivery/ma1/<namespace>/" },
      "Expiration": { "Days": 32 }
    }
  ]
}
```

- Audit effective access and read back `GetBucketVersioning` (unset, **not** suspended) and
  `GetBucketLifecycleConfiguration` before use. In
  `bucket-policy` mode the producer also reads both configurations back within each `put`, including replay;
  extra/ambiguous policy fields or rules, or a nonempty versioning configuration, cannot certify a hold.
  A present expiration header must agree with the rule. The minimum uses `LastModified + 32 days - 121 s`.
- Scope runtime permissions to the binding. On AWS, grant `s3:GetObject` to readers and writers and
  `s3:PutObject` to writers only on `arn:aws:s3:::<bucket>/<prefix>ma1/<namespace>/*` in the standard
  AWS partition. Enforce `If-None-Match: *` with [bucket policy][s3-conditional]. For
  `bucket-policy` mode only, the producer also needs bucket-level `s3:GetLifecycleConfiguration` and
  `s3:GetBucketVersioning` (or the equivalent operations on the compatible service). Neither runtime role
  needs object listing, deletion, ACL changes or policy writes. Verify the equivalent restricted roles on
  your SeaweedFS deployment; do not use the test provisioner's broad privileges in production.
- Deploy and monitor SeaweedFS's [standard lifecycle scheduler][seaweed-lifecycle], not its volume-TTL fast
  path. The adapter does not create buckets, configure policy or close clients. Single-gateway fixture results
  do not qualify other compatible servers, multi-gateway consistency or live AWS behavior.

### Azure Blob attachment backing

Install `@azure/storage-blob` (tested floor `12.34.0`). Provision a private container in a flat-namespace GPv2
account using the Hot tier. Use the **primary container HTTPS URL** (not an account, secondary or blob URL).
Supply a Blob SDK credential or a SAS URL without operation selectors or response overrides. No separate identity
SDK is required by this package. Plain HTTP is only for the `127.0.0.1:<port>/<account>/<container>` emulator.

<!-- example: managed-azure -->

```typescript
import {
  createAzureAttachmentContainerClient,
  createAzureAttachmentStore,
  type AzureAttachmentStoreOptions,
} from '@web-ts-toolkit/email-service/attachments/azure';

function bindAzureAttachments(
  containerUrl: string,
  credential?: Parameters<typeof createAzureAttachmentContainerClient>[1],
) {
  const client = createAzureAttachmentContainerClient(containerUrl, credential);
  const binding: AzureAttachmentStoreOptions = {
    resolverKey: 'invoice-details-azure',
    namespace: 'c987ec2e-1a9b-4393-b247-32faae88802d',
    prefix: 'delivery/',
  };
  return { client, store: createAzureAttachmentStore(client, binding) };
}
```

Import both factories from the **same** Azure entry instance (both ESM or both CommonJS). An ordinary
`ContainerClient` or one from `getContainerClient` is rejected. The helper sets up the required abortable
transport with no transparent retries; bounded credentials are the host's responsibility. Keep this client
dedicated to the adapter; use a different client for provisioning and other SDK calls.

Read back the effective storage account (no HNS), [blob service properties][azure-properties] (no versioning
or blob/container soft delete) and [management policy][azure-policy]. Require this enabled `Lifecycle` rule;
substitute the actual container, configured prefix and namespace. Reject any other enabled intersecting or
global rule.

```json
{
  "enabled": true,
  "name": "emailattachmentsv1<namespace-without-hyphens>",
  "type": "Lifecycle",
  "definition": {
    "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["<container>/delivery/ma1/<namespace>/"] },
    "actions": { "baseBlob": { "delete": { "daysAfterCreationGreaterThan": 32 } } }
  }
}
```

The adapter checks the original service creation time (`x-ms-creation-time`) and uses `createdOn + 32 days - 121 s`.
It cannot read the account policy and cannot detect policy drift. Grant workers exact-blob read. Producers
need read plus permission for conditional create **and same-key replay**. In Azurite `rc` SAS allowed the
first write but denied replay before the precondition; the fixture used `rw` for producers and `r` for workers,
neither with list or delete. This does not prove production authorization. Container SAS is not a prefix grant and
`w` can permit overwrites outside the adapter; use a dedicated container or verified finer-scoped credentials.
Do not give runtime roles shared account keys, delete, or lifecycle mutation to make tests pass.

### Cleanup and deployment gate

Keep writer, worker and storage clocks within ±60 seconds of UTC and avoid client or endpoint queues that can
replay old requests. For cloud, gate new stages on operator readback of effective settings and policy at deployment
and on changes. Record the bound namespace and a sanitized settings/policy digest; block new stages if unreadable or
drifted, preserve access for outstanding reads, and never shorten a live hold. Runtime evidence is not protection
from administrator changes, external deletion, loss of storage, or unavailable credentials.

Exclude versioning, Object Lock, snapshots, soft delete, replication, independent retained copies, and outside
overwrite, tiering or deletion jobs for these backings. Versioning suspension or deleting the current object is
not a cleanup of previous versions, delete markers or snapshots. If discovered, stop new stages; audit and drain
live holds before an operator inventories and retires old copies. Mongo TTL and cloud lifecycle run
asynchronously; the cloud age rule makes an orphan _eligible_ after 32 days, not erased by day 32. Monitor lag.
None of these policies erase independent backups. Before production, verify actual cloud settings,
least-privilege grants, retained reads and cleanup in a separately authorized disposable deployment. Emulator
or offline SDK tests do not qualify live AWS/Azure, their IAM or their lifecycle scheduling.

[s3-conditional]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html
[seaweed-lifecycle]: https://github.com/seaweedfs/seaweedfs/wiki/S3-Lifecycle
[azure-properties]: https://learn.microsoft.com/en-us/cli/azure/storage/account/blob-service-properties#az-storage-account-blob-service-properties-show
[azure-policy]: https://learn.microsoft.com/en-us/cli/azure/storage/account/management-policy#az-storage-account-management-policy-show

## Integration entrypoint types

The integration types have their own entrypoints:

<!-- example: entry-types -->

```typescript
import type { SmtpProviderOptions } from '@web-ts-toolkit/email-service/smtp';
import type { SendGridProviderOptions } from '@web-ts-toolkit/email-service/sendgrid';
import type { MongooseEmailStoreOptions } from '@web-ts-toolkit/email-service/mongoose';
```

Managed attachment types are named exports from `/attachments`: `PutManagedAttachmentInput`,
`ManagedAttachmentReceipt`, `ManagedAttachmentStore`, `ManagedAttachmentBindingOptions` and
`ManagedAttachmentPreparationOptions`. Adapter options are in their respective `/attachments/*` entries as shown
above. `AttachmentRef` and `AttachmentResolver` stay at the root.

The root, `/sendgrid` and `/attachments` have no runtime or declaration dependency on optional peers. A
type-only `/smtp` import does not require Nodemailer. Both Mongoose runtime modules load without Mongoose,
but their declarations and factory inputs require it. Importing `/attachments/s3` or `/attachments/azure`
without its SDK gives a module-not-found error naming that peer. For TypeScript apps using Mongoose or a
cloud SDK, install Node declarations (`@types/node`) for your Node version. No entrypoint opens a connection,
registers a model, starts a timer, or submits mail when imported.
