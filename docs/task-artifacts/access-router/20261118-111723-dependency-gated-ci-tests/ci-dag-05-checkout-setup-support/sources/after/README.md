# web-ts-toolkit

TypeScript packages for backend and web tooling.

## Packages

- `@web-ts-toolkit/access-router`: ACL-aware Express routers and in-memory data services for Mongoose-backed APIs
- `@web-ts-toolkit/access-router-client`: typed client utilities for `@web-ts-toolkit/access-router` APIs
- `@web-ts-toolkit/access-router-deco`: decorator-based configuration for `@web-ts-toolkit/access-router`
- `@web-ts-toolkit/access-router-react`: React hooks for `@web-ts-toolkit/access-router-client` model services
- `@web-ts-toolkit/access-router-runtime`: config-driven Express and serverless runtime for access-router resource APIs
- `@web-ts-toolkit/asset-inliner`: generic asset inliner for CSS and HTML (ESM-only Base64 data URL encoding)
- `@web-ts-toolkit/express-json-router`: Express router wrapper for return-value JSON responses
- `@web-ts-toolkit/express-oidc-vault`: OIDC session middleware for Express with pluggable vault stores
- `@web-ts-toolkit/express-oidc-vault-memory-store`: in-memory store provider for `express-oidc-vault`
- `@web-ts-toolkit/express-oidc-vault-mongodb-store`: MongoDB store provider for `express-oidc-vault`
- `@web-ts-toolkit/express-oidc-vault-redis-store`: Redis store provider for `express-oidc-vault`
- `@web-ts-toolkit/express-response-handler`: FastAPI-style return-value response handling for Express
- `@web-ts-toolkit/express-runtime`: Express app factory plus serverless handler and local dev server helpers
- `@web-ts-toolkit/http-errors`: typed HTTP error classes and payload helpers for backend APIs
- `@web-ts-toolkit/json-frame`: tabular JSON normalization and transformation (records, columns, split, values, table, index)
- `@web-ts-toolkit/message-service`: template-driven messaging core for Mongoose + Express applications
- `@web-ts-toolkit/mongoose-rxdb`: Mongoose-like Schema, Document, Query, Model, and Middleware proxy backed by RxDB (SQLite storage)
- `@web-ts-toolkit/moo`: Mongoose helpers for schema fields, ObjectId checks, and document plugins
- `@web-ts-toolkit/pdf-reader`: resource-safe browser PDF rendering and extraction built on PDF.js
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

`pnpm test` keeps workspace test scripts serial to avoid overlapping dependency
builds. For a faster local pre-flight, build once and then run the safe groups:

```sh
pnpm build
pnpm test:grouped
```

`pnpm test:grouped` validates the groups, runs independent packages in parallel
within each group, waits for the entire group to finish, and only starts the next
group if it passed. Run a single group with `pnpm test:group:1` (through
`pnpm test:group:12`), after building the workspace. Groups must not run
concurrently with each other or with another workspace build/test run in the same
checkout.

| Group | Packages (omit the `@web-ts-toolkit/` scope)           |
| ----- | ------------------------------------------------------ |
| 1     | utils, json-frame, express-runtime                     |
| 2     | http-errors, asset-inliner                             |
| 3     | express-response-handler, express-request-attestation  |
| 4     | express-json-router, mongoose-rxdb                     |
| 5     | access-router, express-oidc-vault                      |
| 6     | access-router-deco, express-oidc-vault-memory-store    |
| 7     | access-router-client, express-oidc-vault-mongodb-store |
| 8     | access-router-react, express-oidc-vault-redis-store    |
| 9     | message-service, oidc-vault-dpop-client                |
| 10    | access-router-runtime, pdf-reader                      |
| 11    | moo, oidc-vault-dpop-example                           |
| 12    | react-vite, create-access-router-mongo-starter         |

`pnpm test:groups:check` checks the runner and verifies that every tested workspace
appears exactly once, with no build/read conflicts inside a group. Group membership
and test-only dependency overrides live in `scripts/test-groups.mjs`. Review the
overrides when tests gain cross-package builds or compiled fixtures; manifest
dependency changes are checked automatically. Existing package test scripts and
their test coverage are unchanged.

## Continuous integration

The `Test` workflow (`.github/workflows/test.yml`) does not run the local grouped
command. It uses isolated, dependency-gated jobs on separate runners:

1. `ci-validate` runs the CI/local validation checks (`pnpm test:groups:check` and
   `pnpm test:ci:check`).
2. `ci-prepare` performs one clean full `pnpm build` on the tested revision and
   uploads a verified archive containing only compiled outputs. Package jobs restore
   that archive; they never share `node_modules`, dependency stores or build
   directories.
3. One static job per tested workspace installs dependencies with a frozen
   lockfile, restores the archive, prepares only its required browsers/databases,
   and runs the workspace's complete `pnpm --filter <workspace> test` script,
   including its own rebuilds and worker limits.
