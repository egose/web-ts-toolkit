# web-ts-toolkit

TypeScript packages for backend and web tooling.

## Packages

- `@web-ts-toolkit/access-router`: ACL-aware Express routers and in-memory data services for Mongoose-backed APIs
- `@web-ts-toolkit/access-router-client`: typed client utilities for `@web-ts-toolkit/access-router` APIs
- `@web-ts-toolkit/access-router-deco`: decorator-based configuration for `@web-ts-toolkit/access-router`
- `@web-ts-toolkit/access-router-react`: React hooks for `@web-ts-toolkit/access-router-client` model services
- `@web-ts-toolkit/express-json-router`: Express router wrapper for return-value JSON responses
- `@web-ts-toolkit/express-response-handler`: FastAPI-style return-value response handling for Express
- `@web-ts-toolkit/express-runtime`: Express app factory plus serverless handler and local dev server helpers
- `@web-ts-toolkit/http-errors`: typed HTTP error classes and payload helpers for backend APIs
- `@web-ts-toolkit/message-service`: template-driven messaging core for Mongoose + Express applications
- `@web-ts-toolkit/moo`: Mongoose helpers for schema fields, ObjectId checks, and document plugins
- `@web-ts-toolkit/utils`: shared collection, object, async, and URL helpers used across workspace packages

## Starter template

- `create-access-router-mongo-starter`: scaffolds a fullstack CRUD starter (Express + access-router + MongoDB + React/Vite) with Netlify deployment support into an existing repo. The published CLI ships with a bundled staged template.

## Development

Install dependencies:

```sh
pnpm install
```

Run tests:

```sh
pnpm test
```

## Release

Publish all workspace packages with:

```sh
pnpm repo-toolkit-publish-packages -- --tag v1.2.3
```

For prereleases:

```sh
pnpm repo-toolkit-publish-packages -- --tag v1.2.3-beta.1
```

Dry-run without publishing:

```sh
pnpm repo-toolkit-publish-packages -- --tag v1.2.3 --dry-run
```

Publish only selected packages:

```sh
pnpm repo-toolkit-publish-packages -- --tag v1.2.3 --filter http-errors
pnpm repo-toolkit-publish-packages -- --tag v1.2.3 --filter http-errors,express-response-handler
```

Resume from a specific package in dependency order:

```sh
pnpm repo-toolkit-publish-packages -- --tag v1.2.3 --from express-response-handler
```

Override the npm dist-tag explicitly:

```sh
pnpm repo-toolkit-publish-packages -- --tag v1.2.3-beta.1 --npm-tag beta
```

The script may also append:

- `--tag <npmTag>`
- `--dry-run`

### Notes

- The version passed with `--tag` is used to replace `0.0.0-PLACEHOLDER`.
- Internal workspace dependencies such as `workspace:*` are rewritten to the release version before publishing.
- Packages are published in internal dependency order.

## asdf Plugin

Use this repository directly as an asdf plugin:

```sh
asdf plugin add web-ts-toolkit https://github.com/egose/web-ts-toolkit.git
asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
asdf install nodejs <node-version>
asdf install web-ts-toolkit <web-ts-toolkit-version>
asdf global web-ts-toolkit <web-ts-toolkit-version>
```

Available commands after install:

- `wtt-express-runtime`

Useful asdf commands:

- `asdf list all web-ts-toolkit` (shows only versions with published install archives)
- `asdf install web-ts-toolkit latest`
- `asdf local web-ts-toolkit <web-ts-toolkit-version>`

`web-ts-toolkit` runs on Node.js, so install a compatible `nodejs` version in asdf before invoking the commands.

The release artifact discovers workspace packages from `packages/*` and automatically exposes any package with a `bin` entry.
