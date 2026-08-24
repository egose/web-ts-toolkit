---
sidebar_label: Create Access Router Starter
sidebar_position: 19
---

# `create-access-router-mongo-starter`

Starter CLI for scaffolding a MongoDB-backed `access-router` + React application.

> **Public demo boundary:** generated apps intentionally allow anonymous Todo
> and Category reads and writes. They are not production-safe authentication
> skeletons. Production Netlify deploys require
> `--acknowledge-public-demo`; this acknowledgement is a warning gate, not an
> abuse control. Configure host rate limits/WAF and bot controls, function and
> spend limits, monitoring/alerts, and MongoDB resource limits before sharing a
> demo publicly.

Unlike the library packages in this workspace, this one is a create-style CLI. It copies a bundled template into a target directory, rewrites app placeholders, and prints the next steps for local development and deployment.

## What It Exposes

- `create-access-router-mongo-starter`
- `create-access-router-mongo-starter-deploy-netlify`
- `create-access-router-mongo-starter-deploy-shared`

The main binary scaffolds the starter app. The deploy-helper binaries support the packaged deployment flow used by the generated starter.

## Quick Start

```bash
# npx downloads and runs the published package automatically
npx create-access-router-mongo-starter ./apps/my-app --name my-app

# npm 7+ shorthand
npm create access-router-mongo-starter ./apps/my-app --name my-app

# pnpm shorthand
pnpm create access-router-mongo-starter ./apps/my-app --name my-app

# interactive mode
npx create-access-router-mongo-starter -i
```

### Dry run

```bash
npx create-access-router-mongo-starter ./apps/my-app --name my-app --dry-run
```

Use this to inspect the planned file operations and placeholder substitutions before writing anything.

### Overwrite an existing target

```bash
npx create-access-router-mongo-starter ./apps/my-app --name my-app --force
```

## Published Binaries

- `create-access-router-mongo-starter`
- `create-access-router-mongo-starter-deploy-netlify`
- `create-access-router-mongo-starter-deploy-shared`

The main binary scaffolds the app. The deploy-helper binaries are emitted as part of the published package so workspace-level deployment flows can reuse the same packaged scripts.

## Options

| Flag                | Description                                 |
| ------------------- | ------------------------------------------- |
| `<target-dir>`      | Where to scaffold the app                   |
| `--name <name>`     | Lowercase npm package name (scopes allowed) |
| `--title <title>`   | Free-form display title                     |
| `--db-name <name>`  | MongoDB database name                       |
| `--force`           | Overwrite the target directory if it exists |
| `--dry-run`         | Print actions without writing files         |
| `-i, --interactive` | Prompt for missing values                   |
| `-h, --help`        | Show help                                   |

## What It Does

1. Copies the bundled starter template into the target directory.
2. Rewrites an explicit operational-file manifest with JSON, TypeScript/JSX,
   HTML, Markdown, and URI-aware serialization; all other files are copied as
   bytes.
3. Leaves you with a ready-to-install app skeleton for local development.
4. Prints next steps, including the exact pinned dev install needed for deployment helpers.

The published package stages the template into `dist/template/`, so the CLI works after install without depending on the source workspace layout.

The scaffold step skips workspace-only output such as `node_modules`, `dist`, and `.env` files. It preserves a release-generated `pnpm-lock.yaml` synchronized with the staged manifest, including the direct `@web-ts-toolkit/access-router-runtime` dependency.

Generated projects declare Node `>=22.12.0` and pnpm `11.18.0`. Install with `pnpm install --frozen-lockfile`; this detects manifest/lock drift instead of silently resolving a different dependency set. The source template has no committed lockfile because its internal dependency versions are placeholders; release staging stamps the release version and generates the lockfile included in the package.

Package names must satisfy npm's lowercase scoped or unscoped naming contract
and be at most 214 characters. Database names must be 1-63 UTF-8 bytes and
exclude MongoDB's forbidden punctuation, spaces, and control characters. A
scoped package defaults to its unscoped segment for the database name, with
dots changed to hyphens. Unicode display titles are supported and escaped for
each output syntax. The CLI rejects unresolved release versions and operational
tokens before replacing the destination; literal examples in maintainer docs
are intentionally preserved.

## Starter Shape

The template includes:

- an Express + `access-router` + Mongoose backend
- a Vite + React frontend
- test files and starter package metadata
- deployment-oriented helper flows for shared and Netlify packaging

The generated backend shares browser-safe Zod entity schemas between request
DTOs, form validation, and authoritative server validation. String inputs are
trimmed and bounded, colors require six-digit hex notation, and IDs require the
MongoDB ObjectId shape before model operations run. The basic route surface
includes ordinary CRUD only: root batches are not mounted and advanced
`__mutation` writes are blocked with `404`. The generated README explains that
advanced opt-in requires the same entity schemas on every write path plus
explicit bulk and concurrency bounds; public root writes must not be enabled
with an unconditional guard.

