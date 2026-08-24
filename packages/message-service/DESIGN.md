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

Templates are trusted application code. The service does not accept caller-supplied template source, and template functions run with the host application's authority. Registering a template validates duplicate/ambiguous action metadata, then stores a frozen shallow snapshot of content and action structure so later accidental object mutation cannot change registered authorization, default-action selection, handlers, or rendered content. Function fields keep their identity; replacing behavior requires registering a replacement template.

Handlebars interpolation uses `noEscape: true` because rendered message fields are plain text values. The package does not sanitize or HTML-escape those values. Any HTML renderer, email formatter that emits HTML, or frontend component that inserts markup must escape at its own output boundary. The compiled-template cache is intentionally process-local and static: it is appropriate for a finite set of application template strings, not unbounded per-request dynamic template generation.

### Actions are the primary interaction model

Users don't "update messages." They **approve**, **reject**, **revoke**, or perform other domain-specific actions. Each action:

1. Validates permissions (sender vs. receiver, role-based)
2. Atomically claims the active message for one action attempt
3. Runs a handler (your business logic)
4. Archives the message in the same transaction that deletes the active copy
5. Optionally notifies the sender after the archive commit

This makes the archive an audit/history collection for committed state transitions. It is not a general event store, and external action handlers must still provide their own idempotency when they call external systems.

### Action attempts are durable but not exactly-once external effects

`handleAction()` uses an active-message lifecycle of `active`, `processing`, and `retryable`, followed by the terminal archived state in `MessageArchive`. The claim is an atomic conditional update, so only one caller can win for a message even if two different actions race. The winner receives a persisted `actionAttemptId` in `ActionContext`; handlers must pass that key to external systems or store it with their own business writes to deduplicate retries.

If a process dies before the handler, the processing lease eventually expires and a same-action retry can reclaim the attempt. If it dies after the handler but before archival commit, the same attempt id is reused so handler side effects can be deduplicated. Archive insertion and active deletion are one MongoDB transaction. After commit, sender notification is explicitly post-commit: failure changes the archive notification state to `failed` and surfaces `ActionNotificationPendingError` instead of pretending the business action did not commit.

### Providers are interfaces, not implementations

The package defines `EmailProvider` and `PaymentProvider` interfaces. You implement them for your stack (SendGrid, Stripe, etc.) or use the no-op defaults. This keeps the core free of third-party dependencies.

Message email notifications configured through `buildMessageSchema({ emailNotifier })` are best-effort post-save delivery for newly created non-transactional messages only. The hook skips session-bound writes because Mongoose hooks run before transaction commit, and the package does not claim a durable email outbox or reliable retry worker. Recipient lookup and notifier failures are surfaced through `onEmailDeliveryFailure` for host logging or metrics without rolling back the committed message. Existing message updates do not resend email.

### Idempotency belongs to the requester and template

Template creation can accept a caller-supplied `clientRequestId` for retry safety. The service trims surrounding whitespace, preserves case, rejects empty/non-string/oversized values, and stores the immutable scope on both the reservation and created messages. The scope is `{ clientRequestId, requester identity, templateCd }`; tenant or application namespaces are not inferred. Hosts that need tenant-level idempotency isolation must supply that as an explicit future contract rather than relying on roles, headers, or recipients.

Reservations have one explicit state machine: `pending` while a lease owner prepares work, `completed` after the full batch and `itemCount` commit atomically, and `failed` after creation fails. Replays are allowed only from `completed` reservations whose messages contain exactly the expected distinct item indexes. Pending reservations have bounded waits and an expiring lease so a crashed owner does not block retries indefinitely.

Idempotent batch creation uses MongoDB sessions/transactions to commit all message items and the reservation completion together. Hosts that enable `clientRequestId` in production must use a replica set or sharded cluster; standalone MongoDB cannot provide this contract and fails clearly. Deployments upgrading from a global `clientRequestId` index must replace it with the compound scoped indexes declared by `buildMessageSchema()` and `buildMessageRequestSchema()`, including `clientRequestOwnerId`.

Payment sessions are external side effects created before the message commit point. If a message write fails or an idempotent batch transaction does not commit, the service compensates by calling the provider's idempotent `expireSession()` for each newly created uncommitted session. Compensation failure is not hidden: `onPaymentCompensationFailure` receives the session, scope, original error, and cleanup error, and the create call fails with `PaymentSessionCompensationError`. A completed same-scope retry replays the committed messages and does not create replacement sessions.

### Routes are standalone

The route factory provides `createMessageRoutes` — a plain Express router with no ACL dependency. Mount it with your own auth middleware, or ignore it entirely and use `MessageService` directly to build your own routes.

### Listing is offset-based and bounded

`listMessages()` keeps the public `skip` + `limit` contract for compatibility, but validates pagination inputs as finite integers so malformed values cannot become an unbounded MongoDB `limit(0)` query. Constructor defaults must be positive finite integers with `defaultListLimit <= maxListLimit`; request `limit <= 0` is normalized to 1, high limits are clamped to the max, and negative `skip` is normalized to 0. Results sort by `{ createdAt: -1, _id: -1 }` to keep pages deterministic when timestamps tie.

The visibility filter has three branches: sender (`fromUser`), direct recipient (`toUser`), and role recipient (`toRoles`). The active message schema declares matching compound indexes with `{ createdAt: -1, _id: -1 }` suffixes so representative branch queries can satisfy filtering and ordering through indexes. Very large offsets remain inherently expensive because MongoDB must advance over skipped matches; applications with large inboxes should build cursor pagination on top of `buildVisibilityFilter(user)` and the same stable sort.

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
  action claim stored (actionAttemptId)
        │
        ▼
  action.runHandler(ctx.actionAttemptId) executes
        │
        ▼
  Message → MessageArchive (transactional archive + active delete)
        │
        ▼
  Sender notification (optional, post-commit)
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
