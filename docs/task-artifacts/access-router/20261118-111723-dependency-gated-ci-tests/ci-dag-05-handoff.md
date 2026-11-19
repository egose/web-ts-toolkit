# CI-DAG-05 rollout verification and handoff

**Current status: in progress; CHANGES REQUIRED / BLOCKED.** R1/R2/setup and the fresh non-implementer reviewer are delivered, idle and coordinator-reconciled. The [corrective report](ci-dag-05-corrective-review.md) accepts only R1's scoped allocation/rejection contract, R2's bounded diagnostic surface and setup's reviewed local contracts. Q1's maintained workflow-formatting failure, positive full native-root/Node-20/runner acceptance, unresolved R2 and R3 hosted/maintainer prerequisites remain. [Coordinator support](ci-dag-05-corrective-review-coordinator-support/README.md) preserves byte/scope and independent saved-evidence reconciliation, not coordinator acceptance or rollout authorization. The [sealed finishing report](ci-dag-05-finishing-review.md) remains unchanged. Current authority is **saved-evidence reconciliation and coordinator documentation only**. Renewed explicit authorization is required before workflow correction/delegation, any package/focused execution, source/native/runner probe, runtime/tool installation or hosted execution; reviewer CI/group allowances and R2's package allowance are spent. No commit/push/dispatch/publication/settings change is authorized.

Historical pre-finishing-review status:

**Status: in progress; blocked before final acceptance.** A fresh non-implementer reviewer ran the local gate review, drafted testing guidance and launched V5 in isolated copies. A provider usage limit interrupted its finishing review; two resume attempts were also blocked. The saved third V5 run subsequently finished successfully. The coordinator reconciled its logs and corrected the unfinished handoff and documentation without rerunning complete suites. These finishing edits are **not independently signed off**. GitHub Actions execution (V6) was unauthorized and unperformed. No commit, push, dispatch, publication, or repository-settings change was made. The coordinator owns the task status; this handoff does not mark CI-DAG-05 complete.

## Scope, source, and authorization boundaries

- Source reviewed: the uncommitted working tree at `HEAD` `0fda5197c5b950e865af73681225c8bbf5533775`, including the CI-DAG-02/03/04 implementation already accepted locally by the coordinator.
- **Current corrective maintained identities** are the 24 entries in the unchanged [review input snapshot](ci-dag-05-corrective-review-inputs.json) and [review input summary](ci-dag-05-corrective-review-support/inputs.json). The workflow is SHA-256 `694a1798730ac2b9fd7253cf88d1e77e0773ea9b23f4d83c1a5b0a180cbcfb3c`; the production evaluator remains `fe0c33a9379e2a44ef2d458b66d254773b4c7519cccb9c1660512e593410b9da`. These source hashes remain current after coordinator-only documentation updates; pre-update coordinator-document hashes are historical.
- **Historical CI-DAG-04 fingerprints, not current corrective certification:** workflow `c9408a1b25912416d25f95cefa609410bbf0c9852551803a9bf710ab69017aaf`, result tests `225a786ce4421d498f2feab1cc0d612c8452251282d8f86f8b6eaa2ddf9b24c6`, plan tests `cf938b1f3b6adc0812f70fd23a4cc710ef3177df2c3c2813a0eb94ec557296fb`, root manifest `f3793110d566df545710024d37c207fc4b592aa57c5a5667fdcb7b5df6733d80`. Later authorized R1/R2/setup deltas have separate reviewed fingerprints.
- The historical integration pass before remediation changed only `README.md`, `AGENTS.md`, this bundle and coordinator task documentation. Subsequent R1/R2/setup corrections are separately reconciled; no package production change, reduced complete script/rebuild, worker-limit change, group-safety weakening, dependency change or branch-protection change is claimed.
- Local toolchain: Node `26.12.1`, pnpm `11.24.0`, npm `11.20.0`, pre-commit `4.6.2`, Docker `29.9.3`, Linux x64, 16 logical CPUs. Firefox/Chromium Playwright browsers and the referenced Redis images were available; WebKit was not confirmed. These are local facts, not hosted-runner facts.
- All scratch work used fresh repo-local ignored `_tmp*` directories confirmed with `git check-ignore`, with `TMPDIR` set inside the same scratch directory. The first two V5 attempts used `_tmp-ci-dag-05-*`; the short-path attempt used `_tmp-05c-*`. No separate build/test invocations or numbered groups overlapped in one checkout; safe concurrent members within each group are intentional. The main checkout was reserved for read-only/validation commands while V5 ran in an isolated copy.

## Verification results

This table is **historical pre-finishing-review verification**, not current corrective certification. The V1 row records the six-document check; later addendum checks are separately recorded. Current review retains 611 CI / 18 group passes and the Q1 maintained formatting failure; none was repeated by the coordinator.

