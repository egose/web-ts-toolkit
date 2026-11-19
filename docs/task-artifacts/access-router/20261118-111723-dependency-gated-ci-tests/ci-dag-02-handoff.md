# CI-DAG-02 handoff

2026-11-18 — [CI-DAG-02 task](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-02-add-a-checked-ci-dependency-model-and-regression-tests).

**Ready for coordinator acceptance of CI-DAG-02 only.** The saved model, generator, and strict workflow/helper contract fixtures pass the required checks. The active legacy workflow is not wired into this check yet; this is not CI-DAG-03/04 completion or live-rollout acceptance. The coordinator owns task statuses.

## Delivered paths and coverage

- [`scripts/ci-test-plan.mjs`](../../../../scripts/ci-test-plan.mjs): pnpm workspace discovery, reviewed direct dependencies and separate success overrides, deterministic model/jobs generation, strict YAML workflow/helper validation, and CLI.
- [`scripts/ci-test-plan.test.mjs`](../../../../scripts/ci-test-plan.test.mjs): 139 regression tests, including independent handwritten helper fixtures and workflow mutations. This continuation applied only the computed Prettier formatting; the result byte-matches that output.
- [`package.json`](../../../../package.json) and [`pnpm-lock.yaml`](../../../../pnpm-lock.yaml): new `test:ci:check` entry point and exact root `yaml@2.9.0` development dependency/importer. No other root metadata or lockfile records changed.
- This handoff and its [bundle index](README.md) link. Saved model/package/lock bytes, the coordinator's task file, and prior design evidence were preserved. Package scripts, local group runner/tests, and `.github` files remain unchanged.

Verified model: **25 tested workspaces, 31 build workspaces, 6 build-only workspaces, 26 direct declared success gates, and one explicit runtime → starter success override**. Four dependency fields retain provenance; aliases/relative workspace references, manifest drift, missing/duplicate coverage, cycles, and build-only prerequisites are covered. Reverse router/runtime/starter and OIDC fixture build/read accesses are not success gates; build-only nodes never become test results. Router failure skips only client, deco, runtime, React, react-vite, and starter descendants; message-service and OIDC branches continue. Multi-parent and missing/cancelled/skipped-result cases are covered.

## Concrete CI-DAG-03/04 interface

- `createCiTestModel(loadWorkspaces(root))` returns `nodes`, `declaredEdges`, `overrideEdges`, `workspaceDependencies`, `executionOrder`, `buildWorkspaces`, and `buildOnlyWorkspaces`. `resolveTestWorkspace(model, workspace)` accepts only an exact tested workspace and supplies `directory`, `jobId`, `testScript`, `command: ['pnpm', '--filter', workspace, 'test']`, `testPrerequisites`, and `needs`. CI-DAG-03 must spawn argv for that complete test script, not interpolate input into a shell or run dependency-closure/subset tests.
- `mainWorkflowJobs(model)` defines **28 main jobs**: `ci-validate`; `ci-prepare` needing validation and exposing `artifact-name`/`artifact-digest`; 25 static `test-*` jobs with exact preparation/direct-success needs; and stable `unit-test` with `always()`, all 27 result prerequisites, `node scripts/ci-test-results.mjs`, and `CI_TEST_NEEDS: '${{ toJSON(needs) }}'`. The result evaluator is still a downstream implementation, not delivered here.
- `ciActions` contains proposed pinned action references and CI-only local action paths. `helperStepContracts` checks `.github/actions/ci-setup/action.yml`, `.github/actions/ci-prepare/action.yml`, and `.github/actions/ci-test/action.yml`. Current setup selects Node/pnpm from repository metadata and installs with `pnpm install --frozen-lockfile --ignore-scripts`.
- Preparation calls `node scripts/ci-test-artifacts.mjs prepare`; step `prepare` must emit `artifact-name`, `artifact-path`, and `artifact-digest`, upload the named path with missing files treated as an error, and expose name/digest through composite and job outputs.
- The test composite requires `workspace`, `artifact-name`, and `artifact-digest`, downloads to `${{ runner.temp }}/ci-test-artifacts`, and calls `node scripts/ci-test-workspace.mjs` with `CI_TEST_WORKSPACE`, `CI_TEST_ARTIFACT_NAME`, `CI_TEST_ARTIFACT_DIGEST`, and `CI_TEST_ARTIFACT_DIR` (the download-path output). Resource selection and verified artifact restoration belong to CI-DAG-03's runner/tests.
- **CI-DAG-03 may refine `helperStepContracts` and the independent positive/negative fixtures together** for frozen dependency/browser/Mongo binary caches, resource selection, and artifact verification. Current minimal `cache: false` fixtures are not a product prohibition. Preserve strict drift rejection, exact coverage/gates, failure propagation, and the separation from local setup/group scripts.
- `generateWorkflowJobs(model)` / `node scripts/ci-test-plan.mjs --generate` emit main jobs only; CI-DAG-04 must preserve the independent lint/minimum-Node lanes. `validateWorkflowContract(source, model, helperSources)` validates YAML plus helpers keyed by `ciActions` local paths. `checkWorkflowFile(path, model, root)` reads the real workflow and all three helper files.
- **Before rollout, CI-DAG-04 must make `node scripts/ci-test-plan.mjs --check-workflow .github/workflows/test.yml` mandatory in root `test:ci:check`**, after implementing the helpers and integrating the generated DAG. Present `--check` validates the workspace model; real-workflow validation cannot be optional or replaced by fixtures. There is no legacy/drift bypass; the legacy grouped workflow and extra bypass CLI flags are explicitly rejected by tests.

