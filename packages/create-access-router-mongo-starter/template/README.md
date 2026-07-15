# {{APP_TITLE}}

A fullstack CRUD starter built on the
[web-ts-toolkit](https://github.com/egose/web-ts-toolkit) `access-router` stack,
backed by MongoDB/Mongoose.

> This package is a **template source**. Use
> `create-access-router-mongo-starter` to scaffold a copy into your repo — it
> rewrites `{{APP_NAME}}`, `{{APP_TITLE}}`, and `{{DB_NAME}}` placeholders
> automatically. See the installer README for details.

## Stack

- **Backend** (`api/`) — Express 5 + `@web-ts-toolkit/express-runtime` +
  `@web-ts-toolkit/access-router` (functional API) + Mongoose, connecting to a
  MongoDB instance via `MONGODB_URI` (local or hosted — Atlas, etc.).
- **Frontend** (`src/`) — Vite + React 19 + `react-router` +
  `@web-ts-toolkit/access-router-client` / `-react` + `react-hook-form` +
  `zod`, styled with `@egose/shadcn-theme` + Tailwind CSS v4.
- **Deploy** (`create-access-router-mongo-starter` bins) — provider-agnostic
  build preparation (`create-access-router-mongo-starter-deploy-shared`) +
  Netlify adapter (`create-access-router-mongo-starter-deploy-netlify`).
  Install the `create-access-router-mongo-starter` package at the
  parent/workspace level to enable deploy.

## Layout

```
api/
  app.ts        # serverless entry (default-exports the Express app)
  app-dev.ts    # local dev entry (async factory: start DB → return app)
  init.ts       # serverless cold-start hook (starts the DB via MONGODB_URI)
  src/
    config.ts   # constants (DB name, port, host)
    db.ts       # Mongoose connect/disconnect using MONGODB_URI
    errors.ts   # AppError
    express.ts  # createExpress() — wires createExpressApp + access-router
    models.ts   # Mongoose models (Todo, Category)
    routers.ts  # createAccessRuntime + ModelRouter + RootRouter
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

| Script                  | What it does                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`              | Start the Vite dev server (UI) on :3000, proxying `/api` → :8000.         |
| `pnpm server`           | Start the backend in watch mode via `wtt-express-runtime dev` on :8000.   |
| `pnpm serverless`       | Bundle the backend as a serverless handler into `api/functions/main.cjs`. |
| `pnpm serverless:start` | Run the bundled serverless handler locally on :9000.                      |
| `pnpm build`            | Typecheck (app + server) and build the frontend.                          |
| `pnpm typecheck`        | Typecheck only.                                                           |
| `pnpm lint`             | ESLint.                                                                   |
| `pnpm test`             | Vitest.                                                                   |

## Environment variables

| Variable            | Required | Description                                                            |
| ------------------- | -------- | ---------------------------------------------------------------------- |
| `MONGODB_URI`       | Yes      | MongoDB connection string (local, Atlas, or other provider).           |
| `VITE_API_BASE_URL` | No       | API base URL for the frontend. Defaults to `/api` (Vite proxy in dev). |
| `PORT`              | No       | Backend dev server port (default: 8000).                               |

## Running locally

You need a MongoDB instance running (e.g. `mongod` locally, or a free MongoDB
Atlas cluster). Put its connection string in `MONGODB_URI`:

```sh
cp .env.example .env
# edit .env and set MONGODB_URI to your connection string
pnpm install
pnpm server        # backend on http://localhost:8000 (reads .env)
pnpm dev           # frontend on http://localhost:3000 (in another terminal)
```

The `Todo` and `Category` entities expose full CRUD through the access-router
generated endpoints (`/api/todos`, `/api/categories`, `/api/root`). The UI lists,
creates, edits, and deletes them via `createModelHooks`.

## Local serverless smoke test

```sh
pnpm serverless        # bundle into api/functions/main.cjs
pnpm serverless:start  # run the handler on http://localhost:9000
```

## Netlify deployment

Netlify deploy is provided by the `create-access-router-mongo-starter` package
bins, which must be installed at the parent/workspace level. Build the frontend
and serverless backend, then deploy both to Netlify:

```sh
pnpm --dir <app-dir> exec create-access-router-mongo-starter-deploy-netlify --site <name-or-id> --mongodb-uri <uri> --prod
```

The deploy command:

- builds the Vite frontend and the `wtt-express-runtime` serverless bundle
- creates or reuses a Netlify site (via `@netlify/api` SDK)
- writes `.netlify/state.json` directly (no `netlify link` CLI needed)
- generates `netlify.toml` with an `/api/*` → function redirect
- sets `MONGODB_URI` on the site environment (via `@netlify/api` SDK)
- defaults to free-tier-compatible env writes with no `--scope`
- uses `--paid-tier` to opt into `--scope functions`

By default, the command writes `dist/`, `netlify/functions/`, `.netlify/`,
and `netlify.toml` into the project directory. To build and deploy from a
throwaway directory instead — leaving the repo untouched — pass `--ephemeral`
(removed on success; keep with `--keep-sandbox`) or `--sandbox-dir <path>` for
a persistent sandbox:

```sh
pnpm --dir <app-dir> exec create-access-router-mongo-starter-deploy-netlify --ephemeral --site <site> --mongodb-uri <uri> --prod
```

Run `... -- --help` for the full list of options, or `-i` for interactive
prompts.

### Deploy to staging / preview

To create a draft deploy at a predictable URL instead of production, use
`--alias`:

```sh
pnpm --dir <app-dir> exec create-access-router-mongo-starter-deploy-netlify --site <site> --alias staging
```

This produces a URL like `https://staging--<site-name>.netlify.app`.

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
4. Add a session middleware in `createExpressApp` (inside `api/src/express.ts`).

## Template customization

This template uses three placeholders that are rewritten at install time by
`create-access-router-mongo-starter`:

| Placeholder     | Replaced with         | Found in                                |
| --------------- | --------------------- | --------------------------------------- |
| `{{APP_NAME}}`  | package/app name      | `package.json`, `api/src/express.ts`    |
| `{{APP_TITLE}}` | display title         | `index.html`, `src/pages/home-page.tsx` |
| `{{DB_NAME}}`   | MongoDB database name | `api/src/config.ts`, `.env.example`     |

If you cloned this template manually, search-and-replace these tokens in the
files listed above.