| Check                        | Command or procedure                                                                                                                                                                  | Result                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1: documentation/hygiene    | `pnpm exec prettier --check --config-path .prettierrc` on the changed documents; `git diff --check`; changed-file scope, links, privacy/path review                                   | Passed: 6 documents, 26 local links / 1 anchor, privacy/ignore/newline/whitespace and diff checks; see the final reconciliation record below.                             |
| V2: legacy grouping          | `pnpm test:groups:check`                                                                                                                                                              | Exit 0: **18 passed**, 0 failed/skipped/cancelled; validated 12 groups covering 25 workspaces.                                                                            |
| V3: CI contracts             | `pnpm test:ci:check`                                                                                                                                                                  | Exit 0: **310 passed**, 0 failed/skipped/cancelled; model 25 tested workspaces, 26 declared + 1 fixture gates, 6 build-only workspaces; active workflow agreement passed. |
| V4: YAML syntax              | `pre-commit run check-yaml --files .github/workflows/test.yml .github/actions/ci-prepare/action.yml .github/actions/ci-setup/action.yml .github/actions/ci-test/action.yml`           | Passed for the workflow and all three composites.                                                                                                                         |
| V4: Actions-aware syntax     | Pinned actionlint `1.7.7`, tarball SHA-256 `023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757`, run as `actionlint -shellcheck= -pyflakes= .github/workflows/test.yml` | Exit 0. Composite definitions are covered by `check-yaml` and strict helper contracts, not claimed as direct actionlint inputs.                                           |
| V5: preserved local coverage | Fresh isolated copy; sequentially `pnpm lint`, `pnpm build`, `pnpm test:grouped`                                                                                                      | See the V5 execution record below.                                                                                                                                        |
| V6: actual Actions behavior  | Authorized hosted run(s)                                                                                                                                                              | **Not performed. Blocked/unauthorized; see rollout blockers.**                                                                                                            |

At that historical stage, the coordinator reproduced V2/V3 and V4 against then-unchanged implementation; eight-path ESLint passed and the CI-DAG-04 fingerprints matched. Those observations do not certify later corrective bytes or override the fresh Q1 failure.

### Local gate-logic review

The saved independent probe script exercises the production evaluator (`scripts/ci-test-results.mjs`) against the checked-in workflow's exact `needs` graph using the production model (`scripts/ci-test-plan.mjs`). Its saved JSON reports **146 local graph/workflow checks passed** and its stderr is empty; the coordinator inspected both. Maintained regression checks cover additional malformed/unexpected payloads; those are not attributed to unsaved independent probes. These are gate-logic and static-workflow checks, not a GitHub Actions run. The [local evidence ledger](ci-dag-05-local-evidence.md) preserves a curated summary.

- Workflow shape: 31 total jobs = 28 generated main jobs (`ci-validate`, `ci-prepare`, 25 `test-*` package jobs, and the stable `unit-test` aggregate) + 3 preserved independent jobs. The aggregate has 27 direct `needs` and uses `if: ${{ always() }}`.
- Each package job requires `ci-prepare` plus exactly its reviewed test prerequisites; no main-path job uses a matrix or `continue-on-error`.
- Healthy production-evaluator input (all 27 required results successful): exit 0, `All 27 required CI jobs succeeded (25 package tests plus ci-validate and ci-prepare).`
- Root failure (`test-access-router`): exit 1 with the exact skip set `test-access-router-client`, `test-access-router-deco`, `test-access-router-react`, `test-access-router-runtime`, `test-create-access-router-mongo-starter`, `test-react-vite`; non-descendant results stay successful in the gate input.
- Mid-graph failure (`test-express-json-router`): exit 1 with the expected `access-router*`, `message-service`, and `react-vite` skips.
- Vault failure (`test-express-oidc-vault`): exit 1 with its three store jobs and the DPoP client/example skipped.
- Preparation failure (`ci-prepare`): exit 1; `ci-validate` remains successful and all 25 package jobs are expected skips.
- Validation failure (`ci-validate`): exit 1; `ci-prepare` and all package jobs are expected skips.
- Saved independent probes reject cancelled and missing package results, and false success after a non-success prerequisite. The maintained result tests additionally reject all skipped results (including expected dependency skips), extra jobs, malformed records, empty/null/array/object environment payloads and unknown result values. Non-success results cannot make the aggregate pass.
- Preserved lanes: `lint`, `access-router-minimum-node-smoke`, and `access-router-react-minimum-node` have no dependency on the main graph and are not part of the aggregate. The floating React lane's existing `continue-on-error` matrix behavior is unchanged.

The skip sets above were derived from the checked-in `needs` graph and evaluated through the production aggregate script. They show that the graph and gate logic express the intended propagation and continuation; they do **not** demonstrate GitHub's scheduler, UI, or cancellation behavior. That remains V6 evidence.

## V5 execution record

