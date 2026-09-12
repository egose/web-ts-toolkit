# `@web-ts-toolkit/message-service`

Template-driven messaging service for Mongoose + Express applications.

## Installation

```bash
pnpm add @web-ts-toolkit/message-service mongoose express
```

Peer dependencies:

- `mongoose >= 8`
- `express >= 5`

## Highlights

- **Message persistence schemas** — `Message`, `MessageArchive`, and `MessageRequest` schemas with timestamps, indexes, archiving, and idempotency reservations
- **Schema factories** — `buildMessageSchema(config?)`, `buildMessageArchiveSchema()`, and `buildMessageRequestSchema()` for per-app configuration
- **Template engine** — Handlebars interpolation for sender/receiver content
- **Template registry** — register and lookup templates by `templateCd` (per-instance or global)
- **Action system** — validate permissions, run handlers, archive messages, send notifications
- **Route factory** — standalone Express routes for template-based creation and action handling
- **Pluggable providers** — email and payment providers are interfaces, not hard dependencies
- **Idempotent create** — bounded `clientRequestId` scoped to the requester and template for double-submit protection
- **Typed errors** — exported service and registry errors with stable route status mappings

## Quick Start

```typescript
import express from 'express';
import mongoose from 'mongoose';
import {
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  buildMessageSchema,
  createMessageRoutes,
  defaultRegistry,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MESSAGE_MODEL_NAME,
  MESSAGE_REQUEST_MODEL_NAME,
  type MessageTemplate,
  type MessageUser,
} from '@web-ts-toolkit/message-service';

const app = express();
app.use(express.json());

declare function resolveAuthenticatedUser(req: express.Request): MessageUser | undefined;

const myAuthMiddleware: express.RequestHandler = (req, res, next) => {
  const user = resolveAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: 'authentication required' });
    return;
  }

  (req as express.Request & { user: MessageUser }).user = user;
  next();
};

await mongoose.connect('mongodb://localhost/mydb');

mongoose.model(MESSAGE_MODEL_NAME, buildMessageSchema());
mongoose.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
mongoose.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema());

const myTemplate: MessageTemplate = {
  templateCd: 'welcome.request',
  type: 'request',
  description: 'Welcome request',
  senderContent: { title: 'Welcome {{name}}', long: 'Sent to reviewers', short: 'Sent' },
  receiverContent: { title: 'Review {{name}}', long: 'Please review this request', short: 'Review' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user, payload }) => ({
    fromUser: user._id,
    toRoles: ['reviewer'],
    payload,
    // Content (`senderContent`/`receiverContent`) renders from `templateData`,
    // not from `payload`. Map caller input here so `{{name}}` renders.
    templateData: { name: String(payload.name ?? '') },
  }),
  actions: [
    {
      actionCd: 'approve',
      name: 'Approve',
      variant: 'primary',
      sender: false,
      receiver: true,
      runHandler: async ({ actionAttemptId }) => ({ actionAttemptId }),
    },
  ],
};
defaultRegistry.register(myTemplate);

const { router, service } = createMessageRoutes({
  getModel: mongoose.model.bind(mongoose),
});

app.use('/api/messages', myAuthMiddleware, router.original);
```

Prerequisites for the flow above: Node `>=22`, `mongoose >= 8`, `express >= 5`,
and a MongoDB replica set (or sharded cluster) when you use `clientRequestId`
idempotency or transactional archival — standalone servers throw
`MessageTransactionRequiredError` instead of partially persisting. The auth
middleware above is required: routes resolve `req._user || req.user` and return
`401` before any service, template, payment, model, or action effect when the
identity is missing or malformed.

Create a message and act on it (content renders from `templateData`):

```typescript
const senderId = new mongoose.Types.ObjectId();
const reviewerId = new mongoose.Types.ObjectId();
const created = await service.createMessage({
  templateCd: 'welcome.request',
  user: { _id: senderId },
  payload: { name: 'Ada' },
});
// `created` is `Array<IMessage | IMessageArchive>`; fresh creates resolve
// active documents only, while completed `clientRequestId` replays may mix in
// `IMessageArchive` records (narrow with `'archivedAt' in doc`).
const message = created[0];
if (!message || 'archivedAt' in message) throw new Error('expected an active message');
console.log(message.receiverContent.title); // 'Review Ada'

const listed = await service.getActions(String(message._id), 'receiver', {
  user: { _id: reviewerId, roles: ['reviewer'] },
});
console.log(listed?.actions.map((action) => action.actionCd)); // ['approve']
```