4. Each package job requires `ci-prepare` and its workspace test prerequisites. A
   failed or cancelled package blocks its dependents; unrelated branches remain
   eligible to run. Validation or preparation failure blocks all 25 package tests.
   The preserved `lint`, `access-router-minimum-node-smoke` and
   `access-router-react-minimum-node` jobs are independent of this graph, and the
   floating React compatibility lane remains non-blocking.
5. The stable `unit-test` job is the aggregate required check. It runs with
   `always()` and validates the 27 main results (`ci-validate`, `ci-prepare` and
   the 25 package jobs) through `scripts/ci-test-results.mjs`. It succeeds only
   when every required job succeeded; failure, cancellation, missing results and
   all skipped results fail closed.

A package job requires the exact run/attempt/checkout-scoped artifact from
`ci-prepare`; a missing, mismatched or incomplete archive fails the job rather than
silently skipping the restore. `pnpm test:ci:check` validates the CI dependency
model, agreement with the checked-in workflow and four main local actions, and the
source-checkout/artifact/resource/result helpers.
`pnpm test:ci:check` and `pnpm test:groups:check` are validation checks, not
replacements for the test suites. Run both after changing workspace dependencies,
test scripts, workflow jobs or CI helpers.

The workflow has no workflow-wide concurrency or `max-parallel` cap. `max-parallel`
applies only to matrix jobs; the main package jobs are static (no matrix), and the
only matrix is the preserved React compatibility lane. Actual parallelism depends
on dependency readiness and GitHub's runner availability/account concurrency, not
on a workflow-level setting.

### Linux checkout-path prerequisite

The resource helper uses a fresh, ignored checkout-local `_tmpXXXXXX` directory
directly as `TMPDIR`. Its normalized real absolute path must be at most **45 UTF-8
bytes**, so the checkout root must be at most **34 bytes**. The helper rejects
unsupported depths before resource probes or package tests; it does not fall back
to external temporary directories, symlink aliases, retries or reduced coverage.
Only dedicated browser downloads and the exact Mongo binary are cached, not
`TMPDIR` or mutable test/database state.

This Linux Unix-socket budget reserves 40 fixed BroadcastChannel path bytes and
22 reader-UUID bytes within the 107-byte pathname limit. It is reviewed for pinned
Node 26.12.1 / BroadcastChannel 7.4.0 and must be revisited on upgrades. A
representative default hosted checkout shape for this repository name has a
calculated 47-byte root and is **unsupported by the resource helper**. The main
jobs now retain the pinned `${{ github.sha }}` checkout for action resolution and
its original cleanup, then use `.github/actions/ci-checkout` to claim only the
exclusive real sibling `dirname(GITHUB_WORKSPACE)/c`. Its parent must be owned and
not group/world writable; the selected root must fit the unchanged 34-byte budget.
Existing targets, symlink aliases and unsupported parents/depths fail closed,
without reuse, alternative paths or deletion of pre-existing work.

The dependency-free bootstrap transfers only the exact selected commit/tree/blob
closure into independent storage with a real `.git`, a generated selected-SHA
shallow boundary and mandatory strict import/connectivity checks. Dirty source,
symlinks, gitfiles and object alternates are rejected. It neither copies private
Git metadata/dependencies/caches nor fetches source from the network. Selected
pin-file inputs, every main project shell's working directory and `TMPDIR` are
explicitly bound to the verified source. pnpm's self-installer receives only a
fresh owned child; original/committed root `.npmrc` is unsupported and rejected
without reading its contents, with both lookup locations rechecked immediately
before installation. The three independent jobs remain unchanged.

Ownership-checked cleanup is a top-level JavaScript action post, not a final
composite shell deletion. The intended order is later cache/tool posts, selected
checkout cleanup, then original checkout cleanup. Local fixtures and `node20`
metadata do **not** certify actual runner runtime, post registration/order,
cancellation or hosted setup/artifact behavior. Those remain authorized live
rollout prerequisites. See the [R1 remediation handoff](docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-05-r1-remediation.md)
and [local setup delivery](docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-05-checkout-setup.md).

### Maintainer rollout and rollback

Before relying on the migrated workflow, a maintainer must authorize and inspect
live Actions evidence for a complete healthy run plus controlled failure,
preparation-failure and cancellation cases, including missing/skipped results.
Confirm that the existing required-check context still targets `unit-test`; any
branch-protection change is a separate repository-settings action.

If rollout is rejected, use a reviewed rollback that restores the previous workflow
running `pnpm build` and then serial `pnpm test:grouped` in one job. Restore matching
pre-migration CI validation wiring and testing guidance too: reverting only the YAML
fails the current mandatory `pnpm test:ci:check` workflow-agreement check. Keep the
existing package scripts, rebuilds, worker limits, group safety rules, independent
lanes and `unit-test` context; remove the added package jobs and artifact
prerequisites. Verify the coherent rollback before publication; do not add a legacy
bypass to the active DAG checks. Do not change branch protection without separate
authorization, or replace the rollback with concurrent local groups. See the
[rollout verification handoff](docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-05-handoff.md)
for evidence, limits and outstanding live checks.

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
