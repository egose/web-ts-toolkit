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