V5 was attempted three times, each in a fresh isolated copy of the dirty working tree (`rsync` of the checkout and `node_modules`, excluding prior scratch), with `TMPDIR` inside that scratch directory. This avoided overlapping builds/tests in the primary checkout, but is not a fresh cold dependency install or isolated CI resource certification. The first two complete attempts failed for the reasons retained below; the third used a shorter scratch path. The first copy predates final documentation-only edits. Coordinator compared 1,987 files against the third copy: all tracked regular files outside `docs/`, except the root README/AGENTS, plus all 11 new CI helper/composite files. Zero byte differences were found; package-local documentation was included, but generated output and copied dependencies were excluded. Full cache/environment/peak-memory telemetry was not captured.

### First complete attempt

| Phase               | Exit | Elapsed | Observation                                      |
| ------------------- | ---- | ------- | ------------------------------------------------ |
| `pnpm lint`         | 0    | 45 s    | Passed.                                          |
| `pnpm build`        | 0    | 193 s   | Passed.                                          |
| `pnpm test:grouped` | 1    | 207 s   | Stopped in group 3; one browser scenario failed. |

The failure was in `@web-ts-toolkit/express-request-attestation`, test `packed-package consumer compatibility > installed Chromium: 'cross-origin explicit cookies recover once from an exposed stale-key challenge'`: the browser received the first `403` with the readable `stale-key` marker but recorded `apiStatuses: [403]`, one preflight/discovery/key module, and no retry. The assertion expected the bounded stale-key retry to end at `200`. All other reported results in that group, including the package's 18 file / 618 test main run and its other 62, 31, and 141 test runs, passed before the packed-consumer failure was reported. No other group or package failure was reported before the runner stopped.

Isolation checks:

- The focused package command `pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer` passed **3/3** times (12/12 tests each) in the same isolated copy with fresh scratch `TMPDIR` directories.
- `pnpm test:group:3` in the same isolated copy passed, including the affected package and `express-response-handler`.

The failure is retained as an unresolved intermittent local risk; the focused passes are isolation evidence, not a root-cause resolution.

### Second complete attempt (environmental failure)

| Phase               | Exit | Elapsed | Observation                                                                      |
| ------------------- | ---- | ------- | -------------------------------------------------------------------------------- |
| `pnpm lint`         | 0    | 37 s    | Passed.                                                                          |
| `pnpm build`        | 0    | 179 s   | Passed.                                                                          |
| `pnpm test:grouped` | 1    | 251 s   | Stopped in group 4; `mongoose-rxdb` hit an environmental Unix-socket path error. |

Groups 1-3 passed, including the affected `express-request-attestation` package (packed-consumer 12/12) and `express-response-handler`. In group 4, `@web-ts-toolkit/mongoose-rxdb` reported 21 failed tests across SQLite smoke, selector, storage and upsert cases. The errors show `broadcast-channel` listening on 113-114-byte Unix-socket paths under the scratch `TMPDIR`, exceeding Linux's 108-byte `sun_path` field (usable pathname shorter for a terminating NUL). The package exited 1 and the grouped runner stopped after group 4. The recorded `listen EINVAL` failures support a scratch-path constraint, rather than a demonstrated product assertion regression; the first attempt never reached group 4.

The second attempt used another long `_tmp-ci-dag-05-v5b-*` scratch name. The third used a short repo-local path (`_tmp-05c-*`) with the same `TMPDIR`-inside-scratch rule and completed `mongoose-rxdb` without socket errors. Both failed attempts and all isolation checks remain recorded. Only the second has a supported environmental-path explanation; the first attestation assertion remains an unresolved intermittent result, not a proven environmental or pre-existing defect.

### Third complete attempt (short scratch path)

| Phase               | Exit | Elapsed | Observation                                                      |
| ------------------- | ---- | ------- | ---------------------------------------------------------------- |
| `pnpm lint`         | 0    | 32 s    | Passed.                                                          |
| `pnpm build`        | 0    | 160 s   | Passed.                                                          |
| `pnpm test:grouped` | 0    | 3,606 s | All 12 groups / 25 complete workspace scripts logged completion. |

The saved summary ends with `ALL_OK` at `2026-11-18T18:13:32-08:00`. Vitest summaries total **689 passed file executions / 21,224 passed test executions**, plus **one existing asset-inliner TODO**, across 34 invocations. These are execution counts, not unique files/tests; root group-check tests and compile-only phases are excluded. No test failures/skips or Vitest unhandled-error summary were reported. React 18 emits expected cycle/depth `toThrow` diagnostics, so empty stderr is not claimed.

DPoP ran its complete script with the default **Chromium-only** browser selection: 55 unit + 75 browser tests = 130, not the 280 from the separately accepted CI-DAG-03 three-engine run. PDF completed 205 node + 32 Chromium browser tests = 237. The starter completed 18 files / 339 tests, including publication guard and release-like packed-consumer cases; no publication/deployment occurred. See the [per-workspace ledger and sanitized failure excerpts](ci-dag-05-local-evidence.md) for counts, copied-dependency/cache limits, source agreement and provenance. The coordinator did not duplicate this successful saved run or retry away the earlier failure; V5 execution is recorded with limits, not independently re-certified after interruption.

