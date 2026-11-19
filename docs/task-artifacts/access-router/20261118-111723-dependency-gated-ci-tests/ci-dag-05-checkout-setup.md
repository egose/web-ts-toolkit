# CI-DAG-05 short-real-checkout setup: local delivery

Prepared: **2026-11-19**. Owner alias: **CI-DAG-05 setup implementation session**.

**Stage-2 local setup correction delivered, uncommitted and unpushed. Coordinator
delivery reconciliation and fresh non-implementer review remain pending.
CI-DAG-05 acceptance and hosted readiness remain blocked.**

Authority: the [confirmed handoff](ci-dag-05-checkout-setup-handoff.md),
[stage-1 coordinator reconciliation](ci-dag-05-checkout-setup-stage1-coordinator-reconciliation.json),
[sole-line amendment](ci-dag-05-checkout-setup-contract-amendment.json), and
[authoritative task](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-05-verify-rollout-measure-tradeoffs-and-update-testing-guidance).
R2 was already idle and coordinator-reconciled; that prerequisite did not resolve R2.
This session performed no delegation, project commit/ref change, push, dispatch,
publication, settings change, hosted execution or tooling/runtime installation.

## Delivered behavior and preserved boundaries

- All **28 main jobs** retain the original
  `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` and
  `${{ github.sha }}` selection, followed by a top-level source action with main/post metadata.
  Original action resolution/workspace and checkout post cleanup are retained;
  `GITHUB_*` and `RUNNER_*` are not rewritten.
- The dependency-free source action declares `using: node20`, `main: index.mjs`,
  `post: index.mjs`, `post-if: always()`. Metadata and inspected built-ins are not
  execution evidence for Node 20 or the runner's substituted runtime.
- Native selection accepts only normalized, real, nonsymlink Linux directories
  under an owned, non-group/world-writable parent. It claims only the exclusive
  sibling `dirname(GITHUB_WORKSPACE)/c`. Existing targets are not reused,
  overwritten or deleted. There is no search, fallback, external local checkout,
  alias, retry, sleep, undocumented override or widened budget.
- R1's native/runtime guards and **40 fixed + 22 UUID bytes**, **34-byte real-root
  maximum** and **45-byte TMPDIR maximum** are unchanged. The source action exports
  `root`, `relative-root` (only `../c`), `tmpdir` and `pnpm-dest` after verification.
- Transfer uses only the exact selected SHA-1 commit/tree/blob closure. A generated
  real `.git`, selected-SHA shallow boundary, strict `index-pack --fsck-objects`
  and `fsck --strict --full --no-reflogs`, exact inventory/object bytes, source/index
  cleanliness, modes, pins/lock and independent inodes/objects are required. Raw
  merge-parent bytes remain unchanged; parent history, alternates, credentials,
  private Git configuration/hooks/refs, dependencies, caches and outputs are not
  copied. Strict failure stops without source fetching, copied history or weaker
  verification.
- Original root `.npmrc` presence is rejected before content reads; committed root
  `.npmrc` is rejected from tree metadata before its blob is read/transferred.
  Both original and selected installer lookup locations are rechecked immediately
  before pnpm setup. Contents are never read/copied. Dirty/malformed source,
  gitfiles, symlinks, shared hardlinks, collisions, unsafe ownership changes and
  malformed/partial post states fail closed; unsafe cleanup retains the allocation.
- Main validate/install/build/restore/resource/test/evaluate shells explicitly use
  the verified selected root and selected-root TMPDIR. Node/pnpm pin-file inputs
  use the selected-relative path; package-manager caching is disabled. Inspected
  action diagnostics may retain their original cwd; pnpm self-install is restricted
  to its newly owned empty selected-root child. Project pins remain Node **26.12.1**
  and packageManager **pnpm 11.18.0**; `.tool-versions` pnpm **11.24.0** is not the
  authoritative pnpm installer selection.
- Artifact identity/digest/run/attempt/SHA checks, resource helpers, package scripts,
  worker limits/rebuilds, graph and evaluator are preserved. Strict contracts retain
  **31 total / 28 main / 25 static complete-package jobs**, **26 declared + one
  fixture gate**, and **27 fail-closed aggregate results**. The three independent
  jobs are unchanged. No matrix barrier, fail-fast/continue-on-error shortcut,
  workflow-wide concurrency cap or dependency-closure filter was added.

