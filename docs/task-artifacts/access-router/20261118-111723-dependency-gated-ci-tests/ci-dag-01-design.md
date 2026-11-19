# CI-DAG-01: dependency-gated CI design and baseline

Investigation date: 2026-11-18. Reviewed checkout: `0fda5197c5b950e865af73681225c8bbf5533775`.

Related plan: [dependency-gated GitHub Actions tests](../../../tasks/20261118-111723-dependency-gated-ci-tests.md).

## Decision and handoff

**Implement the checked model and generator in CI-DAG-02.** Use static, package-visible jobs with exact success prerequisites and a shared CI-only execution helper. Build availability is a separate contract: prepare compiled fixtures before any package tests, including fixtures pointing against the direction of the test-success graph. Keep every existing complete package `test` script and its dependency rebuilds.

Choose readiness-based scheduling on isolated `ubuntu-24.04` runners, subject to GitHub-hosted runner availability and the account/organization quota. Do not introduce a workflow-wide four-job limit, unrelated stage barriers, or cancellation-based semaphores. Runner quota, acceptable aggregate runner time/storage, and required-check rollout approval are maintainer-owned decisions before wiring/rollout; they do not block CI-DAG-02's model work.

The written design resolves CI-DAG-01's investigation questions. It does **not** certify an artifact round trip, a clean lean-toolchain setup, runtime coverage, cost savings, or live Actions scheduling. CI-DAG-03 owns setup/artifact proof, CI-DAG-04 owns mandatory active-workflow enforcement and fail-closed aggregation, and CI-DAG-05 owns live acceptance and measured rollout approval. The coordinator alone updates the task document/statuses.

Scope of work here: read-only inventory, existing public run metadata, the authorized local grouping check, and this documentation bundle. No builds, package tests, dependency changes, workflow/configuration edits, delegation, commits, pushes, dispatches, settings changes, or destructive operations were performed.

## 1. Verified workspace and success-gate inventory

Discovery uses `pnpm -r list --depth -1 --json`, excluding the root package, followed by reading each discovered manifest. Do not copy workspace globs into the CI model. `website` is outside the pnpm workspace set.

| Observation                                                          | Result                                 |
| -------------------------------------------------------------------- | -------------------------------------- |
| Non-root workspaces with a build script                              | 31                                     |
| Workspaces with a test script                                        | 25, including both tested apps         |
| Build-only workspaces                                                | 6                                      |
| Local groups                                                         | 12, covering all 25 tests exactly once |
| All workspace edge occurrences: dependencies / dev / peer / optional | 30 / 4 / 2 / 0                         |
| Tested-to-tested occurrences in those fields                         | 22 / 4 / 2 / 0                         |
| Deduplicated declared direct test-success edges                      | 26                                     |
| Explicit runtime-to-starter fixture success edge                     | 1                                      |

All four dependency fields are inspected. Duplicate provenance is retained but produces one `needs` entry: deco → router occurs in dev and peer dependencies; React → client also occurs in both. Client → router and DPoP-client → vault are dev dependencies, not production dependency edges. No workspace optional-dependency edge currently exists; CI-DAG-02 must still test that field using contract fixtures.

### Exact initial package-job contract

Define `J(name) = test-<name>` for the short name in this table. Scoped packages use their manifest name `@web-ts-toolkit/<name>` when invoking pnpm; the three unscoped test workspaces are `oidc-vault-dpop-example`, `react-vite`, and `create-access-router-mongo-starter`. Reject job-ID collisions rather than silently merging packages.

Every row has **exactly** `needs: [ci-prepare, ...J(upstream)]`. Empty upstream cells below mean preparation only. Keep even declared edges that are transitively redundant; diagrams may omit them, the checked workflow must not. Display names should remain package-identifiable and deterministic; using the job ID as the display name also makes run-metadata matching unambiguous.

| Tested workspace                   | Successful upstream tests                                                   | Provenance                                      |
| ---------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| utils                              | none                                                                        | —                                               |
| json-frame                         | none                                                                        | —                                               |
| express-runtime                    | none                                                                        | —                                               |
| asset-inliner                      | none                                                                        | —                                               |
| express-request-attestation        | none                                                                        | —                                               |
| mongoose-rxdb                      | none                                                                        | —                                               |
| pdf-reader                         | none                                                                        | —                                               |
| express-oidc-vault                 | none                                                                        | —                                               |
| http-errors                        | utils                                                                       | dependencies                                    |
| express-response-handler           | http-errors, utils                                                          | dependencies                                    |
| express-json-router                | express-response-handler, http-errors, utils                                | dependencies                                    |
| access-router                      | express-json-router, utils                                                  | dependencies                                    |
| access-router-deco                 | access-router                                                               | devDependencies + peerDependencies; deduplicate |
| access-router-client               | access-router, utils                                                        | router: devDependencies; utils: dependencies    |
| access-router-react                | access-router-client                                                        | devDependencies + peerDependencies; deduplicate |
| access-router-runtime              | access-router, express-runtime                                              | dependencies                                    |
| message-service                    | express-json-router, utils                                                  | dependencies                                    |
| moo                                | utils                                                                       | dependencies                                    |
| express-oidc-vault-memory-store    | express-oidc-vault                                                          | dependencies                                    |
| express-oidc-vault-mongodb-store   | express-oidc-vault                                                          | dependencies                                    |
| express-oidc-vault-redis-store     | express-oidc-vault                                                          | dependencies                                    |
| oidc-vault-dpop-client             | express-oidc-vault                                                          | devDependencies                                 |
| oidc-vault-dpop-example            | express-oidc-vault, express-oidc-vault-memory-store, oidc-vault-dpop-client | dependencies; all three direct gates            |
| react-vite                         | access-router-client, access-router-react                                   | dependencies; both direct gates                 |
| create-access-router-mongo-starter | access-router-runtime                                                       | explicit test-only success override             |

An inline read-only assertion reproduced the manifest inventory and compared every row against the coordinator's initial gate table: **25/25 rows matched**. Counts above describe this revision, not a permanent hardcoded coverage limit.

### Build-only workspaces, not test nodes

| Workspace                       | Repository path                        | Declared workspace build prerequisites          |
| ------------------------------- | -------------------------------------- | ----------------------------------------------- |
| mongoose-rxdb-example           | `apps/mongoose-rxdb-example`           | mongoose-rxdb                                   |
| org-access-nodejs-example       | `apps/nodejs`                          | access-router, express-runtime, message-service |
| oidc-vault-dpop-angular-example | `apps/oidc-vault-dpop-angular-example` | oidc-vault-dpop-client                          |
| oidc-vault-dpop-react-example   | `apps/oidc-vault-dpop-react-example`   | oidc-vault-dpop-client                          |
| oidc-vault-dpop-vue-example     | `apps/oidc-vault-dpop-vue-example`     | oidc-vault-dpop-client                          |
| access-router-runtime-example   | `apps/runtime`                         | access-router-runtime                           |

