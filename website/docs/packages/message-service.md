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
- `filterActions(...)`
- `isActionAllowed(...)`

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
} from '@web-ts-toolkit/message-service';

const app = express();
const myAuthMiddleware: express.RequestHandler = (_req, _res, next) => next();

await mongoose.connect('mongodb://localhost/mydb');

mongoose.model(MESSAGE_MODEL_NAME, buildMessageSchema());
mongoose.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
mongoose.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema());

const welcomeTemplate: MessageTemplate = {
  templateCd: 'welcome',
  senderContent: {
    title: 'Welcome {{name}}',
  },
  receiverContent: {
    title: 'Welcome {{name}}',
  },
  prepare: async ({ payload }) => ({
    payload,
  }),
};

defaultRegistry.register(welcomeTemplate);

const { router, service } = createMessageRoutes({
  getModel: mongoose.model.bind(mongoose),
});

app.use('/api/messages', myAuthMiddleware, router);
```

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

Mounted routes:

- `POST /new/:templateCd`
- `GET /:id/actions/:usertype`
- `GET /:id/action/:actionCd`
- `POST /:id/action/:actionCd`

The route factory uses `@web-ts-toolkit/express-json-router`, so typed message-service errors become normal HTTP responses without extra controller wiring.

### Route-factory example with custom request extraction

```ts
import type express from 'express';

const requireAuth: express.RequestHandler = (_req, _res, next) => next();
type RequestWithAuth = express.Request & {
  user?: unknown;
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

app.use('/api/messages', router);
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

When `clientRequestId` is present and `MessageRequest` is registered, duplicate retries reuse the original in-flight or completed result instead of producing duplicate side effects.

## `MessageService`

Use `MessageService` directly when you want the message workflow without the route factory.

Common methods:

- `createMessage(params)`
- `createNotification(params)`
- `listMessages({ user, limit?, skip?, populate? })`
- `countMessages(user)`
- `findMessage(id, options?)`
- `findMessageOrThrow(id, options?)`
- `getActions(id, usertype, options?)`
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
  fromUser: { _id: 'system', name: 'System' },
  toUser: { _id: 'user_123', name: 'Ada' },
  receiverContent: {
    title: 'Deployment finished',
    body: 'Your deployment completed successfully.',
  },
});
```

### Direct template-action example

```ts
const message = await service.findMessageOrThrow('message_123');

await service.handleAction('welcome', 'acknowledge', {
  message,
  user: { _id: 'user_123', name: 'Ada' },
  permissions: { 'message.ack': true },
});
```

## Template Registry

`TemplateRegistry` is the in-memory registry for message templates.

```ts
const registry = new TemplateRegistry();

registry.register(template);
registry.find('welcome');
registry.has('welcome');
registry.getAll();
registry.unregister('welcome');
registry.clear();
```

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
- the winner reserves the idempotency key before template preparation or payment-session creation runs
- later duplicate requests return the same outcome instead of causing duplicate side effects

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
import type { PaymentProvider } from '@web-ts-toolkit/message-service';

async function createCheckoutSession(user: unknown, code: string, priceArgs: unknown): Promise<string> {
  void { user, code, priceArgs };
  return 'session_123';
}

async function expireCheckoutSession(sessionId: string): Promise<void> {
  void sessionId;
}

async function refundCheckoutSession(sessionId: string): Promise<void> {
  void sessionId;
}

class StripePaymentProvider implements PaymentProvider {
  async createSession(user, code, priceArgs) {
    return await createCheckoutSession(user, code, priceArgs);
  }

  async expireSession(sessionId) {
    await expireCheckoutSession(sessionId);
  }

  async refundPayment(sessionId) {
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