The original [stage-1 proposal](ci-dag-05-checkout-setup-support/design/stage-1-proposal.md)
is preserved byte-exact with its historical candidate/unapproved language. Its
SHA-256 is `5513e1d9022d0b158e20ce9424e79003b6c292d21e8c92433c10f90b74f471bf`
(29,344 bytes); confirmation did not turn that design into runtime evidence.

## Verification actually run

All commands ran **serially from the repository root**, with a separate fresh,
Git-ignored checkout-local run directory and absolute runtime TMPDIR. Exact argv,
UTC intervals, exits/signals, available runtime/input fingerprints and original
versus sanitized output hashes are in the [observation index](ci-dag-05-checkout-setup-support/observations.json)
and each linked result/stdout/stderr. Historical scratch paths are provenance,
not durable prerequisites. Replace and quote placeholders before any future run;
these historical commands are **not runnable from the archive alone** with omitted
dependencies/tooling/fixture execution state.

### Retained test progression

| Observation                      | Passed / failed / skipped | Exit  | Interpretation                                                                                                                                  |
| -------------------------------- | ------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `red-wiring-YkGW6y`              | 0 / 5 / 0                 | 1     | Behavioral red: wrong pin lookups/cwd and missing registered source/main/post wiring. Exact five-test input retained.                           |
| `selected-only-fixture-KeBfeD`   | 1 / 0 / 0                 | 0     | Early selected-only real-fixture subroutine result, not final-byte/native-selector certification.                                               |
| `boundary-red-c3Z9qz`            | 177 / 6 / 0               | 1     | Expanded boundary/ownership red; exact intermediate source snapshots retained.                                                                  |
| `checkout-green-XYwIiX`          | 204 / 1 / 0               | 1     | Despite its label, failed: the index-flags mutation ran a public synthetic filter, adding an unexpected sentinel before the intended assertion. |
| `checkout-green-isolated-xwggL6` | 205 / 0 / 0               | 0     | Intermediate standalone green after isolating only that fixture mutation.                                                                       |
| `helper-contracts-HZOAkG`        | 405 / 1 / 0               | 1     | Protected R1-test action list omitted the newly required `ciActions.source`; approval preceded its sole-line amendment.                         |
| `ci-check-final-aKP5nR`          | **611 / 0 / 0**           | **0** | Final integration, then both strict model and active-workflow/four-action checks; all thirteen fingerprints unchanged.                          |
| `groups-check-final-NDLH3V`      | **18 / 0 / 0**            | **0** | Validation of 12 groups covering 25 workspaces; no workspace suite ran.                                                                         |

The expanded red's six failures were: empty tree record; committed-ignore
diagnostic mismatch; high-bit batch header; duplicate shallow boundary; changed
pnpm-child mode; unsafe partial-allocation cleanup. The ignore case already stopped
at exit 1; its diagnostic correction did not permit unignored children. Every
failure and its full observation remains distinct from later green results.

The late index-flags correction adds only fixture-local
`-c filter.fixture.clean=` / `-c filter.fixture.smudge=` to the mutation. The
`/Hidden assume-unchanged/` assertion was not removed or broadened. The 205-test
suite also covers dirty/ignored extras, malformed trees/command output, exact SHA
and merge bytes, object/config/inode isolation, unsupported/symlink/collision
parents, ownership/post failures, installer guards and effective shell/pin bindings.

Executed checkout commands used
`node --test --test-concurrency=1 scripts/ci-test-checkout.test.mjs`; the historical
selected-only invocation additionally used
`--test-name-pattern='real fixture: selected-only'`. The failed helper command was:

```sh
node --test --test-concurrency=1 scripts/ci-test-plan.test.mjs scripts/ci-test-artifacts.test.mjs scripts/ci-test-workspace.test.mjs scripts/ci-test-results.test.mjs
```

Final integration was `pnpm test:ci:check`, **2026-11-19T13:54:58.278Z–13:55:20.923Z**,
exit 0. Only the approved checkout-test filename was appended to the serial root
test list; both following model/workflow commands are unchanged. `pnpm
test:groups:check` is a validation check, not grouped package execution.

### Focused lint, format and YAML checks

Final successful commands and their exact selections:

