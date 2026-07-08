# web-ts-toolkit

TypeScript packages for backend and web tooling.

## Packages

- `@web-ts-toolkit/http-errors`
- `@web-ts-toolkit/express-response-handler`

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
pnpm repo-toolkit-publish-all -- --tag v1.2.3
```

For prereleases:

```sh
pnpm repo-toolkit-publish-all -- --tag v1.2.3-beta.1
```

Dry-run without publishing:

```sh
pnpm repo-toolkit-publish-all -- --tag v1.2.3 --dry-run
```

Publish only selected packages:

```sh
pnpm repo-toolkit-publish-all -- --tag v1.2.3 --filter http-errors
pnpm repo-toolkit-publish-all -- --tag v1.2.3 --filter http-errors,express-response-handler
```

Resume from a specific package in dependency order:

```sh
pnpm repo-toolkit-publish-all -- --tag v1.2.3 --from express-response-handler
```

Override the npm dist-tag explicitly:

```sh
pnpm repo-toolkit-publish-all -- --tag v1.2.3-beta.1 --npm-tag beta
```

The script may also append:

- `--tag <npmTag>`
- `--dry-run`

### Notes

- The version passed with `--tag` is used to replace `0.0.0-PLACEHOLDER`.
- Internal workspace dependencies such as `workspace:*` are rewritten to the release version before publishing.
- Packages are published in internal dependency order.