Keep their builds in preparation and their outputs in its inventory. They have no package-test job/result to fabricate. The present graph has no tested workspace declaring a build-only workspace prerequisite. The model must distinguish any future build-only prerequisite from an upstream test-success node; dependency build closure alone must not invent new test gates.

## 2. Build/fixture access is not test-success gating

The local group validator protects shared `dist` reads and writes. It is deliberately conservative about rebuilds; it is not a CI success-gate model. Preserve `scripts/test-groups.mjs`, its safety tests, serial `pnpm test`, sequential groups, and existing worker/file-serialization limits.

| Caller                                       | Compiled access beyond normal declared dependencies                                                          | CI consequence                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| access-router packed-consumer contracts      | Reads compiled runtime, starter, and express-runtime bin candidates; stages the first available suitable CLI | Preparation supplies these outputs. **No** runtime/starter-test → router-test edge. Adding that edge would create a router/runtime cycle. |
| express-oidc-vault packed-consumer contracts | Builds memory/Mongo/Redis stores and DPoP-client for documentation-wiring consumers                          | These are isolated local writes, not reverse upstream-success gates.                                                                      |
| starter generated-tooling watch smoke        | Imports runtime `dist/index.mjs` and executes `dist/cli.js`                                                  | Preparation supplies both; the reviewed **runtime-test → starter-test** override is also intentional.                                     |
| react-vite                                   | Reads shared compiled dependencies; its test script is exactly `vitest run`                                  | Restore prepared outputs; retain the local read-only-script guard.                                                                        |

The router fixture can select an available bin candidate; that fallback is not evidence that every fixture was built or preserved. CI-DAG-03 must explicitly verify runtime/starter completeness instead of using the fallback as an artifact acceptance test.

Not every default script rebuilds itself: `access-router-client` and `json-frame` start with typechecking, and `react-vite` only runs Vitest. Even packages that rebuild their declared closure can need extra fixtures. Each isolated job therefore restores validated preparation outputs **before** running its unchanged complete test script.

Inspected anchors:

- [Local access overrides and discovery](../../../../scripts/test-groups.mjs): `testAccessOverrides`, `dependencyClosure`, `loadWorkspaces`.
- [Router packed consumer](../../../../packages/access-router/test/contracts/packed-consumer-compatibility.test.ts): `releaseArtifactBinPackages`, `hasBuiltBinEntries`, release-artifact staging.
- [Starter tooling tests](../../../../packages/create-access-router-mongo-starter/tests/generated-tooling.test.ts): compiler invocation and `reloads backend behavior when a shared file changes under watch`.
- [Vault packed consumer](../../../../packages/express-oidc-vault/test/packed-consumer.test.ts): downstream builds for documentation wiring.

## 3. Chosen workflow layout and consistency contract

Use 28 main job definitions: `ci-validate`, `ci-prepare`, 25 `test-*` jobs, and the final `unit-test` job. Preserve independent lint and existing minimum-Node lanes unchanged, including the floating React lane's non-blocking behavior. Do not add these compatibility/lint results to the new main-test aggregate.

1. **`ci-validate`** checks the local group contract, the CI model/helpers, and the actual workflow contract once CI-DAG-04 wires it.
2. **`ci-prepare`**, with `needs: [ci-validate]`, independently installs dependencies, runs one full `pnpm build`, verifies outputs, and publishes the output-only archive and identity/digest metadata.
3. **Package jobs** each have the exact table-derived static `needs`. Each checks out the same event revision, sets up its own dependencies/resources, restores the archive, and invokes `pnpm --filter <exact-manifest-name> test` once. Do not use `<name>... test`, substitute a smaller lane, or add a matrix around unrelated packages.
4. **Final `unit-test`** directly needs validation, preparation, and every required package job. Use an always-running aggregation condition and a Node result evaluator consuming `toJSON(needs)` through data/environment, not shell-interpolated code. Only the complete expected set of `success` results passes. Failure, cancellation, missing results, and skips fail closed. A workflow cancellation can also cancel the aggregate itself; that is non-success, not a promised successful cleanup run.

Recommended reuse boundary: a CI-only composite action, proposed `.github/actions/ci-test/action.yml`, called from the visible static package jobs after checkout. It owns common setup/resource selection/restore/execution, with an allowlisted workspace input resolved by the model. A composite avoids a flat matrix's all-siblings barrier and keeps the dependencies in one visible workflow. Do not broadly modify setup shared with publishing, lint, or compatibility workflows.

Preparation and consumers should explicitly check out `${{ github.sha }}` and record actual `git rev-parse HEAD`; all artifacts must match that checked-out commit. For PR events, the default tested merge revision can differ from the REST run's reported `head_sha`. Do not mix head and merge checkouts or treat run metadata alone as proof of identical tested commits.

Generate the main job section deterministically from the checked model: stable workspace/job-ID mapping, sorted IDs/`needs`, exact package inputs/commands, and a complete final-gate prerequisite list. Preserve unrelated workflow sections. A semantic checker must parse the **actual YAML and referenced helper contract**, not merely validate a diagram, regex-match job names, or check a generated file that the active workflow does not use.

### Staging and proposed CLI contract

These commands are **proposed and currently unavailable**, not checks run in CI-DAG-01:

```sh
node scripts/ci-test-plan.mjs --check
node scripts/ci-test-plan.mjs --generate
node scripts/ci-test-plan.mjs --check-workflow .github/workflows/test.yml
pnpm test:ci:check
```

- **CI-DAG-02:** implement model discovery/validation, deterministic generation, and strict workflow-contract checking exercised against valid/invalid regression fixtures. Introduce `pnpm test:ci:check` for model/generator/contract tests and current workspace checks. The active grouped workflow has not yet migrated, so this stage does not claim active-workflow agreement.
- **CI-DAG-03:** add artifact/setup regression checks to the same root validation command and prove representative clean consumer paths.
- **CI-DAG-04:** wire the real DAG and make `--check-workflow .github/workflows/test.yml` (or its equivalent) **mandatory** in `pnpm test:ci:check`. No `allow-legacy`, opt-out, ignored-drift mode, or staged exception may remain in the delivered root check. Keep the checker strict even before integration; staging belongs to which checks the root command invokes.
- **CI-DAG-05:** local checks do not certify GitHub scheduling/UI. Authorized healthy and controlled failure/cancellation runs remain mandatory before final rollout acceptance.

### Required CI-DAG-02 workflow/model fixtures

