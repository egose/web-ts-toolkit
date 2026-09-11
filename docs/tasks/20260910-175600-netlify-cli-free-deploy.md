# Netlify-CLI-free deploy for create-access-router-mongo-starter

Created: 20260910-175600 (UTC)

## Objective and scope

Eliminate the end-user requirement to install `netlify-cli` alongside
`create-access-router-mongo-starter`. The `create-access-router-mongo-starter-deploy-netlify`
bin must deploy using only runtime `dependencies` (`@netlify/api` + small
helpers), without spawning a `netlify` binary.

In scope:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts`
  (only remaining CLI usage: `deploy-netlify.ts:1084-1100`)
- `packages/create-access-router-mongo-starter/scripts/netlify-api.ts`
  (extend client + add deploy path)
- `packages/create-access-router-mongo-starter/tsup.config.ts`,
  `package.json`, `HELP` text, generated template docs mentioning the CLI
- Tests under `packages/create-access-router-mongo-starter/tests/`

Out of scope: changes to the template app itself, other provider adapters.

## Working rules and non-goals

- Do NOT `import` from `netlify-cli` in runtime code. It is a ~6MB CLI
  binary distribution with no stable library entry; bundling it via `tsup`
  blows up `dist/` and build time.
- Keep `netlify-cli@26.2.0` as `devDependency` only (pinned-behavior tests),
  or remove it at the end if no test needs it.
- Keep `tsup` `dist/bin/deploy-netlify.js` small (~70KB today). New runtime
  deps must be small code packages (e.g. `@netlify/zip-it-and-ship-it` for
  function zipping), marked `external` in `tsup.config.ts:15`.
- Preserve existing deploy semantics: `--site/--site-name/--prod/--alias/
--branch/--context/--message/--dry-run`, sandbox modes, env-var
  set+verify flow, `DeploymentReport` remote-mutation accounting,
  secret redaction.
- Do not regress Windows-shim safety by reintroducing shell-spawned deploys;
  the new path must not need `assertShellFreeInvocationSupported` for deploys.

Non-goals:

- No edge-functions / blobs / redirect-file parsing parity beyond what this
  starter emits (`netlify.toml` managed header + single `<functionsName>.cjs`
  per `scripts/deploy-shared.ts:722,728`).
- No full port of `netlify-cli/dist/utils/deploy/*` generality.

## Baseline verification

Confirmed 2026-09-10:

- `scripts/deploy-netlify.ts:9-13` documents `netlify deploy` CLI invocation
  as "the only remaining CLI usage"; `resolveNetlifyCli` (`:132-148`) bails
  without a `netlify` binary on `PATH`.
- `scripts/deploy-netlify.ts:1084-1100` builds
  `['deploy', '--no-build', '--dir', distAbs, '--functions', functionsAbs,
'--site', ..., '--prod'/'--alias', '--message', '--json']` and parses stdout
  JSON for `deploy_url/logs` (`:1103-1113`).
- All other Netlify operations already use `@netlify/api`:
  `scripts/netlify-api.ts` (`resolveSiteTarget`, `setSiteEnvVar`,
  `verifySiteEnvVar`).
- `@netlify/api@15` exposes the needed primitives (verified via live import):
  `createSiteDeploy`, `uploadDeployFile`, `uploadDeployFunction`,
  `getSiteDeploy`, `updateSiteDeploy`, `cancelSiteDeploy`, `listSiteDeploys`.
- Reference CLI algorithm lives in the installed devDependency and is readable
  without importing it at runtime:
  `node_modules/netlify-cli/dist/utils/deploy/deploy-site.js` (hash →
  `updateSiteDeploy` → `waitForDiff` → upload → `waitForDeploy`),
  `hash-files.js` (sha1), `hash-fns.js` (zip via
  `@netlify/zip-it-and-ship-it`, sha256), `upload-files.js`,
  `util.js` (`getUploadList`, `waitForDeploy`),
  `commands/deploy/deploy.js:419-426`
  (`createSiteDeploy({draft, branch: alias, title})`).
- `pnpm --filter create-access-router-mongo-starter... build` succeeds;
  `dist/bin/deploy-netlify.js` ~70KB. Worktree `git status --short` clean at
  planning time.

## Priority definitions

- P0: blocks CLI removal (deploy path, correctness).
- P1: required for release quality (tests, docs, packaging).
- P2: cleanup / follow-up.

## Waves

1. Wave 1 (baseline): lock current CLI behavior into failing regression tests.
2. Wave 2 (core): API deploy implementation behind injectable service.
3. Wave 3 (removal): delete CLI plumbing, HELP/docs, packaging checks.

## Detailed executable tasks

### Task DEPLOY-01: Baseline CLI-behavior characterization tests

Status: completed

Completion evidence:

- Added: `packages/create-access-router-mongo-starter/tests/deploy-cli-contract.test.ts` (14 tests; existing files untouched)
- Verified: `pnpm --filter create-access-router-mongo-starter exec vitest run tests/deploy-cli-contract.test.ts tests/deploy-netlify.test.ts tests/netlify-context-scope-matrix.test.ts` — 3 files / 44 tests passed (main session re-run 2026-09-10)
- Mutation checks (temporary, reverted): arg-vector and URL-selection mutations fail the new tests as required

Priority: P0

Suggested agent: test-focused engineer

Dependencies: none

Primary ownership:

- `packages/create-access-router-mongo-starter/tests/deploy-netlify.test.ts`
- `packages/create-access-router-mongo-starter/tests/netlify-context-scope-matrix.test.ts`
- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:1084-1113`

Finding:

The exact CLI arg contract (`--no-build --dir --functions --site [--prod]
[--alias] [--message] --json`) and result-URL selection
(`alias ? deploy_url : url ?? deploy_url ?? ssl_url`, `logs ?? links.logs`)
are only implicitly covered. Removing the CLI without locking this behavior
risks silent URL/semantics drift.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:1084-1113`
- `packages/create-access-router-mongo-starter/tests/deploy-netlify.test.ts`
- `packages/create-access-router-mongo-starter/tests/netlify-context-scope-matrix.test.ts:6-17`

Implementation requirements:

1. Add/extend unit tests asserting the deploy-arg vector for: prod deploy,
   alias draft deploy, branch-override deploy, message deploy, dry-run
   (no spawn).
2. Add tests asserting URL/logs selection logic for alias vs non-alias
   results and unparseable stdout.
3. Tests must run against the current `runCapture`-injected services (no
   network, no `netlify` binary).

Acceptance criteria:

- New tests fail if `--json`, `--no-build`, `--alias`, or URL-selection logic
  is altered.
- `pnpm --filter create-access-router-mongo-starter... build && vitest run tests/deploy-netlify.test.ts tests/netlify-context-scope-matrix.test.ts` passes.

---

### Task DEPLOY-02: API deploy module (hash + create + upload + poll)

Status: completed

Completion evidence:

- Created: `packages/create-access-router-mongo-starter/scripts/netlify-deploy-api.ts` (`performApiDeploy` + injectable seams, no new deps — Node zlib single-entry zip, rationale in module header)
- Extended: `scripts/netlify-api.ts` client interface (deploy methods); additive stubs in `tests/netlify-api.test.ts`, `tests/netlify-context-scope-matrix.test.ts`
- Added: `tests/netlify-deploy-api.test.ts` (17 tests)
- Verified: targeted 2-file run 31 passed; 4-file run (incl. DEPLOY-01 + matrix) 61 passed (subagent); main-session re-run of 2-file subset passed

Priority: P0

Suggested agent: backend engineer

Dependencies: DEPLOY-01

Primary ownership:

- `packages/create-access-router-mongo-starter/scripts/netlify-deploy-api.ts` (new)
- `packages/create-access-router-mongo-starter/scripts/netlify-api.ts:44-59` (extend client interface)

Finding:

No CLI-free deploy path exists. `@netlify/api` has all primitives but no
high-level "deploy this directory" helper; the CLI's orchestration
(`deploy-site.js`) must be reimplemented in constrained form for this
starter's shape (`dist/` statics + single `<functionsName>.cjs`).

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:722,728`
- `node_modules/netlify-cli/dist/utils/deploy/deploy-site.js` (reference only)
- `node_modules/netlify-cli/dist/utils/deploy/hash-files.js`
- `node_modules/netlify-cli/dist/utils/deploy/hash-fns.js`
- `node_modules/netlify-cli/dist/utils/deploy/upload-files.js`
- `node_modules/netlify-cli/dist/utils/deploy/util.js`
- `node_modules/netlify-cli/dist/commands/deploy/deploy.js:419-426`

Implementation requirements:

1. Extend `NetlifyApiClient` with `createSiteDeploy`, `uploadDeployFile`,
   `uploadDeployFunction`, `getSiteDeploy`, `cancelSiteDeploy` (minimal shapes).
2. Implement `performApiDeploy({ authToken, siteId, distAbs, functionsAbs, functionsName, prod, alias, message, dryRun, log, client })`:
   - statics: recursive walk of `distAbs`, `sha1` hex, unix-normalized
     relative paths, reject `#`/`?` filenames (CLI parity).
   - function: zip `functionsAbs/<functionsName>.cjs` (use
     `@netlify/zip-it-and-ship-it` or a minimal zip dep — decide in task,
     document size impact), `sha256` hex, key = `functionsName`.
   - `createSiteDeploy({ siteId, title: message, body: { files, functions, draft: !prod && !alias, branch: alias } })`.
   - if response is `async`/diff-pending, poll `getSiteDeploy` until
     `prepared/uploading` (timeout ~20min, short poll interval).
   - upload only `required` + `required_functions` via sha-maps, with bounded
     concurrency (default 5-10) and fibonacci/backoff retry (max ~3-5).
   - poll `getSiteDeploy` until `ready`; on `error` throw with
     `error_message`; on timeout throw.
   - return `{ deployUrl, sslUrl, logsUrl }` derived from deploy object
     (`deploy_ssl_url/deploy_url`, `ssl_url/url`, `admin_url + /deploys/<id>`).
   - `dryRun`: compute + log file/function counts and hashes, make zero API calls.
3. Injectable client + filesystem/zip seams so tests run offline.
4. No `child_process` spawn; no `netlify-cli` import.

Acceptance criteria:

- Unit tests with a mock API client verify: manifest maps, `draft/branch`
  derivation (prod → `draft:false`; alias → `draft:false, branch:alias`;
  plain → `draft:true`), required-only upload, retry on transient upload
  failure, poll-to-ready, error-state throw, dry-run makes zero calls.
- Tests fail on the old implementation (no `performApiDeploy` export) and
  pass after.
- `pnpm --filter create-access-router-mongo-starter... build && vitest run <new-test-file>` passes.

---

### Task DEPLOY-03: Wire API deploy into runDeploy, preserve report semantics

Status: completed

Completion evidence:

- Wired: `performDeploy` service slot (default `defaultPerformDeploy`) in `scripts/deploy-netlify.ts`; spawn block removed; cancel-on-error in default wrapper (single site)
- Preserved: mutation accounting, Deploy URL/Logs lines (one genuine change: non-alias now logs immutable per-deploy URL, documented in test header), dry-run zero calls
- Added: `tests/netlify-deploy-wiring.test.ts` (5 tests); updated CLI-contract + seam tests to API path
- Verified: dist 83,597B (<250KB); targeted 3-file run 35 passed (main session); subagent 5-file run 65 passed + 17-file suite 329 passed

Priority: P0

Suggested agent: backend engineer

Dependencies: DEPLOY-02

Primary ownership:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:85-108,937-1118`

Finding:

`runDeploy` hard-codes the CLI spawn (`resolveCli`, `runCapture`,
`deployArgs`, JSON-parse). The API path must slot into the same
mutation-reporting, logging, and dry-run contract.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:899-915,937-1118`

Implementation requirements:

1. Add `performDeploy` (or `deployViaApi`) to `NetlifyDeployServices` with
   default = new API implementation; keep `runCapture/resolveCli` only as
   deprecated fallback until DEPLOY-04, or remove immediately if DEPLOY-04 is
   merged atomically (prefer atomic removal to avoid dual paths).
2. Preserve: `pendingMutation('deploy to site …')` completed only after
   ready-poll; `Deploy URL:` / `Logs:` log lines with identical selection
   rules (see DEPLOY-01); secrets never logged; `dryRun` skips site/env/deploy
   mutations.
3. On deploy error after `deployId` creation, attempt `cancelSiteDeploy`
   (best effort, mirrors CLI `cancelDeploy`).

Acceptance criteria:

- Existing DEPLOY-01 URL/mutation tests pass unchanged against the API path
  (adapted injection only).
- New test: API deploy failure records `completion-unknown` mutation and
  surfaces via `DeployFailure.report`.
- Package tests pass: `pnpm --filter create-access-router-mongo-starter... build && vitest run`.

---

### Task DEPLOY-04: Remove CLI plumbing, HELP, and user-facing install requirement

Status: completed

Completion evidence:

- Deleted: `NetlifyCli`, `resolveNetlifyCli`, `runCaptureNetlify`, deploy service slots; rewrote header/HELP to API-only; updated `src/cli.ts` hint, package/template READMEs, `website/docs/...` page
- Kept: `lookupInPath` (still needed by `checkBuildTools`), `deploy-shared.ts` spawn helpers (build tools)
- Grep clean for `resolveCli/runCaptureNetlify/npm install -g netlify-cli/Could not find the netlify CLI` in src/scripts (main session verified)
- Verified: 6-file run 135 passed (main session); dist 81,970B

Priority: P1

Suggested agent: backend engineer

Dependencies: DEPLOY-03

Primary ownership:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:80-84,132-192,983-987`
- `packages/create-access-router-mongo-starter/src/cli.ts:687`
- `packages/create-access-router-mongo-starter/tests/*` (CLI-spawn mocks)

Finding:

After DEPLOY-03, `resolveCli`, `lookupInPath`, `runCaptureNetlify`,
`assertShellFreeInvocationSupported` deploy guards, `isWindowsShellShimCommand`
tests, and HELP text telling users to `npm install -g netlify-cli` are dead
weight and keep the false impression that a binary is required.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:132-192,983-987`
- `packages/create-access-router-mongo-starter/tests/deploy-cleanup-windows.test.ts`
- `packages/create-access-router-mongo-starter/tests/deploy-shared.test.ts:286-306`
- `packages/create-access-router-mongo-starter/src/cli.ts:687`

Implementation requirements:

1. Delete CLI resolution/spawn code and `NetlifyCli` types; remove
   `checkBuildTools` netlify-binary coupling if any remains (keep
   `vite`/`wtt-access-router-runtime` checks).
2. Update `HELP`, header comment (`:1-16`), `src/cli.ts` hint, and generated
   template `README` assertions (`tests/generated-tooling.test.ts:93`) to
   describe API-only deploy (token + site only, no binary).
3. Update/remove Windows-shim tests that only guard CLI spawning; keep any
   still-relevant redaction/sandbox tests.

Acceptance criteria:

- `grep -rn "npm install -g netlify-cli\|Could not find the .netlify. CLI\|resolveCli\|runCaptureNetlify" packages/create-access-router-mongo-starter/src packages/create-access-router-mongo-starter/scripts` returns nothing (excluding changelog/history).
- `pnpm --filter create-access-router-mongo-starter... build && vitest run` passes.

---

### Task DEPLOY-05: Packaging, tsup size, and dependency hygiene

Status: completed

Completion evidence:

- Removed `netlify-cli` devDependency (zero runtime/test imports; only prose mentions remained, touched up); `dependencies` = 3 small code packages; lockfile contains 0 `netlify-cli`
- `tsup.config.ts` external unchanged (1:1 cover); `dist/bin/deploy-netlify.js` 81,970B (<250KB)
- `assert-publication-ready.ts`: no CLI references, no change
- Verified: package build pass; `generated-tooling + packed-consumer` 2 files / 8 passed (subagent); packed manifest has no `netlify-cli`

Priority: P1

Suggested agent: release engineer

Dependencies: DEPLOY-04

Primary ownership:

- `packages/create-access-router-mongo-starter/package.json:38-49`
- `packages/create-access-router-mongo-starter/tsup.config.ts:15`
- `packages/create-access-router-mongo-starter/scripts/assert-publication-ready.ts`

Finding:

Risk of accidentally promoting `netlify-cli` (or a heavy transitive) to
runtime `dependencies`, or bundling the new zip helper into `dist/`.

References:

- `packages/create-access-router-mongo-starter/package.json:38-49`
- `packages/create-access-router-mongo-starter/tsup.config.ts:1-20`

Implementation requirements:

1. `dependencies` contains only small code packages (`@clack/prompts`,
   `@netlify/api`, `smol-toml`, + chosen zip helper). `netlify-cli` stays
   `devDependency` or is removed.
2. `tsup.config.ts` `external` covers all runtime deps; verify
   `dist/bin/deploy-netlify.js` stays small (budget: <250KB uncompressed;
   document actual size in the task evidence).
3. `prepack`/`assert-publication-ready` updated if it references the CLI.
4. Verify packed output: `pnpm --filter create-access-router-mongo-starter pack` (or `npm pack --dry-run`) contains no `netlify-cli`.

Acceptance criteria:

- `dist/bin/` sizes recorded; deploy-netlify bundle <250KB.
- Packed tarball file list contains no `netlify-cli`.
- `pnpm --filter create-access-router-mongo-starter... build` + package
  `test` script pass.

---

### Task DEPLOY-06: Final integration review (independent reviewer)

Status: completed

Completion evidence (independent reviewer, changed nothing):

- Per-task verdicts: DEPLOY-01 through DEPLOY-05 accepted (contract tests, API module, wiring incl. cancel-exactly-once, CLI removal with `lookupInPath` correctly kept, packaging with `netlify-cli` fully removed from deps + lockfile)
- Verified: package build pass; dist `deploy-netlify.js` 81,970B (<250KB); full suite 18 files / 331 tests passed; `--help` prints API-only wording; grep clean (one noted nit: `resolveCli` substring matches unrelated `resolveCliScriptPath` — future touch-up only)
- Deferred: live-API draft deploy to a throwaway site still recommended before release (no credentials available); alias-vs-branch semantic limit documented in matrix test header

Priority: P1

Suggested agent: independent reviewer (not the DEPLOY-02/03 implementer)

Dependencies: DEPLOY-01 through DEPLOY-05

Primary ownership:

- whole `packages/create-access-router-mongo-starter` surface

Implementation requirements:

1. Verify each acceptance criterion against runtime behavior (mock-API unit
   - at least one manual `--dry-run` and, if credentials available, one real
     draft deploy to a throwaway site; otherwise document why live verification
     was skipped).
2. Verify prod/alias/branch matrix, env set+verify flow, sandbox modes,
   redaction, and `DeploymentReport` on failure.
3. Verify public types, HELP, README/template docs, and implementation agree
   that no CLI install is needed.
4. Run: `pnpm --filter create-access-router-mongo-starter... build && vitest run`, `pnpm lint` (scoped if repo lint is slow), and a pack listing.

Acceptance criteria:

- Reviewer sign-off recorded in this file's completion evidence.
- All deferred items moved to Deferred decisions with rationale.

## Dependency and parallelization guidance

- Sequential backbone: DEPLOY-01 → DEPLOY-02 → DEPLOY-03 → DEPLOY-04 → DEPLOY-05 → DEPLOY-06.
- Shared hotspots (do not parallelize): `scripts/deploy-netlify.ts`
  (DEPLOY-03 vs DEPLOY-04), `scripts/netlify-api.ts` (DEPLOY-02 vs others).
- DEPLOY-05 can start early for measurement but final sign-off must wait for
  DEPLOY-04.

## Deferred decisions requiring maintainer input

1. Zip implementation choice: `@netlify/zip-it-and-ship-it` (CLI-identical,
   larger) vs minimal `archiver`/`jszip` single-file zip (smaller, must prove
   Netlify accepts it). Owner: DEPLOY-02 implementer. Default if undecided:
   `@netlify/zip-it-and-ship-it`.
2. Whether to keep `netlify-cli` devDependency for pinned-behavior reference
   tests or remove it entirely. Default: keep until DEPLOY-06, then remove if
   unused.
3. Live-credential verification policy for the reviewer (throwaway site + token
   scope). Default: `--dry-run` + mock tests suffice; live deploy optional.

## Definition of done

- End-user deploy works with only `dependencies` installed; no `netlify`
  binary on `PATH`; docs/HELP state this.
- No runtime import from `netlify-cli`; `dist/` size budget met.
- Full package verification passes serially per `AGENTS.md` testing notes:
  `pnpm --filter create-access-router-mongo-starter... build && vitest run`.
- DEPLOY-06 reviewer evidence appended below.

## Completion evidence (append per task)

All six tasks completed 2026-09-10. End-user `netlify-cli` install eliminated:
API-only deploy via `scripts/netlify-deploy-api.ts`, `netlify-cli` removed
from `package.json` + lockfile, `dist/bin/deploy-netlify.js` 81,970B,
full suite 18 files / 331 passed (reviewer evidence above).

Residual risk: no live Netlify deploy performed (no credentials) — recommend
one manual draft deploy to a throwaway site before release.