```sh
pnpm exec eslint .github/actions/ci-checkout/index.mjs scripts/ci-test-checkout.test.mjs scripts/ci-test-plan.mjs scripts/ci-test-plan.test.mjs scripts/ci-test-results.test.mjs scripts/ci-test-workspace.test.mjs
pnpm exec prettier --check --config-path .prettierrc .github/actions/ci-checkout/index.mjs scripts/ci-test-checkout.test.mjs scripts/ci-test-plan.mjs scripts/ci-test-plan.test.mjs scripts/ci-test-results.test.mjs scripts/ci-test-workspace.test.mjs package.json README.md
'<user-home>/.cache/pre-commit/repo3aru3ozk/py_env-python3.14/bin/check-yaml' .github/workflows/test.yml .github/actions/ci-checkout/action.yml .github/actions/ci-setup/action.yml .github/actions/ci-prepare/action.yml .github/actions/ci-test/action.yml
_tmp-ci-dag-04-accept-HHjMox/actionlint/actionlint -shellcheck= -pyflakes= .github/workflows/test.yml
```

Their result directories are respectively `lint-final-fingerprint-9b6FjG`,
`format-check-after-cause-wrap-oXXOQK`, `yaml-check-final-FrFAKP` and
`actionlint-final-HbTCqp`, preserved in the observation index. All exited 0;
their thirteen maintained before/after fingerprints match final integration.

Retained earlier failures: two missing-cause ESLint errors (`lint-final-rqDvx4`);
Prettier CLI rejection of `--config` (`format-check-before-qUPMpb`); four formatting
warnings after switching to `--config-path` (`format-check-correct-cli-J8kXdv`);
two incorrect-cause ESLint errors despite the `lint-green-0s2SlG` label; one final
bootstrap formatting warning (`format-check-final-mrtDQy`). The authorized
`format-owned-files-O1OcqU` edit touched only bootstrap, checkout test, plan and
plan test. Both `AggregateError` instances now retain cleanup as `{ cause:
cleanup }`; the intermediate lint pass is separately retained. No historical log
or protected R1-test formatting was rewritten.

Tested tools: Node **v26.12.1**, V8 **14.6.202.34-node.40**, pnpm **11.18.0**,
Git **2.43.0**, ESLint **10.12.0**, Prettier **4.0.0-alpha.13**. Existing-tool
discovery found no Node 20 in inspected PATH/asdf candidates; it is not a claim
that no other runtime exists. Cached check-yaml used source HEAD
`3e8a8703264a2f4a69428a0aa4dcb512790b2c8c`, hooks **6.0.0**, Python **3.14.7**,
ruamel.yaml **0.19.1**, without environment installation. Existing actionlint
**1.7.7** archive/binary matched; archive SHA-256
`023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757`, binary SHA-256
`9f7dedb4e23f89f2922073d1a6720405b7b520d4f5832ebb96f0d55a2958886c`.
The [tool provenance observation](ci-dag-05-checkout-setup-support/observations/tool-prerequisites-final-amBAtc/stdout.log)
preserves exact versions, selections and hashes; binaries/caches were not copied.

No package/resource/packed-consumer/full-build/grouped-suite/whole-repository-lint
execution or separate production source probe ran. Already-green standalone
fixtures were not rerun merely to prepare this archive.

## Exact scope and source fingerprints

The [thirteen-path unified diff](ci-dag-05-checkout-setup-support/sources/maintained.diff)
is against the inherited stage-2 preflight, **not HEAD**. Selected before/after and
red/failure snapshots, original/archive hashes and transformations are indexed by
the [source manifest](ci-dag-05-checkout-setup-support/sources/manifest.json) and
[payload provenance](ci-dag-05-checkout-setup-support/manifest.json).

All maintained modes are **0644**. These are the final actual source fingerprints,
not sanitized-snapshot hashes:

