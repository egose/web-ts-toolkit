# Mongo Starter Boundary Follow-Up

Created: 2026-09-08 23:07:52 (local clock)

## Objective

Close newly identified safety, correctness, generated-application, and verification gaps in `packages/create-access-router-mongo-starter`. This is an executable review backlog, not authorization to implement it during task creation.

Related completed plan: [initial remediation](20260824-050351-create-access-router-mongo-starter-review-remediation.md). CARMS-01 through CARMS-19 are marked completed there. This new phase records residual cases not established by their completion evidence; it does not rewrite historical results. References below identify the relevant prior task rather than duplicating its entire scope.

## Scope And Evidence

- Reviewed scaffold orchestration, path policy, staging/publication metadata, deployment orchestration and Netlify API helpers, generated backend/frontend/configuration, relevant tests, package and generated documentation, and the prior task record.
- Followed Mongoose delete session propagation, runtime bundler output naming, runtime readiness, and installed Netlify CLI semantics where needed to assess a concrete boundary.
- Review agents reported isolated, no-database Node probes confirming replacement-string interpretation, rejection of multi-host Mongo URIs by WHATWG URL parsing, document-delete session timing, and Express parameterized-prefix matching. These are focused probes, not integration-suite results.
- No package/template tests, builds, installs, live Netlify operations, MongoDB integration tests, benchmarks, or Windows execution were run in this review. Avoided unnecessary shared-output writes in a concurrently modified workspace. Historical passing checks in the initial plan are not a current baseline.
- Runtime dependency files have concurrent worktree changes. Re-read their current contracts before implementing cross-package fixes; do not revert or assume ownership of those changes. This review's only deliverables are task documentation.
- No observed credential leak from a real release or real deployment is claimed. Findings describe reachable code paths and controlled failure scenarios. Database concurrency, provider context behavior, Windows execution, and sort performance require the specific verification below.
- This package is a CLI, not an importable SDK. The useful installed-consumer contract is its three bins, packed template, generated declarations/types where applicable, dependency/toolchain requirements, and shipped guidance; adding library exports is not a goal.

## Priorities And Rules

- P0: prevent plausible local data loss or publishing local credentials before the next affected operation/release.
- P1: security-boundary failures, integrity defects, or broken documented deployment/reproducibility contracts.
- P2: bounded correctness, usability, accessibility, portability, and maintainability gaps.
- P3: optional measurement-led optimization.
- Preserve the recorded decisions: intentional anonymous public demo, production acknowledgement, reject deletion of referenced Categories, transaction-capable MongoDB, path-only API prefixes, disabled root/advanced writes, 100-record cap, and release-synchronized frozen installs.
- Do not add authentication/tenancy, speculative caching, a new runtime framework, compatibility aliases for unsafe inputs, or arbitrary new public helper exports.
- Prefer enforcement at the shared parser, path planner, persistence operation, or serializer boundary. Keep regressions with fixes and documentation with changed contracts. Document externally visible restrictions in release notes.
- Paths in this document are repository-relative. Temporary consumers may use `/tmp`; do not add machine-specific external paths or secrets to task evidence.
- Set tasks to `in_progress` only when dependencies are complete. Record changed files, commands actually run, results, and follow-ups on completion. If verification cannot run, use `blocked` with the missing prerequisite rather than declaring completion.

## Verification Profiles

All commands below are proposed, not results from this review. Run from the repository root unless stated otherwise. Use the installed repository toolchain. Serialize every build, package test, packed-consumer test, and artifact operation because they can write shared `dist/` outputs. Never manually edit `dist/`.

**V1: Focused package tests.** Substitute the task's named existing test files, or its new focused regression file:

```sh
pnpm --filter create-access-router-mongo-starter exec vitest run tests/scaffold-safety.test.ts
```

**V2: Package checks after each implementation lane.**

```sh
pnpm --filter create-access-router-mongo-starter typecheck
pnpm exec eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"
pnpm --filter create-access-router-mongo-starter test
```

The package test script builds first. Lockfile resolution requires available release dependencies; CARMSF-02 must make missing dependencies a truthful failure, not fabricated success.

**V3: Installed/generated boundary.** Build deliberately before the packed test if V2 has not already built the current source:

```sh
pnpm --filter create-access-router-mongo-starter build
pnpm --filter create-access-router-mongo-starter exec vitest run tests/packed-consumer.test.ts
```

Extend the existing release-transformed consumer harness, not raw placeholder publication. From its fresh generated project, verify `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm serverless`. Do not run installs in the source template containing `{{VERSION}}`. Use dummy credentials and stub remote mutations. New successful CRUD integration tests need a transaction-capable isolated MongoDB replica set; the repository has `mongodb-memory-server`, but this review has not established a package-local replica-set lane. Record binary/network prerequisites and the exact new command when adding that lane.

**V4: Final repository integration.** Run serially; preserve unrelated changes and identify unrelated failures rather than fixing them opportunistically:

```sh
pnpm lint
pnpm build
pnpm test
pnpm build-artifact -- --version <ver>
pnpm verify-artifact -- --version <ver>
git diff --check
```

Use the current release version from `VERSION` for `<ver>`, not the prior plan's historical version. These artifact commands assemble/verify locally; do not publish. Windows and minimum-Node checks require their respective CI/runtime environments and must not be inferred from a Linux host pass.

## Execution Order

| Lane                    | Ordered tasks                                         | Primary shared files                                                      |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Publication             | CARMSF-01, CARMSF-02                                  | template policy, staging, staging/pack tests                              |
| Scaffold                | CARMSF-03, CARMSF-04                                  | `src/cli.ts`, scaffold tests                                              |
| Deployment              | CARMSF-05, CARMSF-06, CARMSF-07, CARMSF-08, CARMSF-09 | deploy scripts and orchestration tests                                    |
| Persistence             | CARMSF-10, CARMSF-11                                  | models, integrity, runtime config, API tests                              |
| API contract            | CARMSF-12, CARMSF-13                                  | prefix validation, Mongo validation; coordinate with deployment lane      |
| Frontend                | CARMSF-14                                             | home page and frontend tests                                              |
| Generated tooling/docs  | CARMSF-15                                             | template metadata and generated guidance; finalize after behavioral lanes |
| Optional measurement    | CARMSF-16                                             | read-only experiments after affected behavior settles                     |
| Independent integration | CARMSF-17                                             | final evidence and artifact review                                        |

Independent source-only lanes may proceed concurrently, but builds/tests that generate shared outputs may not. Dependencies below intentionally serialize materially overlapping files. All tasks touching `template/tests/api-contract.test.ts` or `tests/orchestration-seams.test.ts` must use their listed ordering or separate newly owned regression files. Documentation outside the primary ownership should be coordinated with CARMSF-15. Do not have multiple agents regenerate the template/lockfile simultaneously.

## Tasks

### Task CARMSF-01: Keep Private Dotenv Files Out Of Release Artifacts

Status: completed

Kind: defect

Priority: P0, staging can publish local database credentials.

Suggested agent: package publication/security specialist

Dependencies: none

Primary ownership: `packages/create-access-router-mongo-starter/src/shared/template-policy.ts`, `scripts/stage-template.ts` within that package, and `tests/stage-template.test.ts` / packed-file assertions.

Finding: publish exclusions omit `.env`; scaffold exclusions omit dotenv variants such as `.env.local`. A maintainer's local credentials can therefore enter the npm template even when later scaffolding excludes the plain `.env` file. Existing fixtures establish `.env.example` inclusion but do not exercise private dotenv sentinels. Prior overlap: completed CARMS-05/17/19.

References:

- `packages/create-access-router-mongo-starter/src/shared/template-policy.ts:12-32` (`PUBLISH_TEMPLATE_POLICY`, `SCAFFOLD_TEMPLATE_POLICY`).
- `packages/create-access-router-mongo-starter/scripts/stage-template.ts:208-222` (publish traversal).

Requirements: enforce a consistent private-dotenv exclusion or rejection policy at staging and scaffold boundaries, including nested files and variants, while explicitly retaining `.env.example`. Keep `.gitignore` alias behavior unchanged. Do not remove useful documented example configuration.

Acceptance criteria: dummy secret sentinels in `.env`, `.env.local`, and nested private dotenv files never appear in staged, packed, or generated output; `.env.example` remains usable; tests fail against the current policy. State the exact allowed example-file policy.

Verification: V1 `tests/stage-template.test.ts`, then V2 and V3 with artifact-content assertions.

Completion evidence:

- Changed files:
  - `packages/create-access-router-mongo-starter/src/shared/template-policy.ts` — added `ALLOWED_DOTENV_EXAMPLE_BASENAME` and `isPrivateDotenvPath()`; `isTemplatePathExcluded()` now excludes private dotenv paths for both publish and scaffold policies. Exact allowed example-file policy: the only dotenv file that may be staged, packed, or scaffolded is a file whose basename is exactly `.env.example` (at any depth); every other path with a `.env` or `.env.*` segment (e.g. `.env`, `.env.local`, `.env.development.local`, nested `config/.env`) is excluded. `.gitignore` alias behavior unchanged.
  - `packages/create-access-router-mongo-starter/scripts/stage-template.ts` — re-exports the new helper/constant (staging traversal itself delegates to `isTemplatePathExcluded`, so no logic change needed there).
  - `packages/create-access-router-mongo-starter/tests/stage-template.test.ts` — new `private dotenv exclusion (CARMSF-01)` block: shared-boundary unit assertions, publish+scaffold policy assertions, and an end-to-end `stageTemplate` sentinel test (root `.env`, `.env.local`, nested `config/.env` excluded; root+nested `.env.example` retained; `_gitignore` alias intact; `verifyStagedTemplate` drift-free).
- Pre-fix failure basis: prior `PUBLISH_TEMPLATE_POLICY` had no dotenv entry and `SCAFFOLD_TEMPLATE_POLICY` excluded only the exact `.env` path, so the new `.env.local`/nested-variant assertions fail against the old policy.
- Commands run + results (repo root, serialized):
  - V1 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/stage-template.test.ts` — 18/18 passed.
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint` on the three touched files — clean; `pnpm --filter create-access-router-mongo-starter test` — 10 files, 199/199 passed.
  - V3 `pnpm --filter create-access-router-mongo-starter build` then `exec vitest run tests/packed-consumer.test.ts` — 2/2 passed (exact packed-file list still holds: includes `template/.env.example`, no private dotenv).
- Acceptance proof: staged `dist/template` contains only `dist/template/.env.example` under `.env*`; `dist/template/_gitignore` present; sentinel scan for test secrets in `dist/template` clean. No `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: none; CARMSF-02 (lockfile fail-closed) remains the next publication-lane dependency.

### Task CARMSF-02: Fail Closed On Invalid Release Lockfiles

Status: completed

Kind: defect

Priority: P1, failed resolution is currently disguised as a reproducible release.

Suggested agent: package/reproducibility specialist

Dependencies: CARMSF-01

Primary ownership: `packages/create-access-router-mongo-starter/scripts/stage-template.ts`, publication guard, and staging/packed-consumer tests.

Finding: `generateLockfile` catches resolution errors and substitutes versions in a prior lockfile or constructs one without devDependencies or a dependency graph. Neither reconstructs valid resolution/integrity metadata. Staging only checks existence and unresolved placeholders; drift verification does not establish lockfile/importer agreement. Injected failure tests bypass the real fallback. Prior overlap: completed CARMS-06/17.

References:

- `packages/create-access-router-mongo-starter/scripts/stage-template.ts:62-135` (`generateLockfile`).
- `packages/create-access-router-mongo-starter/scripts/stage-template.ts:174-179,265-278` (validation).

Requirements: remove fabricated resolution fallback; fail publication preparation on resolution failure without destroying a previously valid stage. Require a real lockfile with manifest/importer agreement. Resolve release-order constraints explicitly if packages are not yet available; do not replace registry unavailability with guessed metadata.

Acceptance criteria: failing fake `pnpm` with and without an old lockfile fails safely; missing, malformed, stale-importer, and synthetic lockfiles are rejected; a correctly release-transformed generated project installs frozen. Test the default generator, not only an injected throw.

Verification: V1 `tests/stage-template.test.ts`, V2, V3. If release dependency availability blocks valid generation, record the exact release-pipeline decision needed and keep the task blocked.

Completion evidence:

- Changed files:
  - `packages/create-access-router-mongo-starter/scripts/stage-template.ts` — removed the version-substitution and synthetic lockfile fallbacks from `generateLockfile()`; resolution failure now propagates, and `stageTemplate()` discards the temporary stage while preserving the previous output (pre-existing temp-dir pattern, unchanged). Added exported `validateStagedLockfile()`: requires an existing regular `pnpm-lock.yaml` with no `{{VERSION}}` placeholder, exact root-importer `dependencies`/`devDependencies` specifier agreement with the staged manifest (each entry must also carry resolved `version` metadata), a non-empty `packages:` section, a `snapshots:` section, and at least one `integrity:` resolution. It runs after lockfile generation in `stageTemplate()` and first in `verifyStagedTemplate()` (drift comparison intentionally ignores generated lockfile bytes), so the `prepack` publication guard fails closed too.
  - `packages/create-access-router-mongo-starter/tests/stage-template.test.ts` — added `writeAgreedTestLockfile()` fixture (exact importer specifiers + resolved versions + `packages:`/`snapshots:`/`integrity:` metadata) and replaced all prior trivial `'lockfileVersion: 9\n'` fixtures that the new validation correctly rejects; reworked the drift test to mutate `app.txt` instead of corrupting `package.json` (corrupt manifests now fail lockfile validation before drift reporting). New `fail closed on invalid release lockfiles (CARMSF-02)` block (8 tests): default generator with a failing fake `pnpm` on `PATH` throws with and without a stale reference lockfile (sentinel preserved, no fabricated lockfile, stale reference untouched, no temp leftovers); missing/malformed/stale-importer/synthetic lockfiles rejected via injected generators; agreed dependencies+devDependencies accepted with clean drift; `verifyStagedTemplate` rejects a post-stage fabricated lockfile.
- Pre-fix failure basis: the old `generateLockfile` caught resolution errors and returned success via substitution/synthesis, so every new fail-closed test expecting a throw fails against the old code; the old drift verification ignored lockfile bytes entirely.
- Commands run + results (repo root, serialized):
  - V1 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/stage-template.test.ts` — 26/26 passed.
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"` — clean (one `--fix` for `no-regex-spaces` in the new parser, re-verified); `pnpm --filter create-access-router-mongo-starter test` — 10 files, 207/207 passed (build regenerated `dist/template/pnpm-lock.yaml` via real pnpm: specifier `^0.43.0` agreement, 781 integrity entries, `snapshots:` present).
  - V3 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/packed-consumer.test.ts` — 2/2 passed (release-transformed generated project passes `pnpm install --frozen-lockfile`, `build`, `typecheck`, `lint`, `test`, `serverless`).
- Acceptance proof: no version-substitution or synthetic fabrication path remains in `stage-template.ts`; failing default-generator runs preserve the prior stage and write no lockfile; missing/malformed/stale-importer/synthetic lockfiles throw with actionable messages; the real staged lockfile installs frozen in the generated consumer. Release dependency availability did not block valid generation (no blocked decision needed). No `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: none.

