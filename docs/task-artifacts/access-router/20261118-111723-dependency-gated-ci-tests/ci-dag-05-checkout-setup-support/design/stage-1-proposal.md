# CI-DAG-05 short-real-checkout setup: stage-1 proposal

Prepared on 2026-11-19. Preflight refreshed at **2026-11-19T11:01:43.040348+00:00**;
final read-only fingerprint reconciliation at **2026-11-19T11:11:55.049895+00:00**.

**Deliverable: design only, awaiting coordinator confirmation in this session.**
The independent-short-checkout approach below is a recommended candidate, not an
approved implementation or a verified runtime result. No implementation,
validator, installation, source-materialization operation, resource, package
script, hosted work or delegation ran in stage 1.

Authority: `docs/tasks/20261118-111723-dependency-gated-ci-tests.md`, CI-DAG-05's
subsequent setup authorization and execution restriction, and
`docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-05-checkout-setup-handoff.md`.
The coordinator alone owns task/status/index/coordination records. Stage 1 may
write only ignored preflight/design notes; these notes therefore remain in scratch.

## 1. Protected preflight and findings

- `preflight.json` SHA-256:
  `2d7e808826ce5a6de639593070944453ee0c2b1cb20a7d5cbec6125a903a91a8`.
- The refreshed fingerprint observation reproduces all **2,581 protected regular
  files**, their bytes and modes: **2,576 at 0644 / five at 0755**. No changed,
  missing, added git-listed or nonregular paths were observed. All ten named
  historical seals still match. This is preflight accounting, not a test result.
  An initial final seal comparison included `expectedSha256`/`matches` metadata
  in whole-dictionary equality and falsely reported ten mismatches. Comparing only
  filesystem `mode`/`bytes`/`sha256` confirms zero differences; the recorded
  fingerprint values are unchanged. This accounting correction is retained below
  the original observation in `stage-1-fingerprints.json`.
- `HEAD` remains `0fda5197c5b950e865af73681225c8bbf5533775`.
  Project refs remain SHA-256
  `40b660a3fac8ab8c4726e35449cc090b4913e64265d5c544ee187b48dbf3427b`
  using `git --no-optional-locks for-each-ref --format=%(objectname) %(refname)`.
  `git --no-optional-locks status --short` reproduces the same **26 inherited
  entries**. The earlier alternative status/ref serializations are not evidence
  of project changes.
- Scratch is ignored by `.gitignore:8:_tmp*`. The complete initial snapshot and
  refreshed observation are `_tmp-c5-setup-ozh7l6on/preflight.json` and
  `_tmp-c5-setup-ozh7l6on/stage-1-fingerprints.json` respectively.
- The local normalized real root measures **33 UTF-8 bytes**. The representative
  hosted root remains **modeled at 47 bytes**, not observed. A modeled 32-byte
  real parent plus `/c` yields 34 bytes; its compact resource suffix adds 11,
  yielding 45. No sibling was created or tested here.
- R1 must stay unchanged: 107-byte pathname budget minus 40 fixed bytes minus
  22 pinned-native-engine UUID bytes leaves **45 TMPDIR / 34 real-root bytes**.
  Its native Node/V8/BroadcastChannel guards and archived fingerprints are not
  replaced by this arithmetic or by new fixture tests.
- Pinned checkout confines its `path` input to the original workspace. Existing
  helpers derive their source root from `import.meta.url`; changing shell cwd
  while executing original helper files is insufficient.
- Pinned pnpm reads the original workspace's `.npmrc` and recursively recreates
  its managed `dest`. Neither is redirected by shell cwd or manifest input.
  Current root `.npmrc` and `.gitattributes` are absent. Pinned setup-node's
  `package-manager-cache: false`, with no explicit cache, prevents its implicit
  package-manager-field lookup; that source-inspection question is resolved.
