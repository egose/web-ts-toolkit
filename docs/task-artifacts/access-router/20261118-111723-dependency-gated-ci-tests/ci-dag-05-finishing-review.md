# CI-DAG-05 independent finishing review

**Verdict: CHANGES REQUIRED/BLOCKED.** The saved local execution accounting and accepted implementation fingerprints agree with the finishing documents. However, the delivered resource helper allocates a `TMPDIR` that is not Unix-socket-safe at the reviewed checkout depth (R1). The successful short-path grouped run did not exercise that allocation. The attestation assertion remains unexplained (R2), and V6 plus maintainer risk/budget/required-check decisions remain outstanding (R3). This is a finishing-review verdict only, not CI-DAG-05 completion or rollout authorization.

Review date: **2026-11-18**. Source: the uncommitted proposal at `HEAD` `0fda5197c5b950e865af73681225c8bbf5533775`. Related [authoritative task](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-05-verify-rollout-measure-tradeoffs-and-update-testing-guidance), [finishing handoff](ci-dag-05-handoff.md), and [local execution ledger](ci-dag-05-local-evidence.md).

## Independence, scope, and authority

- Reviewer alias: **CI-DAG-05 finishing reviewer**, distinct from the implementers of CI-DAG-02/03/04, the interrupted reviewer, and the coordinator who made the finishing edits. This reviewer did not implement those changes and did not delegate this review.
- Reviewed the six finishing documents, preceding accepted handoffs/design, actual workflow/composites, pnpm-discovered manifests, production helpers and maintained regressions, local group runner, and original saved runners/logs/JSON/source copies. Conclusions below distinguish fresh bounded checks, independent read-only reconciliation, and historical execution.
- Review targets remained read-only. The only deliverable created is this report. No task status, source, workflow, package manifest, lockfile, group runner, prior evidence, or guidance was edited.
- No commit, push, dispatch, hosted job, publication, settings change, install, resource preparation, package test, full lint/build/test, or grouped-suite run was performed. Reading/decompressing the saved archive did not extract files, restore outputs, or execute resources. Socket analysis opened no socket.
- Bounded validators ran sequentially from the repository root using existing dependencies and an already-cached pinned check-yaml environment. Reviewer scratch was the ignored repo-local `_tmp-r5-zlqZHs/`; `TMPDIR` was set to its absolute runtime path. Historical scratch references below identify inspected evidence, not reproduction prerequisites.
- The coordinator alone owns status reconciliation. CI-DAG-05 remains `in_progress`; this report does not satisfy V6 or approve accepting an unresolved risk.

## Reviewed fingerprints

SHA-256 identifies the exact bytes reviewed, not a signature or proof of runtime behavior. The initial protected-target snapshot was recorded at `2026-11-18T19:14:07.444598-08:00`. A pre-report recheck at `2026-11-18T19:26:39-08:00` found zero drift across **2,535 protected regular files**, unchanged `HEAD`, and unchanged Git status.

### Six finishing documents

| File                                                                                                      | SHA-256                                                            |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `README.md`                                                                                               | `7972ba490cf26ab60bdb4c4f10da5cfcd965843ee692566afaf9e861f9cbe506` |
| `AGENTS.md`                                                                                               | `daf29134e04cc7601aeec39af63748cbdbbc17cf03b67015e98bbea03ae368d7` |
| `docs/tasks/20261118-111723-dependency-gated-ci-tests.md`                                                 | `5e0bd8de678a33830b2801653439c41e384acf72801b3cddcfe246a2f15f4798` |
| `docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/README.md`                   | `7c45c0118f7ccdf0a4e41555959ebb1fc04de49bd031a58eff38f364d7c0c4a2` |
| `docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-05-handoff.md`        | `8ec4e3c7387cf63457accd1919d12bc964b12f7132763f1b24ff3f266b606953` |
| `docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-05-local-evidence.md` | `6788fd3eb199fd36e23fd06f7e95cb0060d67e2634aa9ef45a0b039d6873b7c8` |

### Implementation and preserved controls

