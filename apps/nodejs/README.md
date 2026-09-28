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

Focused host verification (from the workspace root, after dependency builds):

```bash
pnpm --filter org-access-nodejs-example typecheck
pnpm exec vitest run --config vitest.config.ts apps/nodejs/test/message-lifecycle.test.ts packages/message-service/test/message-service.host-public-list.test.ts --no-file-parallelism --testTimeout=15000
```