### Task CARMSF-03: Preserve Successful Scaffolds When Backup Cleanup Fails

Status: completed

Kind: defect

Priority: P0, recursive cleanup can partially delete old data before rollback.

Suggested agent: transactional filesystem specialist

Dependencies: none

Primary ownership: `packages/create-access-router-mongo-starter/src/cli.ts`, `tests/scaffold-safety.test.ts`.

Finding: after installing the new target, backup removal remains inside the rollback catch. If recursive removal deletes some backup files then throws, the catch deletes the complete new scaffold and restores a partially deleted backup. Existing copy/rewrite/final-rename tests do not cover partial backup deletion. Prior overlap: CARMS-02's completed rollback guarantee.

Reference: `packages/create-access-router-mongo-starter/src/cli.ts:643-658` (replacement/backup cleanup).

Requirements: define successful target installation as the commit point; do not attempt rollback from a backup once irreversible cleanup has begun. Retain the new target and residual backup on cleanup failure and accurately report the outcome and safe cleanup action. Preserve pre-commit rollback.

Acceptance criteria: an injected remover deletes one backup sentinel then throws; the complete new scaffold remains, residual backup is not misrepresented as intact, and diagnostics distinguish committed success from cleanup failure. Existing pre-commit rollback regressions still pass.

Verification: V1 `tests/scaffold-safety.test.ts` and `tests/orchestration-seams.test.ts`, then V2.

Completion evidence:

- Changed files:
  - `packages/create-access-router-mongo-starter/src/cli.ts` — backup-removal block now treats successful target installation as the commit point: `backupTarget` is cleared into `completedBackup` before `services.removeTarget()` runs, so the `finally` rollback (`if (backupTarget && !exists(targetDir)) move back`) can no longer delete the new scaffold or restore a partially deleted backup. Cleanup failure logs and throws `Scaffold complete at <target>, but backup cleanup failed for <backup>: <reason>. The new scaffold was retained; manually remove the residual backup when safe.` (with `cause`). Pre-commit rollback paths (temp-move failure restore, finally-block restore) unchanged.
  - `packages/create-access-router-mongo-starter/tests/scaffold-safety.test.ts` — new `preserves the new scaffold when backup cleanup fails after commit (CARMSF-03)` regression: injected `removeTarget` deletes one backup sentinel (`old-sentinel.txt`) then throws; asserts the error matches `/Scaffold complete.*backup cleanup failed.*residual backup/`, exactly one cleanup attempt, the complete new scaffold remains live (`package.json` = new-app/1.2.3, no old content), and exactly one residual backup remains beside the target missing the deleted sentinel but retaining `old-keep.txt` (not misrepresented as intact).
- Pre-fix failure basis: the old catch ran `removeTarget(targetDir)` + `move(backup → target)` after cleanup began, so the regression's "new scaffold remains" and "residual backup retained" assertions fail against the old code.
- Commands run + results (repo root, serialized):
  - V1 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/scaffold-safety.test.ts` — 16/16 passed.
  - V1 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/orchestration-seams.test.ts` — 32/32 passed.
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"` — clean; `pnpm --filter create-access-router-mongo-starter test` — 10 files, 208/208 passed.
- Acceptance proof: partial backup deletion (one sentinel gone, rest present) throws a committed-success diagnostic distinguishing it from cleanup failure; new target never deleted/restored-over post-commit; all pre-existing pre-commit rollback regressions still pass. No `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: none.

### Task CARMSF-04: Make Scaffold Serialization And Interactive Outcomes Literal

Status: completed

Kind: defect

Priority: P1 for output corruption; related interactive consistency fixes are P2.

Suggested agent: CLI input and interaction specialist

Dependencies: CARMSF-03

Primary ownership: `packages/create-access-router-mongo-starter/src/cli.ts`, scaffold/prompt regressions and packed CLI assertions.

Finding: escaped replacement values are passed as replacement strings, so `$$`, `$&`, prefix, and suffix substitutions are interpreted again. Interactive database defaults also use a scoped/dotted package name instead of the existing safe default helper. Cancellation calls `process.exit` from collection rather than returning to the orchestrator. Existing adversarial titles omit replacement metacharacters, and mocked option collection bypasses real prompt behavior. Prior overlap: CARMS-01/07/18.

References:

- `packages/create-access-router-mongo-starter/src/cli.ts:373-411` (placeholder replacement).
- `packages/create-access-router-mongo-starter/src/cli.ts:204-206,469-530,558-583` (defaults/cancellation).
- `packages/create-access-router-mongo-starter/src/cli.ts:677-679` (printed deploy-help command).

Requirements: insert replacements literally, retaining context-aware escaping; reuse database-name derivation in interactive prompts; allow cancellation to return without terminating an importing caller. Correct printed `pnpm exec ... -- --help` to the invocation actually accepted by the installed bin. Avoid a broad CLI rewrite.

Acceptance criteria: all four JavaScript replacement sequences survive exactly in generated titles; generated JSON/TSX/HTML remains valid; accepting defaults for `@scope/my.app` works; cancelling any prompt returns without filesystem mutation or process exit; the exact printed deploy-help command succeeds in the installed consumer.

Verification: V1 scaffold and orchestration tests, V2, V3 with one literal-title case and actual printed-command execution.

Completion evidence:

- Changed files:
  - `packages/create-access-router-mongo-starter/src/cli.ts` — `replaceManifestToken()` now uses a function replacer (`content.replace(token, () => value)`) and the `{{VERSION}}` rewrite uses `replaceAll(..., () => values.version)`, so all four JS replacement sequences (`$$`, `$&`, `` $` ``, `$'`) are inserted literally while context-aware escaping (HTML/markdown/JSON/URI) is retained. `promptMissing()` reuses `defaultDatabaseName(o.name!)` for the db placeholder/default/fallback (was raw `o.name!`), returns `undefined` on any cancel instead of `process.exit(0)`; `ScaffoldServices.promptMissing` is now `Promise<Options | undefined>` and `runCli` returns `0` when collection is cancelled. Printed next-steps line corrected to `pnpm exec create-access-router-mongo-starter-deploy-netlify --help` (the deploy parser rejects a bare `--`, so the old `-- --help` form threw `Unknown option`). CARMSF-03 commit-point block left intact.
  - `packages/create-access-router-mongo-starter/tests/scaffold-safety.test.ts` — new `inserts all four JS replacement sequences literally (CARMSF-04)` regression: title `Lit $$ amp $& tick $` + backtick + ` quote $' end` survives exactly in TSX (`{JSON.stringify(title)}`), HTML-escaped index.html, and escaped README; package.json parses as valid JSON.
  - `packages/create-access-router-mongo-starter/tests/scaffold-prompts.test.ts` (new) — mocks `@clack/prompts`: accepting defaults for `--name @scope/my.app -i` derives db `my-app` (old code threw `Invalid MongoDB database name`); cancelling each of the target/name/title/db prompts resolves `0` with no filesystem mutation and no `process.exit`.
  - `packages/create-access-router-mongo-starter/tests/orchestration-seams.test.ts` — injected `promptMissing: async () => undefined` resolves `0` with zero mutations and no exit; printed deploy-help line asserted exactly without the pnpm separator.
  - `packages/create-access-router-mongo-starter/tests/packed-consumer.test.ts` — generated title extended with all four `$` sequences (packed literal-title case); new `pnpm exec create-access-router-mongo-starter-deploy-netlify --help` execution in the installed consumer asserts status 0.
- Pre-fix failure basis: old string replacers collapsed `$$`→`$`, expanded `$&`/`` $` ``/`$'`; old db default `@scope/my.app` failed validation; old cancel called `process.exit(0)`; old printed `-- --help` threw `Unknown option: --` in the deploy parser.
- Commands run + results (repo root, serialized):
  - V1 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/scaffold-safety.test.ts tests/scaffold-prompts.test.ts tests/orchestration-seams.test.ts` — 3 files, 56/56 passed.
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"` — clean; `pnpm --filter create-access-router-mongo-starter test` — 11 files, 216/216 passed.
  - V3 `pnpm --filter create-access-router-mongo-starter build` then `exec vitest run tests/packed-consumer.test.ts` — 2/2 passed (frozen install, build, typecheck, lint, test, serverless in generated consumer; literal `$`-title scaffold; printed `pnpm exec ... --help` exits 0 in installed consumer).
- Acceptance proof: all four replacement sequences survive exactly with valid JSON/TSX/HTML; `@scope/my.app` defaults accepted; cancel returns 0 w/o mutation/exit; exact printed deploy-help command succeeds in the installed consumer. No `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: none.

### Task CARMSF-05: Validate Destructive Output Paths After Sandbox Preparation

Status: completed

Kind: defect

Priority: P0, valid CLI options can direct builders to delete dependency/source data.

Suggested agent: deployment filesystem safety specialist

Dependencies: none

Primary ownership: `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts`, `tests/deploy-shared.test.ts`.

Finding: sandbox outputs are checked before `ensureSandboxLinks` creates `node_modules` pointing outside the sandbox. A fresh sandbox with `--dist-dir node_modules` therefore passes containment, then Vite follows the new link with `--emptyOutDir`. Project mode also accepts `--dist-dir .` or `src`. Output directories are not compared with each other, allowing the clean backend build to erase frontend output or place functions beneath public static output. Existing tests cover pre-existing escape links, not the helper-created link or cross-output relationships. Prior overlap: CARMS-03/08.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:244-260,290-370` (path planning and dependency links).
- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:493-513` (destructive builders).

Requirements: reserve dependency/input/config directories; apply canonical destructive-output safety in every mode; perform final checks after owned links exist and before builders run. Require canonically disjoint frontend/function outputs. Define safe handling of external output directories rather than silently treating arbitrary locations as disposable. Do not weaken symlink-aware cleanup.

Acceptance criteria: fresh persistent and ephemeral sandboxes reject `node_modules` and descendants; project mode rejects root/ancestor/source/dependency targets and aliases; equal outputs and either ancestry direction reject before a runner is called; external sentinels remain unchanged; normal disjoint paths still work. Record the deliberately narrowed CLI contract.

Verification: V1 `tests/deploy-shared.test.ts`, then V2. Use fake runners and filesystem sentinels, not actual destructive builds for negative cases.

Completion evidence:

- Changed files:
  - `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts` — new `RESERVED_DEPENDENCY_SEGMENT` (`node_modules`) and `RESERVED_PROJECT_SUBPATHS` (`node_modules`, `api`, `src`, `public`, `.git`); new exported `assertDestructiveOutputsSafe()` enforcing canonical destructive-output safety in every mode (strictly-inside-deploy-dir containment incl. root/ancestor/external rejection, `node_modules`-segment reservation, project-mode reserved-subtree overlap in both directions, mutual disjointness incl. both ancestry directions — all symlink-aware via `canonicalProjectedPath`). `validateSandboxOutputOption()` now rejects `node_modules` segments lexically (covers dry-run placeholders); `resolveSandboxOutputs()` runs the canonical check (post-link); `resolvePaths()` creates the helper-owned `node_modules` link BEFORE resolving sandbox outputs and validates project-mode outputs with `projectMode=true`; `buildArtifacts()` re-validates via `assertDestructiveOutputsSafe()` before any runner call (fs methods default to real fs when fakes omit them), so hand-constructed equal/nested paths reject with zero runner invocations. `SHARED_HELP` records the narrowed contract. Symlink-aware ephemeral cleanup untouched.
  - `packages/create-access-router-mongo-starter/tests/deploy-shared.test.ts` — new `destructive output safety (CARMSF-05)` block (6 tests): fresh persistent sandbox rejects `node_modules`/`node_modules/sub` for both options plus an escape-alias (`alt -> outside`) via canonical resolution; ephemeral rejects via dry-run lexical + real post-link canonical (temp leftovers removed); option-validation lexical reservation; project mode rejects `.`, `..`, `src`, `src/nested`, `api`, `node_modules`, `node_modules/sub`, `alias-src` (+nested), absolute external targets, and `functionsDir` `api`/`.`, with sentinel intact; equal/nested outputs reject at `resolvePaths` (sandbox+project) and at `buildArtifacts` with fake runners (zero invocations); disjoint outputs still build (`vite` + `wtt-access-router-runtime` invoked).
- Deliberately narrowed CLI contract: every `--dist-dir`/`--functions-dir` output must be a disposable directory strictly inside the deploy directory (project root in project mode — root/ancestor/external targets refused, not treated as disposable); `node_modules` and descendants never disposable; project-mode `api`/`src`/`public`/`.git` subtrees reserved in both overlap directions (aliases included); frontend/functions outputs must be canonically disjoint. Documented in `SHARED_HELP`.
- Pre-fix failure basis: old `resolvePaths` checked containment before `linkNodeModules`, so `--dist-dir node_modules` passed and only later followed the new link; project mode had no output validation (`--dist-dir .`/`src` accepted); no cross-output comparison existed — all new rejection assertions fail against the old code.
- Commands run + results (repo root, serialized):
  - V1 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/deploy-shared.test.ts` — 57/57 passed.
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint` on both touched files — clean; `pnpm --filter create-access-router-mongo-starter test` — 11 files, 222/222 passed.
- Acceptance proof: all negative cases use fake runners/filesystem sentinels (no destructive builds); outside sentinels byte-identical after every rejection; normal disjoint project/sandbox paths unchanged. No `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: none; CARMSF-06 (artifact verification) is unblocked.

