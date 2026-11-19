# CI-DAG-04 handoff

Created: 2026-11-18 16:37 PST. Related: [CI-DAG-04](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-04-wire-success-gated-jobs-and-a-fail-closed-final-result).

**Delivered locally and ready for coordinator acceptance of CI-DAG-04; not accepted by this handoff.** The active test workflow now contains the reviewed dependency graph, and the stable `unit-test` aggregate runs a fail-closed evaluator over `${{ toJSON(needs) }}`. Regression tests and `pnpm test:ci:check` enforce agreement with the checked-in workflow, including rejection of the legacy and mutated workflows. The coordinator owns task statuses; this document does not start CI-DAG-05, commit/push/dispatch anything, or certify live GitHub Actions scheduling, artifact service behavior, branch protection, or performance.

## Delivered scope

### Active workflow

[`test.yml`](../../../../.github/workflows/test.yml) now has **31 jobs**:

- **3 preserved independent jobs**, byte-for-byte unchanged from `HEAD`: `lint`, `access-router-minimum-node-smoke`, and `access-router-react-minimum-node`. They have no `needs`, are outside the aggregate, and keep the existing floating React lane non-blocking.
- **28 generated main jobs**: `ci-validate`, `ci-prepare`, 25 static `test-<package>` jobs, and the stable `unit-test` aggregate. No package job uses a matrix or job-level `continue-on-error`.
- Triggers remain exactly `pull_request` and `push` with the Markdown-only `paths-ignore`.

`ci-validate` runs `pnpm test:groups:check` and the expanded `pnpm test:ci:check`. `ci-prepare` requires validation, exposes only the frozen CI-DAG-03 `artifact-name`/`artifact-digest` outputs, and runs the preparation composite. Each package job requires `ci-prepare` plus exactly its approved upstream test successes and invokes the frozen `ci-test` composite with the exact discovered workspace name.

The stable `unit-test` job keeps its ID and display name, uses `if: ${{ always() }}`, requires validation, preparation, and all 25 package tests, and runs:

```yaml
- run: node scripts/ci-test-results.mjs
  env:
    CI_TEST_NEEDS: ${{ toJSON(needs) }}
```

No main-path step or job uses `continue-on-error`. The existing experience is preserved: package test scripts, rebuilds, worker controls, artifact checks, and resource setup are unchanged.

### Result evaluator

[`ci-test-results.mjs`](../../../../scripts/ci-test-results.mjs) derives its required set from `mainWorkflowJobs(model)['unit-test'].needs`; it does **not** contain a second 25-job list. It requires exactly `ci-validate`, `ci-prepare`, and every modeled package job (27 results) and succeeds only when every result is `success`.

It fails closed for:

- `failure`, `cancelled`, `skipped`, and `missing` results;
- unexpected extra jobs, empty payloads, missing/blank environment, invalid JSON, non-object payloads, malformed result records, missing/non-string results, and unknown result values;
- a `success` job whose prerequisite is not successful;
- a `skipped` job whose prerequisites all succeeded (an unexpected skip);
- arguments or hidden bypass flags (the CLI accepts no arguments).

Each non-success job is reported with its workspace when applicable and its exact expected skipped descendants derived from `testPrerequisites`. The evaluator rejects malformed records before producing a pass. The expected descendants for `ci-prepare` are all 25 package jobs; for `ci-validate` they are preparation plus all 25 package jobs.

### Mandatory workflow agreement

Root `test:ci:check` now runs the four maintained Node test files, then the model check, then the mandatory active-workflow check:

```text
node --test --test-concurrency=1 scripts/ci-test-plan.test.mjs scripts/ci-test-artifacts.test.mjs scripts/ci-test-workspace.test.mjs scripts/ci-test-results.test.mjs && node scripts/ci-test-plan.mjs --check && node scripts/ci-test-plan.mjs --check-workflow .github/workflows/test.yml
```

The workflow check is the final mandatory step and cannot be replaced by a staged check, an allow-legacy flag, or an optional path. The plan CLI rejects unknown flags such as `--allow-legacy`, and the result CLI rejects all arguments.

### Regression coverage

[`ci-test-results.test.mjs`](../../../../scripts/ci-test-results.test.mjs) adds 36 result-evaluation tests. In addition to the all-success case, it covers:

- `access-router` failure, including exactly `test-access-router-client`, `test-access-router-deco`, `test-access-router-react`, `test-access-router-runtime`, `test-create-access-router-mongo-starter`, and `test-react-vite` as expected skips; unrelated `message-service`, OIDC, attestation, and PDF branches remain eligible.
- Mid-graph `express-json-router` and `utils` failures with complete transitive descendant sets.
- Multi-parent enforcement for `access-router-runtime` (both upstream parents) and `oidc-vault-dpop-example` (both memory-store and DPoP-client upstreams), including false-success rejection.
- `ci-validate` and `ci-prepare` failures, including preparation blocking all package tests and all 25 expected skips.
- Cancelled, missing, extra, malformed, empty, and unexpected-skip states; every required job is exercised for failure/cancelled/skipped, and the CLI exits nonzero for every non-success category.
- Checked-in workflow agreement: 31 jobs, 28 generated jobs equal to the generator output, exact `unit-test` wiring and condition, preserved independent lanes, and no matrix/continue-on-error escape in the main path.
- Model drift in both directions (removed package test) and result-CLI bypass arguments.

[`ci-test-plan.test.mjs`](../../../../scripts/ci-test-plan.test.mjs) now also asserts the exact mandatory command and exercises the real CLI against the checked-in workflow and a legacy workflow. The existing workflow-contract mutations already cover condition, matrix/fail-fast, `continue-on-error`, dependency, helper-interface, and final-gate bypasses.

## Provenance and saved fingerprints

Tested source is the uncommitted working tree at `HEAD` `0fda5197c5b950e865af73681225c8bbf5533775`. Prior uncommitted CI-DAG-02/03 implementation remains in the worktree; CI-DAG-04 did not change package test scripts, the three composites, shared setup actions, the local group runner, branch protection, publication, or workflow dispatch. `pnpm-lock.yaml` remains the prior CI-DAG-02/03 lock change; this task did not edit it.

Local toolchain: Node `26.12.1`, pnpm `11.18.0`, npm `11.20.0`, pre-commit `4.6.2`, Linux x64. All scratch and `TMPDIR` locations were fresh ignored `_tmp-ci-dag-04-*` directories under `<repo-root>`.

SHA-256 fingerprints of the main delivered files after the final implementation edits:

- `.github/workflows/test.yml`: `c9408a1b25912416d25f95cefa609410bbf0c9852551803a9bf710ab69017aaf`
- `scripts/ci-test-results.mjs`: `fe0c33a9379e2a44ef2d458b66d254773b4c7519cccb9c1660512e593410b9da`
- `scripts/ci-test-results.test.mjs`: `225a786ce4421d498f2feab1cc0d612c8452251282d8f86f8b6eaa2ddf9b24c6`
- `scripts/ci-test-plan.test.mjs`: `cf938b1f3b6adc0812f70fd23a4cc710ef3177df2c3c2813a0eb94ec557296fb`
- `package.json`: `f3793110d566df545710024d37c207fc4b592aa57c5a5667fdcb7b5df6733d80`

## Verification results

All commands ran from `<repo-root>`. Scratch roots were confirmed ignored with `git check-ignore`.

| Check                               | Command                                                                                                                                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI contracts and mandatory workflow | `pnpm test:ci:check`                                                                                                                                                        | **310 passed; 0 failed/skipped/cancelled**. Model: 25 tested workspaces, 26 declared + 1 fixture gates, 6 build-only workspaces. Workflow: `Validated workflow and CI helper contracts: .github/workflows/test.yml (25 tested workspaces).`                                                                                                                                                            |
| Legacy grouping                     | `pnpm test:groups:check`                                                                                                                                                    | **18 passed; 0 failed/skipped/cancelled**; 12 safe groups covering 25 workspaces.                                                                                                                                                                                                                                                                                                                      |
| Real workflow CLI                   | `node scripts/ci-test-plan.mjs --check-workflow .github/workflows/test.yml`                                                                                                 | Exit 0 with the same validated-workflow message.                                                                                                                                                                                                                                                                                                                                                       |
| Generated vs active                 | Node probe using `parseStrictYaml`, `mainWorkflowJobs`, and a `HEAD` workflow copy                                                                                          | 31 total jobs: 28 generated jobs deep-equal to the active file, 3 preserved jobs deep-equal to `HEAD`, triggers deep-equal, `unit-test` changed only as intended.                                                                                                                                                                                                                                      |
| Wrong/legacy rejection              | Real `--check-workflow` CLI against scratch variants                                                                                                                        | Exit 1 for condition (`success()`), cancelled-only condition (`!cancelled()`), matrix/fail-fast barrier, missing aggregate dependency, and legacy `pnpm test:grouped` workflow. Representative messages: `jobs.unit-test.if: expected "${{ always() }}"`, `jobs.test-utils keys: ... extra [strategy]`, `jobs.unit-test.needs: missing [test-utils]`, and `Main workflow job coverage: missing [...]`. |
| Targeted ESLint                     | `pnpm exec eslint` on the eight `scripts/ci-test-*.mjs` files                                                                                                               | Passed.                                                                                                                                                                                                                                                                                                                                                                                                |
| Targeted Prettier                   | `pnpm exec prettier --check --config-path .prettierrc` on the eight scripts and `package.json`                                                                              | Passed.                                                                                                                                                                                                                                                                                                                                                                                                |
| Whitespace                          | `git diff --check`                                                                                                                                                          | Passed.                                                                                                                                                                                                                                                                                                                                                                                                |
| YAML syntax                         | `pre-commit run check-yaml --files .github/workflows/test.yml .github/actions/ci-setup/action.yml .github/actions/ci-prepare/action.yml .github/actions/ci-test/action.yml` | Passed.                                                                                                                                                                                                                                                                                                                                                                                                |
| Actionlint                          | Pinned `v1.7.7` workflow check, checksum verified before execution                                                                                                          | Passed on `.github/workflows/test.yml`.                                                                                                                                                                                                                                                                                                                                                                |