| Fixture family             | Required assertions                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery/coverage         | Pnpm-discovered packages and apps with tests occur exactly once; root/build-only workspaces do not become test jobs. Missing, duplicate, added/removed, unknown, and stale workspace/override nodes fail.                                                     |
| Dependency fields          | Cover dependencies, devDependencies, peerDependencies, and optionalDependencies; deduplicate multi-field edges while preserving provenance; ignore external dependencies; reject unresolved `workspace:` references.                                          |
| Exact gates                | Remove a required edge or add an unrelated edge and validation fails, including redundant declared edges. Cover router/client/runtime, React/client, OIDC example's three parents, and react-vite's two parents.                                              |
| Fixture separation/cycles  | Router's runtime/starter/express-runtime reads require build availability, not reverse test gates. The explicit runtime-to-starter gate remains. A genuine model/workflow cycle fails with an explanatory path.                                               |
| Commands/helper wiring     | Wrong package input, subset test commands, multiple test filters, `... test`, or a helper mismatch fails; each main workspace runs its complete current `test` script.                                                                                        |
| Preparation/final contract | Missing preparation gate, missing validation/preparation job, omitted final prerequisite, non-always final evaluation, main-job `continue-on-error`, gate-bypassing conditions, and unrelated cancellation/fail-fast mechanisms fail.                         |
| Behavioral eligibility     | Router failure blocks deco/client/runtime/React/react-vite/starter but not message-service, OIDC, or independent jobs. Vault failure blocks its stores/client/example but not core jobs. A failed multi-parent prerequisite blocks only its true descendants. |
| Generation/drift           | Stable output across input ordering and repeated generation; edited manifests, job IDs, inputs, `needs`, helper bindings, or final coverage are detected against actual workflow-contract fixtures.                                                           |

CI-DAG-04 additionally tests aggregate states: all-success, preparation failure, root/mid-graph failures, multi-parent failures, cancellation, missing results, and expected skip cascades. An expected skip after an upstream failure still means a failed aggregate.

## 4. Compiled-output artifact boundary

Read-only observation of existing ignored outputs found **31 `dist` roots, 274 regular files, and 11,348,279 bytes**, with no symbolic links or special entries. These were not rebuilt; their freshness, release compatibility, archive size, or clean-checkout usability is **not certified**.

At this revision every non-root build workspace writes a `dist` tree: all 23 package workspaces and all eight apps. Preparation should inventory an explicit pnpm-discovered output allowlist rather than blindly upload `packages/*/dist`; both tested apps and the six build-only app paths matter. Re-review outputs when build scripts change.

| Output family         | Important contents/boundary                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package libraries     | Complete `dist` trees, including ESM/CJS/declaration subpaths and generated/copied assets; not just `index.*`. Router includes `dist/MIGRATION.md`; mongoose-rxdb includes `dist/storage`; PDF/asset-inliner have ESM/declaration-specific layouts. |
| access-router-runtime | `dist/index.mjs`, executable `dist/cli.js`, `dist/tsconfig.package.json`, and copied `dist/tsconfig.json`; strict-consumer/CLI fixtures need the complete tree.                                                                                     |
| express-runtime       | Executable `dist/cli.js`, library/configuration outputs, and supporting chunks.                                                                                                                                                                     |
| Starter               | `dist/bin/{cli,deploy-netlify,deploy-shared}.js` plus the complete staged `dist/template`, including its manifest, generated lock/workspace files, `_gitignore` alias, `.agents`, `.dockerignore`, and public `.env.example`.                       |
| Tested apps           | `apps/react-vite/dist`; DPoP example's **both** `dist/client` and `dist/server`.                                                                                                                                                                    |
| Build-only apps       | All six table-listed `dist` trees; `apps/runtime/dist/app.js` is produced by the compiled runtime CLI, not a conventional library index.                                                                                                            |

Observed file modes: runtime and express-runtime CLIs and all three starter bins were `0755`; the runtime copied package tsconfig was `0644`. A directory upload/download alone may normalize executable permissions or omit hidden entries. Transfer a verified archive so inner file modes/hidden files survive.

**Starter completeness caveat:** `scripts/stage-template.entry.ts` can return success when registry resolution establishes that the current release is unpublished, preserving an old template if present or leaving none. Its packed-consumer helper requires a staged template and validates release dependencies. Therefore build exit status and a nonempty starter `dist` do not establish fixture readiness. Require the expected stage and matching `VERSION`/template dependency contract from a clean preparation checkout. Fail clearly if the release prerequisite is absent; do not reuse an earlier run's template, skip tests, publish packages, or change release logic to manufacture a green preparation job.

### CI-DAG-03 transfer/restore requirements

1. Emit an output manifest containing normalized repo-relative paths, entry type, mode, byte count/hash, required roots/representative files, actual checkout SHA, run ID/attempt, OS/architecture, resolved Node/pnpm versions, and lockfile identity. Emit the archive SHA-256 as a preparation output so consumers verify against an expected digest outside the downloaded archive.
2. Scope artifact names/downloads to that workflow run/attempt/revision and compatible toolchain/platform. No cross-run fallback or broad artifact-prefix lookup. Missing/incomplete/incompatible output is a preparation/restore failure.
3. Archive only designated output trees; keep manifest/archive bookkeeping in ignored scratch. Restore through a validated staging area. Reject absolute/traversal paths, duplicate normalized paths, escaping links/hardlinks, special files, unsafe modes, and attempts to overwrite checked-out source/configuration/root lockfiles. Required safe internal links, if introduced later, need explicit support and regression tests; none were observed now.
4. Preserve hidden staged files and executable bits, but exclude private dotenv files, credentials, dependency trees/stores, browser state/binaries, databases, source checkouts, and machine-installed tools. A generated lockfile **inside** the allowlisted starter output is legitimate; replacing the checkout's root lockfile is not.
5. Install consumer dependencies independently before exercising restored files; each test's subsequent rebuild changes only its own checkout. Caches accelerate installation/downloads and are not substitutes for same-run compiled artifacts.
6. Prove clean round trips with runtime CLI and NodeNext/Bundler consumers, router release-artifact bin fixtures, starter executable-bin/generated-tooling/packed-template paths, and real-browser imports. Test omission, corruption, identity mismatch, permissions, hidden files, and restore-boundary attacks. Filenames alone are not this proof.

Inspected anchors: [runtime build configuration](../../../../packages/access-router-runtime/tsup.config.ts), [starter stage entry](../../../../packages/create-access-router-mongo-starter/scripts/stage-template.entry.ts), [starter packed-consumer support](../../../../packages/create-access-router-mongo-starter/tests/support/packed-consumer.ts), and [starter packed-consumer acceptance](../../../../packages/create-access-router-mongo-starter/tests/packed-consumer.test.ts).

## 5. Per-job resources and repeated setup

### Common tools and install policy

Preparation/test jobs need Node, pnpm, npm, a frozen root-workspace install, and the checked-out source/docs/configuration/license/fixtures. Inspected subprocess paths use Node (including compiled CLIs/watch children), TypeScript, tsx/tsup/esbuild/Vite/Vitest, npm/pnpm installed-consumer operations, and ordinary Ubuntu tools including `git`, `sh`, `tar`, and `find`. Installed-consumer tests can access the package registry; a warm workspace store does not make them offline or frozen to the workspace lockfile.

