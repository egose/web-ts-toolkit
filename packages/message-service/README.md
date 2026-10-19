# `@web-ts-toolkit/message-service`

Template-driven messaging service for Mongoose + Express applications.

## Installation

```bash
pnpm add @web-ts-toolkit/message-service mongoose express
```

Peer dependencies:

- `mongoose >= 8`
- `express >= 5`

Runtime: Node `>=22`. Use package-root **named imports** (or CommonJS
`require('@web-ts-toolkit/message-service')`); there is no default export or public
deep-import subpath.

Bundling note: `handlebars` and the workspace deps are bundled (`tsup` externals are only `mongoose`/`express`), so only `mongoose` + `express` are peers.

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

### Independent applications in one process

Use **separate connections/databases or disjoint collections**, an explicit registry
per app, and matching schema/service model names. Model names alone do not isolate
collections: Mongoose normally derives collection names from model names. This is
separate-app configuration, not shared-collection tenant enforcement. Explicit
registries never fall back to `defaultRegistry`; configured connections never fall
back to global models. Direct `archive()` always requires the app's registry.

This standalone factory uses only root named imports. Call once per connection;
register trusted templates in each registry before serving requests. Register the
configured `${prefix}User` model first if using default email lookup; a custom
directory resolver needs no User model. Email is disabled when no provider is passed.

```typescript
import type mongoose from 'mongoose';
import {
  MessageService,
  TemplateRegistry,
  buildMessageSchema,
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  type EmailProvider,
  type EmailRecipientResolver,
  type PaymentProvider,
} from '@web-ts-toolkit/message-service';

export async function createIndependentMessaging(
  connection: mongoose.Connection,
  options: {
    prefix: string;
    partyStorage: 'nativeObjectId' | 'opaqueString';
    registry: TemplateRegistry;
    paymentProvider?: PaymentProvider;
    emailProvider?: EmailProvider;
    emailRecipientResolver?: EmailRecipientResolver;
  },
) {
  const modelNames = {
    active: `${options.prefix}Message`,
    archive: `${options.prefix}Archive`,
    request: `${options.prefix}Request`,
    user: `${options.prefix}User`,
  };
  const activeSchema = buildMessageSchema({
    connection,
    archiveModelName: modelNames.archive,
    userModelName: modelNames.user,
    emailNotifier: options.emailProvider?.sendNotification.bind(options.emailProvider),
    emailRecipientResolver: options.emailRecipientResolver,
  });
  const archiveSchema = buildMessageArchiveSchema();
  if (options.partyStorage === 'opaqueString') {
    for (const schema of [activeSchema, archiveSchema]) {
      schema.add({
        fromUser: { type: String, default: null, trim: true, minlength: 1 },
        toUser: { type: String, default: null, trim: true, minlength: 1 },
      });
    }
    archiveSchema.add({
      archivedBy: { type: String, default: null, trim: true, minlength: 1, index: true },
    });
  }
  const Message = connection.model(modelNames.active, activeSchema);
  const Archive = connection.model(modelNames.archive, archiveSchema);
  const Request = connection.model(modelNames.request, buildMessageRequestSchema());
  await Promise.all([Message.init(), Archive.init(), Request.init()]);
  const service = new MessageService({
    connection,
    modelNames,
    registry: options.registry,
    paymentProvider: options.paymentProvider,
  });
  return { service, Message, Archive, Request, modelNames };
}
```