Actionlint reproduction used the CI-DAG-03 pin:

```text
https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_linux_amd64.tar.gz
SHA-256 023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757
```

The archive was downloaded, SHA-256 checked, extracted, and run as `actionlint -shellcheck= -pyflakes= .github/workflows/test.yml`. Composite action definitions are not workflows and are not claimed as direct actionlint inputs; their YAML and frozen interfaces are covered by `check-yaml` and the strict helper contracts.

### Acceptance criteria mapping

- **Access-router failure skips deco/client/runtime/React/`react-vite`/starter; eligible message-service, OIDC, and independent tests continue.** Covered by the result fixture with exact descendant equality and eligibility assertions. The independent lanes remain outside the aggregate and are not blocked.
- **Vault failure skips its stores/client/example without cancelling core/independent branches; the example requires both memory-store and DPoP-client.** Covered by the vault descendant test, per-parent false-success tests, and the checked graph.
- **Preparation failure prevents package tests and yields a non-successful required aggregate.** `ci-prepare` is a prerequisite of every package job; the fixture reports preparation failure plus all 25 expected skips, and the aggregate rejects it.
- **Skipped children cannot mask failed ancestors or missing/cancelled required jobs.** Covered by explicit failed/cancelled/missing-parent fixtures, false-success rejection, unexpected-skip rejection, and per-job non-success loops.
- **Workflow syntax/model checks pass; graph exposes package-identifiable branches.** The checked-in workflow passes the model, helper, `check-yaml`, and actionlint checks; each package job is named and parameterized by its exact workspace. Live UI/scheduling certification remains V6/CI-DAG-05.

## Remaining limitations and rollout blockers

- **No live Actions execution is claimed.** The workflow was not committed, pushed, or dispatched. GitHub scheduling, skip/failure propagation, aggregate behavior under real cancellation, artifact upload/download, cache/resource behavior, required-check UI, and timing/quota behavior remain for CI-DAG-05/V6. This is a rollout blocker, not a local CI-DAG-04 acceptance claim.
- **Branch protection is untouched.** The stable `unit-test` ID/name is retained, but the coordinator/maintainer must confirm the existing required-check context and authorize any branch-protection migration.
- **Full V5 integration was not run here.** `pnpm lint`, a full `pnpm build`, and `pnpm test:grouped` across all packages were not executed for this task; CI-DAG-04 verification is V2-V4 plus targeted lint/formatting. CI-DAG-05 owns full coverage/measurement.
- **The workflow file is not Prettier-formatted.** All existing workflow files, including `HEAD`, fail the repository Prettier configuration; reformatting would disturb the preserved independent jobs and is outside this task. YAML syntax is checked with `check-yaml` and the pinned actionlint instead.
- **No commit, push, dispatch, publication, or repository-settings change was made.** No live runner or artifact-service result is inferred from the local fixtures.

## Preservation and hygiene

The maintained tests are the durable regression evidence in their normal locations. Disposable scratch contained only copies, generated workflow variants, and pinned tool downloads; no raw logs, credentials, private session identifiers, dependency trees, browser/database binaries, or machine-specific absolute paths are preserved here. Historical CI-DAG-01/02/03 evidence and the coordinator-owned task file were not modified.

Post-write V1 document checks passed: Prettier on the task file, bundle index, and this handoff; **12** local relative links resolved; final-newline, CRLF, trailing-whitespace, and machine-path scans passed; and `git diff --check` passed.