Preserve the existing root `--frozen-lockfile --ignore-scripts` policy and pnpm build-approval settings. Do not enable all dependency lifecycle scripts or silently install optional native/premium SQLite components. Python/native compilation can be a third-party install fallback, so a clean setup verification must catch actual prerequisites; absence of a direct Python subprocess is not exhaustive proof about every registry dependency.

### Resource inventory for the complete default tests

All rows also require the common tools/output contract above. Browser/system setup belongs to the jobs that use it, not a global Chromium installation.

| Test workspace(s)                                                                            | Additional resources and inspected callers                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| utils, http-errors, json-frame, express-response-handler, express-json-router, asset-inliner | Node/TypeScript/packed-consumer subprocesses and local fixtures; no real-browser, Mongo, or Redis service prerequisite found in the inspected default callers.                                                                                                                                                                                                                                                                          |
| express-runtime, access-router-runtime                                                       | Compiled CLIs, temporary projects, watch/supervisor subprocesses, local HTTP/port/signal behavior, strict installed consumers; no external database service prerequisite found for these default suites.                                                                                                                                                                                                                                |
| access-router                                                                                | Real `mongodb-memory-server` standalone/replica-set harnesses, installed consumers, and reverse compiled bin fixtures. Retain package-specific test-layer/worker controls.                                                                                                                                                                                                                                                              |
| access-router-deco                                                                           | Real Mongo fixtures in owned-authorization/documentation examples, TypeScript/decorator installed consumers, and a `find` subprocess in packed-consumer compatibility.                                                                                                                                                                                                                                                                  |
| access-router-client                                                                         | Real Mongo integration servers plus type/installed-consumer tests. Browser-smoke uses **jsdom**, not Playwright.                                                                                                                                                                                                                                                                                                                        |
| access-router-react                                                                          | jsdom React 19/18 lanes, npm-installed React 18 consumer dependencies, TypeScript/nonruntime/packed consumers. No real browser installation for this main job.                                                                                                                                                                                                                                                                          |
| react-vite                                                                                   | jsdom/Vite React tests reading restored client/React outputs; no Playwright service.                                                                                                                                                                                                                                                                                                                                                    |
| message-service                                                                              | Real Mongo fixtures; preserve `--fileParallelism=false`.                                                                                                                                                                                                                                                                                                                                                                                |
| moo                                                                                          | Standalone Mongo plus replica-set cascade-delete fixtures; preserve `--maxWorkers=1`.                                                                                                                                                                                                                                                                                                                                                   |
| express-oidc-vault                                                                           | Node/packed documentation-wiring consumers and isolated downstream builds; reading Mongo/Redis-store code/docs does not itself start those services.                                                                                                                                                                                                                                                                                    |
| express-oidc-vault-memory-store                                                              | Node/packed-consumer fixtures; no external store service.                                                                                                                                                                                                                                                                                                                                                                               |
| express-oidc-vault-mongodb-store                                                             | Real standalone and replica-set mongod processes, including two-member cases and fail-command behavior. Harness enables test commands and waits for primary/secondary readiness; do not replace it with one shared generic Mongo service.                                                                                                                                                                                               |
| express-oidc-vault-redis-store                                                               | Docker CLI **and working daemon**, disposable Redis `6.2-alpine` / `7.2-alpine` containers with loopback ephemeral ports. Some integration/corruption coverage skips without Docker; a green job in that condition is not full Redis evidence.                                                                                                                                                                                          |
| oidc-vault-dpop-client                                                                       | Node/jsdom/installed-consumer/type tests; its separate `test:browser` delegates to the example with Chromium + Firefox, but is **outside this package's default test script**. Do not add that extra lane as if it were currently grouped coverage.                                                                                                                                                                                     |
| oidc-vault-dpop-example                                                                      | Real Playwright, default Chromium; `DPOP_TEST_BROWSERS` can select Chromium/Firefox/WebKit. Local Vite/example/IdP servers and browser navigation/crypto. Preserve `fileParallelism: false`; validate and cache the selected engines.                                                                                                                                                                                                   |
| express-request-attestation                                                                  | Complete script runs Node, Redis, Mongo, real-browser, and packed-consumer lanes. **Chromium is also used by signer tests in the Node lane.** Docker Redis `6.2-alpine` / `7.2-alpine`, single-member Mongo replica set, installed-consumer browser harness, native browser crypto/module loading. Missing Redis/Mongo prerequisites fail rather than skip-pass.                                                                        |
| pdf-reader                                                                                   | Real Chromium through Vitest's Playwright provider, PDF/canvas/worker fixtures, Node and declaration/packed-consumer lanes. Preserve browser `fileParallelism: false`.                                                                                                                                                                                                                                                                  |
| mongoose-rxdb                                                                                | RxDB memory and SQLite backend/open/persistence subprocess paths. Native trial backend uses Node's `node:sqlite`; npm `sqlite3` and premium storage are optional alternatives, not reasons to change install approvals. The smoke can return after validating fail-closed backend-unavailability, so a green smoke alone does not certify SQLite persistence.                                                                           |
| create-access-router-mongo-starter                                                           | Executable bins, staged template, generated app install/build/typecheck/lint/test/serverless subprocesses, Node-run TypeScript and runtime watch smoke. Generated frontend uses jsdom. Template transaction/readiness paths need downloadable/cached replica-set mongod; they can warn/return if unavailable. Tests use stubbed provider/deploy executables; no real Netlify token, remote deployment, or mandatory global Netlify CLI. |

Inspected browser anchors: [attestation browser configuration](../../../../packages/express-request-attestation/vitest.browser.config.mts), [PDF browser configuration](../../../../packages/pdf-reader/vitest.browser.config.mts), [DPoP browser harness](../../../../apps/oidc-vault-dpop-example/test/browser/harness.ts), [client jsdom configuration](../../../../packages/access-router-client/vitest.browser.config.ts), and [react-vite jsdom configuration](../../../../apps/react-vite/vitest.config.ts).

Inspected database/native anchors: [attestation Redis harness](../../../../packages/express-request-attestation/test/redis-harness.ts), [attestation Mongo harness](../../../../packages/express-request-attestation/test/mongo-harness.ts), [OIDC Mongo harness](../../../../packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts), [OIDC Redis harness](../../../../packages/express-oidc-vault-redis-store/test/redis-harness.ts), [SQLite loader](../../../../packages/mongoose-rxdb/src/storage/loader.ts), [SQLite smoke](../../../../packages/mongoose-rxdb/test/_sqlite-smoke.test.ts), and starter template transaction/readiness tests.

### Browser/database cache boundaries

