# Email service: cross-project adoption review

Reviewed [revision `39848121`][snapshot] against the [five original requirements and V1 non-goals](../../../tasks/20261118-223259-email-service-package.md#objective-and-confirmed-requirements), [V1 contract](../20261118-223259-email-service-package/v1-contract.md), and [large-envelope compatibility contract](../20261120-214514-email-service-smtp-capacity/implementation-contract.md). This is a historical adoption review, not a change to those contracts. Source links are named by symbol or point to the reviewed revision when line numbers are needed.

[snapshot]: https://github.com/egose/web-ts-toolkit/tree/39848121d8b5746960078cac83949caaf26a9d9c/packages/email-service

**Verdict:** A good foundation for Node projects that need durable transactional submission through the two supported paths. Business rules, credentials, connections, scheduling and authorization belong to the host. The main adoption risks are how competing workers claim jobs, what a custom adapter can promise, and how much of the queue protocol an ordinary producer needs to understand.

Follow-up: [cross-project adoption tasks, acceptance criteria and verification](../../../tasks/20261121-022138-email-service-cross-project-adoption.md).

## Highest-priority findings

### 1. Expired jobs can hide eligible work

Both stores look at a bounded prefix ordered by due time. [`next` in memory](../../../../packages/email-service/src/stores/memory.ts) and [`next` in Mongo](../../../../packages/email-service/src/stores/mongoose/operations.ts) pick candidates before [`claimJob`](../../../../packages/email-service/src/internal/job-transitions.ts) rejects expired ones. Without a sweep, successive calls can revisit exactly the same prefix. Memory reports `none` (hence worker `idle`); Mongo's equivalent no-decision path reports `contended`.

**Observed on both V1 adapters:** Enqueue 26 short-lived jobs, let them expire, then enqueue one immediately due, unexpired job. Two `run({ limit: 1, maintenanceLimit: 0 })` calls returned `idle` in memory and `contended` on a disposable MongoDB replica set, with zero claims. A default-maintenance run expired ten but returned the same respective statuses with the live job queued. A second such run reached it on both stores. This matters after an outage, particularly for hosts that stop scheduling on `idle` or retry contention without running expiry maintenance.

**Recommendation:** Make repeated bounded claims advance past stale candidates, or return an actionable “expiry maintenance needed” result when the window is blocked. Test the same scenario on both stores, with a backlog larger than the candidate window. In the meantime, keep scheduling expiry sweeps even after an idle run.

### 2. Competing workers must cover every profile in their scope

[`claimNext`](../../../../packages/email-service/src/worker.ts) selects by scope; [profile matching](../../../../packages/email-service/src/internal/worker-preflight.ts#L124) happens after ownership is taken. A missing or mismatched profile is a **permanent** `profile_unavailable`. At baseline, [`readProfiles`][worker-config] even accepted an empty profile list for a default V1 worker. In a memory run this produced a terminal `failed` job without invoking a provider. Fixing the configuration and replaying the same command returns the existing failed job.

[worker-config]: https://github.com/egose/web-ts-toolkit/blob/39848121d8b5746960078cac83949caaf26a9d9c/packages/email-service/src/internal/worker-config.ts#L59-L71

**Recommendation:** Document the deployment invariant next to the worker example: every competing worker for a scope needs all its active profiles and required attachment resolvers. Deploy new profiles to workers before routing new commands to them; use separate scopes/queues for independent fleets. Reject an empty provider list for a delivery worker. Add profile-aware claiming only if a real deployment requires specialized workers in the same scope; never substitute a different profile after a claim.

### 3. A type-correct provider success can become a durable `unknown`

The [baseline `ProviderResult`][provider-contract] typed its fields independently. A custom SMTP adapter could return the following under strict TypeScript:

[provider-contract]: https://github.com/egose/web-ts-toolkit/blob/39848121d8b5746960078cac83949caaf26a9d9c/packages/email-service/src/contracts/provider.ts#L69-L83

```ts
const result = {
  outcome: 'accepted',
  retry: 'never',
  stage: 'data',
  reason: 'smtp_accepted',
} satisfies ProviderResult;
```

The [evidence contract](../../../../packages/email-service/src/internal/attempt-codecs.ts), implemented by `readAttemptResult`, requires recipient results for SMTP success. A worker using that adapter [records `transport_uncertain`](../../../../packages/email-service/src/internal/worker-attempt.ts#L158) after handoff. The runtime fallback is appropriate; typechecking shouldn't encourage the error.

**Recommendation:** Make `ProviderResult` a union discriminated by `reason`, with the corresponding outcome, retry class, stage and required fields. Keep runtime checks for things types cannot prove, such as whether the recipient indexes cover this envelope. Put one valid custom provider/test-double example in the installed README.

## Reuse and interface findings

### 4. Preserve the template-to-provider relationship in reusable TypeScript code

For an inferred literal map, template keys correctly select both provider and input. At baseline, the [non-distributive conditional][template-contract] mapped `'handlebars' | 'sendgrid'` to **SendGrid only** for a map widened to `TemplateMap`. Strict TypeScript rejected an SMTP ref assigned to `TemplateCommand<TemplateMap>['provider']`. Use `satisfies TemplateMap` at declaration sites today; fix the library mapping with an indexed lookup such as `{ handlebars: 'smtp'; sendgrid: 'sendgrid' }[T[K]['kind']]` and test both concrete and widened maps.

[template-contract]: https://github.com/egose/web-ts-toolkit/blob/39848121d8b5746960078cac83949caaf26a9d9c/packages/email-service/src/contracts/template.ts#L76-L85

There is a second distinction at the same boundary: command `input` is the **return** type of `parseInput`, but [`prepareParsed`](../../../../packages/email-service/src/templates/registry.ts) calls the parser on the supplied input. For a parser that takes a string and returns `{ noticeId: string }`, the string works at runtime but fails typechecking; the object typechecks but fails that parser. The simplest contract is to document `parseInput` as validation of an already-typed input and normalize in `prepare`. Introduce a distinct raw input type only if transforming schema parsers are intended to be supported.

### 5. The producer API carries dependencies it does not use

At baseline a relay had to supply a registry even for `enqueuePrepared`; the [reviewed README][old-outbox] constructs an empty one. Batch admission required a worker even in an application that only produces jobs. The [combined batch factory](../../../../packages/email-service/src/batch.ts) can check scope and capacity, but cannot prove the two objects use the same backing store. Two default memory stores with the same scope produced a successful batch admission, an idle `batch.run()`, and a job still queued in the producer's store. Conversely, a correctly wired `batch.run()` can process unrelated work in the scope.

[old-outbox]: https://github.com/egose/web-ts-toolkit/blob/39848121d8b5746960078cac83949caaf26a9d9c/packages/email-service/README.md#L145-L177

**Recommendation:** Offer a producer-only batch operation over the existing admission logic and an outbox-only construction path exposing `enqueuePrepared`. Keep the existing combined API for compatibility; teach `worker.run()` as scope-wide processing. For hosts that assemble all roles together, show one configuration function that supplies the store, scope and, where enabled, the exact [capacity binding](../../../../packages/email-service/README.md#opt-in-to-larger-smtp-envelopes). Keep the independent processes and their explicit compatibility checks.

### 6. Unknown outcomes have an operator action but no direct discovery query

[Admin](../../../../packages/email-service/src/contracts/admin.ts#L38) can get a job by ID or page projected attempts by job/time. It cannot list jobs with `unknownOpen`. An activity reports what happened on an attempt, not whether the hold is still open; the observer can [skip notifications](../../../../packages/email-service/src/admin.ts#L62). [Cleanup deliberately keeps the payload](../../../../packages/email-service/src/internal/job-record.ts#L121) until resolution.

**Recommendation:** Document a recovery procedure using host-recorded job IDs, reconciliation and authoritative `getJob` reads. For hosts that need the queue to be the source of the operator worklist, add one bounded, scoped `listUnresolvedUnknowns` query returning redacted summaries. An index for it needs an explicit rollout because the Mongo adapter validates the exact catalog. A general job-search API or automatic redrive is unnecessary.

### 7. Be precise about provider and store portability

- [Provider refs/snapshots](../../../../packages/email-service/src/contracts/message.ts#L33), [template dispatch](../../../../packages/email-service/src/templates/registry.ts), evidence and the [durable schema](../../../../packages/email-service/src/stores/mongoose/records.ts#L176) know SMTP and SendGrid. `EmailProvider` lets a host implement one of those protocols; it is not a plugin interface for a third protocol. For example, another relay via SMTP fits; an SES HTTPS adapter or local HTML via the SendGrid HTTPS adapter does not. Publish that small support matrix. If a third path is actually needed, separate _rendered content vs hosted template_ from _submission transport_ in a versioned design rather than accepting arbitrary provider payloads.
- The only bundled durable store requires a caller-open Mongoose 9.12.2+ (below 10) connection to a compatible MongoDB 8.x WiredTiger replica set with the [documented privileges and driver restrictions](../../../../packages/email-service/README.md#durable-store-with-mongoose). The [18-method `EmailStore`](../../../../packages/email-service/src/contracts/store.ts) encodes a real protocol: ownership, write uncertainty, projection and retention. The shared reducer and [conformance suite](../../../../packages/email-service/test/conformance/store-suite.ts#L27) are valuable, but the suite and the precise spec are not in the tarball. Link a versioned adapter contract from the README; when a second backend is needed, make the behavioral tests usable by that adapter. At the consumer boundary, admission could depend on `Pick<EmailStore, 'findAdmission' | 'insert' | 'smtpCapacity'>`. Do not promise equivalent durability from an ordinary queue or weaken Mongo readiness to widen the support list.

## Small improvements that pay off on the first integration

<!-- prettier-ignore -->
| Concern and impact | Practical improvement |
| --- | --- |
| **Scheduling:** Expiry defaults to [24 hours from preparation, maximum 30 days](../../../../packages/email-service/src/constants.ts#L17), and must be strictly after `scheduleAt`. A seven-day reminder with default expiry fails `invalid_snapshot`. [`PrepareContext`](../../../../packages/email-service/src/contracts/template.ts#L18) doesn't receive the validated schedule. | Show this rule on `scheduleAt`/`expiresAt` and include a scheduled-reminder example. Expose the validated schedule to `prepare` if expiry depends on it, so callers needn't pass it again inside business input. Keep expiry frozen on replay. |
| **Quota deferral:** [`rate_deferred` consumes an attempt](../../../../packages/email-service/src/internal/attempt-codecs.ts) in `attemptEffect`. With defaults, three denied permits produced terminal `attempts_exhausted`, with zero provider calls. | Document `maxAttempts` as a **claim** budget next to the limiter and retry options. If normal quota pressure must only postpone work for a particular host, consider an explicitly bounded deferral policy separately. |
| **SMTP attachments:** At baseline a syntactically valid `message/rfc822` reference could be [prepared and admitted](../../../../packages/email-service/src/internal/message-codecs.ts#L127), then [rejected during MIME preflight](../../../../packages/email-service/src/providers/smtp/mime.ts) after resolving the bytes. An attached `.eml` thus failed a job asynchronously for a fact known at preparation. | Reject unsupported composite MIME types for **new SMTP messages** before admission. Keep the provider check and preserve reads/replays of existing records. |
| **SMTP deployment:** [`exchange`](../../../../packages/email-service/src/providers/smtp/submit.ts) uses `EHLO email.invalid`, including after STARTTLS; `servername` is the remote TLS identity. A host cannot meet a relay policy requiring its own client name. | Document the behavior; offer a validated profile-level `clientName` for deployments that need it. Keep it independent of certificate verification. |
| **Error handling:** [Entrypoints are independently bundled](../../../../packages/email-service/tsup.config.ts#L14). A SendGrid factory error had `code: 'invalid_config'` but was not `instanceof` the root `EmailError`, under **both all-ESM and all-CJS** imports. The [reviewed README][old-errors] mentions mixed builds only. | Document this across entrypoints too; provide an allowlisted `getEmailErrorCode(error: unknown)` for strict catch blocks or share the error class within each format. |
| **Test/production consistency:** The [default memory store](../../../../packages/email-service/src/stores/memory.ts) admitted a job before `ready()`. Opt-in memory and [Mongo](../../../../packages/email-service/src/mongoose.ts) reject that use. A test using V1 memory can hide an initialization error. | Use the same explicit readiness pattern in every example and shared test fixture. Align enforcement in a compatible release, or document the V1 exception. |

[old-errors]: https://github.com/egose/web-ts-toolkit/blob/39848121d8b5746960078cac83949caaf26a9d9c/packages/email-service/README.md#L12-L24

## Packaging, onboarding and next steps

The [manifest](../../../../packages/email-service/package.json#L14) and [build](../../../../packages/email-service/tsup.config.ts) agree. The ordinary pack contained all 16 mapped runtime/declaration targets, four private declaration chunks, and the README. Named imports, peer isolation and meaningful factory JSDoc are strengths. The baseline onboarding problem was finding the shortest path through a reference manual: the first example constructed an error, and the first complete queue workflow was spread over several sections.

Lead with a single tested example: define a template → ready the store → enqueue → run the matching worker → inspect the summary. Use one shared provider ref and a host command builder that keeps the idempotency key and stable business intent together (for example, receipt event ID as the key, invoice/recipient IDs and locale as intent). Do not automatically serialize arbitrary business input for idempotency. Follow the example with a short deployment/limits table, then the existing detailed reference.

Fix claim progress and document worker topology first. Tighten the types and producer-only wiring next. Preserve the shared lifecycle, acknowledged handoff, separation of submission from inbox delivery, and the no-automatic-retry rule for uncertain or partially accepted mail. Add another provider, backend, or operator query when a consuming project needs it.

**Verification:** Ran `pnpm --filter @web-ts-toolkit/email-service test` on Node 26.12.1 with the local MongoDB 8.2.6 binary and offline packed-consumer installations. Build and typecheck passed. Vitest: 228 unit, 32 lifecycle, 65 SMTP, 91 SendGrid, and 99 MongoDB tests passed (515 total); two optional extended SMTP timing tests were skipped. All 12 packed-consumer checks passed, covering ordinary and flattened-release tarballs, ESM/CJS, strict TypeScript, README examples, and optional-peer combinations. The ordinary pack dry-run also verified all 16 mapped targets.

**Focused evidence and limitations:** The additional public-API probes used strict TypeScript 6.0.3, synthetic inputs, memory stores, a disposable one-member MongoDB 8.2.6 replica set, and provider preflight/test doubles. The expired-prefix example used an injected wall clock in memory and actual expiry against server time on MongoDB. These checks establish the observed behaviors locally, not production throughput or delivery to a mailbox. Raw command logs, generated packages, dependencies and disposable fixtures are omitted.