## Coverage, artifacts, and required-check review

- **Exact test coverage:** the model names 25 tested workspaces and 6 build-only workspaces. Each gated job runs the workspace's complete package `test` script, not a reduced command; package scripts retain their own rebuilds and worker/file-serialization limits. The preserved lanes remain outside the generated graph.
- **Artifact boundaries:** `ci-prepare` uploads a verified output-only archive and exposes only `artifact-name`/`artifact-digest`. Every package job passes those outputs to the `ci-test` composite and fails on a missing, mismatched, or incomplete restore rather than skipping. CI-DAG-03 verified local preparation and archive contents (31 dist roots, 173 required files, 333 entries; archive SHA-256 `1c9622805df74e10d08d7519bc162787191d871b8388ea82a09d1543731c58c7`). The active workflow wiring is checked statically and by helper contracts; a live artifact-service upload/download round trip was not performed.
- **Failure/skip propagation:** locally reviewed with exact root, mid-graph, vault, preparation, validation, cancellation, missing, and malformed-input cases using the production evaluator. Dependent skipping is represented by the checked graph; unrelated continuation is represented by non-descendant jobs remaining eligible/successful in the gate input and by the preserved lanes having no graph dependency. Live scheduling/continuation is a V6 blocker.
- **Stable required-check context:** the aggregate job ID and display name remain `unit-test`, and its required-result set is exactly the 27 main jobs. Branch protection and the repository's required-check UI were not inspected or changed; a maintainer must confirm that the existing required-check context still targets `unit-test`.
- **Concurrency controls:** the workflow has no workflow-wide concurrency group and no workflow-wide `max-parallel`. `max-parallel` applies only to matrix jobs; the main package jobs are static, and the only matrix is the preserved React compatibility lane. Actual hosted parallelism still depends on dependency readiness and GitHub runner/account availability.

## Baseline comparison and tradeoff status

CI-DAG-01 recorded two public successful runs at the same reported `head_sha` (`44367139569` push and `44367149484` pull request). Their metadata reports a single `unit-test` job at 2740 s and 3062 s, workflow wall time at 2745 s and 3065 s, all-job aggregate time at 3547 s and 3995 s, and an observed peak of 5 running jobs. The baseline's build-plus-grouped step was 2184 s and 2986 s inside that one job; setup/install/browser phases were partly shared and cannot be attributed more precisely because run logs were unavailable (HTTP 403).

This review's local measurements are deliberately kept separate:

- First V5 attempt: lint 45 s, build 193 s, grouped 207 s before the isolated browser failure.
- Second V5 attempt: lint 37 s, build 179 s, grouped 251 s before the scratch-path Unix-socket failure.
- Third V5 attempt: lint 32 s, build 160 s, grouped 3,606 s; combined command execution 3,798 s, with copied dependencies/available caches and resources.
- CI-DAG-03 local clean preparation: 166,305 ms, producing the verified archive described above.

These local numbers measure one 16-CPU workstation running the grouped loop or a one-shot build; they are not hosted-runner durations, not the new DAG's critical path, and not billed usage.

The structural tradeoff is visible even though it is unmeasured. The baseline ran one setup/install/browser/database preparation and then one build-plus-grouped test step on a single runner. The DAG repeats a frozen-lockfile install, artifact download/restore, and job-specific resource preparation per package, but removes shared-`dist` contention and allows independent packages to run concurrently. Its wall time is bounded by the longest prerequisite chain and by runner availability, while its aggregate runner minutes may rise because setup and rebuild work is repeated. The deepest static chain is `test-utils -> test-http-errors -> test-express-response-handler -> test-express-json-router -> test-access-router -> test-access-router-client -> test-access-router-react -> test-react-vite` (eight package jobs after `ci-validate`/`ci-prepare`); this is a topology observation, not a measured critical path. The local V5 run records only grouped-loop behavior on one machine; it does not sample hosted setup, restore, queueing, or peak memory, and it did not observe an OOM or timeout. **No hosted comparison exists**, so neither a wall-time improvement nor a cost/quota outcome is claimed. In particular, shorter wall time would not imply lower billed minutes, and the 25 package jobs may consume more aggregate runner time than one serial job.

### Required V6 measurement plan

Before any rollout acceptance, use the CI-DAG-01 protocol on an authorized revision that contains this workflow:

1. Record the run ID, attempt, event, actual tested checkout SHA, runner image/architecture, cache hit/miss state, browser engines, database services, and whether the run was cold or warm.
2. Compute run wall time, main-graph wall time, `unit-test` aggregate duration, main/all-job aggregate seconds, peak running jobs, and each job's start lag after its latest prerequisite completed. Inspect the complete-test step timestamps to confirm upstream success precedes execution.
3. Record setup/install, artifact restore, resource preparation, test, and post-job phases separately. Treat local preparation/archive hashes as provenance, not as a hosted timing sample.
4. Run controlled healthy, root-failure, mid-graph failure, preparation-failure, cancellation, and missing/skipped-result cases with the delivered gate logic. Inspect graph rendering, package coverage, final conclusion, artifact use, dependent skipping, and unrelated continuation.
5. Compare only like-for-like event/checkout/runner/cache conditions against the CI-DAG-01 metadata. The existing runs are context, not a controlled experiment; collect at least three healthy observations per warm/cold condition if budget and access permit, and document the sample limits otherwise.
6. Obtain maintainer-provided billing/quota evidence separately. Do not derive billed usage from wall time or local measurements.
7. Obtain maintainer approval of any acceptable wall-time/cost thresholds before rollout; none are inferred here.

## Acceptance-criteria review

| Criterion                                                                                                                | Local status                                   | Evidence or blocker                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V1-V6 pass with exact results, or the task remains blocked with the missing prerequisite identified                      | **Blocked on Q1/runtime/R2/R3 and acceptance** | Historical V1-V5 and fresh scoped review are recorded. Workflow formatting, native/Node-20/runner evidence, R2 disposition and unauthorized V6 remain; no coordinator acceptance or completion is granted.                                             |
| Live evidence demonstrates dependent skipping and unrelated continuation; healthy run covers every main tested workspace | **Not met**                                    | Only local production-evaluator/static-graph evidence exists. No hosted run, scheduler, graph UI, or cancellation evidence exists.                                                                                                                     |
| Documentation agrees with actual scheduling, including that matrix `max-parallel` is not a workflow-wide cap             | **Met locally**                                | `README.md` and `AGENTS.md` distinguish local serial/grouped/group commands, isolated gated CI, validation-vs-suite commands, artifact prerequisites, full-script preservation, independent lanes, and the `max-parallel`/no-global-cap behavior.      |
| Measured outcome/tradeoff report and maintainer-visible required-check rollout/rollback instructions exist               | **Partially met; hosted measurement blocked**  | This report records local measurements, the CI-DAG-01 baseline, why they are not comparable, and the required V6 measurement plan. `README.md`/`AGENTS.md` contain rollout and rollback instructions. No hosted outcome or billing measurement exists. |
| Curated evidence retained and sanitized                                                                                  | **Met locally**                                | This handoff and the linked local-evidence ledger retain counts, provenance and sanitized failures. Raw logs, dependencies, generated consumers and caches are omitted; original scratch is unchanged.                                                 |

## Rollout blockers and required authorizations

1. **Live Actions authorization and access.** V6 requires an authorized branch/PR push or an approved workflow-dispatch mechanism (the checked workflow currently has only `pull_request` and `push` triggers). A commit/push, runner execution, log access, and permission to cancel a controlled run are not authorized by this task.
2. **Controlled fault cases.** Healthy, root/mid-graph failure, preparation failure, cancellation, and missing/skipped-result evidence must be produced without weakening the permanent package tests or leaving injection enabled. This requires maintainer authorization and a reviewed temporary mechanism.
3. **Artifact service and required-check UI.** The live run must confirm exact run/attempt/checkout-scoped artifact upload/download and digest rejection behavior. A maintainer must confirm the repository's required-check context still targets `unit-test`; any branch-protection change needs separate authorization.
4. **Cost/quota and performance.** Hosted timings, aggregate runner minutes, artifact storage/retention, account concurrency, billing, and budget thresholds are unknown. No rollout performance or cost claim can be made without maintainer-provided evidence and approval.
5. **Corrective/final acceptance.** Both independent reviews are delivered and unchanged; the fresh corrective verdict remains **CHANGES REQUIRED / BLOCKED**. R1/R2/setup/review idle deliveries are coordinator-reconciled; no setup or reviewer assignment remains pending. Narrow independent R1/diagnostic/setup-contract acceptance does not satisfy runtime/R2/Q1/R3 prerequisites or grant coordinator/final rollout acceptance.
6. **Intermittent attestation risk disposition and incomplete verification (R2).** The original packed Chromium recovery cause remains unresolved after the delivered bounded investigation and awaits explicit maintainer risk disposition. A focused Node abort failure remains undisposed. The sole complete package invocation passed **867 tests** across four lanes but saved no packed-consumer result; its allowance is spent and **any additional package execution requires renewed explicit authorization**. The observer adds one mapped load reaction and is not proven timing-neutral. The TODO and Chromium-only V5 selection are retained coverage limits, not silently expanded certification.
7. **Native/runtime checkout acceptance.** R1's compact `_tmpXXXXXX`, **45-byte UTF-8 `TMPDIR` / 34-byte real-root** allocation/rejection contract is independently accepted within its pinned assumptions; the calculated **47-byte original hosted root remains rejected**. The shorter real-sibling setup is delivered/reconciled and its local contracts reviewed, not pending implementation. Positive full native short-root success, actual Node-20 execution and Actions main/post/installer/action-resolution behavior remain unverified. The historical grouped V5 and two-process transport observation do not certify them. Preserve isolation, complete scripts, multi-instance coverage and failure behavior.
8. **Maintained formatting (Q1).** Fresh Prettier selected all 24 corrective maintained paths and exited 1, warning only for `.github/workflows/test.yml`. No baseline establishes it as pre-existing; it is not a demonstrated semantic workflow failure. Correction/delegation and subsequent corrective evidence require renewed explicit authorization. The historical four-entry coordinator-manifest formatting exception is separate and is not a Prettier pass.

