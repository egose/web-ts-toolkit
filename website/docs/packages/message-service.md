---
sidebar_label: Message Service
sidebar_position: 15
---

# `@web-ts-toolkit/message-service`

Template-driven messaging service for Mongoose + Express applications.

This package combines:

- Mongoose schemas for active, archived, and idempotent-request records
- a template registry and interpolation engine
- a direct `MessageService` API
- a route factory for mounting message endpoints in Express
- pluggable email and payment provider interfaces

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/message-service mongoose express
```

Peer dependencies:

- `mongoose >= 8`
- `express >= 5`

## What It Exposes

Schema exports:

- `buildMessageSchema(config?)`
- `buildMessageArchiveSchema()`
- `buildMessageRequestSchema()`
- model-name constants such as `MESSAGE_MODEL_NAME`, `MESSAGE_ARCHIVE_MODEL_NAME`, and `MESSAGE_REQUEST_MODEL_NAME`

Template and registry exports:

- `TemplateRegistry`
- `defaultRegistry`
- `interpolateTemplate(...)`
- `interpolateMessageContent(...)`
- `resolveUiTemplate(...)`
- `filterActions(...)`
- `isActionAllowed(...)`
- `hasExplicitPermissionGrant(...)`

Service and route exports:

- `MessageService`
- `createMessageRoutes(options)`

Provider exports:

- `EmailProvider`, `NoopEmailProvider`
- `PaymentProvider`, `NoopPaymentProvider`

Typed errors:

- `TemplateNotFoundError`
- `ActionNotFoundError`
- `ActionNotAllowedError`
- `MessageNotFoundError`
- `MessageArchivedError`
- `InvalidClientRequestIdError`

## Quick Start

```ts
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

const welcomeTemplate: MessageTemplate = {
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
    // Content renders from `templateData`, not `payload`.
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

defaultRegistry.register(welcomeTemplate);

const { router, service } = createMessageRoutes({
  getModel: mongoose.model.bind(mongoose),
});

app.use('/api/messages', myAuthMiddleware, router.original);
```

Prerequisites: Node `>=22`, `mongoose >= 8`, `express >= 5`. Use a MongoDB
replica set (or sharded cluster) when you use `clientRequestId` idempotency or
transactional archival; standalone servers throw
`MessageTransactionRequiredError`. Every route requires a resolved user with a
valid `_id` (non-empty string or `ObjectId`) and returns `401` before any
service, template, payment, model, or action effect otherwise.

`createMessageRoutes(...)` returns both the mounted router and the underlying `MessageService` instance.

This is the shortest path when you want a working message API quickly and still want direct access to the underlying service for app-specific workflows.

## Route Factory

`createMessageRoutes(options)` creates a standalone Express router with template-based message routes.

Important options:

- `getModel`
- `paymentProvider`
- `adminRoles`
- `registry`
- `authMiddleware`
- `getUser`
- `getPermissions`
- `getIdentity`
- `adminPermissionKey`

Mounted routes (action mutation is POST-only):

- `POST /new/:templateCd`
- `GET /:id/actions/:usertype`
- `POST /:id/action/:actionCd`

The route factory uses `@web-ts-toolkit/express-json-router`, so typed message-service errors become normal HTTP responses without extra controller wiring.

### Route-factory example with custom request extraction

```ts
import type express from 'express';
import type { MessageUser } from '@web-ts-toolkit/message-service';

const requireAuth: express.RequestHandler = (req, res, next) => {
  const user = (req as express.Request & { user?: MessageUser }).user;
  if (!user || typeof user._id !== 'string' || user._id.trim() === '') {
    res.status(401).json({ message: 'authentication required' });
    return;
  }
  next();
};
type RequestWithAuth = express.Request & {
  user?: MessageUser;
  permissions?: Record<string, boolean>;
};

const { router } = createMessageRoutes({
  getModel: mongoose.model.bind(mongoose),
  authMiddleware: [requireAuth],
  getUser(req) {
    return (req as RequestWithAuth).user;
  },
  getPermissions(req) {
    return (req as RequestWithAuth).permissions ?? {};
  },
  getIdentity(req) {
    return {
      tenantId: req.headers['x-tenant-id'],
    };
  },
});

app.use('/api/messages', router.original);
```

### Create-from-template request example

```ts
await fetch('/api/messages/new/welcome', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'Ada',
    clientRequestId: 'req_123',
  }),
});
```

When `clientRequestId` is present and `MessageRequest` is registered, duplicate retries in the same requester/template scope reuse the original in-flight or completed result instead of producing duplicate side effects.

## `MessageService`

Use `MessageService` directly when you want the message workflow without the route factory.

Common methods:

- `createMessage(params)` — returns `Array<IMessage | IMessageArchive>`; `user`
  (and `payerUser` when provided) must carry a valid principal id.
- `createNotification(params)` — trusted host-level creation with raw `UserId`
  values; performs no principal validation.
- `listMessages({ user, limit?, skip?, populate? })`
- `countMessages(user)`
- `findMessage(id, options?)` / `findMessageOrThrow(id, options?)` — trusted
  host-level lookup across active and archive; no principal validation.
- `getActions(messageId, usertype, { user, permissions?, isAdmin?, message?, populate? })` — `user` is required.
- `handleAction(templateCd, actionCd, options)`
- `buildVisibilityFilter(user)`

Example:

```ts
import { MessageService, TemplateRegistry } from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
registry.register(welcomeTemplate);

