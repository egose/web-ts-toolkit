# {{APP_TITLE}}

A fullstack CRUD starter built on the
[web-ts-toolkit](https://github.com/egose/web-ts-toolkit) `access-router` stack,
backed by MongoDB/Mongoose.

## Stack

- **Backend** (`api/`) — Express 5 + `@web-ts-toolkit/access-router-runtime` +
  `@web-ts-toolkit/access-router` + Mongoose, connecting to a MongoDB instance
  via `MONGODB_URI` (local or hosted — Atlas, etc.).
- **Frontend** (`src/`) — Vite + React 19 + `react-router` +
  `@web-ts-toolkit/access-router-client` / `-react` + `react-hook-form` +
  `zod`, styled with `@egose/shadcn-theme` + Tailwind CSS v4.
- **Deploy** (`create-access-router-mongo-starter` bins) — provider-agnostic
  build preparation (`create-access-router-mongo-starter-deploy-shared`) +
  Netlify adapter (`create-access-router-mongo-starter-deploy-netlify`).
  Install the exact generator version used for this app plus `netlify-cli` as
  dev dependencies before running deploy commands.

## Layout

```
api/
  access-router.config.ts  # shared local/serverless runtime config
  src/
    config.ts   # validated database and API path configuration
    errors.ts   # sanitized API error boundary and structured server logging
    models.ts   # Mongoose models (Todo, Category)
    routers.ts  # model router options and basic-route enforcement
    access-router.d.ts  # module augmentation for request/permission types
src/
  api.ts        # createAdapter + model services
  types.ts      # client-side entity types
  app.tsx       # routes
  main.tsx      # entry
  index.css     # Tailwind + shadcn tokens
  pages/
    home-page.tsx  # CRUD UI using createModelHooks
    todo-form.tsx  # react-hook-form + zod form
tests/
  todo-form.test.tsx
```

## Scripts

| Script                  | What it does                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm dev`              | Start the Vite dev server (UI) on :3000, proxying `API_BASE_URL` (default `/api`) → :8000. |
| `pnpm server`           | Start the backend in watch mode via `wtt-access-router-runtime` on :8000.                  |
| `pnpm serverless`       | Bundle the backend as a serverless handler into `api/functions/main.cjs`.                  |
| `pnpm serverless:start` | Run the bundled serverless handler locally on :9000.                                       |
| `pnpm build`            | Typecheck (app + server) and build the frontend.                                           |
| `pnpm typecheck`        | Typecheck only.                                                                            |
| `pnpm lint`             | ESLint.                                                                                    |
| `pnpm test`             | Run Vitest once for CI/local verification.                                                 |
| `pnpm test:watch`       | Run Vitest in watch mode.                                                                  |

## Toolchain and installation

This generated project requires Node `>=22.12.0` and pnpm `11.18.0`, as
declared in `package.json`. Its `pnpm-lock.yaml` is generated and tested with
the matching `create-access-router-mongo-starter` release. Install without
changing that release snapshot:

```sh
corepack enable
pnpm install --frozen-lockfile
```

## Environment variables

| Variable       | Required | Description                                                                                         |
| -------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`  | Yes      | MongoDB connection string (local, Atlas, or other provider).                                        |
| `API_BASE_URL` | No       | Shared path-only API prefix for backend routes, the Vite proxy, and the client. Defaults to `/api`. |

Backend startup is rejected before the local server listens, and before a
serverless request is handled, when `MONGODB_URI` is missing, blank, or not a
valid `mongodb://` or `mongodb+srv://` connection string.

`API_BASE_URL` must begin with `/`. Schemes, `//` authorities, whitespace,
queries, fragments, backslashes, empty segments, and `.` or `..` segments are
rejected before startup or build. The frontend, backend, and deploy helper all
use this one value. Local ports are intentionally fixed by the package scripts:
the frontend uses `3000`, the backend uses `8000`, and the serverless emulator
uses `9000`; `PORT` and `HOST` environment variables are not configuration for
these scripts.

## Running locally

You need a MongoDB instance running (e.g. `mongod` locally, or a free MongoDB
Atlas cluster). Put its connection string in `MONGODB_URI`:

```sh
cp .env.example .env
# edit .env and set MONGODB_URI to your connection string
pnpm install --frozen-lockfile
pnpm server        # backend on http://localhost:8000 (reads .env)
pnpm dev           # frontend on http://localhost:3000 (in another terminal)
```

The `Todo` and `Category` entities expose ordinary list, read, create, update,
and delete endpoints under `API_BASE_URL` (default: `/api/todos` and
`/api/categories`). The UI uses them through `createModelHooks`. The basic
starter does not mount `/api/root`; pre-router enforcement also returns `404`
for `POST|PUT /api/{model}/__mutation` and
`PATCH /api/{model}/__mutation/:id` before access-router or Mongoose runs.

`src/shared/entity-schemas.ts` is the authoritative transport contract shared
by browser-safe request DTOs, the form, and backend CRUD validation. Titles are
trimmed and limited to 200 characters, category names are trimmed and limited
to 80 characters, colors use six-digit hex notation, and category/document IDs
must be 24 hexadecimal characters. Invalid payloads and malformed IDs return
`400`; valid IDs with no record return `404`. Category names are unique after
trimming, with exact case-sensitive matching. Todo writes verify that a selected
category exists. Category deletion is rejected with `409` while any Todo
references it. These paths take a transaction-scoped write lock on the category,
so racing requests cannot commit a dangling reference. Use a replica set or
sharded MongoDB deployment; standalone servers do not support these required
transactions.

Lists return at most 100 records. Todos default to newest ObjectId first;
categories default to `name`, then `_id`. Advanced lists accept only exact-match
Todo filters for `_id`, `categoryId`, and `completed`, or Category filters for
`_id` and `name`; custom sort input is rejected. Supporting indexes are declared
in `api/src/models.ts`. The UI is a bounded demo and does not imply that records
beyond the first 100 are shown.

The API boundary returns stable, sanitized responses for request validation,
Mongoose validation/cast failures, and duplicate-key conflicts. Unexpected
failures return a generic `500`; raw database messages, collection names,
connection strings, rejected values, and stack traces are not sent to clients.
Server logs contain one structured classification record without request bodies
or credentials.

### Safely opting into advanced writes

Do not only remove `enforceBasicRouteContract` or change `rootRouter: false`.
Before exposing advanced mutation routes, add `advancedCreate.data`,
`advancedUpdate.data`, and `advancedUpsert.data` request schemas derived from
the same entity schemas in `src/shared/entity-schemas.ts`. For bulk create or
upsert, wrap the entity schema in `z.array(...).max(<small explicit limit>)` and
test both the limit and each item before enabling the route. Keep ObjectId
validation in the pre-router middleware for every ID-bearing path.

Root batches call services outside model-router request schemas. If an advanced
application enables a root router, its root guard or a preceding middleware
must allowlist operations, validate every model write with the same entity
schemas, reject unknown models/operations, and set explicit `maxBatchEntries`,
`maxOrderGroups`, and `maxConcurrentOperations`. Do not enable public root
writes with `operationAccess: true`.

## Local serverless smoke test

```sh
pnpm serverless        # bundle into api/functions/main.cjs
pnpm serverless:start  # run the handler on http://localhost:9000
```

## Netlify deployment

> **Public demo warning:** this starter deliberately has no authentication.
> Anyone who can reach it can list, create, update, and delete all Todo and
> Category data. It is not a safe production application until you add an
> authorization boundary. Production deployment requires explicit acceptance
> of this contract.

Netlify deploy is provided by the `create-access-router-mongo-starter` package
bins. Install the exact generator version used for this app plus `netlify-cli`
before deploying:

```sh
pnpm add -D create-access-router-mongo-starter@{{VERSION}} netlify-cli

# Set these through a secure shell prompt or your CI secret manager.
export NETLIFY_AUTH_TOKEN
export MONGODB_URI
pnpm exec create-access-router-mongo-starter-deploy-netlify --site <name-or-id> --prod --acknowledge-public-demo
```

The deploy command:

- builds the Vite frontend and the `wtt-access-router-runtime` serverless bundle
- creates or reuses a Netlify site (via `@netlify/api` SDK)
- writes `.netlify/state.json` directly (no `netlify link` CLI needed)
- generates a minimal `netlify.toml` with `[build]` and `[functions]`
- sets `MONGODB_URI` as a secret and `API_BASE_URL` as non-secret (via the `@netlify/api` SDK)
- defaults to free-tier-compatible env writes with all scopes because granular scopes require a paid plan
- uses `--paid-tier` to restrict both variables to Functions scope
- gives only `MONGODB_URI` to the backend build and only `NETLIFY_AUTH_TOKEN` to the deploy process; the frontend build receives neither

The acknowledgement is not an abuse-control feature. Before sharing a public
demo, configure Netlify rate limiting/WAF or equivalent edge controls, bot and
traffic protection, function concurrency/budget controls, logs and alerts, and
MongoDB connection/storage/spend limits. Keep credentials least-privileged and
be prepared to remove the site. Application-level authentication,
authorization, tenancy, quotas, and audit logging remain your responsibility.

Do not put either credential in command arguments: arguments can be retained in
shell history and exposed by process inspection. The helper accepts
`MONGODB_URI` and `NETLIFY_AUTH_TOKEN` from its environment, and interactive
mode uses masked prompts. Child processes inherit only platform essentials
such as `PATH`, home/temp paths, locale, terminal, and CI indicators; arbitrary
parent environment variables are not forwarded.

When `--paid-tier` encounters an existing variable with broader scope or wrong
sensitivity, the helper updates its metadata while preserving readable context
values. Netlify does not return protected values for every secret/context. If
that prevents a safe replace-all update, the helper stops with instructions to
preserve every context value and set the variable's sensitivity and Functions
scope in the Netlify UI before rerunning.

By default, the command writes `dist/`, `netlify/functions/`, `.netlify/`,
and `netlify.toml` into the project directory. To build and deploy from a
throwaway directory instead — leaving the repo untouched — pass `--ephemeral`
(removed on success; keep with `--keep-sandbox`) or `--sandbox-dir <path>` for
a persistent sandbox:

```sh
pnpm exec create-access-router-mongo-starter-deploy-netlify --ephemeral --site <site> --prod --paid-tier --acknowledge-public-demo
```

Run `... -- --help` for the full list of options, or `-i` for interactive
prompts.

### Deploy to staging / preview

To create a draft deploy at a predictable URL instead of production, use
`--alias`:

```sh
pnpm exec create-access-router-mongo-starter-deploy-netlify --site <site> --alias staging
```

This produces a URL like `https://staging--<site-name>.netlify.app`.
`MONGODB_URI` is required for preview and production deployments because both
contain the serverless backend.

For a branch deploy, use `--branch <name>` as a shorthand that sets both
`--alias <name>` and `--context branch:<name>`, overriding any explicit
`--alias` / `--context`:

```sh
pnpm exec create-access-router-mongo-starter-deploy-netlify --site <site> --branch staging
```

The deploy context defaults to `deploy-preview`. To target a different
preview context (e.g. `branch:staging`), pass `--context <ctx>`.
When `--prod` is set, the deploy context is forced to `production` and any
`--context` value is ignored.

The deploy URL is printed at the end of a successful deploy
(`🌐 Deploy URL: …`), parsed from the Netlify CLI JSON output.

## Adding auth

1. Declare permission keys in `api/src/access-router.d.ts`.
2. Set `globalPermissions` on the access-router runtime.
3. Switch `operationAccess` from `true` to permission strings.
4. Add a session middleware in the runtime config's `express` block (`api/access-router.config.ts`).