Independently matched all **13 accepted implementation fingerprints**: eight from the [CI-DAG-03 handoff](ci-dag-03-handoff.md), and five from the [CI-DAG-04 handoff](ci-dag-04-handoff.md). The proposed root lock also matches its accepted hash. Local group scripts and shared legacy setup actions match `HEAD`; they are included separately rather than counted among the 13.

| File                                     | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `.github/workflows/test.yml`             | `c9408a1b25912416d25f95cefa609410bbf0c9852551803a9bf710ab69017aaf` |
| `package.json`                           | `f3793110d566df545710024d37c207fc4b592aa57c5a5667fdcb7b5df6733d80` |
| `pnpm-lock.yaml`                         | `10165ddd054bfa1db935d20bd2428af94638b57430f71a3d386eadc2ca28546d` |
| `scripts/ci-test-plan.mjs`               | `dc65f5f261288c0d9e69e78428a52e47ee43130316ee8959f57edbf4c0e9496c` |
| `scripts/ci-test-plan.test.mjs`          | `cf938b1f3b6adc0812f70fd23a4cc710ef3177df2c3c2813a0eb94ec557296fb` |
| `scripts/ci-test-artifacts.mjs`          | `606e40dac5ae77462ab03100aea1b2b32cfd3ae39f450f7c074f08eb91c490cc` |
| `scripts/ci-test-artifacts.test.mjs`     | `97e1840df656940bc54e445e367247c34a0fb6e63126265c88ce635b014679e7` |
| `scripts/ci-test-workspace.mjs`          | `d91514e2b57651e4c620fe895935fb00eb14bc00af2d967ff7acb87ec5291fc8` |
| `scripts/ci-test-workspace.test.mjs`     | `6f27022d853464b94050ee3bc7f2378a1fc2423b80b8fe1565d68ec5b0fa1ebd` |
| `scripts/ci-test-results.mjs`            | `fe0c33a9379e2a44ef2d458b66d254773b4c7519cccb9c1660512e593410b9da` |
| `scripts/ci-test-results.test.mjs`       | `225a786ce4421d498f2feab1cc0d612c8452251282d8f86f8b6eaa2ddf9b24c6` |
| `scripts/test-groups.mjs`                | `58c436b21ddfde85f471da562dfbed9ce9ba941f04869764c18089294b74caa9` |
| `scripts/test-groups.test.mjs`           | `ee28295634c4ebb2824982d2c469f4e05f72ec9adbfb4254df314df25b925966` |
| `.github/actions/ci-setup/action.yml`    | `0bcffecbe5d059050e25840aa1d8cccfedfe697c5e286554ff4b1747db86ff92` |
| `.github/actions/ci-prepare/action.yml`  | `71f2bca5f051a7419be9ef9b3c823e8a6ae04e680eef56b600718ad9eea266dd` |
| `.github/actions/ci-test/action.yml`     | `4e2f0efafcfc11d750e62481b4e83766659e557139d8f449dc5128ae5deab9ff` |
| `.github/actions/setup-tools/action.yml` | `495f481aec2ec26351d58a347c05eecb3cef6a3d3c4aff3041f735e2ea7716f5` |
| `.github/actions/setup-npm/action.yml`   | `cf85c1a7defd141e773aa26fa2f204a8dbf5267b0d0f135678f0640f2c3d70f7` |

## Acceptance matrix

“Met locally” means the specified static/local contract or saved execution was checked. It does not certify hosted behavior.

