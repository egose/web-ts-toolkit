---
sidebar_label: Create Access Router Starter
sidebar_position: 9
---

# `create-access-router-mongo-starter`

Starter CLI for scaffolding a MongoDB-backed `access-router` + React application.

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
| `--name <name>`     | Package and app name                        |
| `--title <title>`   | Display title                               |
| `--db-name <name>`  | MongoDB database name                       |
| `--force`           | Overwrite the target directory if it exists |
| `--dry-run`         | Print actions without writing files         |
| `-i, --interactive` | Prompt for missing values                   |
| `-h, --help`        | Show help                                   |

## What It Does

1. Copies the bundled starter template into the target directory.
2. Rewrites `{{APP_NAME}}`, `{{APP_TITLE}}`, and `{{DB_NAME}}` placeholders.
3. Leaves you with a ready-to-install app skeleton for local development.
4. Prints next steps, including deployment helpers.

The published package stages the template into `dist/template/`, so the CLI works after install without depending on the source workspace layout.

The scaffold step skips workspace-only output such as `node_modules`, `dist`, lockfiles, and `.env` files from the source template.

## Starter Shape

The template includes:

- an Express + `access-router` + Mongoose backend
- a Vite + React frontend
- test files and starter package metadata
- deployment-oriented helper flows for shared and Netlify packaging

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

Then move into the generated app, install dependencies, configure environment variables, and start local development using the generated package scripts.

If you want the CLI to prompt for any missing values instead of passing everything on the command line, use `-i` or `--interactive`.

## Deployment Helpers

The package also ships helper binaries used by the starter's deployment workflow:

- `create-access-router-mongo-starter-deploy-shared`
- `create-access-router-mongo-starter-deploy-netlify`

Those are mainly for the generated starter's deployment flow rather than day-one scaffolding, but they are packaged so the released starter can reuse them without depending on this repo's source tree.

### Netlify CLI prerequisite

`create-access-router-mongo-starter-deploy-netlify` shells out to the `netlify` CLI to perform the actual deploy. The `netlify-cli` package is **not** bundled as a runtime dependency (it pulled a ~30k-file transitive tree that bloated the published artifact). Instead the `netlify` binary must be resolvable on `PATH` when you run the deploy helper:

```bash
npm install -g netlify-cli
# or, per project: pnpm add -D netlify-cli   (the binary lands in node_modules/.bin)
```

Verify with `netlify --version` before running the deploy bin. The deploy helper bails with a clear error if `netlify` is missing.

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