## Rollback contract

If rollout is rejected or V6 exposes an unacceptable regression, obtain a reviewed coherent rollback restoring the previous workflow's serial `pnpm build` + `pnpm test:grouped` job and matching pre-migration validation wiring/testing guidance. **Reverting only the YAML is not sufficient:** current `package.json`'s `test:ci:check` and checker/regression contracts require the active DAG and deliberately reject the legacy workflow. Restore compatible root command/checker wiring together rather than weakening the currently delivered DAG checks or leaving contradictory instructions. Keep package scripts, group safety, rebuilds, worker limits, independent lanes and the `unit-test` required-check identity unchanged; remove added package/helper jobs and artifact prerequisites. Verify the rollback coherently with its restored validation contract, full serial/grouped coverage and required-check identity before publication. Do not enable concurrent local groups or change branch protection without separate authorization. No rollback was executed here. In the delivered DAG, `pnpm test:ci:check` and `pnpm test:groups:check` remain validation checks, not test suites.

## Claims deliberately not made

- No live GitHub Actions run, workflow dispatch, commit, push, or publication occurred.
- No live scheduler, dependency-skip, unrelated-continuation, graph/UI, cancellation, artifact-service, cache, runner-image, or required-check evidence is claimed.
- No hosted wall-time, critical-path, runner-minute, billing, quota, or cost improvement is claimed. Local V5 times are not hosted measurements.
- No claim that the observed local `express-request-attestation` browser flake is fixed, understood, or eliminated. It is retained as an intermittent local risk; the focused and group reruns are isolation evidence, not a root-cause resolution.
- No package test, workflow gate, rebuild, worker limit, serialization control, or failure-injection behavior was weakened or permanently changed.
- No branch-protection or repository-settings change was made. Independent review is delivered with scoped acceptance and an overall blocked verdict; the coordinator has granted no final acceptance.

## Coordinator reconciliation before fresh finishing review

The coordinator reviewed the saved 146-check gate probe, all three phase summaries, complete third-run workspace summary ledger, focused attestation results, socket errors, starter test boundaries and source fingerprints. README/AGENTS now distinguish package failure from global validation/preparation failure, reject all skipped aggregate results, and explain coherent rollback alongside mandatory active-workflow checking. An unfinished V5 placeholder and the unsupported classification of both failed attempts as environmental were corrected. The model was checked directly: the eight-package chain quoted above is real, including `utils -> http-errors`; it remains a static topology observation only.

Final V1 passed: Prettier for all six changed documentation/evidence files, **26 local links / 1 anchor**, manual/privacy-pattern review, durable destination and scratch ignore status, final-newline/trailing-whitespace assertions and `git diff --check`. Final read-only reconciliation matched all 25 logged complete commands and completions, all ledger rows/totals, 13 accepted implementation fingerprints and four saved V5 log fingerprints. These checks ran no builds, package tests or hosted jobs. The initial formatting check required corrections in the handoff/ledger; accounting and privacy assertions were adjusted for pnpm's abbreviated starter prefix and a sanitized repo-local `tmp/` subpath, not to change the saved results. This record is **not CI-DAG-05 completion or independent finishing acceptance**; outstanding V6, reviewer access and risk/budget decisions remain explicit.

## Fresh independent finishing review and coordinator result addendum

The user authorized a fresh non-implementer review on 2026-11-18, retaining the no-commit/push/dispatch/settings and no-unjustified-full-suite restrictions. The [new report](ci-dag-05-finishing-review.md) independently inspected the delivered source, actual saved runners/logs/copies/archive and finishing documents. It confirmed all 25 workspace ledger rows, 34 Vitest invocations, the reported totals, all three 1,987-file source comparisons and accepted implementation/log hashes. Fresh V2 **18 passed** and V3 **310 passed**, targeted ESLint, YAML/actionlint and document checks were bounded validation, not duplicate package/full suites.

The verdict is **CHANGES REQUIRED/BLOCKED**. R1 is a source-level resource-helper path-budget defect: a 67-byte `TMPDIR` plus the saved 50-51-byte BroadcastChannel suffix projects 117-118 pathname bytes, exceeding 107. This is distinct from the historical second attempt's scratch-path failure; the successful third grouped runner used `_tmp-05c-G8SORQ/t`, not the helper. R2 retains the unexplained attestation assertion; R3 retains V6, required-check and risk/budget prerequisites. No hosted occurrence, new socket failure, correction or rollout acceptance is claimed.