| Criterion or inherited integration contract                                        | Assessment                                    | Independent evidence / remaining boundary                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V1-V6 pass, or CI-DAG-05 remains incomplete with explicit prerequisites            | **BLOCKED**                                   | Bounded V1-V4 passed; saved V5 reconciles with retained failures. R1/R2/R3 remain. No V6 run and no task completion.                                                                                                                                                                                                           |
| Exact workspace coverage, full scripts, rebuilds and worker/group safety preserved | **MET LOCALLY**                               | 31 discovered/built workspaces, 25 tested and 6 build-only; 26 declared plus 1 fixture success gate. All tested manifests, group scripts/configuration and controls match baseline. All 25 complete third-run commands/completions matched.                                                                                    |
| Live healthy coverage, dependent skips and unrelated continuation                  | **NOT MET**                                   | Local workflow/evaluator agreement is established, but no new-DAG healthy or controlled hosted run exists. Legacy grouped V5 is not the new graph.                                                                                                                                                                             |
| Output-only, same-run/attempt/checkout artifact, external digest, strict restore   | **MET LOCALLY; SERVICE BLOCKED**              | Inspected implementation/regressions and independently decoded the saved CI-DAG-03 archive. Current required roots/files match. Hosted upload/download and current-revision identity remain V6 work.                                                                                                                           |
| Job-specific browser/database/cache preparation and safe execution                 | **PARTIAL; CHANGES REQUIRED**                 | Resource selection, versioned download-only caches and fail-closed preflights are wired correctly. The helper's socket-path budget is unguarded (R1). V5 used a different path.                                                                                                                                                |
| Fail-closed required results and useful dependency diagnostics                     | **MET LOCALLY**                               | Aggregate has exactly 27 direct needs and `always()`; production evaluator rejects every non-success, missing/extra/malformed results and false success after a failed prerequisite. Fresh maintained checks and independent probe reconciliation passed.                                                                      |
| Independent lanes, triggers and readiness-based scheduling preserved               | **MET LOCALLY**                               | Parsed and byte-block comparison with `HEAD` preserves triggers and all three independent lanes. Static main jobs have no matrix/global fail-fast/concurrency cap or `continue-on-error`. Actual scheduler/queue/cancellation behavior is unperformed.                                                                         |
| Guidance matches delivered scheduling and distinguishes validation from suites     | **MET LOCALLY, SUBJECT TO R1 RECONCILIATION** | README/AGENTS correctly separate serial/grouped local work from isolated CI, global validation/preparation failure from package failure, all-skipped aggregate rejection, and matrix-only `max-parallel` semantics. Add the newly identified helper-path limitation and this verdict through coordinator-owned reconciliation. |
| Stable maintainer-visible required check                                           | **PARTIAL**                                   | Job ID/display name remain `unit-test`; required needs are validation, preparation and 25 tests. Repository required-check settings/UI were not inspected or changed.                                                                                                                                                          |
| Measured outcome/tradeoff and approved budget                                      | **PARTIAL; HOSTED BLOCKED**                   | Local phase times and the CI-DAG-01 baseline are distinguished correctly. No comparable hosted critical path, queue/resource/cache measurements, billing/quota data or approved thresholds exist.                                                                                                                              |
| Coherent rollout/rollback instructions                                             | **MET AS GUIDANCE; NOT EXECUTED**             | Restore the previous serial build/grouped job together with compatible pre-migration command/checker wiring and guidance. YAML-only rollback is rejected by mandatory active-DAG checks. No permanent legacy bypass or unsafe concurrent local groups is proposed.                                                             |
| Independent finishing review and curated/privacy-safe evidence                     | **REVIEW DELIVERED; ACCEPTANCE WITHHELD**     | This report independently reconciles the finishing edits and raw evidence, but returns changes required. Original logs/copies remain untouched and omitted. Summary-only reproduction limits are explicit.                                                                                                                     |

## Independent evidence reconciliation

### Saved V5 executions and coverage

Read all three original runners, phase summaries, lint/build logs, and grouped logs. Each runner invokes `pnpm lint`, `pnpm build`, then `pnpm test:grouped`, stopping on nonzero exit. In every attempt, root lint agrees with the manifest, and all **31 exact top-level manifest build commands and completions** are present; nested build prefixes were not miscounted as extra workspaces.

| Attempt           | Lint exit / seconds | Build exit / seconds | Grouped exit / seconds | Retained result                                                                                            |
| ----------------- | ------------------- | -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| First             | 0 / 45              | 0 / 193              | 1 / 207                | Group 3 attestation packed-Chromium assertion failure.                                                     |
| Second            | 0 / 37              | 0 / 179              | 1 / 251                | Group 4 mongoose-rxdb socket-path failure.                                                                 |
| Third, short path | 0 / 32              | 0 / 160              | 0 / 3,606              | All 12 ordered groups and 25 full scripts completed; summary ends `ALL_OK` at `2026-11-18T18:13:32-08:00`. |