### Task CARMSF-06: Verify Producer Artifacts Before Any Remote Mutation

Status: completed

Kind: defect

Priority: P1, valid no-build deployments fail and invalid builds can mutate remote state.

Suggested agent: deployment artifact integration specialist

Dependencies: CARMSF-05

Primary ownership: `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts`, `scripts/deploy-netlify.ts`, deploy/packed-consumer tests.

Finding: no-build inspection requires `main.js` while the generated module project builds CommonJS as `main.cjs`. Tests manually create `.js` rather than consume a real build. Successful build exit codes also lead directly to remote changes without checking required artifacts. Prior overlap: CARMS-01/08/19.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:497-550` (build and inspection).
- `packages/create-access-router-mongo-starter/template/package.json:6,22-23` (producer contract).
- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:895-900` (build-to-mutation transition).
- `packages/create-access-router-mongo-starter/tests/deploy-shared.test.ts:342-361` (synthetic fixture).

Requirements: make expected extension/path agree with the actual runtime bundler and validate both reused and newly built artifacts before site creation/environment writes. Avoid changing shared runtime packages unless their current contract actually requires it.

Acceptance criteria: a generated serverless build passes inspection and `--no-build` in project/persistent modes; successful fake builders that omit required artifacts stop before remote calls; invalid artifacts produce controlled diagnostics. Test build-to-consumer behavior, not duplicate filename assumptions.

Verification: V1 deploy-shared and orchestration tests, V2, V3 extended with real build-to-no-build reuse and stubbed provider operations.

Completion evidence:

- Changed files:
  - `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts` — `inspectArtifacts()` now requires `${functionsName}.cjs` (was `.js`), matching the backend builder's fixed `--format cjs` invocation through tsup in a `"type": "module"` producer (template `pnpm serverless` writes `api/functions/main.cjs`; `serverless:start` consumes it). `runSharedCli()` re-inspects newly built output when not `--no-build` (skipped only for `--dry-run`, which runs no builders), so a zero-exit builder that omits artifacts fails with a controlled diagnostic instead of reporting success. CARMSF-05 destructive-output safety untouched.
  - `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts` — `runDeploy()` applies the same rule: `--no-build` inspects reused artifacts; otherwise it builds then inspects (unless `--dry-run`) before `ensureNetlifyToml`, site lookup/creation, env writes, and deploy. No shared runtime package changed (bundler contract confirmed read-only: tsup `format: [cjs]` with `--out-name main`).
  - `packages/create-access-router-mongo-starter/tests/deploy-shared.test.ts` — synthetic fixture updated to the `.cjs` contract (stale `.js`-only bundle now fails; empty `.cjs` fails; valid `.cjs` passes); new `verifies newly built artifacts before reporting success (CARMSF-06)` regression drives `runSharedCli` with a producer-shaped fake builder (writes `dist/index.html` + `main.cjs`, exit 0) and an omitting builder (exit 0, no files → exit 1 with `Functions artifact directory|Serverless function artifact` diagnostic).
  - `packages/create-access-router-mongo-starter/tests/orchestration-seams.test.ts` — existing `runDeploy` orderings updated for the new `build → inspect → fs:toml → remote` sequence; new `stops before remote calls when a successful build omits producer artifacts (CARMSF-06)` regression uses the real default inspection service: empty dirs stop before `ensureNetlifyToml`/site/env/deploy, empty files fail with `must be a non-empty file`, and producer-shaped files reach the stubbed provider.
  - `packages/create-access-router-mongo-starter/tests/packed-consumer.test.ts` — V3 now does real build-to-`--no-build` reuse: after `pnpm build` + `pnpm serverless`, the real `api/functions/main.cjs` is relocated to the deploy layout `netlify/functions/main.cjs` (project-mode `api/` is a CARMSF-05 reserved source tree), then the installed `deploy-shared --no-build` exits 0; a stale `.js`-only bundle exits non-zero with `Serverless function artifact`; the installed `deploy-netlify --no-build --dry-run` with a shimmed `netlify` binary exits 0 with no remote mutation.
- Pre-fix failure basis: old `inspectArtifacts` required `main.js`, so the new `.cjs` assertions and the packed-consumer stale-`.js` check fail against the old code; old `runSharedCli`/`runDeploy` never inspected after building, so the omitting-builder regressions (expecting failure exit / rejection before remote calls) fail against the old code.
- Commands run + results (repo root, serialized):
  - V1 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/deploy-shared.test.ts tests/orchestration-seams.test.ts` — 2 files, 93/93 passed.
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"` — clean; `pnpm --filter create-access-router-mongo-starter test` — 11 files, 224/224 passed.
  - V3 `pnpm --filter create-access-router-mongo-starter build` then `exec vitest run tests/packed-consumer.test.ts` — 2/2 passed (frozen install, build, typecheck, lint, test, real `serverless` bundle, `--no-build` reuse, stale-`.js` rejection, stubbed-provider dry run).
- Acceptance proof: generated `main.cjs` passes inspection and `--no-build` reuse; zero-exit fake builders omitting artifacts stop before any remote call (deploy-shared exit 1; `runDeploy` rejects before `ensureNetlifyToml`/site/env/deploy); empty/missing artifacts yield controlled `must be a non-empty file` / `is missing` diagnostics. No `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: none; CARMSF-07 (credential-bearing parse failures) is unblocked.

### Task CARMSF-07: Sanitize Credential-Bearing Parse Failures

Status: completed

Kind: defect

Priority: P1, parser diagnostics bypass the credential redaction boundary.

Suggested agent: CLI security specialist

Dependencies: CARMSF-06

Primary ownership: both deployment parsers and process-level CLI tests in `packages/create-access-router-mongo-starter`.

Finding: unsupported equals-form options such as `--auth-token=dummy-secret` and `--mongodb-uri=mongodb://...` are echoed in unknown-option errors. Netlify's catch derives secrets from options assigned only after successful collection, so parse failures have no redaction list; the shared CLI also logs its raw parse error. Existing log tests exercise post-collection behavior. Prior overlap: CARMS-04.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:577,1050-1056,1081`.
- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:681,722-724`.

Requirements: never print unknown option values that may contain credentials; either support equals-form parsing consistently or reject it with value-free diagnostics. Make safe errors independent of successful collection. Preserve environment/masked-prompt recommendations and avoid including secrets in child argv.

Acceptance criteria: both bins reject or accept dummy equals-form secrets without their values appearing in stdout/stderr, with and without environment-provided credentials; parse failures cause no remote or filesystem mutation; useful option-name diagnostics remain.

Verification: V1 deploy and process/orchestration tests, then V2 and installed-bin checks in V3.

Completion evidence:

- Changed files:
  - `packages/create-access-router-mongo-starter/src/shared/arg-parser.ts` — added `splitEqualsOption()` (first-`=` split, values may contain `=`), `readOptionValue()` (equals-form or space-form; empty equals reported as `Missing value`, never echoed), and `unknownOptionError()` (reports only the option name before any `=`, plus help).
  - `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts` — `parseSharedArgs()` supports `--opt=value` for every long value-taking option (`--project-root`, `--api-base-url`, `--mongodb-uri`, `--dist-dir`, `--functions-dir`, `--functions-name`, `--sandbox-dir`); boolean flags and unknown options with `=` throw value-free `Unknown option: <name>`; `runSharedCli()` catch redacts `process.env.MONGODB_URI` even when collection never succeeded. CARMSF-05/06 behavior untouched.
  - `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts` — `collectCliOptions()` supports `--opt=value` for every long value-taking option (short flags `-t/-s/-m` stay space-form; `-t=...` etc. rejected value-free); unknown/flag-with-equals diagnostics are value-free; `runNetlifyCli()` catch falls back to `process.env.NETLIFY_AUTH_TOKEN`/`MONGODB_URI` when `options` is undefined, so redaction no longer depends on successful collection. Child argv unchanged (auth via `NETLIFY_AUTH_TOKEN` env, mongo via site env writes; secrets only in redacted command logs).
  - `packages/create-access-router-mongo-starter/tests/deploy-parse-redaction.test.ts` (new, 6 tests) — netlify equals-form acceptance; netlify/shared unknown-equals value-free rejection; `runNetlifyCli`/`runSharedCli` process-level checks with and without env credentials (exit 1, option name present, no argv/env secret in output, `resolvePaths`/`runDeploy`/`buildArtifacts` never called); valid equals-form acceptance without leaking secrets.
- Pre-fix failure basis: old `default:` branch interpolated the raw argv element (`Unknown option: ${a}`), so every new unknown-equals assertion (expecting no secret in output) fails against the old code; old netlify catch used only `options?.authToken/mongodbUri` (undefined on parse failure) and old shared catch had no redaction at all.
- Commands run + results (repo root, serialized):
  - V1 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/deploy-shared.test.ts tests/deploy-netlify.test.ts tests/orchestration-seams.test.ts tests/deploy-parse-redaction.test.ts` — 4 files, 121/121 passed.
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint` on the four touched files — clean; `pnpm --filter create-access-router-mongo-starter test` — 12 files, 230/230 passed.
  - V3 `pnpm --filter create-access-router-mongo-starter build` then `exec vitest run tests/packed-consumer.test.ts` — 2/2 passed; built-bin probes (`node dist/bin/deploy-shared.js` / `deploy-netlify.js --bogus-option=dummy-secret-xyz`) exit 1 with `Unknown option: --bogus-option` and zero secret matches, with and without `NETLIFY_AUTH_TOKEN`/`MONGODB_URI` env credentials; valid `--mongodb-uri=... --no-build` parses (fails only on missing cwd artifacts, no secret in output).
- Acceptance proof: both bins accept dummy equals-form secrets (parsed into options, never printed) and reject unknown equals-form options value-free; env-credential runs leak neither argv nor env values; parse failures reach no `resolvePaths`/`runDeploy`/`buildArtifacts` (no remote/filesystem mutation); option-name diagnostics retained. No `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: none; CARMSF-08 (context/scope contract) is unblocked.

### Task CARMSF-08: Establish A Consistent Netlify Context And Scope Contract

Status: completed

Kind: investigation

Priority: P1, configuration writes and deployment targets can diverge.

Suggested agent: Netlify provider integration specialist

Dependencies: CARMSF-07

Primary ownership: `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts`, `scripts/netlify-api.ts`, related tests/docs.

Finding: `--context branch:staging` controls environment writes but does not independently associate the no-build deployment with that branch. The installed CLI's `--context` is build-only, so simply forwarding it is not established as a fix. Separately, free-tier setting accepts existing Functions-only scopes while verification insists on all scopes, allowing mutation followed by deterministic verification failure after a prior paid-tier deployment. Existing tests cover helpers/individual policies rather than the complete target/scope matrix. Prior overlap: CARMS-04/08/09/13/18.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:631-633,948-999` (context and deploy argv).
- `packages/create-access-router-mongo-starter/scripts/netlify-api.ts:369-377,487-493` (scope mismatch).
- `packages/create-access-router-mongo-starter/template/README.md:248-249` (branch-context guidance).

Requirements: bound investigation to the pinned Netlify CLI/API and document a supported context/branch/alias/production matrix. Establish which options can target the written environment at runtime and recommend rejecting unsupported combinations before mutation. Resolve the setter/verifier scope policy consistently without automatically broadening Mongo secret visibility. Never treat an alias as proof of a true branch deployment.

Acceptance criteria: evidence-backed matrix covers context-only, branch, alias, preview, and production; existing Functions-only variables under default options have a defined safe set/verify outcome, including hidden values; a concrete follow-up implementation task with ownership/tests is recorded if changes are needed. Provider behavior not provable offline remains explicitly blocked pending an authorized disposable-site check, not guessed.

Verification: inspect pinned CLI behavior and V1 `tests/deploy-netlify.test.ts`, `tests/netlify-api.test.ts`, `tests/orchestration-seams.test.ts` for reproductions. No live writes without explicit authorization. Investigation completion requires a conclusion and executable follow-up, not a speculative fix.

Completion evidence:

- New investigation-evidence file (no source behavior changed):
  - `packages/create-access-router-mongo-starter/tests/netlify-context-scope-matrix.test.ts` (8 tests, offline, stubbed services/mock API client only, zero network/live writes).
- Pinned-CLI facts established offline (`netlify-cli` 26.2.0, the package devDependency; `@netlify/api` ^15.1.0 via `scripts/netlify-api.ts`):
  - `netlify deploy --help`: `--alias` "doesn't create a branch deploy and can't be used in conjunction with the branch subdomain feature"; `--context` is documented as "environment variables read during the build" (build-time input). This deployer always invokes `deploy --no-build` (`scripts/deploy-netlify.ts:1056`), so forwarding `--context` to the CLI could not associate the deployment with a branch at runtime — forwarding it is NOT an established fix.
  - `netlify env:set --help`: `--context branch:<name>` writes a branch-context env value, independent of any deploy; nothing links that write to a later `deploy --alias` draft URL.
