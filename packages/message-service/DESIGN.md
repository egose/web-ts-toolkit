# Design Philosophy

## Core Idea

Every application that manages users, organizations, or workflows needs a way to send messages — approvals, notifications, requests, reminders. Most teams bolt this onto their app with ad-hoc logic scattered across controllers and models.

`@web-ts-toolkit/message-service` takes a different approach: **messages are first-class entities driven by templates**. The package provides the plumbing; you provide the business logic.

## How It Works

A **message** is a record of communication between two parties (sender and receiver). It has:

- Rendered content (title, long body, short summary) for both sides
- A set of available **actions** (approve, reject, revoke, etc.)
- Optional payment and document attachments
- A lifecycle: created → acted upon → archived

A **template** defines what a message type looks like and what can be done with it. It specifies:

- How to render the content (using Handlebars)
- What actions are available and who can perform them
- What happens when an action is taken (`runHandler`)
- Whether payment is required

The package doesn't know about memberships, permits, or volunteer experience. It knows about the pattern: someone sends a request, someone else reviews it, an action is taken, the message is archived.

## Separation of Concerns

```
┌─────────────────────────────────────────────────────┐
│  Your Application                                    │
│                                                     │
│  Templates (business logic)                         │
│  ├── membership-request.ts                          │
│  ├── permit-renewal.ts                              │
│  └── volunteer-experience-request.ts                │
│                                                     │
│  Providers (integrations)                           │
│  ├── SendGridEmailProvider                          │
│  └── StripePaymentProvider                          │
├─────────────────────────────────────────────────────┤
│  @web-ts-toolkit/message-service                       │
│                                                     │
│  Schemas (Message, MessageArchive)                  │
│  Template Engine (Handlebars interpolation)         │
│  Template Registry (lookup by templateCd)           │
│  Message Service (create, actions, archive)         │
│  Route Factory (standalone Express routes)               │
│  Provider Interfaces (email, payment)               │
└─────────────────────────────────────────────────────┘
```

The package handles the **what** and **when**. Your templates handle the **how** and **why**.

## Key Decisions

### Templates are code, not config

Each template is a TypeScript module with a `prepareMessage()` function and an `actions` array. This means:

- Full type safety and IDE support
- Complex business logic in handlers (database updates, side effects, conditional flows)
- No DSL to learn — just functions and objects

### Actions are the primary interaction model

Users don't "update messages." They **approve**, **reject**, **revoke**, or perform other domain-specific actions. Each action:

1. Validates permissions (sender vs. receiver, role-based)
2. Runs a handler (your business logic)
3. Archives the message (moves it from active to history)
4. Optionally notifies the sender

This makes the message system **event-sourced** — the archive is a log of what happened.

### Providers are interfaces, not implementations

The package defines `EmailProvider` and `PaymentProvider` interfaces. You implement them for your stack (SendGrid, Stripe, etc.) or use the no-op defaults. This keeps the core free of third-party dependencies.

### Routes are standalone

The route factory provides `createMessageRoutes` — a plain Express router with no ACL dependency. Mount it with your own auth middleware, or ignore it entirely and use `MessageService` directly to build your own routes.

## Message Lifecycle

```
User submits request
        │
        ▼
  template.prepareMessage()
        │
        ▼
  Message created (type: 'request')
        │
        ├── Sender sees their request
        ├── Receiver sees the request with actions
        │
  Receiver clicks "Approve"
        │
        ▼
  action.runHandler() executes
        │
        ▼
  Message → MessageArchive (actionCd: 'approved')
        │
        ▼
  Sender notification (optional)
```

## What the Package Does NOT Do

- **No UI components** — the package is backend-only. Render messages however you like.
- **No email templates** — it calls your `EmailProvider` with title + body. Handle email formatting in your provider.
- **No payment processing** — it calls your `PaymentProvider` to create/expire/refund sessions. Implement the Stripe integration yourself.
- **No business logic** — templates contain the logic. The package just orchestrates.

## Extending

Adding a new message type is straightforward:

1. Define a template with `templateCd`, content, `prepareMessage()`, and `actions`
2. Register it with the template registry
3. Call `POST /api/messages/new/:templateCd` to create messages
4. The frontend renders based on `uiTemplate` and action buttons

No schema changes, no migrations, no new routes. The template is the entire definition.
