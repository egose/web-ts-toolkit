# AGENTS.md

## Commands

- `pnpm install` — install dependencies
- `pnpm build` — build all workspace packages (`pnpm -r --if-present build`)
- `pnpm test` — run all workspace test scripts serially; package scripts may rebuild dependencies
- `pnpm test:grouped` — validate groups, then run safe build/read groups sequentially (local pre-flight)
- `pnpm test:group:N` — run one numbered group after a build
- `pnpm test:groups:check` — validate local group coverage, build/read safety and runner tests (not a package test suite)
- `pnpm test:ci:check` — validate the CI dependency model, active workflow agreement, and artifact/result helper contracts (not a package test suite)
- `pnpm lint` — run eslint over the repo
- `pnpm build-artifact -- --version <ver>` — assemble the asdf release artifact
- `pnpm verify-artifact -- --version <ver>` — verify the asdf release artifact

## Testing notes

`pnpm test` runs package test scripts **serially** (`--workspace-concurrency=1`).
Most package test scripts rebuild themselves and their transitive deps via
`pnpm --filter <pkg>... build && vitest …`. Running these concurrently caused
multiple `tsup` processes to write to the same shared `dist/` (e.g.
`express-response-handler`) at once and race on CI. Keep this default serialized.

For local grouped runs, build the workspace first, then use `pnpm test:grouped`:
numbered groups run sequentially and stop on failure; packages within each group
run concurrently. `scripts/test-groups.mjs` checks coverage and dependency
build/read conflicts before running any group, including test-only accesses absent
from package manifests. Update its overrides when cross-package fixture/build
behavior changes. Do not run separate groups concurrently in one checkout.
`react-vite` shares compiled dependencies read-only with the starter in group 12;
its override requires review if its test script changes.

The gated `Test` workflow does not use `pnpm test:grouped`. `ci-prepare` performs
one clean full build and uploads a verified output-only archive; each static package
job installs with a frozen lockfile, restores the exact run/attempt/checkout-scoped
archive, prepares its own browsers/databases, and runs the complete package `test`
script. Each package job requires `ci-prepare` plus its reviewed workspace test
prerequisites, so only true dependents skip after a package failure; validation or
preparation failure blocks all package tests. The preserved `lint`,
minimum-Node smoke, and React compatibility jobs are independent of the main graph.
Do not add a matrix barrier, job-level fail-fast, `continue-on-error`, or a
dependency-closure filter to the main path; package rebuilds and worker limits are
intentional.

The stable `unit-test` aggregate uses `always()` and evaluates the 27 direct
`needs` results (`ci-validate`, `ci-prepare`, 25 package jobs) with
`scripts/ci-test-results.mjs`. It passes only when all 27 succeeded; failure,
cancellation, missing results, and all skipped results fail closed. `pnpm test:ci:check`
enforces the model/active-workflow agreement and helper contracts. Both
`pnpm test:ci:check` and `pnpm test:groups:check` are validation checks, not
substitutes for `pnpm test`/`pnpm test:grouped`. The workflow sets no workflow-wide
concurrency or `max-parallel` cap: `max-parallel` applies only to matrix jobs, and
the only matrix is the preserved React compatibility lane.

Before rollout, a maintainer must authorize live healthy, failure,
preparation-failure, cancellation and missing/skipped-result evidence, and confirm
the existing required-check context still targets `unit-test`; branch-protection
changes require separate authorization. Rollback means restoring the previous
serial `pnpm build` + `pnpm test:grouped` job together with matching pre-migration
CI validation wiring and testing guidance. Reverting only the YAML fails the
current mandatory workflow-agreement check; do not add a legacy bypass to the
active DAG checks. Preserve package scripts, group safety, independent lanes and
the `unit-test` context, verify the coherent rollback before publication, and do
not run groups concurrently.

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