- Evidence-backed matrix (reproduced via real `runDeploy` with stubbed services; env context captured at `setSiteEnvVar`, deploy target captured at `runCapture` argv):
  - Default preview: env `deploy-preview`, deploy is a plain draft (no `--alias`/`--prod`, never `--context`/`--branch`) — deploy carries no branch association.
  - Context-only (`--context branch:staging`): env targets `branch:staging`, deploy stays a plain draft — DIVERGENT.
  - Alias-only (`--alias staging`): deploy gets a predictable URL but env stays `deploy-preview`, and per pinned CLI help alias is not a branch deploy — DIVERGENT; alias is never branch proof.
  - `--branch staging`: `applyBranchOverride` synthesizes `alias`+`context` pre-mutation, so env targets `branch:staging` but the deploy argv is still only `--alias staging` — DIVERGENT; env/URL naming match by convention, not by a true branch deployment.
  - `--prod` (+ acknowledgement): env context forced to `production`, deploy argv carries `--prod` — the only fully-associated combo. `--prod` + `--alias`/`--branch` is rejected pre-mutation (regression asserts zero builder/runner calls).
- Functions-only scope outcome under default (free-tier) options, including hidden values (reproduced via mock API client):
  - Setter preserves pre-existing `scopes: ['functions']` + `is_secret: true` via the value-only `setEnvVarValue` path (no `updateEnvVar`/`createEnvVars`, no broadening of `MONGODB_URI` visibility) — safe set outcome.
  - Verifier under the same free-tier options then reports `{ status: 'mismatch', mismatches: ['scope'] }` because it expects `ALL_ENV_SCOPES` — deterministic post-mutation verification failure for vars left over from a prior paid-tier deploy.
  - Hidden secret values (no readable `value` field) with a sensitivity mismatch make the setter bail with the existing manual-migration guidance and zero mutations — safe, no guessing.
- Commands run + results (repo root, serialized):
  - V1 new file `tests/netlify-context-scope-matrix.test.ts` — 8/8 passed.
  - V1 `tests/deploy-netlify.test.ts`, `tests/netlify-api.test.ts`, `tests/orchestration-seams.test.ts` — 3 files, 95/95 passed.
  - `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint` on the new test file — clean.
- Conclusion + executable follow-up (recorded, not implemented — speculative fix prohibited by this task):
  - Follow-up implementation task CARMSF-08F (owner: Netlify provider integration specialist; primary ownership: `scripts/deploy-netlify.ts` incl. `validateNetlifyOptions`/`runDeploy` deploy-argv construction, `scripts/netlify-api.ts` setter/verifier scope policy, `template/README.md:248-249` guidance; CARMSF-09 depends on it): (a) reject pre-mutation the unsupported combos the matrix proves divergent — context-only `branch:*` without `--branch`, and `--alias` without `--branch` when branch-scoped env is intended — or document the single supported mapping (`--branch` for branch env + alias draft, `--prod` for production, default for generic preview); (b) resolve the setter/verifier scope policy consistently without broadening `MONGODB_URI` visibility — e.g. detect pre-existing narrower scopes under free-tier options before mutation and either fail closed with migration guidance or verify against the preserved scopes; (c) never treat alias as branch proof in docs/diagnostics. Tests: extend `tests/netlify-context-scope-matrix.test.ts` (rejection-before-mutation ordering, scope set/verify agreement incl. hidden values) plus `tests/orchestration-seams.test.ts` deploy-argv assertions; docs: correct `template/README.md` branch-context guidance (coordinate with CARMSF-15).
  - Explicitly blocked pending authorized disposable-site live check (NO live writes performed): which runtime context a draft/alias deploy actually reads at request time (deploy-preview vs branch vs all), and whether a true branch deploy is achievable from `netlify deploy --no-build` at all. Prerequisite per task rules: explicit authorization plus a disposable site/token with env:write scope; offline evidence above must not be treated as proof of runtime reads.

### Task CARMSF-09: Retain Deployment Outcomes Across Cleanup And Preflight Failures

Status: completed (Windows native execution blocked — see evidence)

Kind: defect

Priority: P2, misleading failure reporting can trigger duplicate remote operations.

Suggested agent: deployment lifecycle/testability specialist

Dependencies: CARMSF-08 and any implementation follow-up that owns the same orchestration code

Primary ownership: `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts`, shared runner only as necessary, orchestration tests.

Finding: `main` discards the successful `DeploymentReport`, then cleanup can throw outside the `DeployFailure` report path. A successful deployment is consequently reported as a generic failure. Windows handling also resolves a `.cmd` shim but sends it to a shell-free spawn; actual platform support has not been executed. Prior overlap: CARMS-01/03/08.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:131-180,1070-1087`.
- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:428,455,569-582`.

Requirements: retain and report remote success when local cleanup fails; keep cleanup safety checks. Ensure tool preflight exercises the same invocation mechanism used later. Validate Windows shim invocation or explicitly narrow the support contract; do not enable a shell around arbitrary arguments as a shortcut. Keep process/environment ownership at a small orchestration boundary.

Acceptance criteria: injected cleanup failure after remote success yields explicit completed-deployment and local-cleanup diagnostics; retry implications and exit behavior are documented; deployment failure still reports completed mutations. A Windows process-level test establishes safe argument preservation and shim execution, or a documented platform limitation remains tracked as blocked follow-up.

Verification: V1 orchestration/deploy tests, V2; Windows CI/process harness for shim behavior. Linux mocks alone do not close Windows support.

Completion evidence:

- Changed files:
  - `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts` — added exported `isWindowsShellShimCommand()` and `assertShellFreeInvocationSupported(cmd, platform)` (defaults to `process.platform` for testability); `run()`/`runCapture()` call the guard first, preserving the single shell-free (`shell: false`, argv-array) ownership boundary. No shell is enabled around arbitrary args.
  - `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts` — `resolveNetlifyCli()` asserts the shell-free contract after PATH lookup; `runDeploy()` preflight asserts the same contract on every injected/resolved CLI before any site/env mutation; `runCaptureNetlify()` re-asserts at the later invocation (defense in depth, args still passed as argv array). `runNetlifyCli()` retains the `DeploymentReport` across cleanup: cleanup failure after remote success now emits explicit `Deploy completed successfully, but local cleanup failed` + `Local cleanup failed: <reason>` + retry/exit guidance (`do not retry the deploy`, manually remove sandbox, re-run creates a new remote deploy, exit 1), lists completed remote mutations, and calls `keepSandboxOnFailure`; the `DeployFailure` remote-mutation path is unchanged. `HELP` documents exit behavior (0 success; 1 deploy failure with mutation list; 1 cleanup-after-success with completed-deploy listing) and the narrowed platform contract (native Windows `netlify.cmd` execution unsupported/rejected pre-mutation; use WSL2/Linux/macOS or manual CLI; no shell shortcut). Cleanup safety checks (`cleanupSandbox` identity guards) untouched. No CARMSF-08F scope implemented (no context/branch/alias or scope-policy changes).
  - `packages/create-access-router-mongo-starter/tests/deploy-cleanup-windows.test.ts` (new, 6 tests, CARMSF-09-owned separate file to avoid orchestration-seams ordering conflicts) — cleanup-after-success diagnostics/exit/mutation listing/keep-on-failure; deploy-failure mutation reporting via `runNetlifyCli`; shim extension detection; win32 guard rejection vs linux/win32-exe passes; preflight guard wired before build/remote work; real shell-free arg preservation (`node echo-args.mjs` with spaces/`=`/`$...;`/`quotes`/backticks round-trips exactly via `runCapture`).
- Pre-fix failure basis: old `runNetlifyCli` discarded the `runDeploy` return and called `cleanupSandbox` outside any report path, so the new cleanup-failure test (expecting completed-deploy diagnostics + mutation list + exit 1) fails against the old code as a generic failure; old `resolveNetlifyCli`/`runCaptureNetlify` had no shim guard, so win32 `.cmd` was returned then sent to shell-free spawn.
- Commands run + results (repo root, serialized):
  - V1 `exec vitest run tests/orchestration-seams.test.ts tests/deploy-netlify.test.ts tests/deploy-shared.test.ts tests/netlify-context-scope-matrix.test.ts tests/deploy-parse-redaction.test.ts tests/deploy-cleanup-windows.test.ts` — 6 files, 135/135 passed.
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint` on the three touched files — clean; `pnpm --filter create-access-router-mongo-starter test` — 14 files, 244/244 passed.
- Acceptance proof: injected cleanup throw after a 2-mutation completed report yields exit 1 with `Deploy completed successfully` + `Local cleanup failed: simulated cleanup failure` + `do not retry` + `Exit 1` + both `completed` mutations, and `keep-on-failure` (no `Deploy finished.`); `DeployFailure` via `runNetlifyCli` still lists `Remote state may remain` + completed mutation with no success-path cleanup. CARMSF-08 evidence/follow-up (CARMSF-08F) read first; no conflicting context/scope changes made.
- Follow-ups / blocked: Windows NATIVE execution remains blocked, not verified. Missing prerequisite: a Windows host/CI runner (or Windows process harness) capable of executing the installed `deploy-netlify` bin against a `.cmd` shim to prove shim behavior end-to-end. What is covered on Linux: value-free shim rejection unit tests with explicit `win32` platform injection, shared-runner argv-array preservation (tricky args round-trip with `shell: false`), and the narrowed support contract in `HELP`/diagnostics. No shell around arbitrary args was enabled. No `dist/` files hand-edited; CHANGELOG.md untouched.

Kind: defect

Priority: P2, misleading failure reporting can trigger duplicate remote operations.

Suggested agent: deployment lifecycle/testability specialist

Dependencies: CARMSF-08 and any implementation follow-up that owns the same orchestration code

Primary ownership: `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts`, shared runner only as necessary, orchestration tests.

Finding: `main` discards the successful `DeploymentReport`, then cleanup can throw outside the `DeployFailure` report path. A successful deployment is consequently reported as a generic failure. Windows handling also resolves a `.cmd` shim but sends it to a shell-free spawn; actual platform support has not been executed. Prior overlap: CARMS-01/03/08.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:131-180,1070-1087`.
- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:428,455,569-582`.

Requirements: retain and report remote success when local cleanup fails; keep cleanup safety checks. Ensure tool preflight exercises the same invocation mechanism used later. Validate Windows shim invocation or explicitly narrow the support contract; do not enable a shell around arbitrary arguments as a shortcut. Keep process/environment ownership at a small orchestration boundary.

Acceptance criteria: injected cleanup failure after remote success yields explicit completed-deployment and local-cleanup diagnostics; retry implications and exit behavior are documented; deployment failure still reports completed mutations. A Windows process-level test establishes safe argument preservation and shim execution, or a documented platform limitation remains tracked as blocked follow-up.

Verification: V1 orchestration/deploy tests, V2; Windows CI/process harness for shim behavior. Linux mocks alone do not close Windows support.

### Task CARMSF-10: Bind Deletes To The Actual Integrity Transaction

Status: completed

Kind: defect

Priority: P1, documented reference integrity does not cover the actual delete operation.

Suggested agent: Mongoose transaction/integration specialist

Dependencies: none

Primary ownership: `packages/create-access-router-mongo-starter/template/api/src/models.ts`, `api/src/integrity.ts`, focused generated backend integration tests. Coordinate before touching shared access-router services.

Finding: document pre-delete middleware sets `document.$session()` after Mongoose has constructed the delete query and copied its original session. The actual delete therefore lacks the transaction session. The review's collection-stub probe confirmed the propagation defect; a Category delete can contend with its own transaction lock, and check/delete atomicity is not established. Existing tests invoke integrity helpers on fake documents instead of executing document middleware. Prior overlap: CARMS-12.

References:

- `packages/create-access-router-mongo-starter/template/api/src/models.ts:32-41` (document delete middleware).
- `packages/create-access-router-mongo-starter/template/api/src/integrity.ts:21-26,63-82`.
- `packages/access-router/src/services/service.ts:908-909` (`doc.deleteOne()` caller).
- `packages/create-access-router-mongo-starter/template/tests/api-contract.test.ts:112-159` (helper-level coverage).

Requirements: establish transaction ownership before the actual operation captures its options, using the smallest appropriate persistence boundary. Preserve reject-referenced-Category semantics, correct session disposal, and rollback/error sanitization. Do not infer save-hook behavior from delete-hook behavior. Avoid broad service rewrites.

Acceptance criteria: no-database real-Mongoose regression proves the collection delete receives the intended session; replica-set tests successfully delete an unreferenced Category, reject referenced deletion, and cover concurrent reference creation/deletion; failed operations do not hide an already committed outside-transaction delete; sessions terminate on success/failure. Include route-driven persisted CRUD, not only direct helper tests.

Verification: V3 generated tests plus a new isolated replica-set lane with recorded command/prerequisites; V2. Stub-only tests do not establish concurrency guarantees.

Completion evidence:

- Shared-service contract re-read first (`packages/access-router/src/services/service.ts:878-916`: `delete()` runs `beforeDelete`, then bare `doc.deleteOne()`, then `afterDelete`; no session is passed). No shared service, router, save-hook, or error-boundary file was changed — the fix stays inside the template persistence boundary.
- Root cause confirmed in pinned Mongoose (`Model.prototype.deleteOne`, `lib/model.js:816-875`): `query.options.session` is copied from `this.$session()` BEFORE document pre-hooks run; the actual filter/options are captured AFTER pre-hooks via `query.deleteOne(where, options)`. Setting `document.$session()` in the pre-hook is therefore too late, but mutating the pre-hook's `options.session` in place lands in the capture (verified with a real-Mongoose probe: mutating `options.session` in `pre('deleteOne', {document:true})` reaches `collection.deleteOne`).
- Changed files:
  - `packages/create-access-router-mongo-starter/template/api/src/integrity.ts` — new `bindSession()` sets `document.$session(session)` AND `options.session` (in-place, so the post-pre capture carries it); `begin()` reuses an existing WeakMap session (idempotent for double-invocation); `beginTodoIntegrityWrite`/`beginCategoryIntegrityDelete` accept and forward the delete `options`. Lock, reference-check, conflict, commit/abort, and sanitization semantics unchanged.
  - `packages/create-access-router-mongo-starter/template/api/src/models.ts` — document `deleteOne` pre-hooks now forward `(doc, options)` to the integrity begin functions (plain-object `options` only; never the document itself). Save hooks untouched.
  - `packages/create-access-router-mongo-starter/template/tests/integrity-transaction.test.ts` (new, 4 tests) — no-DB real-Mongoose session-binding regression (real `categorySchema`/`todoSchema` models, mocked `db.startSession`, real `doc.deleteOne()` query construction, spied `collection.deleteOne`); referenced-delete abort regression; uncategorized-Todo save-hook preservation check; route-driven replica-set lane (supertest against `createAccessRouterRuntime` with a `MongoMemoryReplSet` URI).
  - `packages/create-access-router-mongo-starter/template/package.json` — added `mongodb-memory-server@^11.2.0` devDependency for the replica-set lane (staged lockfile regenerated via real `pnpm` resolution, CARMSF-02 fail-closed validation intact).
  - `packages/create-access-router-mongo-starter/tests/packed-consumer.test.ts` — added the new template test to `expectedPackedFiles` (one line; sibling-lane content untouched).
- Pre-fix failure basis: old pre-hooks never touched `options`, so the new no-DB assertion (collection `session` defined with the transaction marker) fails against the old code with `session === undefined`.
- Replica-set lane command/prerequisites: isolated command `pnpm exec vitest run tests/integrity-transaction.test.ts` inside the generated app (runs as part of generated `pnpm test` in V3); prerequisites are the new `mongodb-memory-server@^11.2.0` devDependency plus a cached/downloadable `mongod` binary (this lane ran against cached `mongod` 7.0.24/8.2.6; without the module/binary the lane skips with an explicit prerequisite message instead of fabricating success).
- Commands run + results (repo root, serialized):
  - `pnpm --filter create-access-router-mongo-starter build` — clean (tsup + real pnpm staging; `mongodb-memory-server` present in `dist/template/pnpm-lock.yaml`).
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"` — clean; `pnpm --filter create-access-router-mongo-starter test` — 14 files, 244/244 passed.
  - V3 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/packed-consumer.test.ts` — 2/2 passed (frozen install, build, typecheck, lint, generated `pnpm test` 5 files 56/56 incl. the 4 new integrity-transaction tests with a live single-node replica set, `serverless`, `--no-build` reuse).
- Acceptance proof: no-DB test proves lock (`findOneAndUpdate` opts, identical session), reference check, and the real collection delete all carry the intended transaction (collection sees a Mongoose-cloned copy, asserted via unique marker + definedness); referenced delete rejects with `IntegrityConflictError`, performs zero collection deletes, and aborts/ends the session; route-driven replica-set tests delete an unreferenced Category (200 then 404), reject referenced deletion (409, category still present — no hidden outside-tx commit), resolve concurrent Todo-create/Category-delete without dangling references, and accept follow-up writes (sessions terminated). No `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: none; CARMSF-11 (index readiness) can reuse this replica-set lane pattern.

