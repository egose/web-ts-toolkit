# `create-access-router-mongo-starter`

Scaffolds a new access-router + MongoDB CRUD app from the bundled template into
an existing repository.

## Usage

```sh
# npx downloads and runs the published package automatically
npx create-access-router-mongo-starter ./apps/my-app --name my-app

# npm 7+ shorthand
npm create access-router-mongo-starter ./apps/my-app --name my-app

# pnpm shorthand
pnpm create access-router-mongo-starter ./apps/my-app --name my-app

# Interactive mode
npx create-access-router-mongo-starter -i
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
3. Prints next steps for local development and Netlify deployment (via the
   `create-access-router-mongo-starter-deploy-netlify` bin after installing this
   package at the parent/workspace level).

For npm publishing, the package build stages the bundled template into
`dist/template/` so the released CLI can scaffold without needing the source
workspace layout.

## Layout

```
create-access-router-mongo-starter/
  src/
    cli.ts               # CLI entry — built to dist/cli.js by tsup
  scripts/               # repo-owned deploy + staging helpers (also built to dist/)
    stage-template.ts    # stages template/ into dist/template for publishing
    deploy-shared.ts      # provider-agnostic build prep (bin)
    deploy-netlify.ts     # Netlify deploy adapter (bin)
  tests/
    deploy-shared.test.ts # repo-only test for the deploy helpers
  template/              # the source starter template (no deploy scripts)
    api/                 # Express + access-router + Mongoose backend
    src/                 # Vite + React frontend
    tests/
    package.json         # template with {{APP_NAME}} placeholder
    ...
  dist/                  # built CLI + deploy bins + staged template for npm publishing
  tsup.config.ts
  package.json
```

## Publish Checklist

Use this before releasing `create-access-router-mongo-starter` to npm:

1. Build, typecheck, and test the package:

   ```sh
   pnpm --dir packages/create-access-router-mongo-starter build
   pnpm --dir packages/create-access-router-mongo-starter typecheck
   pnpm --dir packages/create-access-router-mongo-starter test
   ```

2. Verify the published tarball contents locally:

   ```sh
   pnpm --dir packages/create-access-router-mongo-starter build
   npm pack --dry-run --prefix packages/create-access-router-mongo-starter
   ```

3. Dry-run the repo publish flow for this package:

   ```sh
   pnpm publish-packages -- --version v0.0.0-test --filter create-access-router-mongo-starter --dry-run
   ```

4. Release through the repo's normal tag-based workflow:

   ```sh
   pnpm release
   git push --follow-tags
   ```

The GitHub workflow in `.github/workflows/publish.yml` publishes all eligible
`packages/*` entries on version tags, and this package is already wired into
that flow.
