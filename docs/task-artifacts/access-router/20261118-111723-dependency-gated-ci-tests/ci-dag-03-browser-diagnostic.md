# CI-DAG-03 Chromium diagnostic evidence

Recorded: 2026-11-18. Related: [finishing handoff](ci-dag-03-handoff.md) and [CI-DAG-03](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-03-implement-isolated-test-setup-and-build-output-transfer).

## Scope and provenance

Bounded investigation in the task's already-owned Ubuntu container and ignored `c`/`d` scratch only. Clean package/test source remained at `0fda5197c5b950e865af73681225c8bbf5533775`; saved helpers/composites stayed uncommitted and unchanged. This is a local environment diagnosis, not a committed Actions run, an independent agent review, a package change or a repetition of either complete PDF/DPoP script.

The original browser consumer completed with the five failures and exact partial/full-lane totals recorded in the handoff. The diagnostic below reproduced a Chromium crash without importing restored package code, then compared execution identities. It does not establish a pre-existing package failure.

## Minimal probe and observed prerequisite

Both executions used Node `26.12.1`, the DPoP workspace's independently installed/resolved Playwright `1.62.1`, its isolated downloaded Chromium `151.0.7922.34`, and fresh checkout-local ignored `TMPDIR`. Resolution of Playwright's actual package file/version was asserted, not obtained through `npx` or a global install. Explicit launch options were `headless: true` and `args: ['--no-sandbox']`; captured Playwright defaults included `--disable-dev-shm-usage`. No browser flags, tests, container mounts or shared-memory allocation were changed between the two probes.

| Operation                                                  | Root process                                     | Checkout-owning user            |
| ---------------------------------------------------------- | ------------------------------------------------ | ------------------------------- |
| Launch/new page; evaluate `2 + 2`                          | passed, 140 ms                                   | passed, 151 ms                  |
| Loopback HTTP navigation; native module imports value `42` | passed, 35 ms                                    | passed, 37 ms                   |
| P-256 WebCrypto signing; canvas RGBA readback              | passed, 4 ms; 64-byte signature, `[255,0,0,255]` | passed, 5 ms; same observations |
| Screenshot                                                 | failed, 2,408 ms, `Target crashed`               | passed, 34 ms, 4,362 bytes      |

The root run recorded `page-crash`; the owner run did not. Both recorded browser disconnection during deliberate closing, which is not itself a test failure. Both final clean-source checks passed.

Selected root stderr, with timestamps/PIDs removed and random temporary paths normalized to descriptive placeholders:

```text
ERROR:base/memory/platform_shared_memory_region_posix.cc:213
Creating shared memory in <diagnostic-tmpdir>/.org.chromium.Chromium.<generated-name> failed: Permission denied (13)
ERROR:base/memory/platform_shared_memory_region_posix.cc:216
Unable to access(W_OK|X_OK) <diagnostic-tmpdir>: Permission denied (13)
page.screenshot: Target crashed
```

Three shared-memory creation/access pairs were present in root stderr; none appeared in owner stderr. Root also reported Vulkan/EGL GPU initialization errors. Missing D-Bus/device warnings occurred in the successful owner run too; their presence alone is not evidence of the crash cause. A separate root Node access probe could write/traverse the scratch directory, so this report does not claim to have traced Chromium's exact child credentials or kernel permission check.

The container retained private **67,108,864-byte (64 MiB) `/dev/shm`**. Docker configured memory limit was `0`, PID limit unset; cgroup `memory.max`/`pids.max` were both `max`. All recorded memory-event counters (`low`, `high`, `max`, `oom`, `oom_kill`, `oom_group_kill`) and the PID `max` counter were zero; `OOMKilled` was false. These are snapshots, not peak-memory monitoring. A capacity increase was neither necessary for the successful minimal probe nor demonstrated as the fix.

The demonstrated task-local prerequisite is browser/test execution as the checkout-owning user with owner-writable local temporary/profile paths. Privileged actual `install-deps` remains mandatory and separate. Only this task's `c` output/temp/Vite cache ownership was corrected; restored content and modes were verified again. Scoped Git trust used environment-only configuration for `c`, never persisted/wildcard trust.

## Setup-only diagnostic failure

The first owner-suite setup controller did not start any tests: overly long diagnostic `TMPDIR` names made `tsx`'s Unix socket paths **121/113/114 bytes** for attestation/PDF/DPoP, exceeding Linux's 108-byte `sun_path` storage. All three real starter-readiness invocations failed with `listen EINVAL`. The next diagnostic used fresh shorter ignored names and explicitly checked socket-path headroom; all three genuine restore/readiness/resource preparations then passed. Helpers, package tests and the failed attempt's logs/results were preserved unchanged.

## Owner-focused restored-package follow-up

Fresh serial attestation/PDF/DPoP preparation phases passed in **14,227/14,017/16,472 ms**. Each verified all 31 roots / 333 entries and the genuine starter publication gate, then ran actual cache-hit `install-deps` plus selected-engine launch/evaluation without another download. Ownership correction was limited to owned outputs/temp and workspace Vite caches; output contents/modes were reverified before switching users.

The existing focused configs and exact argv are recorded in the handoff. Attestation reported **3 files / 141 tests passed** (6,706 ms including verification/tool probes); PDF reported **2 files / 32 tests passed** (15,289 ms). The DPoP focused subprocess selected Chromium/Firefox/WebKit and completed with **exit 0** (349,975 ms including verification/tool probes). Each final report asserted pristine outputs before tests, zero driver prebuilds/complete-manifest executions, clean source afterward and unchanged restored output hashes/modes.