### Task CARMSF-11: Make Backend Readiness And Error Statuses Match Their Contracts

Status: completed

Kind: defect

Priority: P1 for uniqueness readiness; parser status correction is P2.

Suggested agent: backend startup/error-boundary specialist

Dependencies: CARMSF-10

Primary ownership: `packages/create-access-router-mongo-starter/template/api/access-router.config.ts`, model initialization boundary, generated backend tests.

Finding: Category uniqueness is declared as an index but startup does not wait for index readiness; fresh-database requests can precede enforcement, and index build failure is not an explicit readiness failure. The outer Express error handler also maps all errors to 500, including malformed JSON and oversized parser input. Existing tests assert index definitions and model-operation errors, not startup/index timing or raw parser requests. Prior overlap: CARMS-11/12.

References:

- `packages/create-access-router-mongo-starter/template/api/src/models.ts:25` (unique index).
- `packages/create-access-router-mongo-starter/template/api/access-router.config.ts:25-37` (`init`, error handler).
- `packages/access-router-runtime/src/index.ts:574-583` (readiness; re-read concurrent edits).

Requirements: define explicit non-destructive index initialization/readiness or migration policy; do not use destructive index synchronization incidentally. Preserve safe 400/413 classifications for known parser errors without trusting arbitrary error payloads or exposing raw messages. Keep unknown failures generic and the 1 MiB limit intact.

Acceptance criteria: delayed/failed required index creation prevents readiness; concurrent duplicate Category creation on a fresh database yields one record and a sanitized conflict; malformed JSON returns 400 and oversized input 413 through local and serverless paths; unknown errors remain 500 with credential-safe single logging.

Verification: V3 generated API tests and CARMSF-10 replica-set lane; V2. Establish real index readiness, not merely schema metadata.

Completion evidence:

- Changed files:
  - `packages/create-access-router-mongo-starter/template/api/access-router.config.ts` — `init` is now async: after `configureApiErrorBoundary`, it awaits `Promise.all(Object.values(models).map((model) => model.init()))` when `config.db?.url` is set. Non-destructive index readiness policy (documented inline): `Model.init()` builds missing indexes via `createIndex` without dropping/rebuilding; `syncIndexes()` is explicitly prohibited. Index failure rejects `init`, so the runtime never reaches `ready` and serves no requests without the Category unique index. When no database URL is configured (db-less local/serverless parity paths), init proceeds without touching models — `Model.init()` would otherwise buffer indefinitely on a disconnected connection (this preserves the existing `db: undefined` parity tests in `api-contract.test.ts`). The outer Express `errorHandler` now resolves via `resolveExpressError` (still single `logServerError` call) and returns its sanitized status/message with the same `{ success, message }` shape. The 1 MiB JSON limit is untouched (no `json` override; `express-runtime` default `{ limit: '1mb' }`).
  - `packages/create-access-router-mongo-starter/template/api/src/errors.ts` — new exported `resolveExpressError()`: returns sanitized `400 'Invalid request.'` only for allowlisted body-parser types `entity.parse.failed` / `entity.parse.invalid-charset` / `entity.verify.failed`, and `413 'Request too large.'` only for `entity.too.large` (a present `status`/`statusCode` contradicting the allowlisted type falls back to 500, so arbitrary error payloads are never trusted and raw messages/bodies never leak). Everything else returns generic `500 'Unexpected server error.'`. Existing `logServerError` (credential-safe structured fields only) and the access-router boundary are unchanged.
  - `packages/create-access-router-mongo-starter/template/tests/readiness-error-boundary.test.ts` (new, 5 tests, reuses the CARMSF-10 `mongodb-memory-server` replica-set lane pattern with per-run `dbName` isolation and skip-with-prerequisites when no `mongod` binary is available): allowlist unit checks (mismatched/unknown/arbitrary statuses → 500); delayed-index gates runtime readiness plus persistent index failure rejects `init()` (replica-set URIs); concurrent duplicate Category POSTs on a fresh database yield exactly `[201, 409]` with a sanitized `{ status: 409, detail: 'Resource conflict.' }` body (no `E11000`/`duplicate key` leakage) and exactly one persisted record; malformed JSON → 400 and 2 MiB input → 413 through both `runtime.app` (supertest) and `createServerlessHandler()`, each logging exactly once on the `express` boundary with no payload leakage; unknown express failure → generic 500 with credential-safe single logging.
  - `packages/create-access-router-mongo-starter/tests/packed-consumer.test.ts` — added the new template test to `expectedPackedFiles` (one line; sibling-lane content untouched).
- Pre-fix failure basis: old `init` was synchronous and never awaited indexes, so the new delayed/failure assertions fail against the old code (init resolves immediately); old `errorHandler` hardcoded `500`, so every new 400/413 assertion fails against the old code.
- Notable finding during verification: Mongoose's `NativeConnection.openUri` itself invokes `Model.init()` during `database.connect()` before the template readiness check runs (confirmed via stack-trace probe: `connection.js` `openUri` → `model.init`). The failure test therefore uses a persistent rejection — a one-shot rejection would be consumed by connect instead of the awaited gate. Either path rejects `init()` with the index failure, so readiness is still prevented; no shared runtime package was changed.
- CARMSF-10 lane reused, not reverted: `models.ts`/`integrity.ts`/replica-set pattern read first and left untouched; full generated suite passes with both lanes present.
- Commands run + results (repo root, serialized):
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint` on the four touched files — clean; `pnpm --filter create-access-router-mongo-starter test` — 14 files, 244/244 passed (includes V3 packed-consumer below).
  - V3 `pnpm --filter create-access-router-mongo-starter build` then `exec vitest run tests/packed-consumer.test.ts` — 2/2 passed (frozen install, `build`, `typecheck`, `lint`, generated `pnpm test` 6 files 61/61 incl. the 5 new readiness-error-boundary tests against live single-node replica sets, `serverless` bundle, `--no-build` reuse).
  - Scratch generated-app reproduction (placeholders resolved, frozen install): `typecheck`, `lint`, `build`, `serverless` all pass; full generated `vitest run` 6 files 61/61 twice consecutively (rules out order-dependence of the new lane).
- Acceptance proof: real index readiness (delayed `Model.init` keeps runtime `init()` pending; failed `Model.init` rejects `init()`), not schema metadata; one-record + sanitized 409 under concurrent duplicates; 400/413 parity across local and serverless with unknown errors generic 500 and single credential-safe logs. No `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: none; CARMSF-12 (literal API prefixes) is unblocked.

### Task CARMSF-12: Enforce Literal API Prefixes Across Mounts And Guards

Status: completed

Kind: defect

Priority: P1, accepted parameterized prefixes can bypass the basic-route guard.

Suggested agent: Express route/security contract specialist

Dependencies: CARMSF-11

Primary ownership: `packages/create-access-router-mongo-starter/template/src/shared/normalize-api-base-url.ts`, `template/api/src/routers.ts`, package prefix tests and generated route tests.

Finding: `/api/:version` passes normalization. Express interprets it as a route pattern, but `enforceBasicRouteContract` compares the configured literal prefix. Requests mounted at `/api/v1/...` can therefore miss the advanced-write/filter/ID guard. Other accepted metacharacters can fail Express registration. The default `/api` is not affected by this mismatch. Existing prefix tests cover URL syntax, not literal-versus-pattern matching. Prior overlap: CARMS-10/13.

References:

- `packages/create-access-router-mongo-starter/template/src/shared/normalize-api-base-url.ts:7-33`.
- `packages/create-access-router-mongo-starter/template/api/src/routers.ts:28-60,91-113`.
- `packages/create-access-router-mongo-starter/tests/template-api-base-url.test.ts:18-33`.

Requirements: define a literal-safe route-prefix grammar or make mount and guard semantics identically literal; apply it to every configuration consumer. Keep legitimate nested prefixes and path-only behavior. Update documentation/release notes for newly rejected values.

Acceptance criteria: route metacharacters, encoded variants, and invalid registrations are rejected consistently or demonstrably treated literally; actual mounted CRUD honors accepted prefixes; advanced mutations stay blocked and list/ID guards stay active through local/serverless entrypoints. Health-only checks are insufficient.

Verification: V1 `tests/template-api-base-url.test.ts`, V3 generated route/base-path integration tests, V2.

Completion evidence:

- Bypass reproduced before the fix on the template's pinned Express 5.2.1: `app.get('/api/:version/todos')` serves `/api/v1/todos` with `params.version='v1'` while a literal `startsWith('/api/:version/todos/')` guard (the `enforceBasicRouteContract` shape) never fires. A Node probe also confirmed `/api/:version`, `/api/*`, `/api/%3Aversion`, `/api+v1`, `/api(x)`, `/api[0]`, `/api{a}` all passed `normalizeApiBaseURL` before the fix.
- Changed files:
  - `packages/create-access-router-mongo-starter/template/src/shared/normalize-api-base-url.ts` — new literal-safe segment grammar `LITERAL_SEGMENT_PATTERN = /^[A-Za-z0-9._~-]+$/u` enforced per segment before the existing dot/encoding checks. Rejects route parameters (`:version`), wildcards (`*`), other route metacharacters (`? + ( ) [ ] { } ^ $ | !` etc.), all percent-encoded characters (`%`, so encoded variants like `%3A`/`%2F`/`%41` are rejected, not decoded-then-compared), and non-ASCII segments. Accepts the default `/api`, nested `/custom/api`, `/v1/api`, `~`/`-`/`_`/`.` segments, and `/.netlify/functions/main`. Every configuration consumer (Vite config, client `src/api.ts`, backend `api/src/config.ts`, deploy-shared validation) calls this shared parser, so mount and guard semantics are identically literal everywhere; no `routers.ts` logic change was needed and none was made.
  - `packages/create-access-router-mongo-starter/tests/template-api-base-url.test.ts` — new acceptance block (5 literal prefixes incl. nested/dotted) plus 15 new rejection cases (parameterized, wildcard, metachar, `+`, `%`-encoded, non-ASCII).
  - `packages/create-access-router-mongo-starter/tests/deploy-shared.test.ts` — `--api-base-url` rejection list extended with `/api/:version`, `/api/*`, `/api(x)`, `/api%41` (concurrent CARMSF-05/06 hunks in the same file left intact).
  - `packages/create-access-router-mongo-starter/template/tests/api-base-path.integration.test.ts` — invalid-prefix startup-rejection list extended with 5 metachar/encoded values; new `honors an accepted custom prefix for mounted CRUD and guards on both entrypoints` test (`/custom/api`, DB-free): invalid create returns 400 under the custom prefix while the default `/api` prefix returns 404, `__mutation` POST/PATCH return 404, bad `__query` filter and malformed ID return 400 — each asserted through both the local server and `createServerlessHandler()`. No new template test files added, so `tests/packed-consumer.test.ts` file list is unchanged.
  - `packages/create-access-router-mongo-starter/template/README.md` — `API_BASE_URL` contract now documents the literal segment charset and the newly rejected classes (route parameters, wildcards, metacharacters, `%`/encoded variants, non-ASCII) with nested/dotted examples.