Create app A with `partyStorage: 'nativeObjectId'`, app B with
`partyStorage: 'opaqueString'`, distinct `prefix`/connections/registries/providers,
then mount each with `createMessageRoutes({ service, getUser })`. Each host's
`getUser(req)` maps its own authenticated request shape to `MessageUser`; list
through `service.listMessages({ user })` and serialize with `serializePublicMessage`.
Both apps may use the same `templateCd`, textual requester ID, and `clientRequestId`
without sharing reservations. Pass the correct registry to direct document
`archive(actionCd, actorId, registry)`; it is a trusted host primitive, not authorization.
String storage must cover **both parties and archive `archivedBy`**, with the
[identity/migration policy below](#user-id-storage-and-normalization-msga-03-migration).
Transactions still require a replica set/sharded cluster. Idempotent creates skip
schema email hooks; standalone notifications can use each app's bound notifier and
[optional custom directory](#recipient-lookup-msga-05).

#### Bounded installed-consumer compatibility

The packed consumer tests exercise Express **5.0.0** / Mongoose **8.0.0** and the
exact Express/Mongoose versions installed in this workspace (currently 5.x/9.x).
Both lanes compile root-import ESM/CommonJS NodeNext and Bundler consumers with
`strict: true`, `skipLibCheck: false`, and run the two-app MongoDB lifecycle in
both module formats. The minimum-runtime CI lane executes the installed consumers
on actual Node **22.0.0**; newer Node may run build/install/TypeScript tooling.
This bounded check does not certify every intervening or future peer release.

MSGA-11 compatibility correction: schema constants now retain explicit portable
Mongoose schema types, rather than expanding Mongoose 9-only inferred generics in
the shipped declarations. Active/archive document `_id` is explicitly ObjectId
across Mongoose 8 and 9. Runtime schemas, bundling, exports and peer/runtime floors
are unchanged; no data migration is required.

Reproduce from the repository after installing build dependencies and Node 22.0.0:

```bash
mkdir -p _tmp-msga
git check-ignore _tmp-msga
export ASDF_NODEJS_VERSION=26.11.1
export TMPDIR="$PWD/_tmp-msga"
export MESSAGE_SERVICE_CONSUMER_NODE="$(asdf where nodejs 22.0.0)/bin/node"
export MESSAGE_SERVICE_EXPECT_NODE=22.0.0
pnpm --filter @web-ts-toolkit/message-service... build
pnpm --filter @web-ts-toolkit/message-service exec vitest run --config ../../vitest.config.ts --fileParallelism=false test/message-service.packed-consumer.test.ts -t MSGA-11
```

Each lane prints exact resolved peers/types/compiler, build-tool and consumer Node,
MongoDB version and completed checks. `MESSAGE_SERVICE_REPORT_DIR` optionally saves
JSON evidence outside packed temp consumers. Without the runtime override, local
tests execute with their test-runner Node, whose version is reported explicitly.

## API

### `createMessageRoutes(options)`

Creates a standalone Express router with message template routes. Returns `{ router, service }`. Mount the returned JsonRouter with `router.original`.

All user-facing routes require a resolved user with a valid `_id` (non-empty string or `ObjectId`; missing, null, empty, numeric, array, and plain-object ids return `401`). By default, routes read `req._user || req.user`; pass `authMiddleware` and/or `getUser` to adapt your authentication stack. A request with no resolved user returns `401` before any service, template, payment, model, or action side effect. Hosts remain responsible for installing authentication, permission population, and CSRF protection before mounting these routes.

Custom extractors are preserved: `getUser`, `getPermissions`, and `getIdentity` receive the original Express request and their return values are passed through to `MessageService`. The route factory enforces the shared principal contract: `getUser` must return a user with a non-empty string or `ObjectId` `_id` and optional `roles` that are undefined or an array of strings before continuing. Malformed roles also return `401` before service/model lookup. See [authenticated principals](#authenticated-principals-msga-02-migration) for getter/hydrated users and the action-handler snapshot.

| Option                         | Type                                       | Description                                                                       |
| ------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `getModel`                     | `(name: string) => Model`                  | Mongoose model getter                                                             |
| `paymentProvider`              | `PaymentProvider \| null`                  | Required for nonempty payment codes; optional for code-free items and replay      |
| `onPaymentCompensationFailure` | `(event) => void \| Promise<void>`         | Optional hook called when expiring an uncommitted payment session fails           |
| `onTransactionCleanupFailure`  | `MessageTransactionCleanupFailureObserver` | Best-effort diagnostics when a service-owned transaction's `endSession()` rejects |
| `adminRoles`                   | `string[]`                                 | Fallback roles when `toUser` is absent and `toRoles` is omitted or empty          |
| `registry`                     | `TemplateRegistry`                         | Custom template registry (default: `defaultRegistry`)                             |
| `actionLeaseMs`                | `number`                                   | Action lease in ms (default: `30000`)                                             |
| `authMiddleware`               | `((req, res, next) => void)[]`             | Custom middleware applied to all routes before route validation                   |
| `getUser`                      | `(req) => MessageUser \| undefined`        | Extract authenticated user (default: `req._user \|\| req.user`)                   |
| `getPermissions`               | `(req) => Record<string, boolean>`         | Extract permissions (default: `req._permissions \|\| {}`)                         |
| `getIdentity`                  | `(req) => Record<string, unknown>`         | Extract identity (default: `req._identity \|\| {}`)                               |
| `adminPermissionKey`           | `string`                                   | Permission key for admin read-only view of actions (default: `'is.admin'`)        |

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

### Public message DTOs (MSGR-03 migration)

`POST /new/:templateCd` returns `PublicMessageDto[]` for both fresh creation and
completed replay. The shipped Node host's list endpoint returns the same DTOs in
its existing `{ success: true, data }` envelope. Root named exports
`serializePublicMessage`, `PublicMessageDto`, `PublicMessageParty`, and
`PublicMessageSource` let custom HTTP adapters use this contract too:

```typescript
import {
  serializePublicMessage,
  type MessageService,
  type MessageUser,
  type PublicMessageDto,
} from '@web-ts-toolkit/message-service';

export async function publicInbox(service: MessageService, user: MessageUser): Promise<PublicMessageDto[]> {
  const messages = await service.listMessages({ user });
  return messages.map(serializePublicMessage);
}
```

The explicit allowlist is:

- `_id`, `templateCd`, `type`, `fromUser`, `toUser`, `toRoles`;
- `senderContent` and `receiverContent` (only `title`, `long`, `short`),
  `documents` (attachment IDs), `payload`, `display`;
- `paymentCd` and `paymentSession` (intentional business payment reference);
- `actionState`, `actionCd`, `actionAttemptId`, `createdAt`, `updatedAt`;
- archives additionally expose `archivedBy`, `archivedAt`, `actionNotificationState`.

IDs are strings and dates are ISO strings. Unpopulated parties are IDs or `null`;
populated parties contain only `{ _id, displayName?, email? }`, with presentation
fields included only when they are strings. Missing/unsupported party references
become `null`; populated attachments and `archivedBy` become IDs. Populate
`email`/`displayName` only when appropriate for the response audience. The helper
expects stored message fields (including timestamps), accepts hydrated or plain
records, and performs no authorization itself.

Migration: clients must stop reading raw diagnostics, `actionOwnerToken`, claim
identity/timestamps/leases, notification-attempt timestamps, `clientRequest*`
bookkeeping, `__v`, or arbitrary schema/populated-user fields from HTTP messages.
They are no longer returned. Use `_id` for message identity and keep the submitted
request key client-side for replay. The intentional `actionAttemptId` contract
remains available for authorized outcome correlation, including existing 409/202
action responses; it is not a worker ownership credential. For archives, use
`archivedAt` to detect terminal state (`actionState` is the stored action snapshot).

Direct `createMessage`, find, and list service results remain hydrated Mongoose
records with internal diagnostics and lifecycle methods where applicable; the
serializer does not mutate them. Operational observers retain their raw errors.
`payload`, `display`, text content, and action-handler results are host-controlled
business data, **not automatically sanitized**. Custom fields require an explicit
host DTO extension after authorization rather than spreading stored documents.

### Transaction cleanup diagnostics

Migration (MSGR-01): once MongoDB's `withTransaction()` resolves, session cleanup
failure no longer rejects creation or archival. Paid batches retain their payment
sessions and replay normally; committed actions continue to the documented
post-commit sender notification (`sent`, or `ActionNotificationPendingError` with
stored `failed` state). Direct `archive()` resolves successfully after commit.
If the transaction rejects, cleanup cannot replace its primary error. If a
transaction callback and its abort both reject, the callback error takes precedence.

Configure the root-exported `MessageTransactionCleanupFailureObserver` through
`MessageServiceOptions.onTransactionCleanupFailure` for service writes, and
`buildMessageSchema({ onTransactionCleanupFailure })` for direct document archival.
The root-exported `MessageTransactionCleanupFailureEvent` contains:

- `operation`: `createBatch`, `actionArchive`, or `directArchive`;
- `stage`: `endSession`, and `error`: the raw cleanup rejection;
- `outcome: 'committed'` after confirmed commit, or `outcome: 'failed'` with
  `originalError` when the transaction rejected.

These are internal diagnostics, not HTTP response fields. The optional observer
is awaited once per failed package-owned session cleanup; synchronous throws and
asynchronous rejections are swallowed. Keep observers bounded (a never-settling
observer delays the call). Use them for logging/metrics, not payment compensation
or action retries. Without an observer, cleanup errors are suppressed.

Route construction forwards `onTransactionCleanupFailure` unchanged. With
`createMessageRoutes({ service })`, configure the observer on that service;
combining an injected service with this construction option is rejected at runtime
and by strict TypeScript. Schema configuration is independent: service options do
not reconfigure document methods. Direct archival uses the document's owning
connection; a session attached with `$session(session)` is borrowed and never
ended/reported by the package. Its owner remains responsible for cleanup; direct
archival still calls `withTransaction()` and does not join an already-open transaction.

`failed` means no commit was confirmed to this process, **not** proof of rollback.
Driver retries remain in effect. An unresolved commit acknowledgement/network
failure or process death can leave an ambiguous outcome; this hook supplies no
commit reconciliation or payment crash recovery. Reconcile such outcomes with
MongoDB and the payment provider out of band before retrying external effects.

### `MessageService`

Core service for creating messages, getting actions, and handling actions. Constructed by `createMessageRoutes`, or directly:

```typescript
import { MessageService, TemplateRegistry } from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
const service = new MessageService({
  getModel: mongoose.model.bind(mongoose),
  // Add paymentProvider for templates/items with a nonempty paymentCd.
  adminRoles: ['superadmin'],
  registry,
  actionLeaseMs: 90_000, // Optional; default is 30000 ms. Expiry permits takeover.
});
```

Methods:

- `createMessage(params)` — create from template. Supports `clientRequestId` for requester-and-template-scoped idempotency. Returns `Array<IMessage | IMessageArchive>` (fresh creates resolve active documents; completed replays merge active + archive records, narrowed with `'archivedAt' in doc`). `user` (and `payerUser` when provided) must carry a valid principal id (non-empty string or `ObjectId`); invalid principals throw `InvalidMessageUserError` before any template, payment, or model effect in both branches.
- `createNotification(params)` — create a generic (action-less) notification. Accepts raw `UserId` values (`fromUser`, `toUser`), `toRoles`, `receiverContent`/`senderContent` (`{ title, long, short? }`), `documents`. Returns `IMessage`. Trusted host-level operation: performs no principal validation.
- `listMessages({ user, limit?, skip?, populate? })` — list messages visible to a user.
- `countMessages(user)` — count messages visible to a user.
- `findMessage(id, { populate?, select? })` — find a message by id (active or archive). Trusted host-level operation: performs no principal validation.
- `findMessageOrThrow(id, { populate?, select? })` — same as `findMessage`, but throws `MessageNotFoundError`. Trusted host-level operation.
- `getActions(messageId, usertype, { user, permissions?, isAdmin?, populate? })` — read available actions from storage by the requested ID on the configured connection. `user` is required and validated before any model lookup or template operation. Returns `{ uiTemplate, actions }` or `null`; admin/archived views return the resolved `uiTemplate` with an empty list without evaluating conditions. The old `message` option is deprecated and ignored.
- `handleAction(templateCd, actionCd, { message, user, permissions?, input?, req? })` — execute an action with a durable claim, optional synchronous pure input parsing, stable handler attempt key, transactional archive, and post-commit sender notification status. Direct input needs no Express request.
- `buildVisibilityFilter(user)` — get the Mongoose filter for messages visible to a user.

Action-read migration: omit `getActions`' deprecated `message` option. It is
accepted for source compatibility but ignored, even when its ID matches. Every
listing reads the requested ID (active, then archive) through the service's
configured model resolver/connection. Missing records return `null`. The trusted
`findMessage` APIs still return hydrated snapshots without authorization; do not
use a cached result as proof of current access.

Relationships are checked against stored `fromUser`, `toUser`, and `toRoles`
before optional `populate`. Eligible active conditions receive that message with
the requested presentation population applied; admin/archive views skip both
population and conditions. Mutation conditions must also support unpopulated
references because `handleAction` rechecks the atomic claim without population.
Relationship methods accept string/ObjectId identities and populated `_id`s;
null, deleted, or projected-away populated references never match an identity.
An explicit recipient role can still grant access independently. These methods
do not check host account liveness: a valid authenticated principal can match a
canonical stored ID even if presentation population finds no user. Hosts own
account revocation and must clear stored relationships when that is their policy.

Listings and archived outcomes reflect their database read snapshot, not a
reservation or a promise of future access. Later writes may change availability;
active mutations retain their atomic claim-bound authorization and fencing.

Pagination contract: `defaultListLimit` and `maxListLimit` must be finite integers, `maxListLimit` must be at least 1, and the default must not exceed the max. Request `limit` and `skip` values must also be finite integers; fractional, `NaN`, and infinite values are rejected. Request `limit <= 0` is normalized to 1, high limits are clamped to `maxListLimit`, and negative `skip` is normalized to 0 so invalid input never turns into an unbounded MongoDB query. Results are ordered by `{ createdAt: -1, _id: -1 }` for deterministic offset pages when timestamps tie.

`listMessages` uses offset pagination (`skip` + `limit`) for compatibility. Large skips become progressively more expensive because MongoDB still advances over skipped matches before returning the page. Keep `maxListLimit` bounded and prefer a host-owned cursor query using `buildVisibilityFilter(user)` plus the same `{ createdAt: -1, _id: -1 }` ordering for very large inboxes.

### Authenticated principals (MSGA-02 migration)

`MessageUser` accepts plain objects, prototype getters, and hydrated Mongoose
users. Its documented fields are `_id`, optional `id`, optional `roles`, and
optional `displayName`. Equivalent callers receive the same inbox, action, and
archived-outcome decisions. User-facing service calls (including list/count) and
routes validate principals before resolving models or running template/provider
effects. `createMessage` also validates `payerUser` when supplied.

- Omitted/undefined `roles` and `[]` are valid and grant no role membership.
- Provided roles must be an array containing only strings. `null`, strings,
  array-like objects, mixed/non-string elements, and sparse arrays are invalid.
  The service throws `InvalidMessageUserError`; HTTP routes return `401`.
  Invalid roles reject the principal even for direct sender/recipient matches or
  admin read-only views. Document `isSender`/`isReceiver` helpers return `false`
  for malformed roles.
- Role membership uses exact, case-sensitive string equality. No coercion,
  trimming, partial-array acceptance, or substring matching is applied.

Action authorization and `ActionContext.user` explicitly read the four documented
fields, including getters, and copy the roles array. Action `_id` retains its
existing normalized string form. No arbitrary user properties, Mongoose internals,
or private fields are copied, and user-document serializers are not invoked.
Caller objects are not mutated. Preparation still receives the extracted user
itself, and callbacks receive the original `req`; custom extractors continue to
receive that same Express request. Stored targets remain authoritative for active
claims and archived outcomes.

Migration: authentication adapters that supplied string/null/mixed roles must
return a string array, or omit roles/use `undefined` when absent. Handlers that
relied on extra spread user properties should obtain explicitly selected host
data from their original typed request or a template-factory closure. This change
requires no stored-message migration. Trusted host-level find, notification, and
direct-archive APIs retain their existing authorization boundaries.

### User-ID storage and normalization (MSGA-03 migration)

The default schemas store `fromUser`, `toUser`, and archive `archivedBy` as native
MongoDB ObjectIds. They work without extra configuration for ObjectId users.
`UserId` also accepts strings, but arbitrary external/UUID identities need the
following **complete String-schema recipe**, using package-root named imports:

```typescript
import type mongoose from 'mongoose';
import {
  MessageService,
  TemplateRegistry,
  MESSAGE_MODEL_NAME,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MESSAGE_REQUEST_MODEL_NAME,
  buildMessageSchema,
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
} from '@web-ts-toolkit/message-service';

// Call once per connection, before compiling these models. Register the host's
// trusted templates in registry; use a replica set/sharded cluster for transactions.
export async function createStringIdMessaging(connection: mongoose.Connection, registry: TemplateRegistry) {
  const activeSchema = buildMessageSchema({ connection }); // email disabled by default
  const archiveSchema = buildMessageArchiveSchema();
  for (const schema of [activeSchema, archiveSchema]) {
    schema.add({
      fromUser: { type: String, default: null, trim: true, minlength: 1 },
      toUser: { type: String, default: null, trim: true, minlength: 1 },
    });
  }
  archiveSchema.add({
    archivedBy: { type: String, default: null, trim: true, minlength: 1, index: true },
  });
  const Message = connection.model(MESSAGE_MODEL_NAME, activeSchema);
  const Archive = connection.model(MESSAGE_ARCHIVE_MODEL_NAME, archiveSchema);
  const Request = connection.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema());
  await Promise.all([Message.init(), Archive.init(), Request.init()]);
  return new MessageService({ connection, registry });
}
```

Use principals such as `{ _id: 'oidc|Acme:Alice' }` or a UUID string with this
service. Template preparation can return those strings in `fromUser`/`toUser`.
The factory schemas retain methods, hooks, timestamps, and lifecycle/replay
indexes; overriding only active parties is insufficient because both service
actions and direct `message.archive()` write archive parties **and `archivedBy`**.
`MessageRequest` needs no overrides: its owner is already a String scope key.
Custom model names must also agree between service `modelNames` and active-schema
`archiveModelName`. If using population or the default email lookup, register a
User model with a matching String `_id` on this connection and configure the
appropriate model/ref; no User model is needed without populate when email is
disabled or a [custom recipient resolver](#recipient-lookup-msga-05) owns lookup.
Message `_id`, attachment IDs, and the HTTP `:id` contract remain ObjectId.

#### Identity policy

- User-facing principal strings are trimmed, never lowercased or Unicode-normalized.
  Surrounding whitespace is not identity-significant. Preparation still receives
  the original principal, without mutation. New template messages trim both the
  prepared sender/recipient and the default sender before persistence, including
  direct and idempotent creation; a validated padded sender cannot disappear from
  its own normalized inbox. Service archival stores the normalized actor; direct
  archival trims its validated `archivedBy`. Native ObjectId inputs remain native
  until the configured schema casts them.
- **Stored native ObjectId:** relationship helpers (including populated `_id`s)
  accept that ObjectId or its 24-hex string in either case, with surrounding padding
  trimmed. This agrees with default Mongoose inbox query casting. Public IDs use
  lowercase hex. The string form in action-handler `user._id` retains the caller's
  trimmed case; it is not a universal canonical business key.
- **Stored String:** equality is exact and case-sensitive after trimming, even
  for 24-hex strings. `Alice` and `alice`, or uppercase/lowercase hex-looking
  strings, are distinct identities. An ObjectId principal becomes lowercase hex,
  so in a String schema it matches only that exact lowercase identity. Supply
  strings consistently for opaque identities. Use MongoDB's default simple/binary
  collation; case-insensitive collations or custom lowercase/casting setters do not
  satisfy this contract. Each configured collection must use a consistent party
  BSON type; heterogeneous legacy ObjectId/String storage is not supported by this
  recipe without migration.
- **Request scopes are textual and unchanged:** string requester IDs retain their
  trimmed case, ObjectId requester IDs use lowercase hex. Thus an ObjectId and its
  lowercase hex share a scope; uppercase hex is a **different scope**, even with
  default ObjectId party storage. Relationship equivalence does not merge requests.
  Replays use the exact stored `{ clientRequestOwnerId, templateCd, clientRequestId }`
  across reservations, active messages, and archives. Do not switch representation
  during retries. Completed replay preserves existing stored values and never
  reruns preparation to normalize old messages.

The trusted-host `createNotification` boundary still takes raw IDs without
principal validation or service normalization; the String recipe's schema setters
trim these and other Mongoose host writes. Direct `archive()` still performs no
relationship/permission authorization; the host must authorize it. Neither recipe
adds arbitrary top-level preparation-field persistence. The DTO serializer emits
stored string case unchanged, ObjectIds as hex, and archive `archivedBy` as an ID;
it performs no identity repair or authorization.

#### Existing records and scope migration

This release changes new template party writes and direct archive ownership to
trim strings, and makes uppercase hex principals agree with stored native ObjectId
relationships. It does **not** rewrite any record or request scope. No storage
migration is needed for consistently typed, unpadded records. Do not use IDs whose
leading/trailing whitespace is significant; they were already incompatible with
principal validation and inbox query normalization.

For legacy padded string parties/ownership, inspect raw BSON in **both** active and
archive collections (hydration/setters may hide padding), map them to the host's
authoritative identities, check collisions, then rewrite approved `fromUser`,
`toUser`, and `archivedBy` values with writers/actions drained. A String-schema
change alone does not repair persisted padding or change BSON types. Moving an
ObjectId deployment to external string identities additionally needs a host-owned
mapping for these three fields, populated User IDs, and relevant host audit/claim
identity references; blindly stringifying references is not an external-ID mapping.
Changing principal values also changes requester scopes: apply the coordinated
scope migration below or retain an exact-scope legacy retry adapter.

Prefer keeping the current request-scope convention. If a host changes requester
values or chooses to canonicalize ObjectId hex strings before service calls, apply
it consistently at all authentication/service adapters and treat the rollout as a scope migration:
drain creation/action workers and retries, inventory upper/lowercase (and any
historically padded/custom) owners for each template/key, reconcile conflicting
reservations and their **entire** message batches using application knowledge, and
update `clientRequestOwnerId` consistently in MessageRequest, active, and archive
records while preserving item indexes/counts and compound unique indexes. Never
blindly lowercase all owners: opaque IDs may differ only by case, and two completed
ObjectId-representation scopes may already contain separate business effects.
If histories cannot be reconciled, retain their old exact-scope retry adapter until
the host's retention/retry window ends. There is no automatic alias lookup, scope
merge, or general migration tool in this package.

### Recipient defaults (MSGA-01 migration)

For template-based `createMessage`, `adminRoles` (default `[]`) supplies recipients
only when each prepared item has neither a direct user nor nonempty role recipients:

| Prepared `toUser`           | Prepared `toRoles` | Stored `toRoles`           |
| --------------------------- | ------------------ | -------------------------- |
| Absent (`undefined`/`null`) | Omitted or `[]`    | Copy of `adminRoles`       |
| Present                     | Omitted or `[]`    | `[]`                       |
| Absent or present           | Nonempty array     | Copy of the explicit array |

An explicit empty role array **does not suppress fallback** for an otherwise
unaddressed item. To create an unaddressed item without fallback roles, configure
`adminRoles: []` (or omit the option). Explicit `toUser` + `toRoles` combinations
remain independent recipient grants: the direct user and matching role members
can see the message and qualify for receiver actions, subject to each action's
permission and condition checks. Include admin roles explicitly in `toRoles` if
a directly addressed message should also reach them. Generic `createNotification`
stores its supplied recipients without applying this template fallback.

Migration: new directly addressed template messages no longer implicitly add
`adminRoles`. Existing active/archive records and completed idempotent replays
retain their stored recipients. Review legacy `toRoles` in both collections and
correct unintended grants according to application policy; stored roles govern
inbox visibility, action authorization, and archived-outcome access. Legacy
implicit fallback cannot be distinguished automatically from an intentional
direct-user-plus-role combination.

### Prepared attachments (MSGA-06)

The root-exported `PrepareResult.documents?: mongoose.Types.ObjectId[]` selects
attachments for each fresh `createMessage` item in both direct and idempotent
creation:

| Prepared `documents`   | Root message attachments                                          |
| ---------------------- | ----------------------------------------------------------------- |
| Nonempty array         | The prepared selection                                            |
| `[]`                   | No attachments, even when the original payload contains documents |
| Omitted or `undefined` | Original `PrepareContext.payload.documents`, or `[]` when absent  |

The fallback always reads the **original caller payload**, even when preparation
returns a replacement `payload`. A prepared business `payload.documents` does not
select root attachments. Each selected array is shallow-copied per item, including
fallback arrays and arrays reused by multiple fan-out items; the service does not
mutate caller/preparation arrays. Attachment IDs retain the existing ObjectId type.

Inject the host's attachment validation/authorization into a template factory. This
recipe sends approved attachments to reviewers and deliberately clears them for
an audit copy, without editing the caller's payload:

```typescript
import type mongoose from 'mongoose';
import type { MessageTemplate, PrepareContext, PrepareResult } from '@web-ts-toolkit/message-service';

export function createAttachmentReviewTemplate(
  selectApprovedDocuments: (ctx: PrepareContext) => Promise<mongoose.Types.ObjectId[]>,
): MessageTemplate {
  return {
    templateCd: 'attachment.review',
    type: 'request',
    description: 'Review approved attachments and create an attachment-free audit copy',
    senderContent: { title: 'Sent {{name}}', long: 'Review requested', short: 'Sent' },
    receiverContent: { title: 'Review {{name}}', long: 'Review the request', short: 'Review' },
    uiTemplate: 'default-message',
    prepareMessage: async (ctx): Promise<PrepareResult[]> => {
      const documents = await selectApprovedDocuments(ctx);
      const name = String(ctx.payload.name ?? '');
      return [
        { toRoles: ['reviewer'], documents, templateData: { name }, payload: { name } },
        { toRoles: ['auditor'], documents: [], templateData: { name }, payload: { name } },
      ];
    },
    actions: [],
  };
}
```

Content still renders only from `templateData`; business `payload` is stored
separately and supplies later action labels/confirmations. Document construction
remains an explicit field allowlist: extra preparation properties cannot override
message identity, lifecycle, or request ownership.

**Adoption/migration:** templates omitting `documents` keep the legacy fallback.
If preparation must filter/replace attachments, return the approved IDs explicitly;
if it must remove them, return `documents: []`. Replacing or clearing only the
business payload does not clear root attachments. Existing active/archive records
and completed replays keep their stored attachment sets without rerunning
preparation. No schema/index or automatic stored-data migration is needed.

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

Supported package-root exports are the service (`MessageService`, `isValidMessageUserId`, `requireMessageUserId`, `MAX_MESSAGE_SERVICE_TIMEOUT_MS`), route factory (`createMessageRoutes` plus its `MessageRoutes*` option types), schema factories and model-name constants, template helpers (`TemplateRegistry`, `defaultRegistry`, `includesAction`, `interpolateTemplate`, `interpolateMessageContent`, `resolveUiTemplate`, `filterActions`, `isActionAllowed`, `hasExplicitPermissionGrant`), no-op providers, provider/template/message types including `UserId`, `MessageTemplate`, `MessageAction`, `ActionContext`, `PrepareContext`, `PrepareResult`, `RegisteredMessageTemplate`, `RegisteredMessageAction`, `RegisteredUiTemplate`, `IMessage`, `IMessageArchive`, and the typed errors listed below. Deep `dist/*` or `src/*` imports are not part of the public contract. Conditional exports keep working: `import` resolves `./dist/index.mjs` with `./dist/index.d.mts` types, `require` resolves `./dist/index.js` with `./dist/index.d.ts` types.

`includesAction(templateCd, actionCd, registry)` requires the registry explicitly so archive behavior never falls back to unrelated global state.

Templates are trusted application code, not caller-supplied configuration. `prepareMessage`, `condition`, `runHandler`, and notification functions run with your application's authority and may perform database or external side effects.

`register()` validates action metadata deterministically. A template cannot register duplicate `actionCd` values, an action unavailable to both sender and receiver, or multiple `isDefault` actions for the same usertype. Registering the same `templateCd` again still replaces the prior template after the new definition validates.

The registry stores a frozen shallow snapshot of authorization/action-critical structure: content objects, `uiTemplate` objects, the action array, action objects, action confirmations, and action payload objects. `find()`/`getAll()` return readonly `RegisteredMessageTemplate` views — mutating them throws at runtime (strict TypeScript also rejects the write). Function fields keep their original identity, but mutating the object originally passed to `register()` cannot accidentally change registered action authorization, handlers, or rendered content. Register a replacement template when behavior should change.

Template interpolation uses Handlebars with `noEscape: true`. Rendered strings are plain text values, not sanitized HTML. If a frontend, email adapter, or server-rendered view inserts returned content into HTML, that renderer must HTML-escape the strings at the output boundary. The template engine intentionally does not sanitize markup because templates are trusted code and messages may be rendered in non-HTML contexts.

Compiled template strings are cached process-locally for a finite static template set. Do not generate unbounded per-request template strings; if your application needs user-defined or dynamic templates, put a bounded cache and review workflow at that application boundary before passing templates to this package.

Rendering/action separation: message content (`senderContent`/`receiverContent`) is rendered at creation time from `PrepareResult.templateData` via `interpolateMessageContent`, without evaluating action `condition` predicates. Action availability is evaluated only when actions are actually requested/executed (`getActions` for eligible active messages via `filterActions`, `handleAction` via `isActionAllowed`) against the persisted message, and action `name`/confirmation strings compile against persisted `message.payload` — not `templateData`. The two data sources are deliberately distinct (no unified interpolation-data feature); missing values in either source render as empty strings. Read-only/admin (`isAdmin`) and archived `getActions` views return the resolved `uiTemplate` with an empty action list and never invoke conditions. The public combined helper `interpolateTemplate` is preserved (content + filtered actions) with unchanged `noEscape: true` plain-text semantics.

### Action lifecycle notes

- Active messages start with `actionState: 'active'`. `handleAction()` authorizes and selects the handler against the persisted document returned by the atomic claim — not the caller-supplied copy — covering `templateCd`, `toUser`/`fromUser`, `toRoles`, and condition payload data. A stale copy authorized before a stored change cannot execute. If a **fresh attempt** is denied before its handler runs, fenced release restores `active` and clears its action code, attempt ID, owner token, claimant, claim time, lease, and failure diagnostic to `null`. A legitimate caller can then choose any currently allowed action, including a different code in a replacement template, with a new attempt ID. A denied **retry or takeover** instead becomes `retryable`, retaining the same attempt ID and action restriction because earlier execution may have had effects. If ownership changed before either release, the replacement is untouched and the denied caller still receives its authorization error. Supported update protocol: the guarantee covers state as of the atomic claim; hosts must not mutate action-relevant fields concurrently with in-flight actions outside a coordinated protocol, and a fresh read alone is not a substitute for the claim-bound check.
- Migration: a fresh post-claim denial now leaves the message `active`, without a persisted denial diagnostic or reserved action choice, rather than `retryable`. Handle the authorization error and reload current message state before choosing a valid action. Existing retryable/expired attempts remain conservative same-action retries; this change does not automatically reset older denied attempts whose execution history is unknown.
- Archived outcomes re-read the archive by the supplied record's ID on its owning connection, retaining resolver/source-connection consistency checks. They require a sender/receiver relationship with that stored record before any current attempt ID or notification state is disclosed. Unrelated callers receive `ActionNotAllowedError` (403 on HTTP) with no attempt IDs on both direct and HTTP paths, including the claim-fallback path when the active copy is gone. Authorized sender/receiver retries remain available even when the template has been unregistered. Migration: supplied archive fields no longer determine the outcome; deleted/missing archives throw `MessageNotFoundError` rather than replaying cached notification state.
- The service claims an action with an atomic conditional `findOneAndUpdate()`. Only an unclaimed active message, a retryable same-action attempt, or an expired same-action processing lease can move to `actionState: 'processing'`; competing same or different actions receive `ActionConflictError` while a live claim exists.
- The first successful claim stores a stable `actionAttemptId` on the active message and passes it to `action.runHandler(ctx)` as `ctx.actionAttemptId`. If the process dies after an external handler effect but before archival commit, a same-action retry reuses that attempt id. Handlers must use this key with external systems or their own persistence to deduplicate side effects; the service does not claim arbitrary external calls are exactly-once.
- If the handler throws before archival commit, the active message moves to `actionState: 'retryable'` with `actionFailureMessage`, and `handleAction()` throws `ActionRetryableError`. A later same-action retry may reclaim the same attempt id; different actions continue to conflict with the outstanding attempt.
- Each lease acquisition mints a distinct `actionOwnerToken` while `actionAttemptId` stays stable for external deduplication. The retryable mark, the archive commit, and the post-commit notification-state update are all conditioned on the current owner token: a worker whose lease expired and was taken over receives `ActionConflictError` and cannot change the replacement's claim, archive, or notification state. Archive commits additionally pre-check ownership before inserting and map an archive `_id` conflict to `ActionConflictError`, so exactly one acquisition commits.
- Configure `actionLeaseMs` for the workload (default `30000` ms). Expiry permits a same-action takeover; it neither cancels the handler nor automatically rejects the still-current owner's completion or failure. Without takeover, that owner can still archive successfully or report a normal retryable failure after expiry. There is no heartbeat or lease-renewal API. Fencing guards persisted state only — it cannot stop an already-running external call, so handlers must still deduplicate external effects with `ctx.actionAttemptId`.
- Migration: active records written before fencing have no `actionOwnerToken`. A same-action takeover still matches those records, keeps their attempt id, and mints a token, so no backfill is required. Archives record the committing `actionOwnerToken` alongside `actionAttemptId`.
- Archive insertion and active-message deletion run in one MongoDB session transaction using the active and archive models from the service model resolver. If either operation cannot commit, the transaction aborts and no archive-only or active-plus-archive split state is reported as success.
- Trusted host-level direct archival (`message.archive(actionCd, archivedBy, registry)`) uses the same atomicity on the document's owning connection: it re-reads persisted state inside the transaction, refuses a live in-flight service claim with `ActionConflictError` (only an explicitly expired `processing` lease or `active`/`retryable` may move), and commits archive insert plus conditional active delete together so concurrent direct archive versus service action cannot double-commit. It performs no sender/receiver, permission, or condition authorization — hosts must authorize before calling and must never expose it to untrusted callers. Invalid action/template/user input throws (`TemplateNotFoundError`/`ActionNotFoundError`, `InvalidMessageUserError`) instead of silently succeeding; repeats throw `MessageArchivedError` (archive exists) or `MessageNotFoundError`; deployments without transaction support throw `MessageTransactionRequiredError` before writing. Migration: callers relying on silent no-op success or on transaction-free standalone archival must handle the new errors and use replica-set transactions.
- When an action commits, the archive stores `actionAttemptId` and `actionNotificationState`. Actions without `senderNotification` store `none`. Actions with sender notification store `pending` in the archive transaction, then update to `sent` after post-commit delivery succeeds.
- If sender notification fails after the archive commits, the archive is updated to `failed` and `handleAction()` throws `ActionNotificationPendingError` rather than rerunning or reporting the business action as uncommitted. A retry against that archived message returns the same committed-notification-pending outcome.
- Crash recovery boundaries are explicit: before claim means another request can claim; after claim but before/during handler means the live claim conflicts until its lease expires; after handler before archive commit means retry must reuse `actionAttemptId`; during archive commit the transaction commits both archive and active delete or rolls both back; after archive commit before notification delivery leaves archived `actionNotificationState: 'pending'`.

### Action lease configuration (MSGA-08)

`MessageServiceOptions.actionLeaseMs` is an optional finite positive safe integer
in `[1, MAX_MESSAGE_SERVICE_TIMEOUT_MS]` milliseconds (`2147483647`, the shared
platform timeout ceiling). The default remains **30000 ms**, used only when omitted
or explicitly `undefined`. Zero, negative, fractional, `NaN`, infinite, `null`, other
non-number and above-ceiling values throw
`InvalidMessageServiceOptionError` at construction, before any model lookup.
`createMessageRoutes({ getModel, actionLeaseMs, ... })` forwards the same option.
With `createMessageRoutes({ service })`, configure the supplied service itself;
combining `service` and `actionLeaseMs` is rejected by strict TypeScript and at runtime.

Each fresh claim, retryable same-action retry, or expired same-action takeover
persists `actionLeaseExpiresAt = actionClaimedAt + actionLeaseMs` using wall-clock
time. Takeover is eligible at the exact expiry boundary (`<= now`); a different
action cannot replace an outstanding attempt, even after expiry or handler failure.
The attempt ID remains stable while each acquisition rotates the private owner
token. Expiry alone causes no state transition, cancellation, automatic rejection,
or renewal. A takeover fences the old owner's later completion/failure writes with
`ActionConflictError`, but running handlers and external calls may overlap.

**Migration/configuration:** omitting the option or passing `undefined` preserves
the existing 30-second policy. Explicit `null` previously defaulted silently and
now fails at construction; omit the option or use `undefined` to request the default.
No schema/index/backfill is required. The setting affects each new
acquisition only, including retries/takeovers; it does not rewrite stored deadlines.
Configure coordinating service instances consistently and keep their clocks aligned.
Choose a lease with headroom for the handler and archival transaction to reduce
overlap; a longer lease also delays recovery after process death. There is no
heartbeat/renewal mechanism or guarantee that a handler finishes before expiry.
Continue deduplicating effects by `ctx.actionAttemptId` regardless of duration.

### Action input and host-owned commands (MSGA-15)

`handleAction(..., { input })` delivers explicit submitted data as `ActionContext.input`.
The HTTP action route supplies **`input: req.body`**, with no new envelope, while
preserving the exact original `req` for handlers, notification callbacks and
extractors. Direct calls never infer input from `req.body`. Without `parseInput`,
input passes through unchanged, including undefined, null, arrays and scalars;
HTTP receives whatever the host/body-parser middleware supplies (an absent wire
body may become `{}`). No package-level command schema or deep freeze is implied.

An action can opt into `parseInput: (raw: unknown) => unknown`. It runs once per
acquisition **after atomic claim and authoritative authorization/current action
selection**, before the handler. Return a fresh normalized, allowlisted command;
treat raw input as read-only. Parsing must be synchronous, deterministic and
effect-free. **Async parsers are not supported**: Promise/thenable outputs fail
as server configuration errors, their rejections are consumed, and no handler
runs. Purity is a trusted-template contract, not a sandbox. Parsers never run for
unauthorized callers, creation, any action listing (including admin/archive),
or terminal/pending-notification archived outcomes.

- Throw root-exported `ActionInputValidationError` for invalid submitted input.
  HTTP returns 400 with fixed `invalid action input`, without diagnostic text,
  causes or attempt IDs. Unexpected parser failures return sanitized 500; direct
  callers retain the original diagnostic as `error.cause`.
- Either parser failure uses owner-fenced pre-handler release. Fresh claims
  return to `active` and clear all reservation fields, allowing corrected input
  or a different allowed action. Retry/takeover claims become `retryable` with
  their stable attempt ID/action retained: an earlier owner may have had effects.
  A lost-owner release leaves the replacement untouched and reports this caller's
  error; other release failures remain operational failures.
- Errors **inside `runHandler`**, including `ActionInputValidationError` or host
  command conflicts, keep the ordinary `ActionRetryableError` contract (HTTP 409).
  Successful actions still archive terminally (later HTTP 410 or notification-
  pending 202); there is no new package result-replay API.

`action.payload` and confirmation fields (`requireNotes`, `documents`, etc.) are
presentation hints. `message.payload` contains persisted business targets and
condition data. Neither is submitted input or an enforced validation schema.
Hosts own body-parser size limits, direct-call bounds, runtime/schema validation,
attachment access and resource-specific permissions; recheck domain grants on
retries **before returning cached business results**.

The concrete example below captures a business service in a template closure.
It requires a fresh Mongoose connection to a transaction-capable MongoDB replica
set/sharded cluster, with the package's Node/peer baseline. A unique `_id` and
insert-only upsert reserve an immutable versioned command under `actionAttemptId`.
The host transaction couples only its local business mutation and durable result;
package archival is a separate transaction. This sample also binds the actor.

```typescript
import mongoose from 'mongoose';
import {
  ActionInputValidationError,
  MessageService,
  TemplateRegistry,
  buildMessageSchema,
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  MESSAGE_MODEL_NAME,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MESSAGE_REQUEST_MODEL_NAME,
  type MessageTemplate,
} from '@web-ts-toolkit/message-service';

type RejectInput = { notes: string };
type RejectCommand = RejectInput & {
  attemptId: string;
  messageId: string;
  approvalId: string;
  actorId: string;
};

export class HostCommandConflictError extends Error {}

export function parseRejectInput(raw: unknown): RejectInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ActionInputValidationError();
  const notes = (raw as { notes?: unknown }).notes;
  if (
    Object.keys(raw).some((key) => key !== 'notes') ||
    typeof notes !== 'string' ||
    notes.length > 2000 ||
    !notes.trim()
  ) {
    throw new ActionInputValidationError();
  }
  return { notes: notes.trim() };
}

export function createRejectionWorkflow(connection: mongoose.Connection) {
  const Approval = connection.model(
    'ReviewApproval',
    new mongoose.Schema({
      reviewer: { type: String, required: true },
      state: { type: String, default: 'pending' },
      notes: { type: String, default: '' },
      effectCount: { type: Number, default: 0 },
    }),
  );
  const Command = connection.model(
    'ReviewRejectCommand',
    new mongoose.Schema({
      _id: { type: String, required: true }, // MongoDB's unique _id index
      canonical: { type: String, required: true },
      notes: { type: String, required: true },
      result: { type: mongoose.Schema.Types.Mixed, default: null },
    }),
  );

  async function reject(c: RejectCommand) {
    if (!(await Approval.exists({ _id: c.approvalId, reviewer: c.actorId })))
      throw new Error('domain permission denied');
    // Versioned, allowlisted tuple binds message, action/template, target and actor.
    const canonical = JSON.stringify([
      1,
      'approval-review-v1',
      'reject',
      c.messageId,
      c.approvalId,
      c.actorId,
      c.notes,
    ]);
    try {
      await Command.updateOne({ _id: c.attemptId }, { $setOnInsert: { canonical, notes: c.notes } }, { upsert: true });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 11000)) throw error;
      // A concurrent insert won; compare its durable original in the transaction.
    }
    return connection.transaction(async (session) => {
      // Reauthorize even cached-result reads. Only local MongoDB writes here.
      const approval = await Approval.findOne({ _id: c.approvalId, reviewer: c.actorId }).session(session).lean();
      if (!approval) throw new Error('domain permission denied');
      const stored = await Command.findById(c.attemptId).session(session).lean();
      if (!stored) throw new Error('command missing');
      if (stored.canonical !== canonical) throw new HostCommandConflictError();
      if (stored.result) return stored.result as { rejected: true; notes: string };
      if (approval.state !== 'pending') throw new Error('approval already decided');
      const changed = await Approval.updateOne(
        { _id: c.approvalId, reviewer: c.actorId, state: 'pending' },
        { $set: { state: 'rejected', notes: stored.notes }, $inc: { effectCount: 1 } },
        { session },
      );
      if (changed.matchedCount !== 1) throw new Error('approval changed');
      const result = { rejected: true as const, notes: stored.notes };
      const completed = await Command.updateOne(
        { _id: c.attemptId, canonical, result: null },
        { $set: { result } },
        { session },
      );
      if (completed.matchedCount !== 1) throw new Error('command changed');
      return result;
    });
  }

  function template(approvalId: string, reviewer: mongoose.Types.ObjectId): MessageTemplate {
    return {
      templateCd: 'approval-review-v1',
      type: 'request',
      description: 'Review a host-authorized target',
      senderContent: { title: 'Sent', long: 'Review requested', short: 'Sent' },
      receiverContent: { title: 'Review', long: 'Please review', short: 'Review' },
      uiTemplate: 'card',
      prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: reviewer, payload: { approvalId } }),
      actions: [
        {
          actionCd: 'reject',
          name: 'Reject',
          variant: 'danger',
          sender: false,
          receiver: true,
          confirmation: { title: 'Reject', message: 'Reject request?', requireNotes: true },
          parseInput: parseRejectInput,
          async runHandler({ message, user, actionAttemptId, input }) {
            if (!actionAttemptId) throw new Error('attempt missing');
            return reject({
              // Business service captured by this template closure.
              attemptId: actionAttemptId,
              messageId: String(message._id),
              approvalId: String(message.payload.approvalId), // authoritative claimed target
              actorId: String(user._id),
              notes: (input as RejectInput).notes, // this action's parser output
            });
          },
        },
      ],
    };
  }
  return { Approval, Command, reject, template };
}

// Executable local example on a fresh connection; a real host supplies its
// authorized existing approval/reviewer instead of creating this fixture target.
export async function rejectApprovalExample(connection: mongoose.Connection) {
  const Message = connection.model(MESSAGE_MODEL_NAME, buildMessageSchema());
  const Archive = connection.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
  const Request = connection.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema());
  const business = createRejectionWorkflow(connection);
  await Promise.all([
    Message.init(),
    Archive.init(),
    Request.init(),
    business.Approval.init(),
    business.Command.init(),
  ]);
  const reviewer = new mongoose.Types.ObjectId();
  const approval = await business.Approval.create({ reviewer: String(reviewer) });
  const registry = new TemplateRegistry();
  registry.register(business.template(String(approval._id), reviewer));
  const service = new MessageService({ connection, registry });
  const [message] = await service.createMessage({
    templateCd: 'approval-review-v1',
    user: { _id: new mongoose.Types.ObjectId() },
  });
  return service.handleAction(message.templateCd, 'reject', {
    message,
    user: { _id: reviewer },
    input: { notes: '  Original reason  ' }, // no req / Express dependency
  });
}
```

**First durable host reservation wins**, not the first package claim/request. If
an owner dies before reserving, a later authorized owner may reserve a different
valid command under that attempt. Once reserved, equivalent normalized input
replays the original result, including after archive failure or process restart;
changed input produces a controlled handler-entered 409 without replacing command
or result or repeating the mutation. Missing required input is invalid, never an
implicit cached-result lookup. Keep records/results for the entire retry window,
with supported versioned decoders/handlers; avoid hashing arbitrary raw request JSON.

**MSGA-15 migration:** existing `req` handlers continue to work. Move command reads
to validated `ctx.input`; reading changed `req.body` alongside it defeats stability.
The example is for a new template population. Inventory/drain existing processing/
retryable attempts or retain an explicit legacy path; recover known originals only
from trusted host records after effect reconciliation. Unknown legacy originals
need host review, not first-seen-body backfill, cleared claims or new attempt IDs.
There is no new package snapshot, schema/index migration, or legacy classification
flag. Actor changes and command schema changes require an explicit host policy.

For external effects, send the stable attempt key **and immutable original command**
to a downstream system that durably deduplicates concurrent owners and ambiguous
retries. Recording a result only after a remote call leaves a crash gap. External
calls must stay outside automatically retried MongoDB transaction callbacks; an
outbox still needs downstream deduplication or explicit reconciliation. Neither
the package nor this local example guarantees exactly-once remote execution,
cancels stale workers, or jointly commits business writes with the package archive.

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

`buildMessageSchema({ connection, emailNotifier, emailRecipientResolver, emailNotificationExclusions, onEmailDeliveryFailure, userModelName, archiveModelName })` lets you opt in to email notifications with rendered-title exclusions. When `emailNotifier` is omitted or `null` (the default), no email hook is registered and a supplied resolver is never called.

Email delivery is best-effort, not durable. The schema sends only for newly created messages after a successful non-transactional save. It deliberately skips documents saved with a Mongoose session because Mongoose save hooks run before the surrounding transaction commits; this package does not include a durable email outbox or retry worker. Hosts that need reliable transactional email should write their own outbox record in the same transaction and deliver from that outbox after commit.

Email lookup and notifier failures do not roll back a committed message. Pass `onEmailDeliveryFailure` to observe recipient lookup or notifier failures and connect them to your logger or metrics. If the observer itself throws, that secondary error is swallowed so a committed message create is not reported as failed.

Email exclusion matching uses the rendered receiver title after trim + lowercase normalization. The title passed to the notifier is trimmed but keeps its original case. Existing message updates do not resend email; change-triggered or manual resend workflows should be implemented explicitly by the host application.

The default recipient adapter resolves `userModelName` (default `'User'`) on the
hydrated message's owning connection and calls
`findById(toUser).select('email').lean()`. Register that model on the same connection
before building the schema, and pass `connection` for its eager registration check.
Runtime lookup always follows the document's connection, even if the schema was
built against another connection. A missing user or missing/empty `email` skips
delivery. To use nested addresses, preferences, or an external directory, configure
[`emailRecipientResolver`](#recipient-lookup-msga-05) instead.

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
  ActionInputValidationError,
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
  PaymentProviderRequiredError,
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
| `ActionInputValidationError`               | Pure pre-handler parser rejected this submission; fresh claims release, retry attempts retain their ID/action                                                                                                                  | 400, fixed `invalid action input`                        |
| `MessageArchivedError`                     | Mutation was requested for an archived message                                                                                                                                                                                 | 410                                                      |
| `InvalidMessageUserError`                  | Missing/invalid user identity or malformed principal roles at the service boundary                                                                                                                                             | 401                                                      |
| `InvalidClientRequestIdError`              | `clientRequestId` is not a valid bounded string                                                                                                                                                                                | 400                                                      |
| `ActionConflictError`                      | Another live action attempt owns the message                                                                                                                                                                                   | 409                                                      |
| `ActionRetryableError`                     | Handler failed before archive commit; same action may retry with the persisted `actionAttemptId`                                                                                                                               | 409                                                      |
| `ActionNotificationPendingError`           | Business action committed, but sender notification still needs reconciliation                                                                                                                                                  | 202                                                      |
| `ClientRequestPendingError`                | Duplicate create is still live; retry after completion or lease expiry                                                                                                                                                         | 409                                                      |
| `ClientRequestFailedError`                 | The scoped create operation has a recorded terminal failure; public message is stable (`…previously failed; retry with a new clientRequestId`) and never includes the recorded `failureMessage`                                | 409 with the stable message only                         |
| `ClientRequestInconsistentStateError`      | Persisted reservation/message state is corrupt                                                                                                                                                                                 | propagated as a server error                             |
| `MessageTransactionRequiredError`          | MongoDB deployment cannot provide required idempotent batch transactions                                                                                                                                                       | propagated as a server error                             |
| `InvalidPaginationValueError`              | Invalid service construction or list pagination input                                                                                                                                                                          | propagated as a server error unless handled by host code |
| `InvalidMessageServiceOptionError`         | Invalid `actionLeaseMs`/`clientRequestLeaseMs`/`clientRequestWaitMs`/`clientRequestPollMs` (non-finite, fractional, out-of-range, or timer-overflow)                                                                           | propagated as a server error unless handled by host code |
| `ActionTemplateMismatchError`              | Direct `handleAction()` template argument does not match the message                                                                                                                                                           | propagated as a server error unless handled by host code |
| `MessageModelResolutionError`              | Configured active/archive/request/user model cannot be resolved                                                                                                                                                                | propagated as a server error                             |
| `PaymentProviderRequiredError`             | A fresh item has a nonempty effective `paymentCd` but the service provider is absent/null; trusted server configuration must be corrected                                                                                      | 500, sanitized `Internal Server Error`                   |
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

#### Recipient lookup (MSGA-05)

`emailRecipientResolver?: EmailRecipientResolver` replaces the default User.email
adapter. It receives `EmailRecipientResolverContext` with:

- `recipientId`: the direct `toUser` after schema casting (ObjectId by default,
  opaque string with the [String-ID recipe](#user-id-storage-and-normalization-msga-03-migration)).
- `connection`: the hydrated message's owning Mongoose connection.
- `message`: saved fields, including `_id`, `templateCd`, `payload`, `display`, and
  rendered content. This is a shallow read-only view of the hydrated document, not
  a cloned/frozen snapshot; do not mutate it or nested data. Its type exposes no
  document methods.

The resolver can return a string synchronously or asynchronously. `null`,
`undefined`, and `''` skip delivery without a failure event or default lookup.
Nonempty addresses are forwarded unchanged: the host owns validation, normalization,
and preference decisions. A custom resolver needs **no local User model**, and
`userModelName`/its eager check are ignored. Other model registration needed for
host population or the resolver's own queries remains the host's responsibility.

For a nested contact and an opt-out preference, register the host's `Contact` model
on the message connection, then pass this resolver to `buildMessageSchema` along
with a notifier:

```typescript
import type { EmailRecipientResolver } from '@web-ts-toolkit/message-service';

export const resolveNestedEmail: EmailRecipientResolver = async ({ connection, recipientId }) => {
  const Contact = connection.model<{ contact?: { email?: string; notifications?: boolean } }>('Contact');
  const recipient = await Contact.findById(recipientId).select('contact').lean();
  return recipient?.contact?.notifications ? recipient.contact.email : null;
};
```

For an external directory, inject the host client and provider. This schema factory
registers no User model; compile it on `connection` as usual. Bind both methods if
they depend on their instance's `this`:

```typescript
import type mongoose from 'mongoose';
import {
  buildMessageSchema,
  type EmailProvider,
  type EmailRecipientResolver,
  type MessageSchemaConfig,
} from '@web-ts-toolkit/message-service';

export interface ContactDirectory {
  resolveEmail: EmailRecipientResolver;
}

export function buildDirectoryMessageSchema(
  connection: mongoose.Connection,
  directory: ContactDirectory,
  provider: EmailProvider,
  onEmailDeliveryFailure?: MessageSchemaConfig['onEmailDeliveryFailure'],
) {
  return buildMessageSchema({
    connection,
    emailRecipientResolver: directory.resolveEmail.bind(directory),
    emailNotifier: provider.sendNotification.bind(provider),
    onEmailDeliveryFailure,
  });
}
```

Resolver throws/rejections report `onEmailDeliveryFailure` stage `recipientLookup`;
notifier failures report stage `notifier`. Events retain the original `error`,
`messageId`, `recipientId`, and trimmed `title`. Both failures occur after persistence
and leave the save successful, even if the observer throws/rejects. All callbacks
are awaited, so external lookups/delivery/observers should have host timeouts.

Lookup runs only for new successful saves with a direct recipient and nonblank,
nonexcluded rendered receiver title. Role-only messages do not fan out to email.
Disabled email, excluded/blank titles, updates, and **all session-bound saves** skip
both resolver and notifier (including sessions outside transactions and committed
transactions). Idempotent creation uses transactions and therefore also skips email;
completed replay never resends. Body selection remains the longer rendered receiver
`long`/`short` value (short wins ties). For reliable transactional delivery, use a
host-owned outbox; this hook has no durable retry.

**Migration:** the resolver is optional; omitting it preserves the existing local
User.email adapter, eager registration check, timing, and failure behavior. To
replace a dummy User registration, configure a custom resolver before compiling
the Message model. Address resolution does not change party storage, population,
message recipients, or action permissions and requires no data/index migration.

### Payment Provider

#### Required sessions (MSGA-14 migration)

Every fresh prepared item with a nonempty effective `paymentCd` **must create a
session**, including messages with no direct recipient, no roles, and no fallback
roles. The effective code remains `item.paymentCd || template.paymentCd || ''`:

| Template code   | Prepared item code     | Effective code / behavior                                |
| --------------- | ---------------------- | -------------------------------------------------------- |
| Omitted or `''` | Omitted or `''`        | `''`; no provider call, null session                     |
| Nonempty `T`    | Omitted or `''`        | `T`; an empty override cannot disable the default        |
| Any             | Nonempty `I`           | `I`; item overrides the template                         |
| Any             | Whitespace-only string | Exact string; codes are not trimmed or grammar-validated |

Only trusted preparation can set an item code; a raw `payload.paymentCd` does not
override it unless preparation explicitly maps it. One session is requested per
paid item, not per recipient. The payer is `(payerUser || user)._id`, independently
of prepared `fromUser`/`toUser`/roles; HTTP uses the authenticated user as payer.
Only that item's `priceArgs` is forwarded.

| Provider                                                     | Nonempty effective code, with any recipients or none                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Omitted/undefined or `null`                                  | `PaymentProviderRequiredError` before this item's write; HTTP 500 with sanitized `Internal Server Error`   |
| `NoopPaymentProvider`, or any provider returning `null`/`''` | Existing `Error('payment session creation failed')`; no item write                                         |
| Provider rejects/throws                                      | Original rejection propagates, unless compensation itself fails; existing route error mappings still apply |
| Provider returns a nonempty session ID                       | Store that session if persistence succeeds                                                                 |

The provider remains optional for code-free items, which skip it even if it would
throw. `NoopPaymentProvider` cannot satisfy a paid code and is not an implicit
default. A paid template that prepares `null` or `[]` has no items to pay for.

Checks run per fresh item after completed replay selection. Direct batches persist
sequentially: a later configuration/provider failure stops the batch and retains
the already-committed prefix and its sessions. Idempotent batches commit all items
and reservation completion atomically; on failure every known uncommitted session
is compensated. Sessions are created outside retryable transaction callbacks.
A failed reservation remains failed after provider configuration is repaired;
same-key retries return `ClientRequestFailedError` (HTTP 409). Reconcile retained
items/provider effects before starting a new operation with a new key.

Completed same-scope replays return current active/archive records in item order,
including legacy nonempty-code/null-session records, without preparation or payment
work. They remain valid with absent/null/no-op/throwing providers and after template
replacement/removal or payload/payer changes. Principal/payer validation still runs.

**Migration:** fresh code-bearing items that previously committed sessionless with
an absent/null provider now fail; configured providers also run for unaddressed
items that previously skipped them. Configure a real provider when checkout is
intended. Move metadata-only codes into `payload` or `display` and remove their
template/item `paymentCd`. For mixed free/paid items, omit a template default and
assign per-item paid codes; `''` cannot clear a paid default. Audit existing
nonempty-code/null-session active/archive records using host business knowledge.
No schema, index, request-scope, or automatic data migration is needed: do not
automatically backfill sessions, charge, rewrite legacy codes, invalidate completed
reservations, or reinterpret existing actions. Nullable session types remain valid
for code-free and legacy records.

Session creation is not proof of payment. Completion, capture, refunds/webhooks,
and payment-based business authorization remain host/provider responsibilities.

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