For **each** saved source copy, compared 1,987 files with the reviewed tree: 1,976 tracked regular files outside `docs/`, excluding root README/AGENTS, plus the 11 new helpers/composites. All three comparisons have **zero byte differences**. Package-local documentation is included. Copied dependencies, generated outputs, final root documentation and full environment/cache equality are not established by this comparison.

Independently parsed the complete third grouped log, ordered group headers, exact manifest scripts, completion markers, and all **34 paired Vitest summaries**. Every one of the ledger's **25 workspace rows** matches: **689 passed file executions, 21,224 passed test executions, one TODO, zero reported failed/skipped summary counts**, and no Vitest unhandled-error summary. Pnpm's abbreviated starter prefix is included. These count logged executions, not unique coverage or every captured child subprocess test; root checker tests and compile-only phases are excluded.

Checked coverage semantics against source/configuration, not totals alone:

- **Attestation:** five Vitest invocations total 24 files / 864 tests in the successful third script, including packed Chromium. Earlier failure remains below.
- **DPoP:** 5 unit files / 55 tests and 9 browser files / 75 tests, **130 total**, matching default Chromium selection in `apps/oidc-vault-dpop-example/test/browser/harness.ts`. V5 does not certify Firefox/WebKit. The separate CI-DAG-03 three-engine 280-test result is not a second V5 result.
- **PDF:** 4 node files / 205 tests and 2 Chromium files / 32 tests, **237 total**.
- **React:** the unchanged full script includes typecheck, default/React 19 runtime, React 18, and nonruntime/type tests. The three Vitest runs total 43 files / 554 tests. React 18's cycle/depth stderr matches deliberate `toThrow` hook assertions in `packages/access-router-react/test/dependency-policy.test.tsx:457-507,652-662`; it is not evidence of empty stderr or an ignored unhandled-error summary.
- **Starter:** 18 files / 339 tests include VERSION/publication guards and release-like packed-consumer assertions. Inspected `packages/create-access-router-mongo-starter/tests/packed-consumer.test.ts`: publication transformation, installed bins, generated build/typecheck/lint/test/serverless commands, raw-source/version-mismatch rejection, and stubbed-provider dry run. The two `carmsf02 fake pnpm: registry unavailable` diagnostics match the intentional failing shim in `packages/create-access-router-mongo-starter/tests/stage-template.test.ts:426-437`. No remote publication/deploy follows from these assertions.
- **TODO:** the asset-inliner image-replacement / ASSET-06 `it.todo` at `packages/asset-inliner/test/legacy-contract.test.ts:453-455` is unchanged. Zero TODOs or error-free logs are not claimed.

The third runner explicitly uses `_tmp-05c-G8SORQ/t`, rather than the CI resource helper. Copied `node_modules`, existing browser/database/package caches and incomplete telemetry prevent cold-install, artifact-service, runner-resource, OOM/timeout resilience, or hosted-performance certification. No complete suite was rerun for this review.

### Original third-run log fingerprints

Recomputed these hashes from the original files and matched the ledger exactly. Raw logs were not edited or copied into this report.

| Original file                 | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `_tmp-05c-G8SORQ/summary.txt` | `3709ee3f0c6a7d958c58218a67c2d3a3aeded8d3a7ed7d6c019a18006154e32d` |
| `_tmp-05c-G8SORQ/lint.log`    | `192904497e1d404db5e88f37fa40626e70af5ed75752856c8c986155c6bf8f26` |
| `_tmp-05c-G8SORQ/build.log`   | `4d57b5ff1d77843945bc09fa6b85959a18b3e00e592f505b38a8b0bf36d23759` |
| `_tmp-05c-G8SORQ/grouped.log` | `1b750bce5243882f4aec8fd8e344049100e49a5c795aea5fee9620420e782bf0` |

### Gate probe, maintained regressions, and preserved workflow

Reconciled the original `_tmp-ci-dag-05-gates-jakZxk/` probe script, saved JSON and empty stderr. Its **146 checks** account for **9 base + 125 package-contract + 3 independent-lane + 6 gate-scenario + 3 other-scenario checks**. Independently checked workflow contracts, nine in-memory production-evaluator scenarios and five descendant sets derived from actual `needs`.