The host orchestration controller timed out at **120 seconds (SIGTERM)** during DPoP. Its Docker execution continued without a restart. The orchestration JSON therefore retains only five completed phases, and its captured DPoP console stream ends before any test summary. An initial host-PID event wait lacked visibility into the container's PID namespace; its apparent completion was rejected after owned process inspection showed the driver still running. The subsequent Docker-aware waiter found the existing final driver report; it did not capture a Docker `exec_die` event or an orchestration exit status for DPoP.

Selected fields copied from that final DPoP report (identity/user metadata omitted; argv and observations unchanged):

```json
{
  "phase": "run",
  "workspace": "oidc-vault-dpop-example",
  "argv": [
    "pnpm",
    "--filter",
    "oidc-vault-dpop-example",
    "exec",
    "vitest",
    "run",
    "--config",
    "vitest.browser.config.ts"
  ],
  "focusedOnly": true,
  "completeManifestExecutions": 0,
  "driverPrebuilds": 0,
  "outputsPristineBeforeTests": true,
  "sourceClean": true,
  "outputHashesAndModesUnchanged": true,
  "status": "passed",
  "elapsedMs": 349975,
  "finalSourceClean": true
}
```

The reviewed `command` helper rejects subprocess errors or any status other than `0` before those post-test assertions. Thus this report establishes successful focused execution, not merely process disappearance. DPoP's final test/file/failure/skip counts were not retained and cannot be recalculated from this archive; no 225-test total is inferred from earlier failed runs. These successful restored browser paths narrow the local prerequisite, but neither complete PDF/DPoP script was repeated and their failed certifications remain unresolved.

## Preserved evidence versus omitted originals

This curated report preserves selected observations and a descriptive protocol, not the executable scratch driver or full raw logs. Historical original files below remain omitted disposable scratch under `_tmp-c3-Uo71M6/d/`; hashes identify reviewed bytes, not downloadable inputs or a self-contained recalculation bundle.

| Historical original                                                        | SHA-256                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `browser-consumer-results.json`                                            | `a9d0d0ba22b1fa9e91eba5a8aa36d801c815d2c009a6650e3673dde90332d79f` |
| `browser-consumer-runtime-v2.log`                                          | `bf0eb23ec4e3177c1cf88170edffc3a8062a4b38d2df8be74939291ec57af019` |
| `chromium-navigation-results.json`                                         | `676c6afa957e35ec0c1807735d1922939e7904cca0c32746733a38dc930250de` |
| `chromium-navigation-runtime.log`                                          | `45659c609500f9919a51f60db5865cac0a6c4af0f9adf0dec42bf4cab05263da` |
| `chromium-navigation-user-results.json`                                    | `2ce288a26afc783d2b4e6e7d9bd8781a94fc6cac8c7f50292dde68983d5d5dc4` |
| `chromium-navigation-user-runtime.log`                                     | `ffbbbc4dc9734f169dc3df80d920c99197424b945c93407b61eecb29c7fd0763` |
| `browser-owner-orchestration-results.json` (setup-only failed attempt)     | `9c236603bc93b1314a1cb455b876a1f58986db7f9248e243a203985fe71cdac8` |
| `browser-container-resource-observation.json`                              | `59ed224dfd12777096597746780681df5fefa9948f57b5dc0358bb7631758244` |
| `browser-owner-attestation-prepare-v2.json`                                | `eba353c860d403415d79ce662b9fc519c77fae132175cb6f8334fc4cf39c73bf` |
| `browser-owner-attestation-run-v2.json`                                    | `483a577be4dd89414cedf4cd14101a0c7d8b12402ff80849d0264ab073ef08cb` |
| `browser-owner-pdf-prepare-v2.json`                                        | `6ca6d632c266be56c6e9bad8c6a8a92c15da1a4c23bca56f28c6b57f43268f5d` |
| `browser-owner-pdf-run-v2.json`                                            | `f34d966fcbd8851f86e54a6af22a62e658e3420c702145a7d508254678e1618d` |
| `browser-owner-dpop-prepare-v2.json`                                       | `9ab430a173aca0e9d8549360824cf02e860529a8c14fb1b98de6b06dfb704dec` |
| `browser-owner-dpop-run-v2.json`                                           | `ef1fb5714329f536beb154b8beb12af200fc11c2c68e491834a8fbd8b1acdc26` |
| `browser-owner-orchestration-results-v2.json` (five completed phases only) | `9bad9177c0864c60ec2878c123225b611c05f8a018c6779f78d9f6fa9aaa1735` |
| `browser-owner-runtime-v2.log` (partial DPoP console stream)               | `43e1197d3878fddf144570ea74215fb160c9c79c42782b8049037ff85099f0b2` |
| `browser-owner-exec-event-completion.json` (final driver report observed)  | `4fdc70e9d8ca43d700d542d44fa21609633d7782195f3bb863c14b1e791e340b` |

Full logs, process inventories, random profiles, checkouts, dependencies, archives/generated consumers, browser/database binaries/state, private operational metadata and machine-specific absolute paths are deliberately omitted. Reproduction needs the pinned tools, repository/source fingerprints, an independently installed/restored consumer, real browser dependency/download access and appropriate user/temp prerequisites. Neither preservation nor a successful focused diagnosis retrospectively certifies failed complete scripts or GitHub scheduling.