Coordinator inspected the report and saved 310/18 validator results, confirmed its source/path finding with read-only calculations, and verified that only the report was added while **2,535 protected regular files and `HEAD` stayed unchanged**. The initial coordinator log lookup used a nonexistent `grouped.log`; directory inspection corrected it to the saved `v5-grouped.log`, after which the path assertions passed. This was a probe lookup error, not a product or suite failure. The report's six document fingerprints seal the pre-addendum inputs; these later task/handoff/index/ledger updates record the blocked result without modifying that seal or implementation. The report remains unchanged. Useful findings and measurements are curated here; original scratch/probe data is omitted and unchanged, not a self-contained reproduction bundle.

Post-addendum V1 passed for **seven documents / 38 local links / 2 anchors**: Prettier, privacy, durable/scratch ignore status, final-newline/trailing-whitespace and `git diff --check`. All **28 report input fingerprints** matched the pre-addendum baseline or unchanged logs/source. The final scope check allows only the four coordinator result documents to differ; **2,531 other protected regular files**, `HEAD`, root README/AGENTS and the independent report remained unchanged. The initial post-addendum Prettier check flagged handoff table alignment only; a patch corrected it and the complete document check passed. These are documentation/read-only checks, not reruns of the reviewer validators, package suites, resource preparation or hosted work. CI-DAG-05 remains `in_progress` with R1/R2/R3 and no finishing acceptance.

## Evidence and reproduction limits

### Authorized local remediation after finishing review

**Historical remediation authorization, superseded by the current execution limits above:** the user requested necessary fixes and sequential fresh agents for R1 correction, bounded R2 investigation and independent review. Proportionate local checks/probes were allowed then; their subsequent allowances and restrictions are recorded in the [authoritative task](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-05-verify-rollout-measure-tradeoffs-and-update-testing-guidance). This paragraph grants no remaining package/probe/delegation allowance. The original pre-fix snapshot records unchanged `HEAD` and **2,536 protected regular files**, including the sealed report. Earlier no-fix/no-probe statements describe the finishing review itself.

R1's [delivery](ci-dag-05-r1-remediation.md) and [coordinator reconciliation](ci-dag-05-remediation-coordination.md) retain **134 helper / 326 CI / 18 group checks**, byte-boundary regressions, the bounded two-process transport probe and all preceding failures. Five implementation/document files changed relative to R1's preflight (**2,531 unchanged**); the earlier baseline also includes four coordinator addenda (**2,527 unchanged**). No attestation file, sealed report, historical log or `HEAD` changed. The 45-byte helper `TMPDIR` budget supports at most **34-byte real checkout roots**; the **calculated 47-byte representative hosted root is rejected**. A shorter real hosted checkout needs separate scope/authorization and fresh hosted evidence. The R1 agent is idle; fresh R2 investigation follows the [durable handoff](ci-dag-05-r2-handoff.md), before independent corrective review. No R1/CI-DAG-05 acceptance is recorded.

Subsequent scope decision: the user selected **Local setup fix**, authorizing a
fresh setup agent after R2 is idle/reconciled and before independent corrective
review. Minimal local setup/workflow/helper-contract changes may create and use a
shorter real, verified checkout while preserving original action resolution/cleanup,
artifact/source identity, complete scripts and independent jobs. The
[setup handoff](ci-dag-05-checkout-setup-handoff.md) was prepared; the agent was not yet
assigned at that historical scope-decision record. This resolved only local scope, not hosted
evidence. No symlink/external-`TMPDIR` workaround, commit/push/dispatch/settings change
or hosted run is authorized.

R2's subsequent [delivery and coordinator reconciliation](ci-dag-05-remediation-coordination.md#r2-delivered-idle-and-coordinator-reconciled-not-resolved)
retain all eight test/fixture changes, **24 unchanged production files**, package
metadata/scripts, **10 payloads / 99,546 bytes**, **45 source hashes** and **34
planning/staging seals**. The read-only coordinator result preserved all **2,579
regular files** at reconciliation time; its later durable copy/status addenda are
separate. Original cause, focused Node abort failure and interrupted verification
remain undisposed. No production correction was selected. Native sign-promise
identity and shared facade equivalence remain, but one mapped load reaction changes
original signer/load identity and is **not proven timing-neutral**. R2 is idle;
**any additional package execution, including focused lanes, requires renewed
explicit authorization**. Setup and independent review were pending at that
historical R2 delivery record; both have subsequently delivered/reconciled. R3
still blocks final finishing/rollout acceptance.

## Subsequent setup delivery and corrective-review readiness