Ordinary lists are capped at 100 records and use deterministic default sorts.
Advanced lists accept only documented exact-match filters backed by Category,
Todo category, and Todo completion indexes; caller-provided sorts are rejected.
Category names are trim-normalized and exact case-sensitive unique. Todo writes
require the referenced Category to exist, and deleting a referenced Category
returns `409`. Transaction-scoped category locks preserve that policy under
racing requests, so the MongoDB service must support transactions through a
replica set or sharded deployment.

The generated runtime requires a valid nonblank `MONGODB_URI` before local
listen or serverless handling. Its access-router response boundary maps request
validation and Mongoose cast/validation failures to stable `400` responses,
duplicate-key conflicts to `409`, and unknown failures to a generic `500`
without exposing persistence details. Server diagnostics are structured and
exclude credentials, rejected request bodies, and stack traces.

This package is a good fit when you want a copyable baseline instead of manually wiring `access-router`, runtime configuration, and frontend setup from scratch.

### Template layout

```text
create-access-router-mongo-starter/
  src/
    cli.ts
  scripts/
    stage-template.ts
    deploy-shared.ts
    deploy-netlify.ts
  template/
    api/
    src/
    tests/
    package.json
  dist/
```

At publish time, the template is staged into `dist/template/` so installed consumers can scaffold without access to the source repo layout.

## Typical Flow

```bash
npx create-access-router-mongo-starter ./apps/acme-admin --name acme-admin --db-name acme_admin
```

Then move into the generated app, run `pnpm install --frozen-lockfile`, configure environment variables, and start local development using the generated package scripts.

If you want the CLI to prompt for any missing values instead of passing everything on the command line, use `-i` or `--interactive`.

## Deployment Helpers

The package also ships helper binaries used by the starter's deployment workflow:

- `create-access-router-mongo-starter-deploy-shared`
- `create-access-router-mongo-starter-deploy-netlify`

Those are mainly for the generated starter's deployment flow rather than day-one scaffolding, but they are packaged so a generated app can install the exact generator version as a dev dependency and run the same released deploy helpers.

### Netlify CLI prerequisite

`create-access-router-mongo-starter-deploy-netlify` shells out to the `netlify` CLI to perform the actual deploy. The `netlify-cli` package is **not** bundled as a runtime dependency (it pulled a ~30k-file transitive tree that bloated the published artifact). Instead the `netlify` binary must be resolvable on `PATH` when you run the deploy helper:

```bash
npm install -g netlify-cli
# or, per project: pnpm add -D netlify-cli   (the binary lands in node_modules/.bin)
```

Verify with `netlify --version` before running the deploy bin. The deploy helper bails with a clear error if `netlify` is missing.

### Credential and child-process boundary

Set `NETLIFY_AUTH_TOKEN` and `MONGODB_URI` through a secure prompt or CI secret
manager, then invoke the deploy helper without credential arguments:

```bash
pnpm add -D create-access-router-mongo-starter@<generator-version> netlify-cli

export NETLIFY_AUTH_TOKEN
export MONGODB_URI
pnpm exec create-access-router-mongo-starter-deploy-netlify --site <name-or-id> --prod --paid-tier --acknowledge-public-demo
```

The Netlify CLI receives authentication through `NETLIFY_AUTH_TOKEN`, never an
`--auth` argument. The frontend build and deploy process receive no Mongo URI;
only the backend build receives `MONGODB_URI`. Each child starts from a small
allowlist of platform essentials (`PATH`, Windows system paths, home/temp
paths, locale/timezone, terminal/color, and CI indicators), not the complete
parent environment.

`API_BASE_URL` is one path-only prefix shared by the frontend, Vite proxy,
backend routes, Netlify redirects, and serverless runtime. It must begin with
`/`; schemes, authorities, queries, fragments, backslashes, empty segments, and
dot segments are rejected. Deploys provide the selected value directly to the
Vite process, so it takes precedence over a conflicting project `.env` file.
Generated local scripts bind the frontend to port 3000, backend to 8000, and
serverless emulator to 9000; they do not expose `PORT` or `HOST` environment
overrides.

`MONGODB_URI` is required for preview, branch, and production deploys because
the generated artifact always contains the serverless backend.

The helper classifies `MONGODB_URI` as secret and `API_BASE_URL` as non-secret.
Free-tier writes use Netlify's all-scope default because granular scopes are a
paid feature. `--paid-tier` narrows variables to Functions scope. Existing
readable context values and metadata are reconciled together. If Netlify hides
values required by its replace-all update endpoint, the command stops and
provides precise UI migration instructions rather than risking context-value
loss or leaving broad metadata silently.

## When To Use It

Use this starter when you want:

- a scaffolded full-stack starting point around `access-router`
- MongoDB persistence already wired into the starter app
- a packaged CLI instead of copying example directories by hand

If you only want the runtime pieces and plan to build the app structure yourself, use the lower-level packages directly instead.

## Related Packages

- [`@web-ts-toolkit/access-router-runtime`](./access-router-runtime)
- [`@web-ts-toolkit/access-router`](./access-router)
- [`@web-ts-toolkit/express-runtime`](./express-runtime)