## Executed verification

All commands ran from the repository root on 2026-11-18 with `TMPDIR='<repo-root>/_tmp-ci-dag-02-finish-5YpmWf'`, a fresh directory confirmed ignored by `git check-ignore -v _tmp-ci-dag-02-finish-5YpmWf/`. Replace `<repo-root>` with the actual checkout path; use a fresh ignored directory for reruns. Log redirection used only disposable scratch.

- `pnpm test:ci:check` — PASS: 139 tests; 0 failures, cancelled, skipped, or todo; actual model check reports 25 tested, 26 declared + 1 fixture gates, 6 build-only.
- `pnpm test:groups:check` — PASS: 18 tests; 0 failures, cancelled, skipped, or todo; 12 safe groups cover 25 workspaces.
- `pnpm exec eslint scripts/ci-test-plan.mjs scripts/ci-test-plan.test.mjs` — PASS: both changed JS files; exit 0, no diagnostics.
- `cmp -s scripts/ci-test-plan.test.mjs _tmp-ci-dag-02-finish-5YpmWf/ci-test-plan.test.formatted.mjs` — PASS: formatting-only patch exactly matches computed Prettier output. Historical disposable-copy check, not an archive prerequisite.
- `git diff --check` — PASS: no whitespace errors; new scope files also checked separately.

Formatting command, PASS for all five scoped JS/JSON/Markdown files:

The first check including this new handoff failed only on its table layout; that formatting issue was corrected with patch before the final passing check.

```sh
pnpm exec prettier --check --config-path .prettierrc \
  scripts/ci-test-plan.mjs scripts/ci-test-plan.test.mjs package.json \
  docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/README.md \
  docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-02-handoff.md
```

Additional read-only inline Node assertions passed: all **22** root dependency specifiers match the lock importer; installed YAML and its lock package/snapshot are `2.9.0`; removing only the new script/importer/dependency reproduces HEAD's parsed root manifest/lock; five saved-file SHA-256 preservation guards match. Scope, **10** local Markdown targets and the inspected task02 anchor, privacy-sensitive content in six scoped files, destination ignore status, and scratch/evidence contents were reviewed. No additional implementation files or shared task edits were introduced.

## Unrun checks and remaining limits

No package builds/suites, full-repository lint/tests, artifact round trip, resource/cache runtime checks, active-workflow/actionlint integration, live Actions runs, or rollout/performance/resource measurements were run in this bounded continuation. CI-DAG-03 owns runnable isolation/artifact/resource helpers; CI-DAG-04 owns the real DAG/result evaluator and mandatory workflow agreement. Their runtime/integration acceptance and live Actions rollout remain unverified. No commits, pushes, dispatches, settings changes, or subagents were made.

This is summary-only evidence from the saved shared-checkout implementation and this finishing verification, not a new certification of CI-DAG-01's historical observations. Temporary formatted copies, verification logs, hash guards, and disposable fixtures were reviewed and omitted; dependencies, caches, binaries, builds, and raw remote data are not included. Durable continuation instructions are above and regression tests remain in normal code locations; reruns require the repository and installed Node/pnpm dependencies, not the historical scratch directory.