For per-app template isolation, pass a custom `TemplateRegistry`:

```typescript
import { TemplateRegistry } from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
registry.register(myTemplate);

const { router, service } = createMessageRoutes({
  getModel: mongoose.model.bind(mongoose),
  registry,
});
```

## API

### `createMessageRoutes(options)`

Creates a standalone Express router with message template routes. Returns `{ router, service }`. Mount the returned JsonRouter with `router.original`.

All user-facing routes require a resolved user with a valid `_id` (non-empty string or `ObjectId`; missing, null, empty, numeric, array, and plain-object ids return `401`). By default, routes read `req._user || req.user`; pass `authMiddleware` and/or `getUser` to adapt your authentication stack. A request with no resolved user returns `401` before any service, template, payment, model, or action side effect. Hosts remain responsible for installing authentication, permission population, and CSRF protection before mounting these routes.

Custom extractors are preserved: `getUser`, `getPermissions`, and `getIdentity` receive the original Express request and their return values are passed through to `MessageService`. The route factory enforces the shared principal contract: `getUser` must return a user with a non-empty string or `ObjectId` `_id` before continuing.

| Option                         | Type                                | Description                                                                |
| ------------------------------ | ----------------------------------- | -------------------------------------------------------------------------- |
| `getModel`                     | `(name: string) => Model`           | Mongoose model getter                                                      |
| `paymentProvider`              | `PaymentProvider`                   | Optional payment provider (enables payment session handling)               |
| `onPaymentCompensationFailure` | `(event) => void \| Promise<void>`  | Optional hook called when expiring an uncommitted payment session fails    |
| `adminRoles`                   | `string[]`                          | Roles that receive messages when no `toUser`/`toRoles` is specified        |
| `registry`                     | `TemplateRegistry`                  | Custom template registry (default: `defaultRegistry`)                      |
| `authMiddleware`               | `((req, res, next) => void)[]`      | Custom middleware applied to all routes before route validation            |
| `getUser`                      | `(req) => MessageUser \| undefined` | Extract authenticated user (default: `req._user \|\| req.user`)            |
| `getPermissions`               | `(req) => Record<string, boolean>`  | Extract permissions (default: `req._permissions \|\| {}`)                  |
| `getIdentity`                  | `(req) => Record<string, unknown>`  | Extract identity (default: `req._identity \|\| {}`)                        |
| `adminPermissionKey`           | `string`                            | Permission key for admin read-only view of actions (default: `'is.admin'`) |

Routes:

- `POST /new/:templateCd` — create message from template. Body: `{ ...payload, clientRequestId? }`
- `GET  /:id/actions/:usertype` — get available actions (`usertype` is `sender` or `receiver`)
- `POST /:id/action/:actionCd` — execute action (POST)

Route input validation happens before database or template lookup:

- `templateCd` must be 1-128 letters, digits, dots, underscores, or hyphens.
- `actionCd` must be 1-128 letters, digits, underscores, or hyphens.
- `id` must be a 24-character hex MongoDB ObjectId string.
- `usertype` must be `sender` or `receiver`.
- `clientRequestId`, when present, must be a string, is trimmed by the service, must be non-empty after trimming, and must be at most 128 characters.

HTTP contract change: action mutation is POST-only. `GET /:id/action/:actionCd` is not registered and must not be used for state changes; callers should treat a GET response as not found or method-not-allowed depending on surrounding Express middleware.

### `MessageService`

Core service for creating messages, getting actions, and handling actions. Constructed by `createMessageRoutes`, or directly:

```typescript
import { MessageService, NoopPaymentProvider, TemplateRegistry } from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
const service = new MessageService({
  getModel: mongoose.model.bind(mongoose),
  paymentProvider: new NoopPaymentProvider(),
  adminRoles: ['superadmin'],
  registry,
});
```

Methods:

