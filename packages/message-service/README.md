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

- **Message & MessageArchive schemas** — drop-in Mongoose schemas with timestamps, indexes, and archiving
- **Schema factories** — `buildMessageSchema(config?)` and `buildMessageArchiveSchema()` for per-app configuration
- **Template engine** — Handlebars interpolation for sender/receiver content
- **Template registry** — register and lookup templates by `templateCd` (per-instance or global)
- **Action system** — validate permissions, run handlers, archive messages, send notifications
- **Route factory** — standalone Express routes for template-based creation and action handling
- **Pluggable providers** — email and payment providers are interfaces, not hard dependencies
- **Idempotent create** — `clientRequestId` for double-submit protection
- **Typed errors** — `TemplateNotFoundError`, `ActionNotFoundError`, `ActionNotAllowedError`, `MessageNotFoundError`

## Quick Start

```typescript
import mongoose from 'mongoose';
import { createMessageRoutes, defaultRegistry, MessageTemplate } from '@web-ts-toolkit/message-service';

await mongoose.connect('mongodb://localhost/mydb');

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
import { buildMessageSchema, buildMessageArchiveSchema, MESSAGE_MODEL_NAME } from '@web-ts-toolkit/message-service';

const Message = mongoose.model(MESSAGE_MODEL_NAME, buildMessageSchema());
const MessageArchive = mongoose.model('MessageArchive', buildMessageArchiveSchema());
```

`buildMessageSchema({ emailNotifier, emailNotificationExclusions, userModelName, archiveModelName })` lets you opt in to email notifications with per-template exclusions. When `emailNotifier` is `null` (the default), no pre-save hook is registered.

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

class SendGridEmailProvider implements EmailProvider {
  async sendNotification(to: string, title: string, body: string) {
    await sgMail.send({ to, from: 'noreply@example.com', subject: title, text: body });
  }
}
```

Pass it to `buildMessageSchema({ emailNotifier: provider.sendNotification.bind(provider) })`.

### Payment Provider

```typescript
import { PaymentProvider } from '@web-ts-toolkit/message-service';

class StripePaymentProvider implements PaymentProvider {
  async createSession(user, code, priceArgs) {
    const session = await stripe.checkout.sessions.create({
      /* ... */
    });
    return session.id;
  }
  async expireSession(sessionId) {
    await stripe.checkout.sessions.expire(sessionId);
  }
  async refundPayment(sessionId) {
    await stripe.refunds.create({ payment_intent: sessionId });
  }
}
```

Pass it to `MessageService({ paymentProvider })` or `createMessageRoutes({ paymentProvider })`.

## License

MIT