| Maintained path                          |  Bytes | SHA-256                                                            |
| ---------------------------------------- | -----: | ------------------------------------------------------------------ |
| `.github/actions/ci-checkout/action.yml` |    519 | `2e33e69304b843ca86d839cd54f3a9f24f61ffa42f527a17ba4a40ac82a58bf5` |
| `.github/actions/ci-checkout/index.mjs`  | 32,529 | `7b39870bb9eb1c4621d475b77ebf3cc7fffffa13b46a286b15a78f67f92f121a` |
| `.github/actions/ci-prepare/action.yml`  |  1,406 | `35054ec6acdb4f823f77bdf8d2975b971706a41a2324b3b19c82174b13708747` |
| `.github/actions/ci-setup/action.yml`    |  1,382 | `4169b7bf717d2c951b1007219acd6549c9ec4b96a766cd0bbac14e6ba14588f2` |
| `.github/actions/ci-test/action.yml`     |  2,857 | `85dfb30dee2223fe13f9ae47bc9fbde77386017a7cd441f7d5251e2383053fe2` |
| `.github/workflows/test.yml`             | 27,606 | `694a1798730ac2b9fd7253cf88d1e77e0773ea9b23f4d83c1a5b0a180cbcfb3c` |
| `scripts/ci-test-checkout.test.mjs`      | 64,062 | `4b16f6fd820b742dc0e6e447e000ade1a55419b1bc006729dbfc29c4ddc0b9a9` |
| `scripts/ci-test-plan.mjs`               | 32,782 | `50c6e1880b3cea9ea49cc1bbcc0aa320ab10bf2495461400817b28e9bb64d408` |
| `scripts/ci-test-plan.test.mjs`          | 72,222 | `f916a064401391bc20997afad82298af13b69b8f6aff7f990c80189d79c9cf2f` |
| `scripts/ci-test-results.test.mjs`       | 22,739 | `d0e12781c0c6f0b4af86173e02cd24a01549d3f104e4650a1c80a53f7667535a` |
| `scripts/ci-test-workspace.test.mjs`     | 46,822 | `72c310d44334852a58ba311d1157b3d843bb49d6c787c778177d6c3634431b95` |
| `package.json`                           |  2,964 | `2f17f6b734045bf54e76d91fb0e654eb9231c3821bc2e628ae86b34425b5109a` |
| `README.md`                              | 13,333 | `f4fc1345a9152c6f1d9e0f49ffde8a85183fa8818e899cd7fab4eb4e9e9c9055` |

The [machine-readable before/after record](ci-dag-05-checkout-setup-support/fingerprints.json)
also retains absent preimages for the three new files.

### Isolated R1-test amendment

Only `ciActions.source` was inserted before `ciActions.setup` at the existing
source-list line 194. The [isolated exact diff](ci-dag-05-checkout-setup-support/sources/r1-one-line.diff)
contains one replacement; all other actual file bytes/mode match the protected
preimage. Before: **46,804 bytes**, SHA-256
`9638b1beb57cacac0c0f8c055e4ec96898ddbf8fc20067a61cdc8be7b09de285`.
After: **46,822 bytes**, SHA-256
`72c310d44334852a58ba311d1157b3d843bb49d6c787c778177d6c3634431b95`.
Coordinator approval artifact: **3,315 bytes**, SHA-256
`899234ecfcead72ac7cf4cfa6b32fdc77f90348afbf7dbfce30ef9b56111ea07`.
Previous R1 checks certify only their recorded pre-amendment fingerprints.

The two archived R1-test snapshots redact only a public `example.org` synthetic
credential URL. They therefore have distinct archival hashes; original full-file
fingerprints, exact one-line diff and the reversible, fixture-only transformation
remain explicit. No actual maintained fixture or assertion was redacted/changed.

### Protected baseline reconciliation

The [pre-archive local scope result](ci-dag-05-checkout-setup-support/scope/scope-before-archive.json)
passed at **2026-11-19T14:00:12.029627+00:00**, with all **17 assertions true**:
**10 existing maintained changes + 3 new maintained files**, separately accounted
**4 exact coordinator-document deltas + 1 coordinator JSON addition**, **2,568
unchanged original files**, and no unexpected path. It matched all original modes,
inherited status, thirteen historical inputs/seals, independent blocks, exact
manifest/result-test/R1 amendments, protected graph prefix and final integration
fingerprints. This is a same-implementer check, not coordinator or independent
acceptance.