- The current result test at `scripts/ci-test-results.test.mjs:525,531-534`
  freezes package step position and aggregate shell metadata. The proposed
  explicit root binding needs a separately approved, test-only fixture amendment.

## 2. Recommended runtime shape

Keep the existing original checkout exactly as pinned:
`actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, with the unchanged
`${{ github.sha }}` selection on every main job. Do not supply a new checkout
`path`, change event/merge semantics, alter action resolution, or overwrite any
`GITHUB_*` / `RUNNER_*` variable.

Immediately after that checkout, add one **top-level** local action, with step
ID `source`, at `./.github/actions/ci-checkout`. It independently materializes the
selected committed source into the fixed real sibling `c` under
`dirname(GITHUB_WORKSPACE)`. Do not assume a `runner.workspace` context or a
`RUNNER_WORKSPACE` variable. Always use this independent candidate; do not add an
original-root reuse branch, alternative sibling search, retry or external fallback.

The dependency-free action would declare `using: node20`, `main: index.mjs`,
`post: index.mjs`, `post-if: always()`. Main/post dispatch uses generated action
state, not a user path/budget flag. Code uses only Node-20-compatible built-ins:
no install, transpilation, YAML dependency, `import.meta.dirname`, or newer-only
filesystem APIs. This runtime is the bootstrap contract, **not** the project
runtime: project Node remains 26.12.1 and pnpm remains 11.18.0. Actionlint 1.7.7
recognizes local JavaScript actions using `node20` but rejects `node24`; do not
upgrade or bypass that validator. The actual runner-selected action runtime is
unobserved and must not be claimed from metadata alone.

### Selection and ownership

1. Require normalized absolute Linux paths with no NUL/CR/LF, real directories,
   and no symlink component in the original root or its parent. Require the
   original `.git` to be a real directory, not a gitfile/linked worktree, with
   regular, nonsymlinked HEAD/index inputs. Reject malformed inputs, an unexpected
   HEAD, unsupported object format or ambient repository-routing/config overrides
   before publishing outputs. Reject any original root `.npmrc` by path/presence
   before source-content reads or transfer; never inspect its contents.
2. Support only the original root's real parent, owned by the action uid and not
   group/world-writable; reject a filesystem-root parent or an unsupported runner
   shape. Measure the normalized candidate with native `Buffer.byteLength`.
   Require at most **34 UTF-8 bytes**. Do not accept a lexical alias for a longer
   real path. Recheck parent/root identity after allocation.
3. Claim exactly `parent/c` using nonrecursive, exclusive mkdir, initially 0700.
   Any existing file, directory, symlink or dangling link is a collision: stop,
   without inspecting it for reuse, deleting it or selecting a different name.
4. Record parent/root device+inode and a generated ownership witness in the new
   `.git`, with private action state. Register state as allocations occur; publish
   no usable checkout outputs until all source and isolation checks succeed.
5. Allocate an owned compact `_tmpXXXXXX` child for bootstrap/main temporary work
   and a separate, fresh ignored `_tmp-pnpm-*` child for pnpm's managed installer
   destination. Verify committed ignore rules actually cover them. Native
   measurement of the compact child must be at most 45 bytes. Do not put resource
   mutable state in the pnpm destination or in an external directory.

The bootstrap's 34-byte constant is cross-checked in maintained tests against
unchanged R1's `resourceTmpdirMaxBytes - 11`. There is no CLI/environment budget
override and no R1 refactor.

### Exact, credential-free source operation

The preferred transfer is **selected commit + complete tree/blob closure**, not a
filesystem copy, local clone, worktree, bundle of unrelated refs, copied `.git`,
alternate object database or hardlink optimization.

1. Check the original detached HEAD against the unchanged expected 40-hex
   `GITHUB_SHA`. Use a freshly initialized SHA-1 `.git` with empty templates and
   generated neutral configuration for all bootstrap Git subprocesses. Never use
   or copy the original `.git/config`, auth headers, remotes, hooks, reflogs,
   packed refs, private excludes or credentials.
2. Read original objects through a narrowly scoped, read-only
   `GIT_OBJECT_DIRECTORY` in that sterile Git view. An original index may be read
   through `GIT_INDEX_FILE` only for inspection; never copy it or use that setting
   for a write. Scrub inherited `GIT_*` injection/tracing for these subprocesses,
   disable replace/graft behavior and network protocols, and reject object
   alternates, symlinked object storage or missing/promisor objects. These producer
   settings are never persisted in the selected repository or exported to other
   actions; all destination commands use its independent objects.
3. Enumerate the selected raw commit/tree closure, using NUL-delimited paths and
   fixed-format object IDs. Reject symlinks, gitlinks/submodules, nonregular source,
   unsafe/duplicate/traversing paths and unsupported modes. Reject a root `.npmrc`
   tree entry before reading or packing its blob. Compare every original source
   file's raw bytes and executable mode with that tree. Require the original
   index to match it at stage zero, without hidden skip/assume-unchanged states.
   Reject dirty source and extra worktree entries, including ignored installed
   dependencies, caches or generated outputs; none is eligible for transfer.
4. Feed only the explicit commit/tree/blob object IDs to `pack-objects --stdout`
   with object/delta reuse and delta construction disabled. No revision traversal,
   thin pack, history fetch, shared hardlink or source metadata copy is permitted.
   Check both producer and consumer exit statuses; partial/broken transfer fails.
5. Generate the selected repository's own shallow boundary containing exactly the
   selected SHA, and import with `index-pack --stdin --fsck-objects`. After import,
   generate its detached HEAD at that SHA, then run
   `git fsck --strict --full --no-reflogs` against it and the shallow boundary.
   Raw commit parent/merge lines stay byte-for-byte intact;
   shallow traversal omits unavailable parents, without inventing a new commit.
   Object checking during import and strict connectivity after import are separate
   obligations, not a waiver of strict validation.
6. Materialize files from the **destination** blobs using exclusive, no-follow
   regular-file writes and explicit 0644/0755 modes; create/recheck real parents.
   Populate a new index from the selected tree and verify its detached HEAD.
   Do not invoke worktree filters, smudge, checkout hooks, submodule updates or
   autocrlf to produce different source bytes.
7. Recheck both original and selected raw source against the committed tree,
   exact SHA/index/modes/lock/config, clean Git state and distinct file/object
   inodes. Selected regular files must not be shared hardlinks. Assert absence of
   copied credentials, remotes, alternates, hooks and installed/generated state.
   Only the specifically owned ignored temporary children are allowed in addition
   to the source. Pin files must exist and match the selected committed objects.

**Unverified design question:** selected-only shallow import/connectivity needs a
real local fixture result before this operation is accepted. Git 2.43 source/docs
support the distinction between `--fsck-objects`, strict link walking and shallow
parent suppression; this inspection is not a successful materialization. If the
strict final check fails, stop and return the failure. Do not silently weaken it,
copy history/private metadata, fetch, retry or add a budget bypass.

### Failure and post-job cleanup

Ordinary main failures clean only newly owned allocations. The post action checks
saved path relationships, the real parent/root/.git identities and ownership
witness before deletion. Missing, malformed, replaced or mismatched ownership is
a failure requiring retention, not permission to delete an existing target.
Never scan/delete other siblings, old scratch, the original checkout or another
run's collision. Cleanup may unlink owned dependency symlinks without following
them; source/root symlinks are never accepted. The supported parent is job-owned,
not an adversarial shared writable location; inode checks are not a proof against
arbitrary hostile races or hard runner termination.

Place this action at top level before setup/cache actions. Inspected runner source
registers posts on a LIFO stack: the intended order is later cache/tool posts,
then short-checkout cleanup, then the original checkout's unchanged cleanup.
There is **no final composite shell deletion**, which could remove cache inputs
too early. Registration/order and hard-cancellation cleanup remain V6 questions,
not a hosted guarantee from local mocks or source inspection.

## 3. Explicit bindings and installer boundary

The action exposes four verified outputs, with no defaults or public root override:
`root`, `relative-root`, `tmpdir`, `pnpm-dest`. `relative-root` must resolve from
the original workspace to exactly the verified sibling, normally `../c`.

| Consumer | Required binding |
| --- | --- |
| Main setup/prepare/test composite call | Required `checkout-root`, `checkout-relative`, `pnpm-dest` inputs from `steps.source.outputs`; `TMPDIR` explicitly from its `tmpdir` output |
| Nested setup call in prepare/test | Forward those three required inputs unchanged; inherit that explicit temporary environment |
| setup-node version-file input | `${{ inputs.checkout-relative }}/.tool-versions`; retain the pin, `package-manager-cache: false`, and no explicit cache |
| pnpm manifest/destination inputs | `${{ inputs.checkout-relative }}/package.json` and `${{ inputs.pnpm-dest }}`; retain pin, `run_install: false`, `cache: false` |
| Frozen install and tool helper | Explicit `working-directory: ${{ inputs.checkout-root }}`; keep existing complete argv |
| Prepare/build/archive, restore, resource and complete-test helper shell steps | Same explicit selected-root cwd, so relative `scripts/*` executes the selected module, not an original-workspace copy |
| ci-validate's group/CI checks | Explicit `working-directory: ${{ steps.source.outputs.root }}` and `TMPDIR` from `source` |
| unit-test evaluation | Same explicit root/TMPDIR binding; unchanged result command, needs, `always()` and `CI_TEST_NEEDS` payload |
| Artifact download | Unchanged `${{ runner.temp }}/ci-test-artifacts`, exact name/digest/run/attempt/SHA verification |
| Browser/Mongo caches and resource scratch | Existing helper outputs derived from the selected module/root; R1 creates and verifies its separate fresh compact resource TMPDIR |

**Installer decision requiring confirmation:** runner-managed JavaScript action
execution remains in the original action workspace. Their version/config pin
inputs are selected-relative; absolute inputs are not an escape from the pinned
actions' `path.join(GITHUB_WORKSPACE, input)` behavior. setup-node's built-in
version diagnostics still launch there. That is not a project install, build,
resource, test or evaluation command. Requiring even these diagnostics to use the
selected cwd would need a different design, not an undocumented cwd claim.

The pinned pnpm self-installer launches its bundled installation in its explicit
managed `dest`, not as a project install. That destination is a newly owned,
isolated selected-root child; its known remove/recreate behavior is permitted only
for that child, never an existing home/tool-cache/worktree directory. Its original
workspace `.npmrc` read cannot be redirected by the inputs. Therefore fail closed
if root `.npmrc` exists: reject the original path and committed tree entry before
source reads/transfer, and recheck both lookup locations immediately before the
installer. Do not read/copy its potentially credentialed contents or silently
support it. Future committed `.npmrc` support requires a new reviewed design. The
current absence is an observed prerequisite, not an assumption about all future
checkouts.

All existing tool provisioning, package installation, cache and artifact-service
network behavior remains distinct from the source transfer. Shortening source
requires **no new Git/network/authenticated fetch**. No reserved variable changes
or original-workspace project command are authorized by this installer boundary.

## 4. Smallest intended file scope

**Twelve maintained files**, contingent on confirmation; only scratch notes have
actually changed in stage 1.

| File | Intended change |
| --- | --- |
| `.github/actions/ci-checkout/action.yml` (new) | Strict dependency-free main/post metadata and four outputs |
| `.github/actions/ci-checkout/index.mjs` (new) | Node-20-compatible selection, source transfer, ownership and cleanup helper |
| `scripts/ci-test-checkout.test.mjs` (new) | Maintained budget/source/ownership/action-boundary regressions |
| `.github/workflows/test.yml` | Insert `source` immediately after original checkout on 28 main jobs; bind outputs/inputs/TMPDIR/cwd |
| `.github/actions/ci-setup/action.yml` | Required selected inputs, explicit file/dest lookups and shell cwd |
| `.github/actions/ci-prepare/action.yml` | Forward selected inputs and explicitly bind prepare cwd |
| `.github/actions/ci-test/action.yml` | Forward selected inputs and explicitly bind restore/test cwd |
| `scripts/ci-test-plan.mjs` | Main-step/helper metadata contracts only; read/strictly validate all four local actions |
| `scripts/ci-test-plan.test.mjs` | Independent updated fixtures, root-binding/metadata mutations, unchanged graph checks and approved root-script expectation |
| `package.json` (**amendment approval needed**) | Add exactly one maintained test filename to `test:ci:check` |
| `scripts/ci-test-results.test.mjs` (**test-only amendment approval needed**) | Adapt only its two wiring assertions to the inserted source step and explicit aggregate cwd/TMPDIR |
| `README.md` | Explain supported real-parent setup, early rejection, unchanged budgets and unverified hosted lifecycle/rollout prerequisites |

Strict metadata coverage must include the new JavaScript action's exact output
names and `runs` keys/runtime/main/post/post-if. Keep the three composites'
required input/output/step checks exact. Missing source metadata, original-relative
pin files, dropped forwarding/cwd/TMPDIR, altered pins, weakened post conditions,
fallback paths, caching or extra setup steps must fail the mandatory checker.
Do not add a generic action/path exemption or legacy option.

Preserve all **31 jobs**, 25 static complete package scripts, exact needs edges,
runtime-to-starter fixture gate, fail-closed **27-result** aggregate and independent
lanes. Do not modify graph/evaluator code, worker/rebuild/multi-instance behavior,
package metadata/scripts/lockfiles, shared legacy setup, R1 source/tests/seals,
attestation source/tests/evidence or coordinator/historical records. The root
script and the two result-test assertions are requests, not currently owned edits.

After stage-2 approval, delivery would add only the new
`docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-05-checkout-setup.md`
and a fresh `ci-dag-05-checkout-setup-support/` directory in that same bundle.
Curate the proposal/preflight, final diffs/fingerprints, red/green observations and
necessary sanitized fixture/validator evidence. No existing handoff/index/status
file or seal would be edited; no entire scratch/cache/dependency tree would be
copied. Durable preservation is deferred solely by the stage-1 scratch-only rule.

## 5. Explicit amendment requests

**A. Root validation wiring.** Insert only
`scripts/ci-test-checkout.test.mjs` in the existing serial Node test list, keeping
both following commands and the mandatory final active-workflow check unchanged:

```text
node --test --test-concurrency=1 scripts/ci-test-plan.test.mjs scripts/ci-test-artifacts.test.mjs scripts/ci-test-workspace.test.mjs scripts/ci-test-results.test.mjs scripts/ci-test-checkout.test.mjs && node scripts/ci-test-plan.mjs --check && node scripts/ci-test-plan.mjs --check-workflow .github/workflows/test.yml
```

Synchronize the exact assertion at `scripts/ci-test-plan.test.mjs:1771-1780`.
No dependency, lock, package-manager, other root script or package script change.

**B. Result-test wiring only.** At the inspected package-position assertion,
assert the new `source` step at index 1 and the existing complete test step at
index 2. Extend the existing aggregate last-step deep equality with exactly the
selected-root `working-directory` and `TMPDIR` binding. Retain its result command,
`CI_TEST_NEEDS`, 31-job/27-needs/graph/independent-lane assertions and every result
failure/cancellation/missing/skipped-state test. No evaluator/gate logic change,
dropped test, broad expectation relaxation or new result-policy behavior.

**C. Stage-2 boundary.** Confirm the candidate, Node-20 metadata/bootstrap boundary,
documented installer diagnostics/.npmrc rejection and these exact amendments before
implementation. Confirm fixture-only source-operation investigation plus the
focused serial checks below; it does not authorize package/resource/full-workspace
execution, project ref changes, commit/push/dispatch/settings or hosted work.

## 6. Maintained regression and verification plan — not run

| Evidence class | Required behavior and limits |
| --- | --- |
| Behavior-based red wiring | Before production edits, new focused regressions observe the inherited original pin lookups/default shell root and missing source/post metadata; selected-root expectations fail. Retain exact red failures. A missing-module/import failure alone is not the behavioral red evidence. |
| Native arithmetic on modeled strings | Representative 47-to-34 calculation; 34 accepted/35 rejected; multibyte boundaries; normalization/NUL/CR/LF errors; 45 TMPDIR and unchanged 40+22/R1 cross-check. Modeled paths are never reported as created real roots. |
| Modeled action/command bindings | Independent YAML fixtures and mutations cover all 28 main jobs/four actions. Harmless shell/module sentinels and mocked installers record effective cwd, selected module origin, joined pin paths, managed dest and TMPDIR. No real installer/package/helper resource execution. |
| Real filesystem/source fixtures | Ignored checkout-local fixtures exercise exact commit/tree/blob/modes/lock/config, empty/hidden/executable/UTF-8 files, merge-parent bytes, independent objects/inodes, clean index and unchanged original metadata/refs. Label these deep fixture paths separately from production root selection. |
| Fail-closed source/ownership | Wrong SHA, dirty/staged/extra/ignored source, symlink/gitfile/alternate/unsafe tree, collision, unsupported parent, malformed state and producer/import/fsck/write failure publish no checkout outputs and launch no tools/resources/tests. Existing targets remain byte-for-byte unchanged. Ownership mismatch refuses deletion. |
| Post lifecycle model | Validate top-level ordering, exact main/post metadata and private-state dispatch; cleanup only the owned root after modeled cache posts. This does not execute the real runner. |

Use exported source/ownership subroutines to test real deep fixtures independently
of the production selector. The full action must still reject an over-budget
native fixture path. Do not add `skipBudget`, a public environment switch, a fake
native byte length, a symlink alias or external scratch to claim full setup success.

The bounded materialization uncertainty is: **does selected-only independent
object import plus the generated shallow boundary pass strict object/connectivity
checks while preserving the exact merge commit/source/index and isolation?**
Prefer answering it within maintained fixture tests. If those cannot isolate the
Git behavior, request at most **one** separate fixture-only probe under a fresh
ignored repository-local `_tmp*`, with its absolute path as runtime `TMPDIR`.
Use synthetic local commits/config/credential sentinels, never real credentials,
the dirty working tree as a consumer, network, packages or resources. No second
probe or fallback operation is implied. Preserve the original failure if blocked.

After confirmation, run all affected lanes **serially**, from the repository root,
with fresh ignored checkout-local log/scratch and explicit runtime TMPDIR:

1. Focused behavior-based red tests before production edits; then focused green
   `node --test --test-concurrency=1 scripts/ci-test-checkout.test.mjs scripts/ci-test-plan.test.mjs`.
2. `pnpm test:ci:check`, including the approved new maintained test file and final
   real-workflow/four-action validation; then `pnpm test:groups:check`.
3. Targeted `pnpm exec eslint` on the new action module/test, plan module/test and
   approved result-test edits. Targeted `pnpm exec prettier --check --config-path
   .prettierrc` on the twelve affected files and new delivery/evidence documents.
   Preserve independent workflow blocks when correcting formatting; do not apply
   an indiscriminate whole-file rewrite.
4. `git diff --check`; `pre-commit run check-yaml --files .github/workflows/test.yml
   .github/actions/ci-checkout/action.yml .github/actions/ci-setup/action.yml
   .github/actions/ci-prepare/action.yml .github/actions/ci-test/action.yml`.
5. Previously checksum-pinned actionlint **1.7.7**, workflow input only:
   `actionlint -shellcheck= -pyflakes= .github/workflows/test.yml`.
   Release archive SHA-256 remains
   `023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757`.
   Use verified existing tooling; if unavailable, return the prerequisite or seek
   explicit tooling-install approval using the existing pinned procedure. Never
   substitute a newer validator or omit the new local-action metadata check.
6. Read-only final scope/hash/mode/ref reconciliation, privacy/reference review,
   and curated new evidence. Report commands, selected cases, counts, every retained
   failure and the final bytes actually checked. An unrun check stays unrun.

No new package execution (including focused lanes/packed consumers), resource
launch, dependency setup, full build, grouped suite or whole-repo lint is included.
Missing local prerequisites require a blocker/renewed authorization, not a silent
install or reuse of someone else's mutable scratch.

## 7. Remaining acceptance limits and stop point

- Stage 1 has **zero validator/runtime results**. The only new observations are
  read-only source/metadata inspection and protected-file fingerprints.
- Shallow transfer, full native short-root materialization, bootstrap-runtime
  compatibility and runner post execution have not been exercised. Mocked binding
  evidence and a deep real source fixture cannot certify a hosted short-root setup.
- Original pinned checkout cleanup, runner action-runtime substitution, cache posts,
  cancellation, artifact-service behavior and scheduler/UI need authorized V6.
- R1 is delivered/idle/reconciled, not independently accepted. Its old evidence
  would not attest to new setup bytes. R2's original cause, focused abort failure,
  observer timing neutrality and interrupted complete-package result remain
  unresolved; its package allowance is spent. R3 and maintainer rollout/risk/budget/
  required-check decisions remain blocked and unauthorized.
- Even a locally delivered setup awaits coordinator reconciliation and a fresh
  non-implementer corrective review; it is not CI-DAG-05 or rollout acceptance.

**Stop now.** Await coordinator confirmation of sections 2–5 and focused stage-2
verification scope in this same session. Do not implement, run checks, preserve
new durable files or delegate while awaiting that confirmation.

### Inspected public implementation references

- Checkout pin/input/main references are preserved in the authoritative setup
  handoff. Its original repository-path state remains the cleanup authority.
- [setup-node main](https://raw.githubusercontent.com/actions/setup-node/249970729cb0ef3589644e2896645e5dc5ba9c38/src/main.ts)
  and [utilities](https://raw.githubusercontent.com/actions/setup-node/249970729cb0ef3589644e2896645e5dc5ba9c38/src/util.ts).
- [pnpm self-installer](https://raw.githubusercontent.com/pnpm/action-setup/b906affcce14559ad1aafd4ab0e942779e9f58b1/src/install-pnpm/run.ts)
  and [main/post](https://raw.githubusercontent.com/pnpm/action-setup/b906affcce14559ad1aafd4ab0e942779e9f58b1/src/index.ts).
- [Git 2.43 shallow semantics](https://raw.githubusercontent.com/git/git/v2.43.0/Documentation/technical/shallow.txt),
  [pack-objects](https://raw.githubusercontent.com/git/git/v2.43.0/Documentation/git-pack-objects.txt),
  [index-pack](https://raw.githubusercontent.com/git/git/v2.43.0/builtin/index-pack.c)
  and [fsck](https://raw.githubusercontent.com/git/git/v2.43.0/fsck.c).
- [Runner post registration](https://raw.githubusercontent.com/actions/runner/v2.331.0/src/Runner.Worker/ExecutionContext.cs)
  and [Node action handler](https://raw.githubusercontent.com/actions/runner/v2.331.0/src/Runner.Worker/Handlers/NodeScriptActionHandler.cs).
- [Actionlint 1.7.7 local-action rule](https://raw.githubusercontent.com/rhysd/actionlint/v1.7.7/rule_action.go).

These are source-inspection references, not claims that the hosted runner uses
these exact runner/Git versions or that any action was executed.