- Resolve Playwright **inside each real-browser workspace**. The inspected installed version was `1.62.1`; do not assume all future workspaces resolve the PDF job's version. Key browser caches by OS/architecture, resolved Playwright version, and normalized selected engines. Restore binaries only; no browser profiles/test state.
- Default main graph requires Chromium for attestation, PDF, and the DPoP example. Install selected browsers on cache misses, and install their **system dependencies even on cache hits**. Do not interpret a browser-cache hit as an apt/library cache hit.
- Mongo memory-server resolves/downloads a real mongod at runtime because install-time scripts are ignored. Inspected root memory-server/core were `11.3.0`; attestation's were `11.2.0`; both inspected cores defaulted to mongod `8.2.6`. These are local resolved observations, not proof of hosted binaries or future pins. Record actual server binary/version, package version, platform, cache-hit status, and any `MONGOMS_VERSION`/download override.
- Cache Mongo **binaries**, never database directories, replica-set state, or locks shared between active jobs. Keep harness startup/failpoints/member counts/local ports intact. Docker availability includes daemon access and required image pulls; record resolved image digests, not only mutable Redis tags.
- Keep per-package serialization limits. Splitting jobs removes cross-package mutable-output contention but does not reduce the peak memory of an individual heavy package or its nested browser/database/subprocesses.

### Python/asdf/website setup decision

Current shared setup installs Python build headers, invokes pinned `egose/actions/asdf-tools`, installs all root `.tool-versions` entries, and pip-installs `pre-commit==4.6.2` / `gitlint==0.19.1`. It also adds a docker-compose plugin. Shared npm setup frozen-installs **root and website**, with lifecycle scripts ignored. These costs would repeat on at least 25 isolated test runners plus preparation if reused unchanged.

No direct execution of Python, pre-commit, gitlint, or docker-compose was found in inspected default test/build callers; Redis harnesses invoke `docker`, not compose. TypeScript is executed by Node, not Python. Multiple tests read `website/docs` as source text, including vault and starter, but that does not require a website dependency install or Docusaurus build. `website` is not selected by root `pnpm build`.

**Recommendation for CI-DAG-03:** add a lean CI-only Node/pnpm/root-workspace setup for preparation and package jobs; omit the website install and repeated source-built Python/pip tools there, while retaining actual Ubuntu/native runtime prerequisites discovered by clean consumer verification. Leave shared/lint/compatibility/publishing setup untouched. Validation needing `pre-commit check-yaml` can use Python tooling in its own validation context; do not propagate that requirement to every package job. Asdf is required by the unchanged minimum-Node lanes, but copying `.tool-versions` in consumer fixtures does not require asdf when usable Node/pnpm/npm binaries are directly on PATH. Verify subprocess resolution from generated/packed consumer directories before accepting the lean helper.

Toolchain discrepancy to resolve explicitly: `.tool-versions` pins Node `26.12.1`, Python `3.15.1`, and pnpm `11.24.0`, while root `packageManager` and the generated template pin pnpm `11.24.0`. Observed checkout execution was Node `v26.12.1` / pnpm `11.24.0`. Prefer the package-manager contract for the CI-only pnpm execution target, but CI-DAG-03 must record the chosen resolution and prove root/subprocess versions, or obtain maintainer-approved canonical-pin alignment. Do not silently rewrite either pin, bypass package-manager enforcement, or mark artifacts compatible merely because asdf installed a different pnpm binary.

## 6. Concurrency scope and maintainer decisions

There is no repository-configured global semaphore in the chosen layout. GitHub evaluates each static job's successful prerequisites and schedules eligible jobs as runner slots become available. Eight main root test jobs are initially eligible after preparation; additional branches become eligible without waiting for unrelated packages or an entire dependency level. Other workflows, unchanged lint/compatibility lanes, and overlapping push/PR runs also consume quota.

`strategy.max-parallel` applies to **one matrix**, not all DAG jobs or the entire workflow. A workflow/job `concurrency` group is a cancellation/queue policy, not a safe counting semaphore. Do not add unrelated `needs` to fake throttling: that changes failure propagation.

Public observations showed five running jobs per old workflow and ten across the two overlapping runs below. They demonstrate available slots at those instants, **not** the organization's quota, a guaranteed future allocation, or approval to expand runner usage.

| Maintainer-owned decision                                                                                                | Timing / consequence                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted plan/runner quota, other workload contention, and whether a hard global cap is required                           | Confirm before CI-DAG-04 wiring/rollout. If exactly four slots are mandatory, this static multi-runner design needs a separately approved feasible runner/provisioning or scheduling solution; do not substitute stage barriers or cancellation groups. |
| Acceptable main/workflow aggregate job time, actual billing, artifact storage/retention, and cold/warm wall-time targets | Approve comparison thresholds before CI-DAG-05 live acceptance; none are inferred here. Shorter elapsed time can cost more overall.                                                                                                                     |
| Canonical pnpm execution/pin alignment                                                                                   | CI-DAG-03 must document/verify the execution contract before publishing compatible artifacts; source pin edits need the appropriate owner.                                                                                                              |
| Stable required-check context and any branch-protection migration                                                        | Confirm current `unit-test` identity before rollout; settings changes require separate authorization. Preserve Markdown-only trigger exclusions, which affect required-check behavior.                                                                  |
| Permission to run healthy and controlled failure/cancellation Actions cases                                              | Explicit authorization/access is needed for CI-DAG-05; no dispatch or push was performed here.                                                                                                                                                          |

Proceed with model/generator work now. Defer speculative build-elision, package-script changes, larger browser coverage, premium/native dependency changes, and additional scheduler infrastructure. Reconsider the rollout design only if quota/budget evidence makes it unsuitable.

## 7. Available public baseline, not a savings claim