Stage-2 preflight: **2,582 original regular files**, **547,222 bytes**, SHA-256
`72b2bcd351628378cfd9f6ad7ccf1e01f7a154e543343b0ff559e1d982cdb4ff`.
Unchanged coordinator baseline: **547,981 bytes**, SHA-256
`ed5906c0c6c97b52055bcb9edae0c93120bd379446b7a33b8e2b5ff8fd164c45`.
The [separate coordinator delta record](ci-dag-05-checkout-setup-support/scope/coordinator-deltas.json)
is **2,598 bytes**, SHA-256
`4c24f3a6fc7a32b88ff405f8096b4ca9b0ed680c3f0a09aaeb6a03b88f5357e1`;
coordinator-owned documents/artifact were not edited by this session.

Recorded unchanged HEAD: `0fda5197c5b950e865af73681225c8bbf5533775`.
Project-ref serialization is
`git --no-optional-locks for-each-ref --format='%(objectname) %(refname)'`, SHA-256
`40b660a3fac8ab8c4726e35449cc090b4913e64265d5c544ee187b48dbf3427b`.
The corrected thirteen-path `reconcile-final.py` is retained; the older
twelve-path scratch driver was left unchanged and was not used for final scope.

## Archive integrity and handoff limits

The [support index](ci-dag-05-checkout-setup-support/README.md) distinguishes exact
copies, redacted copies, generated diffs, historical failed/green results and
omitted data. Initial curation preserved **26 observations**, including **11
nonzero observations** (nine earlier test/lint/format failures and two curation-only
failures). The privacy scan stopped on the synthetic R1 URL; a partial-copy check
then incorrectly expected 22 rather than 21 files. Both failed inputs/logs were
retained. All 21 owned partial copies were subsequently verified byte-identical
and retained without overwrite; only archival R1 copies were redacted. One
context-order edit-tool rejection is separately recorded. Curation completed at
**2026-11-19T14:14:04.493Z** with 132 core payload files plus its manifest.

The [pre-final delivery-integrity observation](ci-dag-05-checkout-setup-support/delivery/delivery-integrity-before-final-ljSlxP/validation.json)
passed with **140 captured curated files / 44 parsed JSON files / 42 local links /
one local anchor**, **135 declared archive entries** and **129 original local
source files** verified. All twelve assertions passed, including exact diff
recalculation, reversible R1 snapshot hashes, observation counts/output provenance,
serial intervals, privacy-pattern checks, not-ignored destinations and unchanged
captured inputs. Its explicit captured set precedes this paragraph and later
records; it is not certification of those future bytes. The
[delivery-foundation provenance](ci-dag-05-checkout-setup-support/delivery/provenance-delivery-foundation.json)
also preserves the two-new-document formatter edit and
`git --no-optional-locks diff --check` (**exit 0**). The latter checks the tracked
diff; the delivery verifier separately checks authored-document/driver whitespace.

Final document/link/privacy/JSON/format/ignore checks and post-archive
scope reconciliation are kept under [delivery records](ci-dag-05-checkout-setup-support/delivery/).
Their exact captured file sets and fingerprints, not this paragraph, define each
observation's coverage. Records and curated copies are written after capture:
no manifest/result claims to hash itself or later additions. Immutable historical
streams/snapshots retain diagnostic whitespace and are not reformatted.

Still unverified or unresolved:

1. **Positive full native short-root execution and Node-20 execution compatibility.**
   Deep checkout-local fixtures exceed the production root budget and exercise
   transfer/ownership subroutines separately. Native over-budget rejection and
   modeled arithmetic/action/shell bindings are not production-root success.
2. **Runner/hosted behavior:** actual runtime, post registration/order, cache/tool
   posts, cancellation, original checkout cleanup, source setup, artifact service
   and scheduler behavior are unauthorized/unobserved. Intended post order is not
   certified by `node20` metadata or modeled fixtures.
3. **R1 independent acceptance and R2 disposition:** the
   [R2 investigation](ci-dag-05-r2-investigation.md) remains unresolved, including
   original cause, focused abort failure, observer timing neutrality and incomplete
   packed-consumer result. The package allowance is spent; nothing here supplies
   another package result or resolves R2.
4. **R3/live rollout/required-check/billing evidence and maintainer decisions** remain
   unavailable. No repository-settings or hosted action was authorized.

Stop idle for coordinator reconciliation of this new delivery/support and a
fresh non-implementer review. Only the coordinator may update task/status/index/
coordination records. Local setup delivery is **not CI-DAG-05 acceptance** and does
not authorize another test/build/resource/package/hosted invocation.
