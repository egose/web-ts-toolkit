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
| `--name <name>`     | Lowercase npm package name (scoped names supported)        |
| `--title <title>`   | Free-form display title (default: Title Case of name)      |
| `--db-name <name>`  | MongoDB database name (default: unscoped package name)     |
| `--force`           | Overwrite the target directory if it exists                |
| `--dry-run`         | Print actions without writing files                        |
| `-i, --interactive` | Prompt for any missing option                              |
| `-h, --help`        | Show help                                                  |

## What it does

1. Copies the release-staged `template/` directory (excluding `node_modules`,
   `dist`, build output, and `.env`) together with its generated lockfile.
2. Rewrites an explicit manifest of operational placeholders using structural
   JSON updates and context-specific TypeScript/JSX, HTML, Markdown, and URI
   serialization. Other files are copied byte-for-byte. See
   [Operational Placeholder Contract](#operational-placeholder-contract).
3. Prints next steps for local development and Netlify deployment (via the
   `create-access-router-mongo-starter-deploy-netlify` bin after installing the
   exact scaffolder version plus `netlify-cli` in the generated app).

For npm publishing, the package build stages the bundled template into
`dist/template/` so the released CLI can scaffold without needing the source
workspace layout. npm omits nested `.gitignore` files, so the staging script
publishes that file under the reserved `_gitignore` alias. The CLI restores the
`.gitignore` name while scaffolding; maintainers must not add a source-template
file named `_gitignore`.

The publish and scaffold file policies are intentionally named separately.
Publishing excludes generated dependencies, build output, Netlify state/TOML,
and generated serverless functions, stages `.gitignore` as `_gitignore`, and
generates the release lockfile. Scaffolding excludes the same generated outputs
plus `.env`, restores `_gitignore` to `.gitignore`, and preserves the shipped
release lockfile so generated apps install reproducibly with a frozen lockfile.

Each release build stamps the repository `VERSION` into the staged template
manifest and generates `dist/template/pnpm-lock.yaml` from that exact manifest.
The source template intentionally has no lockfile because its dependency
versions still contain release placeholders. Generated projects include the
release lockfile and declare Node `>=22.12.0` with pnpm `11.18.0`; use
`pnpm install --frozen-lockfile` to install the dependency set tested for that
generator release.

Generated apps expose bounded, schema-validated ordinary CRUD routes. Root
batching and advanced `__mutation` writes are disabled in the basic starter;
the generated README documents the validation and bounded-batch requirements
for an intentional advanced opt-in.

## Operational Placeholder Contract

Maintainers should keep generated-user documentation separate from source
template policy. The scaffolder rewrites only these operational tokens through
its explicit manifest:

| Token           | Source of replacement                        |
| --------------- | -------------------------------------------- |
| `{{APP_NAME}}`  | validated npm package/app name               |
| `{{APP_TITLE}}` | free-form display title, escaped per context |
| `{{DB_NAME}}`   | validated MongoDB database name              |
| `{{VERSION}}`   | release version during staging/scaffolding   |

Generated README and agent guidance must not explain these source-template
tokens. A concrete package version is mandatory; unresolved or sentinel versions
stop before filesystem mutation.

Generated apps are explicitly anonymous public demos, not production-ready
applications. Production Netlify deploy requires
`--acknowledge-public-demo` after a prominent warning; operators remain
responsible for authentication and host rate limiting, WAF/bot controls,
function/spend limits, monitoring, and incident response. Lists are capped at
100 records with deterministic defaults and indexed exact-match filter
allowlists. Category names are trim-normalized, exact case-sensitive unique;
Todo references are validated, and referenced Category deletion returns `409`
under transaction-protected races. MongoDB must be a replica set or sharded
deployment so these integrity transactions are available.

Generated backends reject missing, blank, or malformed `MONGODB_URI` values
before local listen or serverless request handling. Their access-router response
boundary sanitizes validation, cast, duplicate-key, and unknown persistence
errors while emitting credential-safe structured server logs.

## Layout

```
create-access-router-mongo-starter/
  src/
    cli.ts               # CLI entry — built to dist/bin/cli.js by tsup
  scripts/               # repo-owned deploy + staging helpers (also built to dist/)
    stage-template.ts    # side-effect-free staging helpers and verification
    stage-template.entry.ts # executable staging entrypoint for package build
    deploy-shared.ts      # provider-agnostic build prep (bin)
    deploy-netlify.ts     # Netlify deploy adapter (bin)
  tests/
    deploy-shared.test.ts # repo-only test for the deploy helpers
  template/              # the source starter template (no deploy scripts)
    api/                 # Express + access-router + Mongoose backend
    src/                 # Vite + React frontend
    tests/
    package.json         # template package manifest
    ...
  dist/                  # built CLI + deploy bins + staged template for npm publishing
  tsup.config.ts
  package.json
```

## Netlify Deploy Prerequisites

The `create-access-router-mongo-starter-deploy-netlify` shell out to the `netlify` CLI to perform the actual deploy. The `netlify-cli` package is **not** bundled as a runtime dependency — it pulls a ~30k-file transitive tree that would bloat the published artifact. Install the CLI separately so it is on `PATH` when you run the deploy helper:

```sh
npm install -g netlify-cli     # global
# or, per project:
pnpm add -D netlify-cli        # binary lands in node_modules/.bin
```

Verify with `netlify --version`. The deploy helper bails with a clear error if `netlify` is missing.

### Deployment credentials

Provide `NETLIFY_AUTH_TOKEN` and `MONGODB_URI` through a secure shell prompt or
CI secret manager rather than command arguments. The Netlify child process gets
the token through `NETLIFY_AUTH_TOKEN`; it never appears in child arguments.
The frontend build and deploy process do not receive `MONGODB_URI`, while the
backend build receives the required value. Preview and production deployments
both require Mongo configuration because every deployment includes the backend.

Child processes inherit an explicit platform allowlist: executable lookup,
Windows system paths, home/temp paths, locale/timezone, terminal/color, and CI
indicators. Other parent variables are excluded. Netlify creates `MONGODB_URI`
as secret and `API_BASE_URL` as non-secret. On paid plans, pass `--paid-tier`
to use Functions-only scope. Existing readable variables are reconciled; if
Netlify hides context values needed for a safe replace-all metadata update, the
helper stops with exact manual migration instructions instead of widening or
discarding values.

`--api-base-url` accepts one path-only prefix used by the frontend bundle,
Netlify redirects, and serverless runtime. It rejects schemes, authorities,
queries, fragments, backslashes, empty segments, and dot segments. The helper
passes the selected `API_BASE_URL` directly in the Vite process environment, so
it deterministically overrides conflicting project `.env` files without
exposing backend credentials to the frontend build.

## Publish Checklist

Use this before releasing `create-access-router-mongo-starter` to npm:

1. Build, typecheck, and test the package:

   ```sh
   pnpm --dir packages/create-access-router-mongo-starter build
   pnpm --dir packages/create-access-router-mongo-starter typecheck
   pnpm --dir packages/create-access-router-mongo-starter test
   ```

2. Verify the release-like artifact through the package tests. A raw
   package-local `npm pack` is intentionally rejected because it would publish
   placeholder metadata without the repository transformation:

   ```sh
   pnpm --filter create-access-router-mongo-starter test
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
that flow. The repository `publish-packages` wrapper requires the requested
version to match `VERSION` and passes it to template staging; a mismatch fails
before publication.

Package names follow npm's lowercase scoped/unscoped naming rules and are at
most 214 characters. MongoDB database names must be 1-63 UTF-8 bytes and cannot
contain control characters, spaces, `/`, `\\`, `.`, `"`, `$`, `*`, `<`, `>`,
`:`, `|`, or `?`. For a scoped package, the default database name is the
unscoped package segment; dots are converted to hyphens. Display titles may
contain Unicode, quotes, backslashes, newlines, and markup characters and are
escaped for each generated syntax.

Maintainer-only documentation may show literal examples outside generated-user
files. Scaffold validation checks only the operational files in the source
manifest.

## Documentation

Full package documentation lives in `website/docs/packages/create-access-router-mongo-starter.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/create-access-router-mongo-starter