- Healthy accepts all 27 successes. Access-router failure has exactly six descendants: client, deco, React, runtime, starter and react-vite. JSON-router failure adds access-router and message-service to that downstream set. Vault failure affects its three stores, DPoP client and example. Preparation blocks all 25 package jobs; validation also blocks preparation.
- Cancellation, missing result and false-success inputs fail closed. The original probe asserts missing/false-success rejection but **does not retain those two outputs in its JSON**. Their behavior is supported by the inspected assertions, fresh independent in-memory evaluation and maintained tests, not invented saved output.
- Maintained result tests additionally cover extra/malformed/empty/unknown records, all skipped results, multi-parent failures and CLI bypass rejection. Expected dependency skips still fail the aggregate; no skipped result is treated as success.
- Inspected `scripts/ci-test-results.mjs:12-22,79-140`: required IDs derive from generated aggregate needs, not a second workspace list. The active `unit-test` has exactly 27 needs and `if: ${{ always() }}` with `CI_TEST_NEEDS: ${{ toJSON(needs) }}`.
- All 25 package jobs use exactly preparation plus reviewed prerequisite successes and full `pnpm --filter <manifest-name> test` execution. The workflow's **31 jobs** are 28 generated main jobs plus `lint`, `access-router-minimum-node-smoke`, and `access-router-react-minimum-node`. Triggers and those independent job blocks match `HEAD` in parsed and byte forms. The preserved floating React matrix remains non-blocking and outside the aggregate.
- Local group/configuration/test scripts match baseline. The group validator still covers test-only build/read conflicts, including react-vite/starter sharing compiled inputs read-only in group 12. Separate local groups/builds must not overlap.

This proves expressed eligibility and evaluator behavior, not GitHub scheduling, unrelated job completion, cancellation UI, account concurrency or required-check behavior.

### Artifact and resource contracts

Inspected `scripts/ci-test-artifacts.mjs:237-307,316-388,461-619,630-651` and the independent handwritten USTAR/regression fixtures. Preparation requires clean source and absent, untracked, real output destinations; performs one complete build; rechecks actual checkout/run/platform/toolchain/lock identity; and inventories reviewed outputs. The download requires the exact current name and one regular archive. The externally supplied digest is the **gzip archive SHA-256**, not a digest trusted from its own manifest or the upload action's service digest.

The parser validates external digest, bounded decompression, normalized paths, duplicate/schema/inventory/hash/mode agreement, required roots/files, and only regular files/directories. Links, special/extended entries, private/dependency/cache paths and unsafe modes are rejected. Restore verifies staging and genuine starter readiness before moving output roots; existing/tracked/symlinked destinations fail closed. Hidden template files and executable bins remain required. The sole empty `wire.mjs` exception still requires presence/hash and declarations-only source-AST agreement.

Independently read the original CI-DAG-03 archive with Python `tarfile` **in memory without filesystem extraction**, and matched `outputs.json`, `roundtrip-inventory.json`, every payload hash/mode and current preparation output bytes:

- Archive: **2,585,645 bytes**, SHA-256 `1c9622805df74e10d08d7519bc162787191d871b8388ea82a09d1543731c58c7`.
- **31 roots / 173 required files / 333 output entries: 274 files and 59 directories**, plus the archive manifest. Current production output contract recomputed from pnpm discovery matches those required roots/files exactly.
- Identity is the saved **synthetic local run `30306`, attempt `1`**, the reviewed baseline SHA, Linux/x64, Node `26.12.1`, pnpm `11.24.0`, and package-source lock SHA-256 `8685e0d36b941dcf7e7fa18ed4cb35fe3b8512d175ee0aecba241902979bcede`. Saved preparation duration is 166,305 ms.
- That older clean clone imported the proposed helpers from the installed dirty tree. Its package-source lock differs intentionally from the proposed root lock recorded above. It is **not an artifact for the current proposal's identity or a hosted Actions revision**. Contract agreement does not bypass checkout/lock matching or authorize preparing the dirty main checkout.