- `createMessage(params)` — create from template. Supports `clientRequestId` for requester-and-template-scoped idempotency. Returns `Array<IMessage | IMessageArchive>` (fresh creates resolve active documents; completed replays merge active + archive records, narrowed with `'archivedAt' in doc`). `user` (and `payerUser` when provided) must carry a valid principal id (non-empty string or `ObjectId`); invalid principals throw `InvalidMessageUserError` before any template, payment, or model effect in both branches.
- `createNotification(params)` — create a generic (action-less) notification. Accepts raw `UserId` values (`fromUser`, `toUser`), `toRoles`, `receiverContent`/`senderContent` (`{ title, long, short? }`), `documents`. Returns `IMessage`. Trusted host-level operation: performs no principal validation.
- `listMessages({ user, limit?, skip?, populate? })` — list messages visible to a user.
- `countMessages(user)` — count messages visible to a user.
- `findMessage(id, { populate?, select? })` — find a message by id (active or archive). Trusted host-level operation: performs no principal validation.
- `findMessageOrThrow(id, { populate?, select? })` — same as `findMessage`, but throws `MessageNotFoundError`. Trusted host-level operation.
- `getActions(messageId, usertype, { user, permissions?, isAdmin?, message?, populate? })` — get available actions. `user` is required and validated before any model lookup or template operation. Returns `{ uiTemplate, actions }` or `null`; admin/archived views return the resolved `uiTemplate` with an empty list without evaluating conditions.
- `handleAction(templateCd, actionCd, { message, user, permissions? })` — execute an action with a durable claim, stable handler attempt key, transactional archive, and post-commit sender notification status.
- `buildVisibilityFilter(user)` — get the Mongoose filter for messages visible to a user.

Pagination contract: `defaultListLimit` and `maxListLimit` must be finite integers, `maxListLimit` must be at least 1, and the default must not exceed the max. Request `limit` and `skip` values must also be finite integers; fractional, `NaN`, and infinite values are rejected. Request `limit <= 0` is normalized to 1, high limits are clamped to `maxListLimit`, and negative `skip` is normalized to 0 so invalid input never turns into an unbounded MongoDB query. Results are ordered by `{ createdAt: -1, _id: -1 }` for deterministic offset pages when timestamps tie.

`listMessages` uses offset pagination (`skip` + `limit`) for compatibility. Large skips become progressively more expensive because MongoDB still advances over skipped matches before returning the page. Keep `maxListLimit` bounded and prefer a host-owned cursor query using `buildVisibilityFilter(user)` plus the same `{ createdAt: -1, _id: -1 }` ordering for very large inboxes.

### `TemplateRegistry`

In-memory registry for trusted message templates.

```typescript
import { TemplateRegistry, type RegisteredMessageTemplate } from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
registry.register(template);
const found: RegisteredMessageTemplate | undefined = registry.find('template-cd');
registry.has('template-cd');
const all: RegisteredMessageTemplate[] = registry.getAll();
registry.unregister('template-cd');
registry.clear();
```

`defaultRegistry` is a global instance for simple cases.

The package supports both ESM `import` and CommonJS `require`. Prefer named root imports. `defaultRegistry` is shared through `globalThis` so mixed ESM/CommonJS consumers in one process observe the same mutable registry, but application code should still prefer an explicit `new TemplateRegistry()` per app/test for isolation.

Supported package-root exports are the service (`MessageService`, `isValidMessageUserId`, `requireMessageUserId`, `MAX_MESSAGE_SERVICE_TIMEOUT_MS`), route factory (`createMessageRoutes` plus its `MessageRoutes*` option types), schema factories and model-name constants, template helpers (`TemplateRegistry`, `defaultRegistry`, `includesAction`, `interpolateTemplate`, `interpolateMessageContent`, `resolveUiTemplate`, `filterActions`, `isActionAllowed`, `hasExplicitPermissionGrant`), no-op providers, provider/template/message types including `UserId`, `MessageTemplate`, `RegisteredMessageTemplate`, `RegisteredMessageAction`, `RegisteredUiTemplate`, `IMessage`, `IMessageArchive`, and the typed errors listed below. Deep `dist/*` or `src/*` imports are not part of the public contract. Conditional exports keep working: `import` resolves `./dist/index.mjs` with `./dist/index.d.mts` types, `require` resolves `./dist/index.js` with `./dist/index.d.ts` types.

`includesAction(templateCd, actionCd, registry)` requires the registry explicitly so archive behavior never falls back to unrelated global state.