- Pre-fix failure basis: every new rejection assertion fails against the old parser (old code accepted `/api/:version` etc.); the new custom-prefix guard assertions would pass vacuously under any prefix, but the rejection cases plus the mount/404-split prove literal mounting.
- Commands run + results (repo root, serialized):
  - V1 `exec vitest run tests/template-api-base-url.test.ts tests/deploy-shared.test.ts` — 2 files, 98/98 passed.
  - V2 `typecheck` — clean; `eslint` on the four touched source/test files — clean; `test` — 14 files, 269/269 passed.
  - V3 `build` then `exec vitest run tests/packed-consumer.test.ts` — 2/2 passed three consecutive times (frozen install, build, typecheck, lint, generated `pnpm test` incl. the extended api-base-path suite, `serverless` bundle, `--no-build` reuse). Note: the very first V3 attempt failed 1/2 without a retained log; the identical code then passed 3/3 serial runs, consistent with environment flake (replica-set binary/timing) rather than this change — no new mongodb-dependent test was added here.
- Acceptance proof: metachar/encoded/invalid registrations are rejected consistently at the one shared parser used by all consumers; mounted CRUD honors accepted prefixes (400-under-custom/404-under-default split) with advanced mutations blocked and list/ID guards active via local and serverless entrypoints — beyond health-only checks. Default `/api` behavior unchanged.
- Follow-ups: CARMSF-15 reconciliation should mirror the new literal grammar in `template/AGENTS.md`, `template/.agents/skills/*` (client-data, backend-runtime), package `README.md` (`--api-base-url` paragraph), and deploy `--help` text, which were deliberately left untouched per lane coordination; CARMSF-13 (Mongo grammar) is unblocked. No `dist/` files hand-edited; CHANGELOG.md untouched.

### Task CARMSF-13: Accept MongoDB Connection Grammar Consistently

Status: completed

Kind: defect

Priority: P1, valid transaction-capable deployments are rejected before startup.

Suggested agent: MongoDB configuration specialist

Dependencies: CARMSF-09, CARMSF-12

Primary ownership: `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts`, `template/api/src/config.ts`, corresponding validation tests.

Finding: both validators use WHATWG `new URL`, which rejects normal seed lists such as `mongodb://db-a:27017,db-b:27017/app?replicaSet=rs0`. Existing tests accept only single-host/SRV examples. This conflicts with the template's transaction-capable Mongo requirement. Prior overlap: CARMS-11; merged deployment/runtime observations into this task.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:265-277`.
- `packages/create-access-router-mongo-starter/template/api/src/config.ts:9-25` (`requireMongoUri`).

Requirements: use a MongoDB-aware grammar/parser or bounded driver-compatible validation; keep missing/wrong-protocol inputs rejected with credential-free messages. Choose dependency placement deliberately: generated apps must not import scaffolder internals to share this policy. Keep accepted/rejected behavior aligned with a shared fixture matrix where practical.

Acceptance criteria: multi-host explicit-port, authenticated, supported IPv6, single-host, and SRV inputs have consistent deploy/runtime results; malformed counterparts reject without printing URI contents; tests do not need a database connection to validate grammar.

Verification: V1 deploy-shared tests, V3 generated API config tests, V2.

Completion evidence:

- Dependency placement (deliberate, no new dependencies): new single grammar module `packages/create-access-router-mongo-starter/template/src/shared/mongo-connection-string.ts` exporting `isMongoConnectionString()` lives in the generated template's own `src/shared` tree, so generated apps never import scaffolder internals; `scripts/deploy-shared.ts` imports it from the template source, mirroring the established `normalize-api-base-url.ts` arrangement (CARMSF-09/12 files re-read first; their hunks untouched). No `mongodb-connection-string-url` dependency was added, so CARMSF-02 lockfile validation and the staged lockfile are unaffected.
- Grammar (bounded, no `new URL`, no DB/driver needed): `mongodb://[user[:password]@]host1[:port1][,host2[:port2]...][/db][?opts]` and `mongodb+srv://[user[:password]@]single-host[/db][?opts]`; scheme matched case-insensitively (preserves prior `MONGODB://` acceptance); DNS/IPv4/bracketed-IPv6 hosts; bare unbracketed IPv6 rejected; SRV exactly one host, no port, no IP literals; ports 1-65535; nonblank user when `@` present; no whitespace, no `#` fragment, no nested `/` in db, non-empty query when `?` present. Both validators keep their exact static diagnostics (`--mongodb-uri or MONGODB_URI must be a valid MongoDB connection string.` / `MONGODB_URI must be a nonblank MongoDB connection string using mongodb:// or mongodb+srv://.`), so rejected URIs never echo credentials.
- Changed files:
  - `template/src/shared/mongo-connection-string.ts` (new) — the shared grammar.
  - `template/api/src/config.ts` — `requireMongoUri` delegates to `isMongoConnectionString` after trim (missing/blank still rejected with the same static message).
  - `scripts/deploy-shared.ts` — `validateSharedDeployOptions` delegates to the same grammar (covers both deploy bins; `deploy-netlify.ts` validates through this path; missing-URI and value-free redaction behavior unchanged).
  - `tests/deploy-shared.test.ts` — `MONGO_ACCEPT` (8) / `MONGO_REJECT` (13) fixture matrix: multi-host explicit-port, authenticated multi-host, bracketed IPv6 single + multi, single-host, SRV plain + authenticated accepted; wrong-protocol, missing-hosts, SRV-with-port, whitespace, SRV-multi-host, empty seed entry, out-of-range port, unclosed bracket, bare IPv6, empty user, fragment, empty query, SRV IP-literal rejected with byte-exact static message plus a non-echo assertion.
  - `template/tests/api-contract.test.ts` — mirrored `MONGO_ACCEPT`/`MONGO_REJECT` matrix through `requireMongoUri` with the same exact-message/non-echo assertions (header comment in both files states the matrices must stay aligned; no new template test files, but the new shared module ships in the packed template).
  - `tests/packed-consumer.test.ts` — added `template/src/shared/mongo-connection-string.ts` to `expectedPackedFiles` (one line; sibling-lane content untouched).
- Pre-fix failure basis: old `new URL` parsing throws on any comma seed list, so every new multi-host acceptance assertion fails against the old code in both validators.
- Commands run + results (repo root, serialized):
  - V1 `pnpm --filter create-access-router-mongo-starter exec vitest run tests/deploy-shared.test.ts` — 83/83 passed.
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"` — clean; `pnpm --filter create-access-router-mongo-starter test` — 14 files, 290/290 passed.
  - V3 `pnpm --filter create-access-router-mongo-starter build` then `exec vitest run tests/packed-consumer.test.ts` — 2/2 passed (frozen install, build, typecheck, lint, generated `pnpm test` incl. the extended api-contract matrix, `serverless` bundle, `--no-build` reuse). Note: the first V3 attempt failed 1/2 without a retained log while the V2-embedded run and two subsequent serial runs passed 2/2 with identical code; consistent with the replica-set binary/timing flake recorded in CARMSF-12 — no new DB-dependent test was added here (grammar tests need no database).