Inspected composites and `scripts/ci-test-workspace.mjs:193-278,292-296,304-443,446-511`: each package independently frozen-installs, restores the archive, obtains only browser downloads/exact Mongo binary caches, and executes the full script once. Source/output/identity are rechecked after resource preflight immediately before testing; no retry/subset/resource-skip fallback exists. Resource inventory selects exactly three browser, eight Mongo and two Redis workspaces. Browser cache hits still run system dependencies and real engine launch/evaluation. Mongo resolves job-local versions/OS/download identity and binary/server availability with no global-binary fallback. Redis requires Docker and pulls/preflights both required tags with observed digests/versions. Fresh regressions exercise rejection contracts through fixtures; this review did not launch those resources. **R1 remains a gap in these otherwise checked contracts.**

## Findings and retained failures

P1 here denotes a required pre-rollout correction or explicit risk decision, not a demonstrated hosted incident.

### R1: Resource helper allocates an overlong Unix-socket path

**Kind: confirmed source-level path-budget defect; priority P1; blocks local finishing acceptance of the resource claim.** Hosted occurrence is untested.

The second V5 log contains **344 `listen EINVAL` occurrences across 22 distinct 113-114-byte socket paths**. Inspected `broadcast-channel@7.4.0` builds its Linux pathname from `os.tmpdir()`, `/pubkey.bc/A` plus 20 channel-hash characters, `/rdrs/`, reader UUID and `.s`. Inspected RxDB's multi-instance support creates this channel for relevant storage instances. The observed suffixes occupy **50-51 bytes**; Linux `sun_path[108]` ordinarily permits at most **107 pathname bytes** including room for a terminating NUL.

The delivered path chain is `restoreWorkspace` -> `ignoredScratch(root, 'resources')` -> `_tmp-ci-test-resources-XXXXXX` -> `resolve(resourceDirectory, 'tmp')` -> `resourceEnvironment` setting `TMPDIR`. References: `scripts/ci-test-artifacts.mjs:270-274`; `scripts/ci-test-workspace.mjs:188-189,292-296,465-473,489-511`. Neither the resource helper nor its inspected tests enforce a socket-path byte budget.

| Allocation at the reviewed 33-byte checkout-root depth | TMPDIR bytes | Resulting observed-shape socket bytes | Interpretation                                                    |
| ------------------------------------------------------ | ------------ | ------------------------------------- | ----------------------------------------------------------------- |
| Historical failed `_tmp-ci-dag-05-v5b-lw2nfp/tmp`      | 63           | 113-114                               | Actual saved `listen EINVAL` errors.                              |
| Delivered helper `_tmp-ci-test-resources-XXXXXX/tmp`   | 67           | **117-118**                           | Source-derived over-budget pathname; not executed in this review. |
| Successful V5 `_tmp-05c-G8SORQ/t`                      | 51           | 101-102                               | Shorter grouped-run path; does not validate the helper.           |

For the observed 51-byte suffix, TMPDIR must be at most **56 bytes**. The helper adds 34 bytes to its root, so a root longer than 22 bytes already exceeds that budget for such a reader. These are read-only byte calculations, not a new failure reproduction or a claim about an unmeasured hosted checkout path. The historical failure has a supported environmental-path explanation; the **helper's own unguarded allocation is a separate delivered-code risk**, not merely a discarded scratch mistake.

**Next owner:** CI resource-helper maintainer, with coordinator reconciliation of guidance/evidence. Obtain scoped change/probe authorization. Deliver socket-safe allocation at supported checkout depths and explicit fail-closed handling for unsupported budgets; add a maintained byte-boundary regression and, when authorized, a bounded RxDB/BroadcastChannel runtime probe using the actual helper allocation. Preserve repo-local ignored scratch rules, resource isolation, full scripts and normal failure propagation. Do not disable multi-instance behavior, skip tests, shorten coverage, or add retries to hide it. Reconcile R1 in the handoff/task/guidance, then request fresh finishing review of changed bytes. No fix or probe is authorized by this report.

### R2: First V5 attestation assertion remains an investigation/risk decision

**Kind: unresolved intermittent result; priority P1 before rollout.** This is accurately retained by the finishing edits, not proved to be an environmental or pre-existing failure.