Templates are trusted application code, not caller-supplied configuration. `prepareMessage`, `condition`, `runHandler`, and notification functions run with your application's authority and may perform database or external side effects.

`register()` validates action metadata deterministically. A template cannot register duplicate `actionCd` values, an action unavailable to both sender and receiver, or multiple `isDefault` actions for the same usertype. Registering the same `templateCd` again still replaces the prior template after the new definition validates.

The registry stores a frozen shallow snapshot of authorization/action-critical structure: content objects, `uiTemplate` objects, the action array, action objects, action confirmations, and action payload objects. `find()`/`getAll()` return readonly `RegisteredMessageTemplate` views — mutating them throws at runtime (strict TypeScript also rejects the write). Function fields keep their original identity, but mutating the object originally passed to `register()` cannot accidentally change registered action authorization, handlers, or rendered content. Register a replacement template when behavior should change.

Template interpolation uses Handlebars with `noEscape: true`. Rendered strings are plain text values, not sanitized HTML. If a frontend, email adapter, or server-rendered view inserts returned content into HTML, that renderer must HTML-escape the strings at the output boundary. The template engine intentionally does not sanitize markup because templates are trusted code and messages may be rendered in non-HTML contexts.

Compiled template strings are cached process-locally for a finite static template set. Do not generate unbounded per-request template strings; if your application needs user-defined or dynamic templates, put a bounded cache and review workflow at that application boundary before passing templates to this package.

Rendering/action separation: message content (`senderContent`/`receiverContent`) is rendered at creation time from `PrepareResult.templateData` via `interpolateMessageContent`, without evaluating action `condition` predicates. Action availability is evaluated only when actions are actually requested/executed (`getActions` for eligible active messages via `filterActions`, `handleAction` via `isActionAllowed`) against the persisted message, and action `name`/confirmation strings compile against persisted `message.payload` — not `templateData`. The two data sources are deliberately distinct (no unified interpolation-data feature); missing values in either source render as empty strings. Read-only/admin (`isAdmin`) and archived `getActions` views return the resolved `uiTemplate` with an empty action list and never invoke conditions. The public combined helper `interpolateTemplate` is preserved (content + filtered actions) with unchanged `noEscape: true` plain-text semantics.

### Action lifecycle notes

