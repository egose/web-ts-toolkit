# `create-access-router-mongo-starter`

Scaffolds a new access-router + MongoDB CRUD app from the bundled template into
an existing repository.

## Usage

```sh
# From within the web-ts-toolkit monorepo
pnpm create-access-router-mongo-starter ./apps/my-app --name my-app

# Interactive mode
pnpm create-access-router-mongo-starter -i
```

## Options

| Flag                | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| `<target-dir>`      | Where to scaffold the app (positional, first non-flag arg) |
| `--name <name>`     | Package/app name (default: derived from target dir)        |
| `--title <title>`   | Display title (default: Title Case of name)                |
| `--db-name <name>`  | MongoDB database name (default: same as name)              |
| `--force`           | Overwrite the target directory if it exists                |
| `--dry-run`         | Print actions without writing files                        |
| `-i, --interactive` | Prompt for any missing option                              |
| `-h, --help`        | Show help                                                  |

## What it does

1. Copies the `template/` directory (excluding `node_modules`, `dist`, build
   output, `.env`, and lockfiles).
2. Rewrites `{{APP_NAME}}`, `{{APP_TITLE}}`, and `{{DB_NAME}}` placeholders in
   all copied files.
3. Prints next steps for local development and Netlify deployment.

## Layout

```
create-access-router-mongo-starter/
  src/
    cli.ts          # CLI entry — built to dist/cli.js by tsup
  template/         # the starter source (copied at scaffold time)
    api/            # Express + access-router + Mongoose backend
    src/            # Vite + React frontend
    scripts/        # deploy-shared.ts + deploy-netlify.ts
    tests/
    package.json    # template with {{APP_NAME}} placeholder
    ...
  dist/             # tsup build output
  tsup.config.ts
  package.json
```