const service = new MessageService({
  getModel: mongoose.model.bind(mongoose),
  registry,
});
```

### Direct notification example

```ts
await service.createNotification({
  fromUser: 'system',
  toUser: 'user_123',
  receiverContent: {
    title: 'Deployment finished',
    long: 'Your deployment completed successfully.',
    short: 'Deployment done',
  },
});
```

### Direct template-action example

```ts
const message = await service.findMessageOrThrow('message_123');

await service.handleAction('welcome.request', 'approve', {
  message,
  user: { _id: 'user_123', roles: ['reviewer'] },
  permissions: { 'message.ack': true },
});
```

## Template Registry

`TemplateRegistry` is the in-memory registry for message templates.

```ts
const registry = new TemplateRegistry();

registry.register(template);
const found: RegisteredMessageTemplate | undefined = registry.find('welcome.request');
registry.has('welcome.request');
const all: RegisteredMessageTemplate[] = registry.getAll();
registry.unregister('welcome.request');
registry.clear();
```

Registration takes a mutable `MessageTemplate`; `find()`/`getAll()` return
readonly `RegisteredMessageTemplate` views matching the frozen snapshot depth.

`defaultRegistry` is a shared global instance for simpler applications.

Prefer a dedicated `TemplateRegistry` instance when different apps, tenants, or tests should not share template definitions through process-global state.

## Schema Factories

Register all three schemas when you want full message-service behavior, especially idempotent create flows:

```ts
import {
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  buildMessageSchema,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MESSAGE_MODEL_NAME,
  MESSAGE_REQUEST_MODEL_NAME,
} from '@web-ts-toolkit/message-service';

mongoose.model(MESSAGE_MODEL_NAME, buildMessageSchema());
mongoose.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
mongoose.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema());
```

Why the third schema matters:

- `clientRequestId` is only safe for concurrent retries when `MessageRequest` is registered
- the service trims surrounding whitespace, preserves case, and rejects non-string, empty, whitespace-only, or over-128-character IDs
- the idempotency key is scoped to the trimmed `clientRequestId`, `String(user._id)`, and `templateCd`
- the winner reserves the scoped idempotency key before template preparation or payment-session creation runs
- later duplicate requests in the same scope return the same outcome instead of causing duplicate side effects
- reusing the same ID from another requester or another template creates a separate batch and cannot return the first scope's messages

Migration note: scoped idempotency adds `clientRequestOwnerId` to message and reservation records. Replace any old global unique index on `clientRequestId` with the compound scoped indexes declared by `buildMessageSchema()` and `buildMessageRequestSchema()`.

### Schema config example

```ts
const Message = mongoose.model(
  MESSAGE_MODEL_NAME,
  buildMessageSchema({
    userModelName: 'User',
    archiveModelName: MESSAGE_ARCHIVE_MODEL_NAME,
    emailNotificationExclusions: ['silent-template'],
  }),
);
```

## Providers

Email and payment integrations are interfaces, not hard dependencies.

### Email provider

```ts
import type { EmailProvider } from '@web-ts-toolkit/message-service';

async function sendWithProvider(to: string, subject: string, text: string): Promise<void> {
  void { to, subject, text };
}

class SendGridEmailProvider implements EmailProvider {
  async sendNotification(to: string, title: string, body: string) {
    await sendWithProvider(to, title, body);
  }
}
```

Use the provider with `buildMessageSchema({ emailNotifier })` when you want schema-level notification hooks.

### Payment provider

```ts
import type { PaymentProvider, UserId } from '@web-ts-toolkit/message-service';

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

Pass it to `createMessageRoutes({ paymentProvider })` or `new MessageService({ paymentProvider })`.

## Typed Errors

```ts
import {
  ActionNotAllowedError,
  ActionNotFoundError,
  InvalidClientRequestIdError,
  MessageNotFoundError,
  TemplateNotFoundError,
} from '@web-ts-toolkit/message-service';
```

These are useful both in route handlers and in direct service usage with `instanceof` checks.

```ts
try {
  await service.findMessageOrThrow('missing-id');
} catch (error) {
  if (error instanceof MessageNotFoundError) {
    console.error('message not found');
  }
}
```

## When To Use It

Use `@web-ts-toolkit/message-service` when you want:

- template-based notification and action workflows
- Mongoose-backed persistence for active and archived messages
- an Express router you can mount quickly, with a direct service API underneath
- idempotent create flows and pluggable provider integration

If your app only needs a thin email wrapper or a one-off notification table, this package may be broader than you need.