- Active messages start with `actionState: 'active'`. `handleAction()` authorizes and selects the handler against the persisted document returned by the atomic claim — not the caller-supplied copy — covering `templateCd`, `toUser`/`fromUser`, `toRoles`, and condition payload data. A stale copy authorized before a stored change cannot execute; a claim denied after acquisition is released to `retryable` through the fenced owner-token path so legitimate retries are not stranded. Supported update protocol: the guarantee covers state as of the atomic claim; hosts must not mutate action-relevant fields concurrently with in-flight actions outside a coordinated protocol, and a fresh read alone is not a substitute for the claim-bound check.
- Archived outcomes require a sender/receiver relationship with the archived record before any attempt ID or notification state is disclosed. Unrelated callers receive `ActionNotAllowedError` (403 on HTTP) with no attempt IDs on both direct and HTTP paths, including the claim-fallback path when the active copy is gone. Authorized sender/receiver retries remain available even when the template has been unregistered.
- The service claims an action with an atomic conditional `findOneAndUpdate()`. Only an unclaimed active message, a retryable same-action attempt, or an expired same-action processing lease can move to `actionState: 'processing'`; competing same or different actions receive `ActionConflictError` while a live claim exists.
- The first successful claim stores a stable `actionAttemptId` on the active message and passes it to `action.runHandler(ctx)` as `ctx.actionAttemptId`. If the process dies after an external handler effect but before archival commit, a same-action retry reuses that attempt id. Handlers must use this key with external systems or their own persistence to deduplicate side effects; the service does not claim arbitrary external calls are exactly-once.
- If the handler throws before archival commit, the active message moves to `actionState: 'retryable'` with `actionFailureMessage`, and `handleAction()` throws `ActionRetryableError`. A later same-action retry may reclaim the same attempt id; different actions continue to conflict with the outstanding attempt.
- Each lease acquisition mints a distinct `actionOwnerToken` while `actionAttemptId` stays stable for external deduplication. The retryable mark, the archive commit, and the post-commit notification-state update are all conditioned on the current owner token: a worker whose lease expired and was taken over receives `ActionConflictError` and cannot change the replacement's claim, archive, or notification state. Archive commits additionally pre-check ownership before inserting and map an archive `_id` conflict to `ActionConflictError`, so exactly one acquisition commits.
- Long-running handlers must complete within the 30-second action lease; there is no lease-renewal API. Fencing guards persisted state only — it cannot stop an already-running external call, so handlers must still deduplicate external effects with `ctx.actionAttemptId`.
- Migration: active records written before fencing have no `actionOwnerToken`. A same-action takeover still matches those records, keeps their attempt id, and mints a token, so no backfill is required. Archives record the committing `actionOwnerToken` alongside `actionAttemptId`.
- Archive insertion and active-message deletion run in one MongoDB session transaction using the active and archive models from the service model resolver. If either operation cannot commit, the transaction aborts and no archive-only or active-plus-archive split state is reported as success.
- Trusted host-level direct archival (`message.archive(actionCd, archivedBy, registry)`) uses the same atomicity on the document's owning connection: it re-reads persisted state inside the transaction, refuses a live in-flight service claim with `ActionConflictError` (only an explicitly expired `processing` lease or `active`/`retryable` may move), and commits archive insert plus conditional active delete together so concurrent direct archive versus service action cannot double-commit. It performs no sender/receiver, permission, or condition authorization — hosts must authorize before calling and must never expose it to untrusted callers. Invalid action/template/user input throws (`TemplateNotFoundError`/`ActionNotFoundError`, `InvalidMessageUserError`) instead of silently succeeding; repeats throw `MessageArchivedError` (archive exists) or `MessageNotFoundError`; deployments without transaction support throw `MessageTransactionRequiredError` before writing. Migration: callers relying on silent no-op success or on transaction-free standalone archival must handle the new errors and use replica-set transactions.
- When an action commits, the archive stores `actionAttemptId` and `actionNotificationState`. Actions without `senderNotification` store `none`. Actions with sender notification store `pending` in the archive transaction, then update to `sent` after post-commit delivery succeeds.
- If sender notification fails after the archive commits, the archive is updated to `failed` and `handleAction()` throws `ActionNotificationPendingError` rather than rerunning or reporting the business action as uncommitted. A retry against that archived message returns the same committed-notification-pending outcome.
- Crash recovery boundaries are explicit: before claim means another request can claim; after claim but before/during handler means the live claim conflicts until its lease expires; after handler before archive commit means retry must reuse `actionAttemptId`; during archive commit the transaction commits both archive and active delete or rolls both back; after archive commit before notification delivery leaves archived `actionNotificationState: 'pending'`.

### Schema factories

```typescript
import {
  buildMessageSchema,
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  MESSAGE_MODEL_NAME,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MESSAGE_REQUEST_MODEL_NAME,
} from '@web-ts-toolkit/message-service';

const Message = mongoose.model(MESSAGE_MODEL_NAME, buildMessageSchema());
const MessageArchive = mongoose.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
const MessageRequest = mongoose.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema());
```

`buildMessageSchema({ emailNotifier, emailNotificationExclusions, onEmailDeliveryFailure, userModelName, archiveModelName })` lets you opt in to email notifications with per-template exclusions. When `emailNotifier` is `null` (the default), no email hook is registered.

Email delivery is best-effort, not durable. The schema sends only for newly created messages after a successful non-transactional save. It deliberately skips documents saved with a Mongoose session because Mongoose save hooks run before the surrounding transaction commits; this package does not include a durable email outbox or retry worker. Hosts that need reliable transactional email should write their own outbox record in the same transaction and deliver from that outbox after commit.

Email lookup and notifier failures do not roll back a committed message. Pass `onEmailDeliveryFailure` to observe recipient lookup or notifier failures and connect them to your logger or metrics. If the observer itself throws, that secondary error is swallowed so a committed message create is not reported as failed.

Email exclusion matching uses the rendered receiver title after trim + lowercase normalization. The title passed to the notifier is trimmed but keeps its original case. Existing message updates do not resend email; change-triggered or manual resend workflows should be implemented explicitly by the host application.

When you use `clientRequestId`, register all three models. `MessageRequest` stores the reservation record that prevents duplicate side effects during concurrent duplicate requests in the same scope.