Sources: [workflow runs API](https://api.github.com/repos/egose/web-ts-toolkit/actions/workflows/test.yml/runs?per_page=5), [push run](https://github.com/egose/web-ts-toolkit/actions/runs/44367139569), and [PR run](https://github.com/egose/web-ts-toolkit/actions/runs/44367149484), with their public run/jobs/steps metadata. Both successful records report `head_sha = 0fda5197c5b950e865af73681225c8bbf5533775`, attempt 1, and five successful jobs. The PR's actual checkout merge SHA was not established from logs.

Definitions: unit-job duration is its `completed_at - started_at`; workflow wall time here is run `created_at` to the last job's `completed_at`; aggregate job time is the sum of all five job intervals, including lint/compatibility setup. These are timestamp-derived execution observations, **not billed minutes**.

| Run / event / created UTC                             | Unit-test seconds | Workflow wall seconds | All-job aggregate seconds | Observed peak running jobs |
| ----------------------------------------------------- | ----------------- | --------------------- | ------------------------- | -------------------------- |
| `44367139569` / push / `2026-11-18T18:12:27Z`         | 2740              | 2745                  | 3547                      | 5                          |
| `44367149484` / pull_request / `2026-11-18T18:12:30Z` | 3062              | 3065                  | 3995                      | 5                          |

Selected unit-job steps, seconds:

| Phase                          | Push    | PR      | What is / is not known                                                                                                        |
| ------------------------------ | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Setup Tools                    | 156     | 23      | Shared Python headers/asdf/pip step; subphase/cache attribution unavailable.                                                  |
| Setup NPM packages             | 24      | 23      | Combined root + website setup; individual install/cache attribution unavailable.                                              |
| Cache Playwright browsers      | 6       | 4       | Cache step ran; raw cache outputs unavailable.                                                                                |
| Install Playwright Chromium    | skipped | skipped | With the reviewed conditional, consistent with browser-cache hits.                                                            |
| Install Playwright system deps | 349     | 9       | Ran on both; browser cache does not establish system dependency cost.                                                         |
| Combined build + grouped tests | 2184    | 2986    | One step contains `pnpm build` and `pnpm test:grouped`; cannot separate fresh build, internal rebuilds, or individual groups. |

These selected phases do not sum to the entire job: checkout/setup/post-action overhead remains. Peak across the overlapping pair was ten, computed from half-open job intervals with completions ordered before starts at equal timestamps.

Access limitations: the exact command below exited 4 because `gh` was unauthenticated. Read-only unauthenticated REST requests recovered public metadata, but run-log retrieval returned HTTP 403. No detailed cache outputs, actual tested PR merge revision, hardware/image observations, memory/CPU/disk peaks, billing, private quota/settings, or maintainer budget approval were available. Successful public runs are not a new local baseline test pass. This is a summary-only evidence bundle; raw API/log data and dependencies were not archived.

```sh
gh run list --repo egose/web-ts-toolkit --workflow test.yml --limit 10 --json databaseId,headSha,event,status,conclusion,createdAt,updatedAt,displayTitle
```

REST metadata was fetched from `/actions/runs/<run-id>` and `/actions/runs/<run-id>/jobs?per_page=100`, then cross-checked using `/actions/runs/<run-id>/attempts/1/jobs?per_page=100`. Each response had all five jobs (`total_count` matched); run/step durations and overlapping concurrency were calculated, not guessed.

## 8. Concrete downstream comparison protocol

**All commands in this section are future authorized verification, not executed package/build/Actions work in CI-DAG-01.** Run in Bash from the repository checkout root with the selected toolchain and a fresh ignored scratch directory. `$PWD` supplies the absolute checkout-local scratch/TMPDIR path only at runtime. Do not preserve raw logs, caches, databases, consumer trees, or credentials; curate sanitized measurements into a new evidence file in this bundle without overwriting this historical design.

Compare a healthy serial/grouped control with the healthy DAG using identical test sources/lockfiles/toolchain and the smallest necessary workflow-only change. Match event/actual checkout commit, runner image/architecture, selected browser engines, and cache conditions; record differences instead of attributing all changes to scheduling. The two existing runs are useful context, not a statistically controlled experiment. Collect at least three healthy observations per recorded warm/cold condition if budget/access permits; otherwise document sample limits. Do not delete shared caches/settings to force a cold run: use explicitly approved measurement-only cache keys/isolated stores, record partial hits, and leave production behavior unchanged.

### A. Read existing run/attempt metadata and compute elapsed/aggregate/concurrency

This requires an authenticated `gh` for logs (or read-only REST access for metadata). Set `RUN_ID`/`ATTEMPT` to an already-authorized completed run; this does not start one. `gh --version` records the client used. Keep raw output in scratch until reviewed/sanitized.

```sh
set -euo pipefail
RUN_ID=44367139569
ATTEMPT=1
scratch="$(mktemp -d "$PWD/_tmp-ci-dag-metadata-XXXXXX")"
git check-ignore "$scratch" >/dev/null
export TMPDIR="$scratch"
gh --version > "$scratch/gh-version.txt"
gh api "repos/egose/web-ts-toolkit/actions/runs/$RUN_ID/attempts/$ATTEMPT" > "$scratch/run.json"
gh api --paginate --slurp "repos/egose/web-ts-toolkit/actions/runs/$RUN_ID/attempts/$ATTEMPT/jobs?per_page=100" > "$scratch/jobs-pages.json"
node --input-type=module - "$scratch/run.json" "$scratch/jobs-pages.json" <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const [runPath, jobsPath] = process.argv.slice(2);
const run = JSON.parse(readFileSync(runPath, 'utf8'));
const pages = JSON.parse(readFileSync(jobsPath, 'utf8'));
assert.equal(run.status, 'completed');
const jobs = pages.flatMap((page) => page.jobs);
assert.equal(new Set(jobs.map((job) => job.id)).size, jobs.length);
assert.equal(jobs.length, pages[0].total_count);
const millis = (value) => value ? Date.parse(value) : NaN;
const timed = jobs.filter((job) => job.conclusion !== 'skipped' &&
  Number.isFinite(millis(job.started_at)) && Number.isFinite(millis(job.completed_at)));
const main = timed.filter((job) => ['ci-validate', 'ci-prepare', 'unit-test'].includes(job.name) ||
  job.name.startsWith('test-'));
const seconds = (job) => (millis(job.completed_at) - millis(job.started_at)) / 1000;
const peak = (set) => {
  const events = set.flatMap((job) => seconds(job) > 0 ?
    [[millis(job.started_at), 1], [millis(job.completed_at), -1]] : [])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0, maximum = 0;
  for (const [, delta] of events) { active += delta; maximum = Math.max(maximum, active); }
  return maximum;
};
const final = jobs.find((job) => job.name === 'unit-test');
assert(final && main.length && timed.length && Number.isFinite(millis(final.completed_at)),
  'Expected completed final gate and timed main graph');
const last = Math.max(...timed.map((job) => millis(job.completed_at)));
console.log(JSON.stringify({
  run: run.id, attempt: run.run_attempt, event: run.event, reportedHeadSha: run.head_sha,
  conclusion: run.conclusion,
  workflowWallSeconds: (last - millis(run.created_at)) / 1000,
  createdToUnitGateSeconds: (millis(final.completed_at) - millis(run.created_at)) / 1000,
  mainGraphWallSeconds: (millis(final.completed_at) - Math.min(...main.map((job) => millis(job.started_at)))) / 1000,
  mainAggregateJobSeconds: main.reduce((sum, job) => sum + seconds(job), 0),
  workflowAggregateJobSeconds: timed.reduce((sum, job) => sum + seconds(job), 0),
  mainPeakRunningJobs: peak(main), workflowPeakRunningJobs: peak(timed),
  missingTiming: jobs.filter((job) => job.conclusion !== 'skipped' && !timed.includes(job)).map((job) => job.name),
  jobs: jobs.map((job) => ({ name: job.name, conclusion: job.conclusion,
    seconds: timed.includes(job) ? seconds(job) : null,
    steps: job.steps?.map((step) => ({ name: step.name, conclusion: step.conclusion,
      seconds: Number.isFinite(millis(step.started_at)) && Number.isFinite(millis(step.completed_at)) ?
        (millis(step.completed_at) - millis(step.started_at)) / 1000 : null })) }))
}, null, 2));
NODE
```

Request logs separately after metadata calculation, so a log-access failure does not prevent using the available metadata:

```sh
gh run view "$RUN_ID" --repo egose/web-ts-toolkit --attempt "$ATTEMPT" --log > "$scratch/run.log"
```

Report authentication/log-access failures; do not pretend unavailable data was measured. For overlapping-run peak, apply the same interval calculation to the union of job intervals from all concurrent runs, not the sum of each run's peak. For healthy DAG eligibility latency, compare each job's start with the latest completion of its exact static prerequisites; this includes scheduler latency, not a proven quota-only queue delay. Also inspect the complete-test step timestamps to verify that upstream success precedes execution. Record main graph wall/critical path, overall workflow wall, and aggregates separately.

### B. Record runner/tool/cache/resource facts without revealing machine paths

CI-DAG-03/05 should record these commands' versions/results alongside the measured run:

```sh
node -e 'const os=require("node:os"); console.log(JSON.stringify({node:process.version,abi:process.versions.modules,platform:process.platform,arch:process.arch,logicalCpu:os.cpus().length,totalMemoryBytes:os.totalmem()}))'
pnpm --version
npm --version
git rev-parse HEAD
uname -sr
cat /etc/os-release
/usr/bin/time --version
pnpm --dir packages/express-request-attestation exec playwright --version
pnpm --dir packages/pdf-reader exec playwright --version
pnpm --dir apps/oidc-vault-dpop-example exec playwright --version
docker version --format '{{.Client.Version}} {{.Server.Version}}'
docker image inspect --format '{{json .RepoDigests}}' redis:6.2-alpine redis:7.2-alpine
```

Browser/Docker commands apply only to the appropriate prepared jobs; missing prerequisites must be reported. Include `ImageOS`/`ImageVersion` when the hosted image exposes them, the configured runner label, actual mongod version/server startup outcome, and resolved package versions. Do not log complete environments, process arguments, connection strings, tokens, or hostnames.

Record dependency-store, browser, Mongo, and any tool caches separately: **key, exact/partial/miss status, restore/save seconds, binary-install seconds, and system-dependency seconds**. Workflow helper steps should emit the cache action's hit outputs explicitly. Measure cache/artifact sizes with the following commands using the helper's runtime cache paths; sanitize absolute paths to cache labels in preserved output:

```sh
du --summarize --block-size=1 "$(pnpm store path)"
du --summarize --block-size=1 "$PLAYWRIGHT_BROWSERS_PATH"
du --summarize --block-size=1 "$MONGOMS_DOWNLOAD_DIR"
stat --format='%s' "$scratch/compiled-outputs.tar.gz"
sha256sum "$scratch/compiled-outputs.tar.gz"
```

`PLAYWRIGHT_BROWSERS_PATH`, `MONGOMS_DOWNLOAD_DIR`, and archive path above must be the CI helper's configured runtime locations, not guessed defaults. A missing directory is not a cache-size observation. Artifacts and caches have different identity/trust/restore rules. Do not include native dependency stores or browser binaries in the compiled-output artifact to reduce setup time.

### C. Separate setup/build/test phase timings; observe total runner pressure

On separately authorized clean isolated checkouts, time root installation, preparation build, artifact upload/download/verify, browser download, system dependencies, and full package scripts as distinct steps. Sample the whole runner while builds/tests execute. Example below measures one complete workspace test, after its independent setup and validated artifact restore; replace `WORKSPACE` only with a model-validated exact manifest name.

```sh
set -euo pipefail
WORKSPACE='@web-ts-toolkit/pdf-reader'
scratch="$(mktemp -d "$PWD/_tmp-ci-dag-resources-XXXXXX")"
git check-ignore "$scratch" >/dev/null
export TMPDIR="$scratch"
(
  while :; do
    date -u +'%Y-%m-%dT%H:%M:%SZ'
    awk '/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/' /proc/meminfo
    cat /proc/loadavg
    ps -e -o comm=,rss=,pcpu= --sort=-rss
    if command -v docker >/dev/null 2>&1; then
      docker stats --no-stream --format '{{json .}}' 2>/dev/null || true
    fi
    df --block-size=1 --output=size,used,avail .
    sleep 2
  done
) > "$scratch/runner-samples.log" 2>&1 &
sampler_pid=$!
trap 'kill "$sampler_pid" 2>/dev/null || true; wait "$sampler_pid" 2>/dev/null || true' EXIT
/usr/bin/time --verbose --output "$scratch/package-time.txt" pnpm --filter "$WORKSPACE" test > "$scratch/package.log" 2>&1
```

The wrapper preserves a failed test's nonzero exit via `set -e`; review raw logs before archiving. GNU time's maximum RSS is a process/child accounting proxy, **not simultaneous total runner memory** and not Docker-container memory. `/proc/meminfo` samples establish runner memory pressure, `ps` identifies Node/browser/mongod concurrency without logging arguments, and Docker stats records container pressure separately. Sampling is approximate and may miss short peaks; record the two-second interval and measurement overhead. `ps %CPU` is a lifetime average, not an instantaneous peak. Record OOM/timeout/process-exit failures rather than inferring safety from a green status alone.

Additional timed commands, executed sequentially and only in their appropriate authorized checkout/phase:

```sh
/usr/bin/time --verbose --output "$scratch/install-time.txt" pnpm install --frozen-lockfile --ignore-scripts
/usr/bin/time --verbose --output "$scratch/preparation-build-time.txt" pnpm build
/usr/bin/time --verbose --output "$scratch/grouped-time.txt" pnpm test:grouped
```

For each real-browser job, resolve `WORKSPACE_DIR` and the validated `ENGINES` Bash array from the model (`chromium` by default here). Time misses and dependencies independently:

```sh
/usr/bin/time --verbose --output "$scratch/browser-download-time.txt" pnpm --dir "$WORKSPACE_DIR" exec playwright install "${ENGINES[@]}"
/usr/bin/time --verbose --output "$scratch/browser-system-deps-time.txt" pnpm --dir "$WORKSPACE_DIR" exec playwright install-deps "${ENGINES[@]}"
```

Run the first command only on a browser-cache miss and the second on both hits and misses. Existing package `test` commands include rebuilds: label those timings **full package script including internal rebuilds**, not pure test time. Step/subcommand logs may identify subphases, but do not remove rebuilds or split coverage merely to obtain a smaller number. Never overlap builds/groups/tests in one checkout.

### D. Live acceptance and budget review

CI-DAG-05 needs an authorized healthy production-logic run plus controlled router/root, mid-graph/multi-parent, vault, preparation-failure, cancellation, and missing/skip-result cases (local fixtures cover impossible-to-inject states). Confirm package coverage, artifact identity/restore, actual UI graph, no early dependent execution, unrelated continuation, and fail-closed `unit-test`. Use disposable controlled fixtures with production gate logic; leave no failure injection, test subset, or weakened condition in the delivered workflow.

Compare wall time, main and whole-workflow aggregate execution time, setup/rebuild/transfer phases, cache conditions, observed peak concurrency, and browser/Mongo/Redis/runner resources separately. Actual billing and organization quota require maintainer-provided evidence. If costs or regressions exceed the approved budget, fix them within scope or obtain an explicit maintainer decision before rollout. A rollback returns to serial safe groups, never concurrent legacy groups sharing one checkout.

## 9. Pinned Actions-aware validator

Select **actionlint v1.7.7**, checksum-pinned Linux amd64 binary, for V4. Local `actionlint -version` was unavailable (`ENOENT`); `go version` exited 126 because no Go version was configured. Do not require an unpinned Go install or `go install ...@latest`.

- Release archive: [actionlint_1.7.7_linux_amd64.tar.gz](https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_linux_amd64.tar.gz), published size 2,080,472 bytes.
- Published [checksums](https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_checksums.txt): `023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757`.
- [Pinned usage documentation](https://github.com/rhysd/actionlint/blob/v1.7.7/docs/usage.md) confirms explicit workflow paths and disabling optional ShellCheck/Pyflakes integrations. The release API digest was null; the checksum above was fetched from the published checksums file. No binary was downloaded/installed or validator pass claimed.

Exact future installation/check procedure, in Bash from repo root on Linux x86_64; the `pre-commit` command requires the pinned Python tooling in its separate validation context:

```sh
set -euo pipefail
test "$(uname -s)" = Linux
test "$(uname -m)" = x86_64
scratch="$(mktemp -d "$PWD/_tmp-ci-dag-actionlint-XXXXXX")"
git check-ignore "$scratch" >/dev/null
export TMPDIR="$scratch"
archive="$scratch/actionlint_1.7.7_linux_amd64.tar.gz"
curl --fail --location --proto '=https' --tlsv1.2 --output "$archive" https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_linux_amd64.tar.gz
printf '%s  %s\n' '023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757' "$archive" | sha256sum --check --strict -
tar -xzf "$archive" -C "$scratch" actionlint
"$scratch/actionlint" -version
"$scratch/actionlint" -shellcheck= -pyflakes= .github/workflows/test.yml
pre-commit run check-yaml --files .github/workflows/test.yml
```

Also pass touched composite `action.yml` files to `pre-commit check-yaml` and the CI helper/contract tests. Do **not** pass action definitions to actionlint as if they were workflows. Disabling optional integrations gives a reproducible Actions-aware baseline; it does not validate helper shell behavior or replace CI-model/restore/result tests. A different architecture needs its own reviewed release checksum, not this amd64 binary.

## 10. Executed verification and acceptance record

Working directory for all local checks: repository root, at the reviewed SHA. Only the coordinator's untracked task file existed before this agent's deliverables. The task file remains coordinator-owned and was not edited.

- Read-only `pnpm -r list --depth -1 --json` and all-four-field manifest/table assertions passed: 31 build workspaces, 25 tested, six build-only, 26 declared direct gates + one explicit gate; all 25 task table rows matched.
- `TMPDIR="$PWD/_tmp-ci-dag-01-20261118-JlHN5t" pnpm test:groups:check` passed: 18 runner/validation tests, 12 groups / 25 workspaces.
- `TMPDIR="$PWD/_tmp-ci-dag-01-20261118-final-NSTf1d" pnpm test:groups:check` passed on confirmation: 18 tests, zero failed/skipped, 12 groups / 25 workspaces. This is not a package-test run.
- Existing-output lstat/recursive inventory: 31 roots / 274 files / 11,348,279 bytes; modes/hidden entries inspected, without a fresh-build claim.
- Public run/attempt/job/step metadata: two successful five-job records summarized above; detailed logs unavailable (403).
- Published actionlint release/checksum/usage inspection selected the version/binary/checksum; installation and V4 execution were not run.

Document verification passed:

- `TMPDIR="$PWD/_tmp-ci-dag-01-20261118-final-NSTf1d" pnpm exec prettier --check --config-path .prettierrc docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-01-design.md docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/README.md`: both files passed. The initial check found table-formatting differences in the design only; those were corrected before the passing rerun.
- `git diff --check`: passed. Separate read-only Node assertions covered the two new untracked files' whitespace/final newline, which git's tracked diff does not check.
- `TMPDIR="$PWD/_tmp-ci-dag-01-20261118-final-NSTf1d" node --input-type=module` with inline read-only assertions: passed. Reproduced all four dependency-field counts; matched all 25 gate rows in both design and task; verified six build-only rows, all 25 workspaces' resource coverage, important descendant sets, and the existing-output counts. Also checked 23 local links, privacy patterns/manual content review, destination/scratch ignore status, and changed-file scope.
- The same assertions parsed all ten shell blocks using `bash -n` and the one embedded JavaScript block using `node --input-type=module --check`. These are **syntax checks only**, not execution of the proposed measurement/installation procedures.
- Observed verification toolchain: Node `v26.12.1`, pnpm `11.24.0`; formatter dependency pinned by the root manifest to `4.0.0-alpha.13`. No implementation/workflow/action files changed; only these two bundle documents were added alongside the untouched coordinator task.

Both referenced scratch directories were reviewed: only disposable `node-compile-cache/` material, no continuation evidence to promote. They are ignored and were left unchanged apart from tool-managed caches. No required continuation material relies on scratch; no raw run logs, caches, generated consumers, dependency trees, or compiled artifacts are included in this bundle.

### CI-DAG-01 acceptance review

- **Implementation decision:** sections 1–6 resolve topology, exact gating, artifact scope, resource setup, and concurrency semantics. Implement CI-DAG-02; quota/budget/pin/required-check/live-authorization decisions are explicitly assigned downstream.
- **Browser inventory:** section 5 covers attestation/PDF/DPoP engines, Node-lane Chromium, database/subprocess requirements, and default-vs-optional browser coverage; jsdom suites remain distinct.
- **Baseline/comparison protocol:** sections 7–8 separate elapsed time, aggregate job time, and resource observations, with public evidence, exact future commands, and unavailable measurements identified.
- **Required verification/scoped handoff:** read-only manifest/table assertions, local grouping validation, document formatting/hygiene/syntax, and scratch preservation review passed.

**CI-DAG-01 acceptance criteria are met; ready for coordinator acceptance and CI-DAG-02 handoff.** No unresolved decision blocks the model/generator work. The coordinator must reconcile this evidence and update the task status. CI-DAG-03/04/05 artifact, active-workflow, and live-rollout acceptance are explicitly **not** satisfied by this investigation.