The first complete grouped run stopped in group 3 on `packed-package consumer compatibility > installed Chromium: cross-origin explicit cookies recover once from an exposed stale-key challenge`. It received readable `stale-key` status **403**, recorded `apiStatuses: [403]`, one preflight/discovery/key module and no retry; the assertion expected **200**. Packed consumer reported 1 failed / 11 passed tests. Other attestation runs and the response-handler sibling passed.

Matched three focused packed-consumer passes (12/12 each) and the subsequent complete group-3 pass in the same source copy. The second and third complete attempts also passed attestation. Unchanged-source passes establish intermittency, **not cause, a fix, pre-existence or elimination**. No product/test weakening or permanent retry was found.

**Next owner:** attestation maintainer and rollout maintainer. Investigate the bounded stale-key browser retry assertion with authorized diagnostics, or record an explicit maintainer disposition specifying residual risk and follow-up. Later green runs alone are not a disposition. The coordinator must retain the first failure when reconciling status.

### R3: V6 and maintainer acceptance decisions are unperformed

**Kind: unmet rollout prerequisite, not a local validator defect.** The checked workflow has only push/pull-request triggers; neither publication of a tested revision nor hosted execution was authorized.

The [CI-DAG-01 protocol](ci-dag-01-design.md) and finishing handoff appropriately separate public baseline metadata from local runs. Baseline reports 2,740/3,062-second unit jobs, 2,745/3,065-second workflow walls and 3,547/3,995 all-job aggregate seconds, with observed peak five running jobs; PR actual merge checkout/log-level attribution is limited. These are inherited baseline observations, not newly fetched or controlled hosted measurements. Third V5's **3,798-second sum of command execution** and CI-DAG-03's local preparation time cannot measure the new DAG's critical path or billed cost. The eight-package chain is static topology only. Repeated installs/restores/resources/rebuilds may raise aggregate runner usage despite possible wall-time gains.

**Next owner:** repository/rollout maintainer. Authorize an actual revision containing the delivered workflow/helpers, healthy and controlled root/mid-graph/preparation/validation failure, cancellation and missing/skipped-result evidence, artifact-service round trip/digest rejection, and required-check UI confirmation. Review fault injection before use and remove it afterward without weakening permanent checks. Record actual checkout/run attempt/runner/cache/browser/database conditions, setup/restore/resource/test timings, dependency-ready start lags, wall/aggregate time, peak concurrency/resource observations and billing/quota/retention evidence. Establish acceptable thresholds and approve budget/risk explicitly. Branch-protection changes require separate authorization. The coordinator then reconciles final acceptance; this reviewer supplies none of those permissions.

### Historical and review-tool failures remain distinguishable

- Second V5 mongoose-rxdb run reported **21 failed cases across 9 files, 36 passed files / 611 passed tests**. Groups 1-4 started; group-4 JSON-router sibling completed successfully. The runner waited for the group and did not start group 5. Third V5 passed the same mongoose-rxdb script (45 files / 632 tests) with a shorter path. This is local grouped behavior, not hosted DAG continuation evidence.
- Earlier CI-DAG-03 browser/ownership/preparation failures and later authorized checkout-owner complete PDF/three-engine DPoP passes remain in the preceding handoff/diagnostic. They were not rewritten, reclassified as V5, or rerun here.
- Reviewer-only assertions initially failed on ledger selection, guessed socket lengths, an expected actionlint `v1.7.7` prefix instead of `1.7.7`, a guessed cached Python-environment name, nested pnpm build-prefix accounting, and an overly broad absolute-path pattern matching an already-sanitized repository-local `tmp` child. Corrected read-only assertions passed against unchanged raw evidence/product/document bytes. These were review-tool errors, not hidden product-check failures or a demonstrated privacy leak. The coordinator's own earlier formatting/accounting/privacy corrections remain recorded in its handoff.
- The initial report-only Prettier check exited 1 on Markdown table formatting. Only this report was reformatted through `patch`; its subsequent check passed. No review target was reformatted.

## Checks actually executed by this reviewer

All commands ran from the repository root, sequentially, with existing dependencies/tools and scratch-local runtime `TMPDIR`. V2/V3 are validators, not substitutes for package/grouped coverage.