The same setup session subsequently delivered its [local correction](ci-dag-05-checkout-setup.md)
and stopped idle. [Coordinator byte/scope reconciliation](ci-dag-05-checkout-setup-stage2-coordinator-reconciliation.json)
passed at **2026-11-19T14:29:16.540Z**, matching **2,582 originals / 2,568 unchanged**,
exactly **10 maintained changes + three new maintained files**, and separately
accounted coordinator deltas. [Saved-evidence reconciliation](ci-dag-05-checkout-setup-stage2-coordinator-evidence.json)
passed at **2026-11-19T14:33:42.048567+00:00** for **169 setup files / 57 JSON files /
162 archive entries / 156 original sources / 64 raw outputs**, **35 serial
observations** and all **11 initial nonzero results**. The exact final fingerprints,
thirteen-path diff, sole R1-test line, two result-test wiring amendments and
reversible archival transformation reconcile. Saved final **611 CI / 18 group
checks** and focused quality passes match all thirteen maintained fingerprints;
the coordinator did not repeat tests or source operations.

[Curated coordinator support](ci-dag-05-checkout-setup-coordinator-support/README.md)
preserves successful checks separately from unchanged delivery reports/support and
historical seals. The [fresh independent corrective review](ci-dag-05-corrective-review-handoff.md)
was ready after the document check and input snapshot, not yet
assigned at that **historical prelaunch readiness** record. Positive full native short-root success,
Node-20 execution, actual runner main/post, R1 acceptance, R2 original cause/
abort/timing-neutrality/incomplete packed-consumer disposition and all R3/maintainer
rollout prerequisites remain outstanding. Further package execution, including
focused lanes, separate source probes, runtime installation and hosted work are
not authorized. CI-DAG-05 remains **in progress, blocked before independent
corrective and final rollout acceptance**.

## Current corrective review and coordinator reconciliation

The fresh non-implementer reviewer launched at **2026-11-19T14:56:47.674093+00:00**
after the sequential R1/R2/setup idle/reconciled deliveries, delivered the
[new report](ci-dag-05-corrective-review.md) and stopped idle. Verdict:
**CHANGES REQUIRED / BLOCKED**, with only scoped R1 allocation/rejection, narrow
R2 diagnostics and local setup contracts accepted. Requirement-9 runtime behavior,
R2 disposition, Q1 and R3 remain outstanding.

[Byte/scope reconciliation](ci-dag-05-corrective-review-coordinator-support/coordinator-byte-scope.json)
matched **2,771 originals / 24 maintained fingerprints / 33 historical inputs**,
nine reviewer additions and unchanged bytes/modes/HEAD/refs. Its **2,782-file**
capture precedes these seven coordinator-document edits.
[Independent saved-evidence reconciliation](ci-dag-05-corrective-review-coordinator-support/coordinator-saved-evidence.json)
matched all six serial one-shot receipts/twelve retained streams, **611 CI / 18
group passes**, 17-path ESLint exit 0, 24-path Prettier exit 1 and workflow-only
actionlint exit 0 with shellcheck/pyflakes disabled. The **582-source** inventory,
both reviewer audit attempts, retained failures, curation and actual final delivery
receipts reconcile without executing historical drivers or repeating checks.

Raw reviewer execution streams were not persisted; their equality to retained
bytes/hashes is recorder metadata, not an independently readable raw witness.
Static **476/482**, reviewer audits **3,257/3,507**, delivery **449/591/5,922**, and
inventory **52/53/55/56** counters remain distinct from maintained-test totals.
The **1,630-byte intermediate** formatter summary is not the **13,411-byte final**
summary; saved final-byte verification matches the latter.
[Coordinator support](ci-dag-05-corrective-review-coordinator-support/README.md)
preserves successful results, inspected drivers and initial audit failures/
preimages unchanged. Historical readiness and CI-DAG-04 fingerprints are labeled
historical, not presented as current corrective certification.

Only saved-evidence reconciliation and coordinator documentation are currently
authorized. The reviewer's CI/group allowances and R2's package allowance are
spent; renew authorization before correction/delegation, package/focused execution,
source/native/runner probes, runtime/tool installation or hosted execution. No
coordinator acceptance, commit, push, dispatch, publication or settings change is
recorded.

Maintained regression checks live in `scripts/ci-test-plan.test.mjs`, `scripts/ci-test-artifacts.test.mjs`, `scripts/ci-test-workspace.test.mjs`, `scripts/ci-test-results.test.mjs`, `scripts/ci-test-checkout.test.mjs`, and local group-safety tests. Durable evidence includes the checked-in workflow/helpers/tests, README/AGENTS, this handoff, the [local-evidence ledger](ci-dag-05-local-evidence.md), both unchanged independent reports and coordinator support. Original scratch copies/raw logs/probe tooling remain unchanged and partly omitted; this is not a self-contained rerun bundle. Hosted V6 additionally needs authorized access, controlled-fault review, runner/browser/database prerequisites, required-check confirmation and budget approval. Current independent acceptance is scoped, and Q1/runtime/R2/R3 still block CI-DAG-05/final rollout acceptance.
