# Org Access Example Backend

Express + MongoDB-memory example for a multi-tenant organization and role hierarchy app built on `@web-ts-toolkit/access-router`.

## Run

```bash
pnpm install
pnpm --filter org-access-nodejs-example dev
```

The API starts on `http://localhost:8000` and uses a single-member, WiredTiger
`MongoMemoryReplSet` from `mongodb-memory-server`, so no local MongoDB install is
required. This disposable development database supports the transactions needed
for message creation and action archival. SIGINT/SIGTERM drain HTTP requests,
disconnect Mongoose, then stop the replica set. Startup failures also clean up
the database; replica-set shutdown is attempted even if disconnect fails.

Demo users seeded on startup:

- `owner@example.com`
- `ada@example.com`
- `maya@example.com`
- `sam@example.com`

The seed includes two organizations and a small reporting hierarchy. `owner@example.com`, `ada@example.com`, and `sam@example.com` already belong to at least one organization when they log in.

Key routes:

- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET|POST|PATCH /api/organizations`
- `GET|POST|PATCH /api/memberships`
- `GET /api/role-templates`
- `POST /api/root`

## Message lifecycle

Startup registers the package's `Message`, `MessageArchive`, and `MessageRequest`
models using its public schema factories and model-name constants.

Log in with `POST /api/auth/login` and `{"email":"alice@example.com"}`, then send
the returned `data.token` as `x-session-token` on message requests:

- `POST /api/messages/new/direct-message` with
  `{"clientRequestId":"demo-1","toUserEmail":"bob@example.com","subject":"Hello","body":"Please read"}`.
  Repeating the request replays the same batch, scoped to the authenticated user,
  template, and request ID (the first payload wins).
- `GET /api/messages` returns public message DTOs with populated party IDs,
  email/display names, and business content; internal diagnostics and request/worker
  bookkeeping are excluded.
- Log in as Bob and `POST /api/messages/<id>/action/mark-read` to run the action
  and transactionally move the message to one archive. Every successful action
  is terminal, including task acknowledgement; multi-step workflows need separate
  messages. Replaying creation after archival returns the archived public DTO.

### Message input validation

All five templates validate their payload inside `prepareMessage`, before any
recipient lookup or message creation. Direct `MessageService.createMessage` calls
using these registered templates enforce the same rules as HTTP. Content renders
from the prepared `templateData`, including actor/recipient names from the host;
handlers and action labels still use the persisted prepared business payload.
Caller-supplied rendering data and extra business fields are stripped by Zod.

| Template              | Required fields and limits (after trimming)                                 | Optional fields                                        |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `team-invitation`     | `inviteeEmail`: valid email; `organizationName`: 1–80 characters            | —                                                      |
| `task-assignment`     | `toUserEmail`: valid email; `taskTitle`: 1–200 characters                   | `taskDescription`: ≤2000 characters; `dueDate`: string |
| `approval-request`    | `toUserEmail`: valid email; `requestTitle`: 1–200; `requestDetails`: 1–2000 | `amount`: number (numeric strings are rejected)        |
| `direct-message`      | `toUserEmail`: valid email; `subject`: 1–200; `body`: 1–5000                | —                                                      |
| `system-announcement` | `title`: 1–200; `body`: 1–5000                                              | `priority`: exactly `low`, `normal`, or `high`         |

Text fields are trimmed and recipient emails are lowercased before lookup.
Omitted task description/due date remain empty strings; omitted priority remains
`normal`. Required fields no longer receive placeholder titles or organization
names. `dueDate` remains free-form text, with no additional date/length rule.
The announcement retains its 100-user query cap and excludes the sender.

Schema failures throw the existing host `AppError` with status 400. The message
routes' response wrapper serializes it as
`{"message":"Invalid message payload."}`. A valid email with no matching user,
or an announcement with no eligible recipients, throws status 404 with
`{"message":"Message recipient not found."}` rather than completing an empty batch.
These checks do not create users.

For a fresh `clientRequestId`, either failure records a **failed reservation**
before returning 400/404. A corrected request with the same user/template/key
returns **409** with a message instructing the caller to use a new
`clientRequestId`; it does not rerun preparation. Submit the corrected payload
under a **new key**. A completed key still replays its original batch without
revalidation, including after archival. Requests without a key create no
reservation on validation/recipient failure. Direct calls throw `AppError` on the
initial failure and the package's `ClientRequestFailedError` on a failed-key retry.

Focused host verification (from the workspace root, after dependency builds):

```bash
pnpm --filter org-access-nodejs-example build:deps
# Build the host runtime too when its generated entrypoints are absent.
pnpm --filter @web-ts-toolkit/express-runtime... build
pnpm --filter org-access-nodejs-example typecheck
pnpm exec vitest run --config vitest.config.ts --fileParallelism=false apps/nodejs/test/message-lifecycle.test.ts apps/nodejs/test/message-validation.test.ts
```