| Check                         | Actual command/procedure                                                                                                                                                                                                   | Result                                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V3                            | `pnpm test:ci:check`                                                                                                                                                                                                       | Exit 0, **310 passed**, 0 failed/cancelled/skipped/TODO; model/workflow/helper agreement; 15.132 s.                                                                    |
| V2                            | `pnpm test:groups:check`                                                                                                                                                                                                   | Exit 0, **18 passed**, 0 failed/cancelled/skipped/TODO; 12 groups / 25 workspaces; 3.906 s.                                                                            |
| Finishing-document formatting | `pnpm exec prettier --check --config-path .prettierrc` followed by the six fingerprinted document paths                                                                                                                    | Exit 0; all six passed.                                                                                                                                                |
| Targeted helper lint          | `pnpm exec eslint` followed by `scripts/ci-test-{plan,artifacts,workspace,results}.mjs` and their four `.test.mjs` files, explicitly listed in the invocation                                                              | Exit 0; eight files passed.                                                                                                                                            |
| YAML syntax                   | `pre-commit run check-yaml --files .github/workflows/test.yml .github/actions/ci-prepare/action.yml .github/actions/ci-setup/action.yml .github/actions/ci-test/action.yml`                                                | Passed in the already-cached pinned v6.0.0 hook environment; no installation.                                                                                          |
| Actions-aware syntax          | Existing checksum-verified actionlint `1.7.7`, `-shellcheck= -pyflakes= .github/workflows/test.yml`                                                                                                                        | Exit 0. Archive pin and binary/archive byte equality verified independently. Composites are covered by YAML/strict contracts, not claimed as direct actionlint inputs. |
| Read-only reconciliation      | Original log parsing, all source-copy comparisons, accepted/document/log hashes, saved gate JSON/assertions plus independent evaluator/needs traversal, independent archive parsing and current output-contract comparison | Passed with the limits above; no build/restore/resource/test execution.                                                                                                |
| Final report hygiene/scope    | Report-only Prettier; local-link/anchor, privacy, ignore, newline/whitespace review; `git diff --check`; final protected-target/status comparison                                                                          | Passed; 33 links / 2 anchors; privacy, 28 hashes and whitespace; zero drift in 2,535 protected files/HEAD; only report added.                                          |

The final link total comprises 26 local links / one anchor in the six finishing documents and seven links / one anchor in this report. Scope checking is against the initial review snapshot, not a claim that the proposal tree was clean.

Actionlint archive SHA-256: `023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757`; binary SHA-256: `9f7dedb4e23f89f2922073d1a6720405b7b520d4f5832ebb96f0d55a2958886c`. Disabling shellcheck/pyflakes follows the accepted protocol and is not a claim that those analyzers ran. No completed validators were repeated merely to obtain cleaner results.

## Preservation, limits, and handoff

This report preserves the independent reconciliation, exact fingerprints/counts, new path finding, retained failures, scope and owner decisions. It follows the [artifact preservation workflow](../../README.md). Scratch runners/logs/JSON, protected snapshot, archive/dependencies/consumers, browser/database state and tool binaries remain untouched and are omitted rather than copied wholesale. No credentials, private session identifiers, machine-specific absolute paths or identifying session URLs are included. Numerical path lengths retain the relevant constraint without disclosing the machine root.

This is a **summary-only review, not a self-contained reproduction bundle**. Another checkout can run maintained regressions with the appropriate pinned prerequisites; recalculating historical counts/hashes requires the omitted original logs/archive/copies. No new clean install, hosted measurement, resource certification, full-suite rerun or historical execution is implied by preservation.

The existing “independent finishing review missing” statements describe the pre-report state. The coordinator should link/reconcile this **changes-required** report without converting it into acceptance, rewriting historical claims or marking CI-DAG-05/V6 complete. Next steps are R1's authorized resource-path correction/verification, R2's investigation or explicit maintainer disposition, and R3's separately authorized live evidence and risk/budget/required-check decisions. A coherent rollback remains an alternative requiring its matching validation wiring, serial/grouped coverage and reviewed required-check identity before publication. **No rollout or rollback was executed or authorized here.**
