# AGENTS.md

## Commands

- `pnpm install` — install dependencies
- `pnpm build` — build all workspace packages (`pnpm -r --if-present build`)
- `pnpm test` — run all workspace tests
- `pnpm lint` — run eslint over the repo
- `pnpm build-artifact -- --version <ver>` — assemble the asdf release artifact
- `pnpm verify-artifact -- --version <ver>` — verify the asdf release artifact

## Testing notes

`pnpm test` runs package test scripts **serially** (`--workspace-concurrency=1`).
Each package's test script rebuilds itself and its transitive deps via
`pnpm --filter <pkg>... build && vitest …`. Running these concurrently caused
multiple `tsup` processes to write to the same shared `dist/` (e.g.
`express-response-handler`) at once and race on CI. Keep the run serialized
unless the per-package pre-build is removed in favor of a single root build.

## Temporary files and durable task evidence

- Use ignored repository-local `_tmp*` directories for scratch tests/probes,
  temporary fixtures, consumers, logs and other disposable work. Choose a fresh
  directory per task/run and confirm it is ignored with `git check-ignore`.
- When tools use `os.tmpdir()`, set `TMPDIR` to that directory's absolute path
  at runtime. Record repo-relative paths or quoted `<repo-root>` placeholders in
  shared documents, not machine-local paths.
- Before finalizing a task or handoff, review referenced scratch contents. Move
  material worth preserving to `docs/task-artifacts/<package-name>/<task-or-run-id>/`
  and update task/document references to the preserved files. Use the package
  directory name, e.g. `access-router`, not the scoped npm name.
- Preserve useful designs, handoffs, migration ledgers, review/acceptance reports
  and necessary supporting evidence; do not copy entire scratch trees. Keep
  maintained regression tests and benchmark scripts in their normal code locations.
- Scrub credentials, private session identifiers and machine-specific paths;
  document omitted dependencies/raw data and any reproducibility limits. Verify
  preserved references resolve and the destination is not ignored.
- If moving would break active work or historical seals, preserve a curated copy
  instead and leave originals unchanged. Never overwrite old evidence or delete
  another task's temporary files.
- Follow [the preservation workflow](docs/task-artifacts/README.md) and
  [task-file conventions](docs/tasks/README.md). Git ignore status does not imply
  that lint/build tools exclude scratch files.

## Packaging notes

- Packages that publish `.mjs` for direct Node runtime use should not use `tsup` with `bundle: false` when source files use bundler-style relative specifiers like `./plugins` or `./create-handler`. Plain Node ESM will not resolve directory imports or extensionless relative imports from published output.