### Idempotent create notes

- `clientRequestId` is safe for concurrent retries only when `MessageRequest` is registered.
- At the `MessageService` boundary, `clientRequestId` must be a string. It is trimmed before use, must remain non-empty after trimming, and must be at most 128 characters. Case is preserved, so `Request-1` and `request-1` are different idempotency keys.
- The idempotency scope is exactly the trimmed `clientRequestId`, the requester identity (`String(user._id)`), and `templateCd`. A reused ID from another user or another template starts its own operation and never replays the first scope's messages.
- The winning request reserves the scoped idempotency key before template preparation or payment-session creation runs.
- Payment sessions created for messages that fail before persistence, or for idempotent batches whose transaction does not commit, are expired through `PaymentProvider.expireSession()`. Every newly created session tracked from preparation through the commit attempt is attempted — including earlier batch items when a later item's provider/render step fails, and sessions left uncommitted by model resolution, `startSession()`, persistence, or rollback failures. Every known session is attempted even when an earlier expiration or the `onPaymentCompensationFailure` observer fails; a lone session throws `PaymentSessionCompensationError`, multi-session batches throw `PaymentSessionCompensationAggregateError` (a subclass carrying every per-session failure in `failures` with the triggering error as `originalError`). Committed sessions are never expired because post-commit housekeeping failed, and non-idempotent sequential creation keeps per-item semantics (only the failing item is compensated; already-committed items are retained). Ambiguous provider/commit outcomes the process cannot observe must be reconciled with the provider out of band. A completed same-scope retry replays the committed message batch and does not create another payment session.
- Reservations move through explicit `pending`, `completed`, and `failed` states. A completed replay is returned only when the completed reservation's `itemCount` exactly matches the persisted distinct `clientRequestItemIndex` values merged across the active and archive collections (`Array<IMessage | IMessageArchive>`, sorted by item index). Action archival never breaks replay and never reruns preparation/payment: some/all archived batches replay from current records, with archive entries returned as persisted `IMessageArchive` (no fabricated active methods; narrow with `'archivedAt' in doc`). A commit landing between the reservation read and the message reads is reconciled (reservation re-read; one bounded collection re-read) rather than reported as corruption. Completed zero-item results are replayed as `[]`.
- Losing requests in the same scope wait for the winning request to finish. If the reservation remains live beyond `clientRequestWaitMs`, `ClientRequestPendingError` is thrown and the caller should retry later. If the pending lease expires after `clientRequestLeaseMs`, exactly one retry can atomically take over the reservation.
- Timing configuration is validated at construction and throws `InvalidMessageServiceOptionError` for out-of-range values: `clientRequestLeaseMs` and `clientRequestPollMs` must be finite safe integers in `[1, 2147483647]` ms (positive lease/poll); `clientRequestWaitMs` must be in `[0, 2147483647]` ms (nonnegative wait, `0` is a supported immediate check that raises `ClientRequestPendingError` without sleeping when the first attempt cannot acquire or replay). `NaN`, infinite, fractional, negative (and zero lease/poll), and timer-overflow values above `2^31 - 1` (Node's maximum `setTimeout` delay, exported as `MAX_MESSAGE_SERVICE_TIMEOUT_MS`) are rejected. The duplicate-wait deadline bounds polling only — it never cancels a hung database/provider operation; each reservation/message read is awaited to completion, then the deadline decides whether to poll again or throw pending. Tests use injected `clientRequestDelay`/`clientRequestNow` hooks so boundary behavior is deterministic without long sleeps; production defaults use `setTimeout`/`Date.now`, with persisted `leaseExpiresAt` wall-clock timestamps (`new Date(now())`) and the stale-takeover filter compared against the same clock.
- Multi-item idempotent batches are persisted in one MongoDB transaction together with the transition to `completed`. Production deployments that use `clientRequestId` therefore need MongoDB replica set or sharded-cluster transaction support. Standalone MongoDB servers fail with `MessageTransactionRequiredError` instead of returning partially persisted batches.
- If creation fails, the reservation is recorded as `failed` (raw diagnostic in `failureMessage`) and later retries raise `ClientRequestFailedError`. The direct-service error carries a stable public message (`clientRequestId "…" previously failed; retry with a new clientRequestId`) with the recorded diagnostic retained on `error.failureReason`/`cause`; the HTTP route returns 409 with that stable message only, never the recorded cause text. If persisted state is corrupt, such as a completed reservation missing an expected item index across both collections after reconciliation, the service raises `ClientRequestInconsistentStateError` rather than returning a partial array. Retain reservations and archive documents for the idempotency-replay window: archive TTL/deletion turns later replays into `ClientRequestInconsistentStateError`, and cross-owner/template IDs remain isolated scopes. The archive declares the same scoped `clientRequest*` indexes as the active collection (including a unique scope+item-index index).

Migration note: versions with scoped idempotency add `clientRequestOwnerId` to messages and reservations and replace the old global `clientRequestId` unique indexes with compound indexes on `{ clientRequestOwnerId, templateCd, clientRequestId }` plus `clientRequestItemIndex` for message items. Drop any obsolete deployment-created unique index on `clientRequestId` before building the new schema indexes, otherwise different users or templates can still collide globally.

### Typed errors

```typescript
import {
  MessageNotFoundError,
  TemplateNotFoundError,
  ActionNotFoundError,
  ActionNotAllowedError,
  ActionConflictError,
  ActionRetryableError,
  ActionNotificationPendingError,
  InvalidClientRequestIdError,
  InvalidMessageServiceOptionError,
  InvalidPaginationValueError,
  ClientRequestPendingError,
  ClientRequestFailedError,
  ClientRequestInconsistentStateError,
  MessageTransactionRequiredError,
  PaymentSessionCompensationError,
  PaymentSessionCompensationAggregateError,
  MessageArchivedError,
  InvalidMessageUserError,
  ActionTemplateMismatchError,
  MessageModelResolutionError,
  TemplateRegistryValidationError,
} from '@web-ts-toolkit/message-service';
```

The package brands exported errors so `instanceof` works across mixed ESM/CommonJS imports in one process.

| Error                                      | Direct-service meaning                                                                                                                                                                                                         | Route status                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `MessageNotFoundError`                     | `findMessageOrThrow()` could not find an active or archived message                                                                                                                                                            | 404                                                      |
| `TemplateNotFoundError`                    | Requested `templateCd` is not registered                                                                                                                                                                                       | 404                                                      |
| `ActionNotFoundError`                      | Requested action is not present on the message template                                                                                                                                                                        | 404                                                      |
| `ActionNotAllowedError`                    | User lacks sender/receiver, permission, or condition access                                                                                                                                                                    | 403                                                      |
| `MessageArchivedError`                     | Mutation was requested for an archived message                                                                                                                                                                                 | 410                                                      |
| `InvalidMessageUserError`                  | Missing/invalid user identity at the service boundary                                                                                                                                                                          | 401                                                      |
| `InvalidClientRequestIdError`              | `clientRequestId` is not a valid bounded string                                                                                                                                                                                | 400                                                      |
| `ActionConflictError`                      | Another live action attempt owns the message                                                                                                                                                                                   | 409                                                      |
| `ActionRetryableError`                     | Handler failed before archive commit; same action may retry with the persisted `actionAttemptId`                                                                                                                               | 409                                                      |
| `ActionNotificationPendingError`           | Business action committed, but sender notification still needs reconciliation                                                                                                                                                  | 202                                                      |
| `ClientRequestPendingError`                | Duplicate create is still live; retry after completion or lease expiry                                                                                                                                                         | 409                                                      |
| `ClientRequestFailedError`                 | The scoped create operation has a recorded terminal failure; public message is stable (`…previously failed; retry with a new clientRequestId`) and never includes the recorded `failureMessage`                                | 409 with the stable message only                         |
| `ClientRequestInconsistentStateError`      | Persisted reservation/message state is corrupt                                                                                                                                                                                 | propagated as a server error                             |
| `MessageTransactionRequiredError`          | MongoDB deployment cannot provide required idempotent batch transactions                                                                                                                                                       | propagated as a server error                             |
| `InvalidPaginationValueError`              | Invalid service construction or list pagination input                                                                                                                                                                          | propagated as a server error unless handled by host code |
| `InvalidMessageServiceOptionError`         | Invalid `clientRequestLeaseMs`/`clientRequestWaitMs`/`clientRequestPollMs` (non-finite, fractional, out-of-range, or timer-overflow)                                                                                           | propagated as a server error unless handled by host code |
| `ActionTemplateMismatchError`              | Direct `handleAction()` template argument does not match the message                                                                                                                                                           | propagated as a server error unless handled by host code |
| `MessageModelResolutionError`              | Configured active/archive/request/user model cannot be resolved                                                                                                                                                                | propagated as a server error                             |
| `PaymentSessionCompensationError`          | Create failed and at least one uncommitted payment session could not be expired (single session; also the base class of the aggregate below)                                                                                   | propagated as a server error                             |
| `PaymentSessionCompensationAggregateError` | Multi-session create failed and at least one uncommitted payment session could not be expired; `failures` carries every per-session `{ sessionId, compensationError, hookError }` with the triggering error as `originalError` | propagated as a server error                             |
| `TemplateRegistryValidationError`          | Invalid trusted template metadata at registration time                                                                                                                                                                         | not thrown by route handlers                             |

Malformed route values and ObjectId cast failures are translated to 400 before service/model/template lookup. Direct callers should treat `ClientRequestPendingError` as retryable, `ClientRequestFailedError` as a stable recorded failure for that scope, and `ClientRequestInconsistentStateError`/`MessageTransactionRequiredError` as operational errors requiring investigation. Action handlers should treat `ActionConflictError` as a live in-progress action, `ActionRetryableError` as a same-action retry using the persisted attempt key, and `ActionNotificationPendingError` as a committed business action whose sender notification still needs host reconciliation. Inspect `PaymentSessionCompensationError` and the compensation hook event before retrying or reconciling with the provider.

## Custom Providers

### Email Provider

```typescript
import { EmailProvider } from '@web-ts-toolkit/message-service';

async function sendWithProvider(to: string, subject: string, text: string): Promise<void> {
  void { to, subject, text };
}

class SendGridEmailProvider implements EmailProvider {
  async sendNotification(to: string, title: string, body: string) {
    await sendWithProvider(to, title, body);
  }
}
```

Pass it to `buildMessageSchema({ emailNotifier: provider.sendNotification.bind(provider), onEmailDeliveryFailure })`.

### Payment Provider

```typescript
import { type PaymentProvider, type UserId } from '@web-ts-toolkit/message-service';

async function createCheckoutSession(user: UserId, code: string, priceArgs?: Record<string, unknown>): Promise<string> {
  void user;
  void code;
  void priceArgs;
  return 'session_123';
}

async function expireCheckoutSession(sessionId: string): Promise<void> {
  void sessionId;
}

async function refundCheckoutSession(sessionId: string): Promise<void> {
  void sessionId;
}

class StripePaymentProvider implements PaymentProvider {
  async createSession(user: UserId, code: string, priceArgs?: Record<string, unknown>) {
    return await createCheckoutSession(user, code, priceArgs);
  }
  async expireSession(sessionId: string) {
    await expireCheckoutSession(sessionId);
  }
  async refundPayment(sessionId: string) {
    await refundCheckoutSession(sessionId);
  }
}
```

Pass it to `MessageService({ paymentProvider })` or `createMessageRoutes({ paymentProvider })`.

Payment providers must treat `expireSession(sessionId)` and `refundPayment(sessionId)` as idempotent. During message creation, the service creates payment sessions before MongoDB can commit the message. If any prepared item, model/session setup step, or the idempotent batch transaction fails before commit, the service expires every newly created uncommitted session it tracked from preparation through the commit attempt (including earlier batch items when a later item's provider/render step fails, and sessions stranded by model resolution, `startSession()`, persistence, or rollback failures). Every known session is attempted even when an earlier expiration or the observer fails: `onPaymentCompensationFailure` is called once per failed session with the session id, scope, original error, and expiration error, then a lone session throws `PaymentSessionCompensationError` while multi-session batches throw `PaymentSessionCompensationAggregateError` (carrying every failure in `failures`); the idempotency reservation is recorded as failed according to the create state machine. Committed sessions are never expired because post-commit housekeeping failed, and non-idempotent sequential creation keeps per-item semantics (only the failing item is compensated; already-committed items are retained). Provider methods stay bound to the provider instance. Process death before a returned session is recorded, or any ambiguous provider/commit outcome, must be reconciled with the provider out of band.

## License

Apache-2.0
