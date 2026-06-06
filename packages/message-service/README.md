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
- **Template engine** — Handlebars interpolation for sender/receiver content
- **Template registry** — register and lookup templates by `templateCd`
- **Action system** — validate permissions, run handlers, archive messages, send notifications
- **Route factory** — standalone Express routes for template-based creation and action handling
- **Pluggable providers** — email and payment providers are interfaces, not hard dependencies

## Quick Start

```typescript
import mongoose from 'mongoose';
import { createMessageRoutes, MessageTemplate, setEmailNotifier } from '@web-ts-toolkit/message-service';

await mongoose.connect('mongodb://localhost/mydb');

const { router, service } = createMessageRoutes({
  getModel: mongoose.model.bind(mongoose),
});

service.registerTemplate(myTemplate);
app.use('/api/messages', myAuthMiddleware, router);
```

## API

### `createMessageRoutes(options)`

Creates a standalone Express router with message template routes.

| Option            | Type                      | Description                            |
| ----------------- | ------------------------- | -------------------------------------- |
| `getModel`        | `(name: string) => Model` | Mongoose model getter                  |
| `emailProvider`   | `EmailProvider`           | Optional email provider                |
| `paymentProvider` | `PaymentProvider`         | Optional payment provider              |
| `adminRoles`      | `string[]`                | Roles that receive messages by default |
| `authMiddleware`  | `any[]`                   | Custom auth middleware                 |

Returns `{ router, service }`.

Routes:

- `POST /new/:templateCd` — create message from template
- `GET /:id/actions/:usertype` — get available actions
- `GET /:id/action/:actionCd` — execute action (GET)
- `POST /:id/action/:actionCd` — execute action (POST)

### `MessageService`

Core service for creating messages, getting actions, and handling actions.

- `createMessage(params)` — create from template
- `createNotification(params)` — create generic notification
- `getActions(messageId, usertype, options)` — get available actions
- `handleAction(templateCd, actionCd, data)` — execute an action

### `TemplateRegistry`

In-memory registry for message templates.

- `register(template)` — register a template
- `find(templateCd)` — find by code
- `has(templateCd)` — check existence
- `getAll()` — get all templates

### `setEmailNotifier(notifier)`

Set a global email notifier function. Called on every message save (with exclusions).

### `setEmailExclusions(exclusions)`

Set titles that should not trigger email notifications.

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

## License

MIT