- Acceptance proof (no DB connection in any grammar test): built-bin dry-run probe — multi-host `mongodb://db-a:27017,db-b:27017/app?replicaSet=rs0` passes deploy validation (proceeds to artifact inspection, failing only on the empty probe dir's missing build output); malformed `mongodb+srv://h1,h2/db` fails at validation with the static message; staged-template `tsx` probe — multi-host URI loads as `MONGODB_URI` at runtime-config import and all matrix accepts/rejects behave identically to deploy-time with zero URI echo. `git diff --check` clean; no `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: CARMSF-15 reconciliation should mirror the new Mongo grammar in `template/AGENTS.md` / `README.md` guidance and deploy `--help` text where they describe accepted `MONGODB_URI` values, coordinated with that lane (deliberately left untouched here).

### Task CARMSF-14: Preserve Error-Recovery Focus And Shared Category Validation

Status: completed

Kind: defect

Priority: P2, users can lose typing focus and receive misleading validation advice.

Suggested agent: React accessibility/forms specialist

Dependencies: none

Primary ownership: `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx`, `template/tests/home-page.test.tsx`.

Finding: an inline alert ref focuses on each reattachment; its changing identity means unrelated renders after an error can pull focus out of a correction field, despite a separate error-focus effect. Category creation also checks only nonblank text, bypassing the shared 80-character schema and describing overlong input as a possible duplicate. Existing tests check retained data, not keyboard correction/focus or the length boundary. Prior overlap: CARMS-10/14/15/16.

References:

- `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx:69-71,175-207,435-449`.
- `packages/create-access-router-mongo-starter/template/src/shared/entity-schemas.ts:34-37`.
- `packages/create-access-router-mongo-starter/template/tests/home-page.test.tsx:291-315`.

Requirements: focus newly reported errors once without refocusing on unrelated renders; reuse the shared Category request schema and associate actionable validation messages with the field. Keep server validation authoritative and existing pending/error state preservation.

Acceptance criteria: after a failed Category mutation a keyboard user types a correction without losing focus; unrelated query updates do not steal focus; blank/80/81-character cases and trimming match the schema; invalid input never calls the mutation; initial error announcement still works.

Verification: V3 generated frontend tests, typecheck/lint/build; V2 for packed-template consistency.

Completion evidence:

- Changed files:
  - `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx` — inline alert now uses a stable `ref={alertRef}` (removed the identity-changing callback ref that called `node?.focus()` on every reattachment); the `operationError` effect focuses only once per newly reported error via a `lastFocusedOperationError` guard (reset on clear), so typing a correction or unrelated query rerenders no longer steal focus while initial announcement still works. `handleAddCategory` now validates with the shared `categoryCreateSchema.safeParse({ name: categoryName })`, sets the schema message (`Name is required` / `Name must be at most 80 characters`) as the field-associated `categoryNameError` (existing `aria-describedby`/`aria-invalid` wiring unchanged), returns without calling the mutation on failure, and sends the schema-trimmed `parsed.data.name` on success. Server remains authoritative (duplicate/conflict path and pending/error preservation untouched).
  - `packages/create-access-router-mongo-starter/template/tests/home-page.test.tsx` — 3 new regressions: shared-schema validation (blank `'   '` → `Name is required`, 81 chars → `Name must be at most 80 characters`, both with zero mutation calls; 80 chars accepted with exact `{ name }` arg); trimming (`'  padded  '` mutates as `{ name: 'padded' }`); focus preservation (after a failed duplicate Category mutation the alert receives initial focus, then moving focus to the correction field, typing, and an explicit unrelated `rerender` all keep focus in the input with exactly one mutation call).
- Pre-fix failure basis: old callback ref refocused on every render (typing/rerender assertions fail); old blank-only check accepted 81-char input and called the mutation with it (validation assertions fail).
- Commands run + results (repo root, serialized):
  - V3-template `pnpm --filter create-access-router-mongo-starter exec vitest run --root template tests/home-page.test.tsx` — 12/12 passed.
  - V2 `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint` on both touched files — clean; `pnpm --filter create-access-router-mongo-starter test` — 14 files, 290/290 passed.
  - V3 `pnpm --filter create-access-router-mongo-starter build` then `exec vitest run tests/packed-consumer.test.ts` — 2/2 passed (frozen install, build, typecheck, lint, generated `pnpm test` incl. the extended home-page suite, `serverless` bundle, `--no-build` reuse).
- Acceptance proof: failed Category mutation announces once via `role="alert"` focus; correction typing and unrelated rerenders retain field focus; blank/80/81 + trimming match `categoryCreateSchema` byte-for-byte; invalid input never reaches `services.category.create`. `git diff --check` clean; no `dist/` files hand-edited; CHANGELOG.md untouched.
- Follow-ups: none; CARMSF-15 docs reconciliation may reference the schema-bound messages.

### Task CARMSF-15: Align Generated Tooling And Shipped Architecture Guidance

Status: completed

Kind: defect

Priority: P2, the documented development/toolchain contract is inconsistent with generated behavior.

Suggested agent: generated-consumer/toolchain documentation specialist

Dependencies: CARMSF-02, CARMSF-04, CARMSF-13, CARMSF-14

Primary ownership: template `package.json`, TS configuration, `AGENTS.md`, README and `.agents` guidance; package README; focused tooling/consumer tests. Stage/lockfile regeneration is serialized.

Finding: backend watch covers `api` but not authoritative `src/shared` imports; the app advertises Node `>=22.12.0` while inspected jsdom 29 requires a stricter/discontinuous range; node-side TS configuration is not executed by build/typecheck and omits Vitest configuration. Generated guidance references obsolete `mongoose.models.*`/`createRouters(runtime)` ownership and a non-shipped deploy test. The publication checklist also supplies a test version rejected by the wrapper's `VERSION` guard. Prior overlap: CARMS-06/10/16/18.

References:

- `packages/create-access-router-mongo-starter/template/package.json:7-23,61`.
- `packages/create-access-router-mongo-starter/template/tsconfig.node.json:23`.
- `packages/create-access-router-mongo-starter/template/.agents/skills/template-api-models-and-routers/SKILL.md:37-45`.
- `packages/create-access-router-mongo-starter/template/.agents/skills/template-testing-and-scaffolding/SKILL.md:17,31`.
- `packages/create-access-router-mongo-starter/README.md:188-205`; `scripts/publish-packages.mjs:21-28`.

Requirements: watch server-imported shared schema files using supported runtime flags; include build/test config in executed typechecking; align the supported Node range with the actual release dependency graph and verify its lower boundary. Replace stale guidance with runtime-owned schema/connection ownership and real shipped tests. Correct publication examples without invoking publication. Reconcile docs for all preceding contract changes, including package/website guidance where it repeats them.

Acceptance criteria: changing a shared validation bound reloads backend behavior in a watcher smoke test; an invalid Vite/Vitest configuration fixture fails the advertised check; a frozen installed consumer passes at the declared minimum supported Node; every named generated path/symbol exists; guidance does not encourage global model reuse; publication example agrees with the version guard. No unresolved source placeholders are installed directly.

Verification: V3 at supported minimum Node, focused watcher/typecheck coverage, documentation-reference review, V2. Record dependency engine evidence from the actual resolved release graph rather than assuming one dependency is the only constraint.

Completion evidence:

- Prior-lane evidence read first (dotenv policy CARMSF-01, literal titles CARMSF-04, Mongo grammar CARMSF-13, focus/validation CARMSF-14, prefix grammar CARMSF-12 + CARMSF-08 context/scope matrix and CARMSF-08F ownership); no behavioral file from those lanes was reverted. Branch-context deploy docs were deliberately left for CARMSF-08F.
- Engine evidence from the actual resolved release graph (`dist/template/pnpm-lock.yaml`, regenerated by this lane's build): `jsdom@29.1.1` requires `^20.19.0 || ^22.13.0 || >=24.0.0`; the ESLint 10 family (`eslint`, `@eslint/js`, `@eslint/core`, `config-array`, `plugin-kit`, `espree`, `eslint-scope`, `visitor-keys`, `object-schema`) requires the same discontinuous range; `vite@8.2.2`/`@vitejs/plugin-react` require `^20.19.0 || >=22.12.0`; workspace runtime packages (`access-router`, `access-router-runtime`, `express-runtime`, `express-json-router`) require `>=22`. The `@napi-rs/lzma-linux-x64-gnu` `^22.20 || ^24.12 || >=25` entry is an optional native dep and does not constrain the range. Intersection for the generated app: `^22.13.0 || >=24.0.0` (excludes 22.0–22.12 and the discontinuous Node 23 line). Corroborated by the pinned `pnpm@11.18.0`, which refuses to run on Node 22.12.0 (`This version of pnpm requires at least Node.js v22.13`).
- Changed files:
  - `template/package.json` — engines `>=22.12.0` → `^22.13.0 || >=24.0.0`; `server` watch `./api` → `./api,./src/shared` (comma-separated multi-root is a documented supported `--watch` form in `express-runtime` help); `build`/`typecheck` now also run `tsc -p tsconfig.node.json --noEmit`.
  - `template/tsconfig.node.json` — include `["vite.config.ts", "scripts/**/*.ts"]` (the template ships no `scripts/` dir) → `["vite.config.ts", "vitest.config.ts"]`.
  - `template/tsconfig.app.json` — removed the dead `exclude: ["tests/deploy-shared.test.ts"]` (file is repo-owned, never shipped).
  - `template/tests/api-contract.test.ts` — grammar-matrix comment now names the scaffolder package's `tests/deploy-shared.test.ts` as not shipped in the template.
  - `template/README.md` — toolchain range + engine rationale; `MONGODB_URI` multi-host/IPv6/authenticated grammar shared with the deploy helper; fixed stale `... -- --help` to the CARMSF-04 accepted `pnpm exec ... --help` form.
  - `template/AGENTS.md` — Node range; literal `API_BASE_URL` segment charset; `MONGODB_URI` seed-list grammar; shared-schema bounds/messages (CARMSF-14); `pnpm server` dual-root watch + node-config typecheck; private-dotenv policy (only `.env.example` scaffolded, CARMSF-01).
  - `template/.env.example` — replaced stale `` `startDB()` `` ownership with runtime `db.url` ownership plus seed-list grammar.
  - Skills: `template-api-models-and-routers` — removed `mongoose.models.*` reuse and `createRouters(runtime)` guidance; models register through runtime-owned `models: [...]` with connection/index-readiness ownership, no global model reuse encouragement. `template-testing-and-scaffolding` — replaced non-shipped `tests/deploy-shared.test.ts` with the real shipped test list, corrected the jsdom/Node-env note (`// @vitest-environment node` opt-outs), documented node-config typecheck + dual-root watch + Node range. `template-backend-runtime`/`template-client-data` — mirrored the literal prefix charset and seed-list Mongo grammar.
  - `packages/.../README.md` — generated-app Node range + rationale; publish dry-run example `v0.0.0-test` (rejected by the `VERSION` guard) → `v$(cat VERSION)` run from the repo root, which always agrees with `scripts/publish-packages.mjs:21-28`.
  - `website/docs/packages/create-access-router-mongo-starter.md` — same Node range/rationale, literal prefix charset, seed-list Mongo grammar.
  - `tests/packed-consumer.test.ts` — generated `engines.node` expectation updated (scaffolder's own `>=22.12.0` untouched).
  - `tests/generated-tooling.test.ts` (new, 6 tests) — script/tsconfig/engines contract; doc-reference review (skills, READMEs, website); publication-example-vs-guard agreement; invalid-Vitest-config fixture fails `tsc -p` on the shipped include list (hermetic `any` stubs for bare imports; full resolution covered by generated `pnpm typecheck`); live watcher smoke spawning the real `wtt-access-router-runtime` dev binary with `--watch <api>,<shared> --ext ts --delay 0` — serving `v1` from a shared module, rewriting it to `v2`, and observing the reloaded value.
- Pre-fix failure basis: old `server` script watched only `./api`; old build/typecheck never executed `tsconfig.node.json` (which also omitted `vitest.config.ts`); old `>=22.12.0` admits jsdom/eslint-rejected 22.12.x and Node 23; old skill/README text matched every removed stale reference; old `v0.0.0-test` example fails the guard against `VERSION` (0.43.0).
- Commands run + results (repo root, serialized; no `dist/` hand-edits; CHANGELOG.md untouched):
  - V1 `exec vitest run tests/generated-tooling.test.ts` — 6/6 passed.
  - V2 `typecheck` — clean; `eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"` — clean; `test` — 15 files, 296/296 passed (build regenerated `dist/template` staging with the new manifest; CARMSF-02 lockfile validation intact).
  - V3 `build` then `exec vitest run tests/packed-consumer.test.ts` — 2/2 passed (frozen install, build, typecheck incl. the new node-config step, lint, generated `pnpm test`, `serverless`, `--no-build` reuse). One earlier V3 attempt failed on the CARMSF-10 concurrent Todo-create/Category-delete race (`todoStatus` 409, a third interleaving outside that test's `{201,400}` expectation); reruns passed with identical code — recorded as a follow-up below, not caused by this lane (no runtime/persistence file touched).
  - Min-Node consumer (scaffolded from the staged template, placeholders resolved, zero `{{...}}` remainders): under Node v22.20.0 (nearest available ≥ the 22.13.0 floor; 22.13.0 binary not installed) with pinned pnpm 11.18.0 — `install --frozen-lockfile --ignore-scripts`, `typecheck`, `lint`, `build`, `vitest run tests/home-page.test.tsx` (jsdom 29, 12/12), `vitest run tests/api-contract.test.ts` (55/55) all passed. Under Node v22.12.0 the pinned pnpm refuses to execute at all, and jsdom/eslint engines exclude it — lower boundary verified. `git diff --check` clean.
- Acceptance proof: shared-file edit reloads backend behavior via supported flags (live smoke); corrupted Vitest config fails the node-config check while pristine passes; frozen consumer passes at min-range Node and the declared floor excludes 22.12/23 per the resolved graph; packed-file list unchanged and placeholder-free; skills contain no model-reuse encouragement; publication example always agrees with the guard.
- Follow-ups: (1) CARMSF-10 race test accepts only `todoStatus ∈ {201,400}` but a delete-winning interleaving can surface `409` on the Todo create — observed twice as a V3 flake, passes on rerun; owned by the persistence lane / CARMSF-17 independent review, not changed here. (2) Exact 22.13.0-binary verification blocked (no 22.13.0 install available; verified at 22.20.0 instead) plus Windows native execution remains per CARMSF-09.

### Task CARMSF-16: Measure Remaining Query And Deployment Overhead

Status: completed

Kind: investigation

Priority: P3, optional optimization needs evidence rather than speculative caching/indexes.

Suggested agent: performance/testability reviewer

Dependencies: CARMSF-13

Primary ownership: task evidence and isolated experiments; no production code change is required to complete the investigation.

Finding: Category lists sort by `{ name: 1, _id: 1 }` while the declared index is `{ name: 1 }`; an index declaration assertion does not prove absence of a blocking sort. Netlify set/verify repeats site/account and variable reads for each variable. The 100-result cap does not by itself bound database scan work, but no performance regression has been measured. Prior overlap: CARMS-12's sort/index intent; no existing open measurement task found.

References:

- `packages/create-access-router-mongo-starter/template/api/src/routers.ts:112`; `template/api/src/models.ts:25` within the same package.
- `packages/create-access-router-mongo-starter/scripts/netlify-api.ts:350-360,456-462`.
- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:945-981`.

Requirements: collect Category `explain()` plans at representative cardinalities and deterministic provider call counts/latency using stubs or an authorized environment. Assess whether a minimal index change or deployment-scoped metadata reuse is justified. Preserve real post-write verification; do not cache secret values or add frontend memoization.

Acceptance criteria: record inputs, plans/examined counts, provider request counts, and a recommendation to implement/defer/take no action with rationale. Any proposed optimization gets its own measurable acceptance criteria and ownership before implementation. Investigation can complete without code changes.

Verification: CARMSF-10 isolated Mongo lane for explain evidence; controlled provider harness for call counts. Record exact experiment commands and results; no unmeasured speedup claims.

Completion evidence (no production code changed — investigation only; scratch DBs and stub clients only, zero live writes):

- Query experiment (`/tmp/carmsf16/mongo-explain.mts`, run via `pnpm --filter create-access-router-mongo-starter exec tsx /tmp/carmsf16/mongo-explain.mts`): single-node `MongoMemoryReplSet` (CARMSF-10 lane pattern, cached `mongod` 7.0.24/8.2.6), REAL `template/api/src/models.ts` `categorySchema` (`Category.init()` built the declared unique `{ name: 1 }` index; confirmed index list `[_id_1, name_1 unique]`), production query shape `find({}).sort({ name: 1, _id: 1 }).limit(100)` from `routers.ts:112`, `explain('executionStats')`:
  - N=0: stages `PROJECTION,SORT,COLLSCAN`, nReturned=0, keys=0, docs=0.
  - N=50: stages `PROJECTION,SORT,COLLSCAN`, nReturned=50, keys=0, docs=50.
  - N=250: stages `PROJECTION,SORT,COLLSCAN`, nReturned=100, keys=0, docs=250 — the 100-cap bounds transfer, NOT scan work (limit applies after the blocking in-memory sort; examined grows with collection size).
  - N=250 filtered (`{ name: 'cat-0007' }`, allowed exact-match filter): `SORT,FETCH,IXSCAN`, keys=1, docs=1, nReturned=1 — equality uses the `{ name: 1 }` index, but a (trivial, 1-doc) in-memory SORT stage remains.
  - N=250 with a scratch-only compound `{ name: 1, _id: 1 }` index (created in the scratch DB, dropped afterward — not a code change): `LIMIT,FETCH,IXSCAN`, keys=100, docs=100, nReturned=100, NO sort stage — examined bounded exactly to the limit.
  - `executionTimeMillis` was 0–1 ms in all cases at these cardinalities: no performance regression is measurable at demo scale; the cost is asymptotic (full-collection scan + blocking sort per unfiltered list once the collection exceeds the cap).
- Provider experiment (`/tmp/carmsf16/provider-counts.mts`, run via `pnpm --filter create-access-router-mongo-starter exec tsx /tmp/carmsf16/provider-counts.mts`): counting stub `NetlifyApiClient` through the REAL `setSiteEnvVar`/`verifySiteEnvVar` (`netlify-api.ts`) and the REAL `runDeploy` env loop (`deploy-netlify.ts:1044-1061`, 2 vars: `API_BASE_URL`, `MONGODB_URI`), zero network:
  - Fresh site, set+verify x2 vars: `{ getSite: 4, getEnvVars: 4, setEnvVarValue: 0, updateEnvVar: 0, createEnvVars: 2 }` — 8 read-type calls + 2 writes.
  - Steady-state redeploy (metadata already matches, value-only path): `{ getSite: 4, getEnvVars: 4, setEnvVarValue: 2, updateEnvVar: 0, createEnvVars: 0 }` — same 8 reads + 2 writes.
  - End-to-end `runDeploy` (fresh site, stateful stub so post-write verify observes the created vars): identical `{ getSite: 4, getEnvVars: 4, createEnvVars: 2 }` — confirms the loop repeats site+account resolution and full env-list reads per variable per phase (set re-resolves, verify re-resolves; `resolveSiteId` by-id adds its own read on top in real runs).
  - Stub wall time <2 ms per scenario — NOT representative of real API latency; no live/authorized-environment timing was performed, and no speedup is claimed.
- Recommendation: DEFER both optimizations (no action now), with rationale:
  - Query: the compound `{ name: 1, _id: 1 }` index provably removes the blocking sort and bounds examined docs to the limit, but at demo cardinalities there is zero measurable regression (0–1 ms), the unique `{ name: 1 }` index must be retained regardless, and a second index adds write/storage overhead for an unmeasured problem. Do not add it speculatively.
  - Provider: site/account resolution and env-list reads could be scoped once per deploy phase (8 reads → ~2–3) by threading resolved IDs and one env-list snapshot per phase into set/verify, but every deploy currently succeeds deterministically, real round-trip latency is unmeasured, and the saving must never skip the post-write re-read (verification must observe fresh state) nor retain secret values (metadata reuse only).
- Proposed follow-ups (own criteria + ownership, NOT implemented — implementation needs its own lane):
  - CARMSF-16F1 (owner: backend persistence specialist; files: `template/api/src/models.ts` index declaration + generated index-readiness tests): add compound `{ name: 1, _id: 1 }` while retaining unique `{ name: 1 }` IFF a replica-set `explain()` at ≥10k Categories shows `totalDocsExamined > limit` with wall-time regression vs the compound; acceptance: unfiltered list `explain()` shows IXSCAN-only with `totalDocsExamined == nReturned == min(N,100)`, uniqueness/conflict behavior unchanged, V3 replica-set lane green.
  - CARMSF-16F2 (owner: Netlify provider integration specialist; files: `scripts/netlify-api.ts` set/verify signatures, `scripts/deploy-netlify.ts` env loop): deployment-scoped metadata reuse (resolve site/account once, one env-list read per phase shared across vars, fresh re-read after each write for verification; never cache secret values) IFF authorized disposable-site timing shows env set/verify dominates deploy wall time; acceptance: stub-harness counts drop to ≤3 reads + 2 writes per deploy with verify still observing post-write state (missing-after-write still bails), hidden-value/mismatch behavior unchanged.
- Post-write verification preserved (no change made); no secret caching and no frontend memoization added or proposed.
- Commands run + results (repo root, serialized; read-only experiments, no repo files touched): mongo-explain script — all 6 explain outputs recorded above, `DONE`; provider-counts script — all 3 scenarios recorded above, `DONE`. No package tests needed changes (none made); `git status` confirms no source/test file touched by this task (worktree modifications present are sibling lanes'; this task edited only this Status/evidence block).

### Task CARMSF-17: Independently Verify The Follow-Up Boundaries

Status: completed (V4 full-repo `pnpm test` truthfully blocked by the known CARMSF-10 race flake — see evidence; no implementation files touched)

Kind: improvement

Priority: P1, helper-only tests previously missed multiple producer/consumer boundaries.

Suggested agent: independent reviewer who did not implement the primary fixes

Dependencies: CARMSF-01 through CARMSF-16 and any required implementation follow-ups from investigations; optional work may instead have an explicit approved deferral with residual risk.

Primary ownership: this task record, integration evidence, narrowly scoped missing regressions. Do not silently rewrite implementation during independent review.

Finding: prior integration passed helper-heavy tests while session propagation, artifact naming, post-link containment, and parse-error redaction remained unverified at their real boundaries. References: the task-specific source/test evidence above and prior CARMS-19 completion record.

Requirements: review each acceptance criterion against real boundary behavior; verify security across alternate CLI/HTTP paths, literal title serialization, packed-secret exclusion, actual frozen installation, successful persisted CRUD, index readiness, provider context decisions, and generated documentation/types. Check that no new raw errors/secrets cross external boundaries and that request/output bounds remain intact. New independent findings become explicit tasks with evidence and dependencies.

Acceptance criteria: all required fixes and investigation follow-ups have passing targeted evidence; V2/V3/V4 pass or are truthfully blocked with exact prerequisites; platform/provider/database gaps are not represented as verified; staged/packed output derives from reviewed source; an independent findings summary and residual-risk list are appended; unrelated worktree changes remain untouched.

Verification: V2, V3, V4 serially; inspect all investigation conclusions and minimum-Node/Windows/replica-set evidence. A passing mock-only suite cannot substitute for the required real operation checks.

Completion evidence (independent reviewer; no source/test/implementation file touched — only this CARMSF-17 block edited; no `dist/` hand-edits; CHANGELOG.md untouched):

- Full task file + all CARMSF-01..16 completion evidence read first. Worktree before/after this task: 46 changed/new entries, all owned by sibling lanes (verified via `git status --porcelain`); this task added no files and modified no implementation, test, template, doc, or config file outside this block.
- V2 (repo root, serial): `pnpm --filter create-access-router-mongo-starter typecheck` — clean; `pnpm exec eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"` — clean (0 errors); `pnpm --filter create-access-router-mongo-starter test` — 15 files, 296/296 PASSED on one full run. One earlier V2 run failed 295/296 in `tests/packed-consumer.test.ts` via the inner generated `integrity-transaction` race (see CARMSF-17F1); rerun with identical code passed 296/296.
- V3 (repo root, serial): `pnpm --filter create-access-router-mongo-starter build` then `exec vitest run tests/packed-consumer.test.ts` — 2/2 PASSED on consecutive runs (frozen install, build, typecheck incl. node-config step, lint, generated `pnpm test`, `serverless` bundle, `--no-build` reuse, literal-`$`-title scaffold, printed deploy-help execution).
- Boundary spot-checks (real staged output, not mocks): staged `dist/template` contains only `dist/template/.env.example` under `.env*` plus `dist/template/_gitignore`; credential-pattern scan over staged `*.ts`/`*.json`/`*.md` clean. Staged/packed output was regenerated from reviewed source by the builds run during this review (real `pnpm` staging, CARMSF-02 validation intact).
- V4 (repo root, serial): `pnpm lint` — 0 errors (3 warnings, all pre-existing unused-`eslint-disable` in unrelated `packages/access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts`); `pnpm build` — pass; `pnpm test` — BLOCKED/FAILING on the known race flake (see CARMSF-17F1; serial run stops at the starter package, so later packages did not execute in failing runs); `pnpm build-artifact -- --version 0.43.0` (VERSION floor, not the prior plan's historical version) — pass, artifact `dist/web-ts-toolkit-0.43.0.tar.gz`; `pnpm verify-artifact -- --version 0.43.0` — `release artifact verified successfully`; `git diff --check` — clean.
- Investigation conclusions inspected: CARMSF-08 matrix stands (context-only/alias-only/`--branch` divergent, `--prod` only associated combo; scope setter/verifier mismatch reproduced) with live runtime-read check explicitly blocked pending authorized disposable-site work — correctly not claimed as verified. CARMSF-16 DEFER-both recommendation accepted as evidence-backed (compound-index plan proven but unmeasured at demo scale; provider counts measured on stubs only, no live timing claimed). Min-Node evidence accepted with the recorded caveat (verified at Node v22.20.0, exact 22.13.0 binary unavailable; 22.12.0 exclusion verified via pnpm refusal + engine ranges). Replica-set lane confirmed REAL (not mock-only): `mongodb-memory-server` single-node replica sets execute live in both the V2-embedded and V3 generated suites — the CARMSF-17F1 flake itself is a live interleaving, and skip-with-prerequisites logic covers binary-absent hosts. Host toolchain during this review: Node v26.7.0, pnpm 11.18.0.
- Per-boundary verdicts: CARMSF-01 packed-secret exclusion VERIFIED (staged-output check + packed-file assertions); CARMSF-02 fail-closed lockfiles VERIFIED (fake-pnpm failure paths exercised in-suite); CARMSF-03 commit-point VERIFIED; CARMSF-04 literal titles/defaults/cancel/help-command VERIFIED incl. installed-bin probes; CARMSF-05 destructive outputs VERIFIED (fake runners, sentinels intact); CARMSF-06 `.cjs` inspection + post-build re-inspection VERIFIED incl. real build-to-`--no-build` reuse; CARMSF-07 redaction VERIFIED on both bins with and without env credentials; CARMSF-08 investigation COMPLETE with follow-up CARMSF-08F recorded and live check blocked (no speculative fix made — correct); CARMSF-09 cleanup-after-success VERIFIED on Linux, Windows native execution BLOCKED (narrowed contract documented, no shell shortcut — correct); CARMSF-10 session binding VERIFIED (no-DB real-Mongoose collection-session proof + live route-driven replica-set CRUD) subject to CARMSF-17F1 test-expectation gap; CARMSF-11 index readiness + 400/413 parity VERIFIED on live replica sets via both entrypoints; CARMSF-12 literal prefixes VERIFIED (shared-parser rejections + mounted-CRUD guard parity); CARMSF-13 Mongo grammar VERIFIED consistently deploy/runtime with zero URI echo; CARMSF-14 focus/schema VERIFIED; CARMSF-15 tooling/docs VERIFIED (watcher smoke live, node-config gate live, min-Node consumer real); CARMSF-16 investigation COMPLETE, deferrals explicit. No raw errors/secrets cross external boundaries in any exercised path; request/output bounds (100-cap, 1 MiB, literal prefix, frozen installs) intact.
- No new regressions added: every boundary above has targeted passing evidence; the single gap found is a too-narrow test expectation (CARMSF-17F1), not an unverified boundary, and fixing it would require editing files outside this task's ownership — so it is recorded as an explicit follow-up instead.

Independent findings summary:

- F1 (new, blocking V4): `template/tests/integrity-transaction.test.ts:201` accepts only `todoStatus ∈ {201,400}`, but the concurrent Todo-create/Category-delete race has a third live interleaving — delete wins first, the racing Todo create then fails closed with `409` (observed: `expected [201, 400] to include 409`, reproduced across 3 of 5 full-suite runs during this review, passes on rerun). Semantically the 409 outcome is SAFE (integrity-conflict rejection, no dangling reference; the `deleteStatus === 200 → expect 400` branch at lines 203-205 is likewise too narrow). No data-loss or integrity violation observed; the boundary itself (CARMSF-10) remains verified.
- F2 (confirmation, not new): CARMSF-15's follow-up (1) describes exactly this flake — this review independently reproduces and confirms it, and confirms it also fails the packed-consumer outer test (`pnpm test` inside the generated app), which is why V4 `pnpm test` cannot go green deterministically.
- F3 (no action): no other boundary was found unverified; CARMSF-08F/16F1/16F2 ownership and acceptance criteria remain valid as recorded and are not duplicated here.

Residual-risk list:

- R1: V4 full-repo `pnpm test` is red until CARMSF-17F1 lands; any release cut before then must rerun to a green pass and disclose the flake. Owner: persistence lane (CARMSF-10 test author). Prerequisite: none (reproducible on Linux with cached `mongod` binary).
- R2: Windows native execution still blocked (CARMSF-09): `.cmd` shim rejection is unit-tested with platform injection only; no Windows host/CI run exists. narrowed contract (WSL2/Linux/macOS) documented in deploy HELP.
- R3: Netlify runtime-context reads still unproven offline (CARMSF-08F): needs explicit authorization + disposable site/token with env:write scope; draft/alias deploys must not be assumed to read branch-context env at request time.
- R4: Exact Node 22.13.0 floor binary never executed (verified at 22.20.0); Node 23 and 22.0–22.12 correctly excluded per resolved engine graph.
- R5: Compound `{ name: 1, _id: 1 }` index and provider metadata-reuse optimizations deferred without production-scale measurements (CARMSF-16F1/F2); unfiltered Category lists perform a full-collection scan + blocking sort beyond the 100-cap, and env set/verify issues ~8 reads + 2 writes per deploy — both fine at demo scale, unbounded asymptotically.

Explicit follow-up task CARMSF-17F1 (owner: backend persistence specialist; files: `packages/create-access-router-mongo-starter/template/tests/integrity-transaction.test.ts` race block lines ~189-210; no production-code change expected): widen the concurrent race expectations to the three safe interleavings — `todoStatus ∈ {201, 400, 409}`, `deleteStatus ∈ {200, 409}` — with branch assertions covering delete-wins-then-409 (`deleteStatus === 200 → todoStatus ∈ {400, 409}`) and todo-wins (`todoStatus === 201 → deleteStatus === 409`), while keeping the no-dangling-reference invariant (post-race reads) and session-termination check. Acceptance: 10 consecutive full `pnpm --filter create-access-router-mongo-starter test` runs green with no other change; V4 `pnpm test` then unblocked. Not implemented by this review per ownership rules.

Kind: improvement

Priority: P1, helper-only tests previously missed multiple producer/consumer boundaries.

Suggested agent: independent reviewer who did not implement the primary fixes

Dependencies: CARMSF-01 through CARMSF-16 and any required implementation follow-ups from investigations; optional work may instead have an explicit approved deferral with residual risk.

Primary ownership: this task record, integration evidence, narrowly scoped missing regressions. Do not silently rewrite implementation during independent review.

Finding: prior integration passed helper-heavy tests while session propagation, artifact naming, post-link containment, and parse-error redaction remained unverified at their real boundaries. References: the task-specific source/test evidence above and prior CARMS-19 completion record.

Requirements: review each acceptance criterion against real boundary behavior; verify security across alternate CLI/HTTP paths, literal title serialization, packed-secret exclusion, actual frozen installation, successful persisted CRUD, index readiness, provider context decisions, and generated documentation/types. Check that no new raw errors/secrets cross external boundaries and that request/output bounds remain intact. New independent findings become explicit tasks with evidence and dependencies.

Acceptance criteria: all required fixes and investigation follow-ups have passing targeted evidence; V2/V3/V4 pass or are truthfully blocked with exact prerequisites; platform/provider/database gaps are not represented as verified; staged/packed output derives from reviewed source; an independent findings summary and residual-risk list are appended; unrelated worktree changes remain untouched.

Verification: V2, V3, V4 serially; inspect all investigation conclusions and minimum-Node/Windows/replica-set evidence. A passing mock-only suite cannot substitute for the required real operation checks.

## Decisions And Deliberate Deferrals

- CARMSF-08 must establish provider context targeting and safe scope transitions before a concrete implementation is chosen. No current task authorizes live Netlify mutations. This does not block publication/filesystem/backend fixes.
- CARMSF-02 may reveal release-order dependency availability constraints. Fail closed first; any offline resolution strategy needs real verifiable resolution metadata, not version substitution.
- CARMSF-09 must verify Windows support or record an explicit unsupported-platform decision. Do not claim portability based solely on `.cmd` path resolution.
- Optional readability cleanup is deferred: remove unused `NetlifyDeployServices` members, unify duplicate deployment-result types, inject linked-state reads, and clean temporary executable-lookup fixtures only when a focused implementation exposes a concrete need. These are lower risk than the listed behavior defects and do not justify a large refactor.
- Authentication, tenancy, pagination beyond the chosen 100-item demo, full production abuse controls, frontend cache/memoization work, and new SDK exports remain out of scope. The generated public-demo warning must remain prominent.

## Definition Of Done

- Each task is completed with acceptance/verification evidence, or explicitly deferred with owner, rationale, and residual risk; missing required verification remains blocked.
- No private dotenv content is published, destructive outputs are validated at use time, and cleanup cannot masquerade as rollback or erase successful output.
- Generated frozen installs, bin commands, toolchain declarations, serverless artifacts, and developer guidance match actual installed behavior.
- Delete transactions and unique indexes enforce the promised persistence policy; accepted API prefixes cannot disable guards; Mongo URI validation accepts supported Mongo grammar without disclosure.
- Client input/focus recovery works accessibly; error status classification is accurate and sanitized.
- Investigation decisions are resolved or bounded and explicitly blocked; performance changes have measurements.
- Final independent review records real package, generated-consumer, repository, and release-artifact verification without claiming unrun checks passed.
