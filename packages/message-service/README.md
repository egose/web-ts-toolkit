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
- **Idempotent create** — `clientRequestId` for double-submit protection
- **Typed errors** — `TemplateNotFoundError`, `ActionNotFoundError`, `ActionNotAllowedError`, `MessageNotFoundError`

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
  MessageTemplate,
} from '@web-ts-toolkit/message-service';

const app = express();
const myAuthMiddleware: express.RequestHandler = (_req, _res, next) => next();

await mongoose.connect('mongodb://localhost/mydb');

mongoose.model(MESSAGE_MODEL_NAME, buildMessageSchema());
mongoose.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
mongoose.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema());

const myTemplate: MessageTemplate = {
  /* ... */
};
defaultRegistry.register(myTemplate);

const { router, service } = createMessageRoutes({
  getModel: mongoose.model.bind(mongoose),
});

app.use('/api/messages', myAuthMiddleware, router);
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

Creates a standalone Express router with message template routes. Returns `{ router, service }`.

| Option               | Type                                | Description                                                                |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `getModel`           | `(name: string) => Model`           | Mongoose model getter                                                      |
| `paymentProvider`    | `PaymentProvider`                   | Optional payment provider (enables payment session handling)               |
| `adminRoles`         | `string[]`                          | Roles that receive messages when no `toUser`/`toRoles` is specified        |
| `registry`           | `TemplateRegistry`                  | Custom template registry (default: `defaultRegistry`)                      |
| `authMiddleware`     | `((req, res, next) => void)[]`      | Custom auth middleware applied to all routes                               |
| `getUser`            | `(req) => MessageUser \| undefined` | Extract user from request (default: `req._user \|\| req.user`)             |
| `getPermissions`     | `(req) => Record<string, boolean>`  | Extract permissions (default: `req._permissions \|\| {}`)                  |
| `getIdentity`        | `(req) => Record<string, unknown>`  | Extract identity (default: `req._identity \|\| {}`)                        |
| `adminPermissionKey` | `string`                            | Permission key for admin read-only view of actions (default: `'is.admin'`) |

Routes:

- `POST /new/:templateCd` — create message from template. Body: `{ ...payload, clientRequestId? }`
- `GET  /:id/actions/:usertype` — get available actions (`usertype` is `sender` or `receiver`)
- `GET  /:id/action/:actionCd` — execute action (GET)
- `POST /:id/action/:actionCd` — execute action (POST)

### `MessageService`

Core service for creating messages, getting actions, and handling actions. Constructed by `createMessageRoutes`, or directly:

```typescript
import { MessageService, TemplateRegistry } from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
const service = new MessageService({
  getModel: mongoose.model.bind(mongoose),
  paymentProvider: stripe,
  adminRoles: ['superadmin'],
  registry,
});
```

Methods:

- `createMessage(params)` — create from template. Supports `clientRequestId` for idempotency.
- `createNotification(params)` — create a generic (action-less) notification. Accepts `fromUser`, `toUser`, `toRoles`, `receiverContent`, `senderContent`, `documents`.
- `listMessages({ user, limit?, skip?, populate? })` — list messages visible to a user.
- `countMessages(user)` — count messages visible to a user.
- `findMessage(id, { populate?, select? })` — find a message by id (active or archive).
- `findMessageOrThrow(id, { populate?, select? })` — same as `findMessage`, but throws `MessageNotFoundError`.
- `getActions(id, usertype, { permissions?, isAdmin?, populate? })` — get available actions.
- `handleAction(templateCd, actionCd, { message, user, permissions? })` — execute an action.
- `buildVisibilityFilter(user)` — get the Mongoose filter for messages visible to a user.

### `TemplateRegistry`

In-memory registry for message templates.

```typescript
const registry = new TemplateRegistry();
registry.register(template);
registry.find('template-cd');
registry.has('template-cd');
registry.getAll();
registry.unregister('template-cd');
registry.clear();
```

`defaultRegistry` is a global instance for simple cases.

`includesAction(templateCd, actionCd, registry)` requires the registry explicitly so archive behavior never falls back to unrelated global state.

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

`buildMessageSchema({ emailNotifier, emailNotificationExclusions, userModelName, archiveModelName })` lets you opt in to email notifications with per-template exclusions. When `emailNotifier` is `null` (the default), no pre-save hook is registered.

When you use `clientRequestId`, register all three models. `MessageRequest` stores the reservation record that prevents duplicate side effects during concurrent duplicate requests.

### Idempotent create notes

- `clientRequestId` is safe for concurrent retries only when `MessageRequest` is registered.
- The winning request reserves the idempotency key before template preparation or payment-session creation runs.
- Losing requests wait for the winning request to finish, then return the same created messages or the same empty result.

### Typed errors

```typescript
import {
  MessageNotFoundError,
  TemplateNotFoundError,
  ActionNotFoundError,
  ActionNotAllowedError,
} from '@web-ts-toolkit/message-service';
```

The route factory translates these to 404/400/403 HTTP responses via `@web-ts-toolkit/express-json-router`. Direct `MessageService` callers can `instanceof` them, and `findMessageOrThrow()` raises `MessageNotFoundError` directly.

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

Pass it to `buildMessageSchema({ emailNotifier: provider.sendNotification.bind(provider) })`.

### Payment Provider

```typescript
import { PaymentProvider } from '@web-ts-toolkit/message-service';

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

Pass it to `MessageService({ paymentProvider })` or `createMessageRoutes({ paymentProvider })`.

## License

MIT
