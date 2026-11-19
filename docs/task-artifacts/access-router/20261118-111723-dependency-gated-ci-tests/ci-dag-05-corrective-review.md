# CI-DAG-05 independent corrective review

**Verdict: CHANGES REQUIRED / BLOCKED.** R1's compact allocation and early
supported-depth guards are accepted within their pinned, native-random contract.
R2's bounded diagnostic surface is useful, but the original cause, focused abort
failure, observer timing risk and incomplete packed-consumer verification remain
undisposed. Setup's scoped source/ownership/wiring contracts pass local review;
positive full native-root, Node-20 and actual runner main/post acceptance do not.
A fresh formatting check also fails on `.github/workflows/test.yml`. This is not
CI-DAG-05 completion, hosted certification or rollout authorization.

Created: **2026-11-19T17:28:19.671755+00:00**. Reviewer alias:
**CI-DAG-05 fresh corrective-review session**. Related:
[authoritative task](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-05-verify-rollout-measure-tradeoffs-and-update-testing-guidance),
[launch assignment](ci-dag-05-corrective-review-assignment.json),
[review handoff](ci-dag-05-corrective-review-handoff.md),
[unchanged historical review](ci-dag-05-finishing-review.md), and
[new review support](ci-dag-05-corrective-review-support/README.md).

## Independence and execution boundary

- The separate launch record confirms a fresh non-implementer reviewer after
  R1/R2/setup idle delivery and coordinator reconciliation. This reviewer did not
  implement that work or delegate. The record's actual launch is
  `2026-11-19T14:56:47.674093+00:00`; earlier frozen “pending/unassigned” wording is
  historical, not drift or evidence that this review was already accepted.
- Reviewed task requirements 7/8/9, inherited finishing findings, actual source and
  callers, exact delivery diffs, maintained regressions, archives, original saved
  observations and coordinator records. The installed-package skill was applied
  only to the relevant R2 consumer boundary, not a broad package review.
- Own only this new report, new `ci-dag-05-corrective-review-support/` files and
  reviewer scratch. No implementation, task/status/handoff/index, earlier report
  or historical evidence was edited. The coordinator alone owns reconciliation
  and subsequent shared status updates.
- All six fresh static/validation/quality commands ran once, serially. The one
  `pnpm test:ci:check` and one `pnpm test:groups:check` allowances are spent.
  Maintained synthetic checkout fixtures ran only inside the authorized CI
  validator; their local Git/ownership subroutines are not standalone production
  source or runner probes. Separate report/support-only closure checks are recorded
  in the delivery check, not added to the maintained-test totals.
- No additional package/focused/pack/consumer execution, workspace build/full
  suite, resource launch, native short-root/Node-20/runner probe, installation,
  fetch, production history/config/ref change, hosted run, commit, push,
  publication or settings change was performed. Existing executable tooling was
  used; actionlint provenance was verified locally before its invocation.
- Commands ran from the repository root. Runtime `TMPDIR` was the absolute path
  of ignored reviewer scratch `_tmp-c5cr-5m91q69w/`, recorded below with
  `'<repo-root>'` placeholders. Historical scratch paths identify inspected
  observations, not archive-only execution prerequisites.

## Exact inputs and protected scope

[Inputs](ci-dag-05-corrective-review-support/inputs.json) records all **24 corrective
maintained fingerprints**, relevant controls and delivery-document hashes.
The unchanged [immutable snapshot](ci-dag-05-corrective-review-inputs.json)
contains the complete **2,771 protected regular-file** table and **33 historical
seals**, including expressly sealed ignored originals. SHA-256 identifies bytes,
not a signature or runtime certification.

- Snapshot: **610,017 bytes**, mode **0644**, SHA-256
  `ad378fec69c87bb1b750c9f1bb3b47b23861ebf4f1d40a3aabb9ebe4678ef696`.
- Canonical protected files-table SHA-256:
  `0ff69a3db18fc13dbebe0107f4dc3dc03151520dd1a263da180feee31c56a7c2`.
- `HEAD`: `0fda5197c5b950e865af73681225c8bbf5533775`; refs SHA-256:
  `40b660a3fac8ab8c4726e35449cc090b4913e64265d5c544ee187b48dbf3427b`.
- Launch-assignment SHA-256:
  `697c18c1d6085870b8187eed4b0b8cc6ee915f9fd70f1b9ccd54ad8994d1cce1`.
  This separately permitted record is outside the snapshot table.
- Readiness source/archive SHA-256:
  `ca8e25a8f3ddc19b6ec76b355a5125795368f21da1977a587d26a091c30dccfa`.
  Readiness's two retained failures and historical four-entry manifest
  formatting-only exception are not a formatter pass for maintained code.

Initial matching and all **52 inventory checks before report creation** passed;
support-finalization entry/resume and the closing inventory also passed, totaling
**55 inventory records at that closing capture**. Every fresh command independently
matched the snapshot before and after execution, including
the 24 maintained fingerprints; all six reported unchanged inputs. Nonregular
inventory, Git status, HEAD/refs and both readiness/driver source/archive pairs
also matched. The separate closing inventory and deliverable-only checks are
preserved in
[closing integrity](ci-dag-05-corrective-review-support/closing-integrity.json) and
[delivery check](ci-dag-05-corrective-review-support/delivery-check.json).
Delivery formatting selects only the seven new Markdown/JSON files, excluding the
two complete failure streams; content/links/privacy checks cover all nine new files.
Ignored dependency/build/cache state is **not** inventoried.

Scope reconciliation distinguishes stages rather than comparing every historical
record directly with today's coordinator documents:

- R1: exactly five delivery changes; **2,531/2,536** preflight originals unchanged
  at that delivery. Four later coordinator-document changes are separate.
- R2: exactly eight maintained test/fixture paths; **24 production source files
  unchanged**. No production retry fix is delivered.
- Setup: **10 maintained edits + three new files**. Its sole R1-test change is
  `ciActions.source` at `scripts/ci-test-workspace.test.mjs:194`; every remaining
  byte/mode matches the protected preimage. Exactly two approved result-test
  wiring replacements reconcile; the production evaluator is unchanged.
- Setup's historical four coordinator-document changes and **2,568** unchanged
  originals are not today's seven coordinator-document changes and **2,565**
  unchanged originals. Neither accounting implies implementation scope growth.

## Per-finding acceptance

### R1 — ACCEPTED for the scoped supported-depth correction

References: [delivery](ci-dag-05-r1-remediation.md),
[support](ci-dag-05-r1-support/README.md),
`scripts/ci-test-artifacts.mjs:270-275`, and
`scripts/ci-test-workspace.mjs:44-68,191-220,334-351,505-554`.

- Resource scratch is now fresh checkout-local `_tmpXXXXXX`, itself the child's
  `TMPDIR`, with no extra `/tmp` child, alias or external fallback. Real-directory,
  isolation and ignore checks remain; only browser/binary children are cached.
- The normalized absolute UTF-8 guard reserves **40 fixed + 22 UUID bytes** from
  Linux's 107-byte pathname capacity: maximum **45-byte `TMPDIR`**, hence maximum
  **34-byte real checkout root** for this allocation. ASCII/UTF-8 maximum and
  one-over, malformed measurement, early rejection and runner-failure contracts
  are maintained and included in fresh CI validation.
- The inspected pinned derivation concerns native `k / 2**53` random values on
  Node **26.12.1**, V8 **14.6.202.34-node.40**, and BroadcastChannel **7.4.0** as
  resolved through RxDB. Its radix-conversion analysis supports at most 21 token
  digits, with 22 reserved. It is not a bound for arbitrary finite Numbers,
  replaced randomness or an unreviewed Node/BroadcastChannel upgrade.
- `restoreWorkspace` performs read-only identity/archive context validation
  before the budget guard, but guards **before allocation, package resolution,
  resource probes and compiled-output restore**. Resolution guards before resource
  configuration; preparation guards before resource commands. The run path keeps
  restored-output/identity checks and dispatches the unchanged complete script
  only after successful resource preparation. The programmatic byte-measurement
  seam is not a CLI/environment override.

Saved evidence independently reconciles **134 helper / 326 CI / 18 group passes**
and the maintained red-before result **50 passed / one failed**, not a passing
baseline. Two transport-probe teardown failures remain **exit 101**. The corrected
disposable controller closes the sender before awaiting receiver exit; its saved
success used a **33-byte real root / 44-byte `TMPDIR`**, **95/94-byte sockets** and
one delivery, with zero resource/package commands. It proves that transport
observation, **not RxDB database/full-script or hosted success**.

Formatter reconstruction matches the four helper preimages. It does **not**
establish formatting-only provenance for the earlier README hash
`ab328da8c1754fe317565b1929b7835e695189aa672e3fc3afc5a7c824fdb7c9`
versus delivered R1 README
`4149b5dfdc5c13afea2a2e070bd5dec5c057e8390bde41dc7d2a9f2634bc66a4`.
The separate implementation delta reconstructs that delivered README. Today's
README includes later authorized setup guidance and has its own input fingerprint.

**Boundary:** this accepts the allocation/rejection contract, not full native-root
execution. The calculated representative original hosted root is **47 bytes**,
which would require **58-byte `TMPDIR`** and is intentionally rejected. Setup is a
separate correction; R1's old transport success does not certify it.

### R2 — diagnostic surface accepted narrowly; cause/fix/risk acceptance withheld

References: [investigation](ci-dag-05-r2-investigation.md),
[support](ci-dag-05-r2-support/README.md),
`packages/express-request-attestation/src/attested-fetch.ts:647-796`,
`test-packed-consumer/consumer/installed-browser-observer.mjs:60-188`, and
`test/installed-browser-harness.ts:327-468` within that package.

The original `_tmp-ci-dag-05-v5-bzejoa/v5-grouped.log:388-435` expected
`[403, 200]` and got `[403]`, with a readable CORS `stale-key` marker, one
discovery/rotation, zero business effects and **535 ms**, versus the **5000-ms**
default. This does not support missing header exposure or elapsed default timeout
as the explanation. The original retry-preparation exception was not retained.
Production can preserve the first response on replacement load, invalidation,
sign/header/request-preparation failure or repeated envelope; retry transport
errors instead reject. A controlled matching sign/preparation phenotype is a
possible cause, not evidence identifying the historical one.

The delivered diagnostics satisfy the inspected bounded-data contract:

- Browser events cap at **32**, native events at **64**, with dropped counters.
  Exported error names/codes, resource/method/failure classes, status/marker,
  ownership booleans and same-proof identity booleans are allowlisted/bounded.
  No raw cookies, key/proof bytes, URLs, private IDs or arbitrary error messages
  are added to those diagnostic payloads. Proof identity is retained internally
  until disposal, not exported as proof material.
- Native Fetch/import are not replaced by the observer. Receiver and argument
  mapping, original thrown/rejected errors, native sign-promise identity and
  response/body ownership are preserved in the inspected paths. Opt-in causal
  fault controls are separate from the observation facade.
- Shared source load promises map to one observed reaction and frozen signer
  facade. **Source load/signer identity is changed**, and an additional reaction
  can change microtask ordering. Equivalence within the facade is not timing
  neutrality relative to the unobserved client.
- The harness only observes native request/response/failure events. Its failure
  path attempts a bounded browser diagnostic read and a server report, wraps the
  original failure as cause, and still closes browser/server in `finally`; it
  neither retries the request nor converts scenario failure to success. Added
  observation/failure collection work is not a runtime-equivalence proof.

Fresh syntax/structural comparison parsed all eight R2 files, matched five
preimages and retained **all 239 original expect chains in order**: fetch-client
**111 → 111**, packed-consumer **128 → 184**. Existing fetch-client statements
remain after only two registrations; `browserScenarios` is unchanged. The new
diagnostic-case file contains **70 expect chains**. Surrounding runtime behavior
does not follow from assertion retention. No nonexistent
`ci-dag-05-r2-support/retained-assertions.json` is used as evidence.

**Unresolved acceptance blockers:**

1. Original causality remains unknown; no confirmed production fix with a
   historical red-before/green-after regression exists.
2. The saved focused abort run remains **104 passed / one failed / 91 skipped**,
   versus byte-verified baseline **105 passed / 76 skipped**. At
   `test/fetch-ownership.cases.ts:793`, after **508 ms**, the expected rejected
   observation was `undefined`. Observer cases were skipped in that selection;
   neither observer causation nor harmlessness is established.
3. Observer timing neutrality remains unverified, including shared-load mapping.
4. The sole complete-package invocation retains **633 Node / 62 Redis / 31 Mongo /
   141 browser passes**, but its packed-consumer completion/result and recorder
   JSON are absent. **120 seconds / exit 143 / SIGTERM** are separately attributed
   harness metadata, not an invented recorder result or a complete package pass.

Further package execution was unauthorized and not performed. Maintainer risk
disposition or separately authorized investigation is required; green repeats
cannot substitute for it.

### Setup — local contracts accepted; requirement 9 runtime acceptance incomplete

References: [handoff](ci-dag-05-checkout-setup-handoff.md),
[delivery](ci-dag-05-checkout-setup.md),
[support](ci-dag-05-checkout-setup-support/README.md),
`.github/actions/ci-checkout/index.mjs:105-123,283-330,586-681,692-792`, and
`.github/actions/ci-setup/action.yml`.

- The only selection is an exclusively owned, real sibling
  `dirname(GITHUB_WORKSPACE)/c`, emitting only selected-relative `../c`. Native
  budget selection precedes claim/transfer in `runMain`; deep fixtures can call
  ownership/transfer subroutines programmatically but cannot override the CLI or
  environment budget. Aliases, external-temp fallback, collisions, unsafe
  ownership and over-budget UTF-8 parents remain rejected.
- Selected materialization transfers exactly the selected event SHA-1 closure
  into generated credential-free `.git`, not original history/configuration,
  remotes, credentials, alternates, hooks, reflogs, shared objects or hardlinks.
  Index/worktree/object identity and selected shallow boundary remain checked.
  `index-pack --fsck-objects` and `fsck --strict --full --no-reflogs` remain strict;
  rejected shallow/connectivity fixtures are not retried, fetched or weakened.
- Installer pins are selected-relative. Ownership and `.npmrc` checks execute
  immediately before pnpm setup; its destination is an empty owned child.
  Installation/tool/test shells bind the selected root and owned temporary path.
  Original `GITHUB_*`/`RUNNER_*` meaning and original action resolution remain
  unchanged. Main/post metadata uses the same bootstrap with `post-if: always()`;
  cleanup is witness/ownership checked, including partial-failure handling.
- The **31 job IDs/order/metadata**, trigger/independent raw blocks, all **25 full
  scripts/rebuilds/worker limits**, **26 declared + one runtime-to-starter gate**,
  and fail-closed **27-result `unit-test`** remain intact. The two approved
  result-test amendments change only expected source/checker wiring. No matrix
  barrier, main-path fail-fast, concurrency cap, reduced filter or success-by-skip
  was introduced.

Independent saved reconciliation matched **169 files / 57 JSON / 162 archive
entries / 156 originals / 64 raw outputs**, all **35 serial observations** and
all **11 nonzero results**. The misleadingly named `checkout-green` was
**204 passed / one failed**; the later **205** passes followed fixture-only filter
isolation without weakening the index-flags assertion. The helper result
**405 passed / one failed** preceded the approved sole R1-test source-list line.
Final saved integration is **611 CI / 18 group passes**, matched by fresh checks.
The earlier `lint-final` predates formatting; the four-file formatter correctly
records changed inputs. The distinct final fingerprint lint result, not that
earlier result, matches final bytes.

**Not satisfied:** positive full native short-root main execution, execution under
the action's **Node-20** runtime, and actual Actions main/post/installer/action-file
resolution behavior. Fresh validation ran under Node **26.12.1**. Deep local
subroutine success, modeled shell bindings and `using: node20` metadata cannot
satisfy those criteria. No standalone probe was authorized. This review accepts
the reviewed local contracts without declaring requirement 9 fully accepted.

### Q1 — CHANGES REQUIRED: maintained workflow formatting

The single fresh `pnpm exec prettier --check --config-path .prettierrc` selection
covered all **24 corrective maintained paths** and exited **1**, warning only for
`.github/workflows/test.yml` at SHA-256
`694a1798730ac2b9fd7253cf88d1e77e0773ea9b23f4d83c1a5b0a180cbcfb3c`.
[Retained stdout](ci-dag-05-corrective-review-support/maintained-prettier.stdout.log)
and [stderr](ci-dag-05-corrective-review-support/maintained-prettier.stderr.log)
preserve the failure: stderr is byte-exact; stdout's sole CRLF is normalized to LF,
with both byte counts/hashes recorded in support. No maintained edit or check retry
was made. Setup's historical successful Prettier selection excluded YAML, so it does
not contradict this failure.
No baseline execution establishes this as pre-existing; it is a current maintained
quality defect, not a demonstrated semantic workflow failure.

### R3 / final rollout — BLOCKED, unchanged acceptance boundary

Static/local preservation does not demonstrate live healthy new-DAG coverage,
fault/preparation/validation propagation, unrelated completion, cancellation,
missing/skipped-result handling, artifact-service identity or scheduling behavior.
The historical successful V5 log still reconciles **12 groups / 25 full scripts /
34 invocations / 689 file executions / 21,224 passes / one unchanged TODO**, SHA-256
`1b750bce5243882f4aec8fd8e344049100e49a5c795aea5fee9620420e782bf0`.
It used a different temporary allocation and does not recertify R1/R2/setup, cold
installation, current-revision artifacts or hosted execution. No suite was repeated.

Maintainer-authorized V6 evidence, existing required-check confirmation targeting
`unit-test`, comparable critical-path/workflow/queue/cache/resource measurements,
cost/concurrency observations and budget/risk decisions remain unavailable. Faster
local wall time is not lower billed usage. Branch-protection changes require
separate authorization. Coherent rollback remains the previous serial build plus
grouped job **with matching pre-migration validation wiring and guidance**, not a
YAML-only revert or active-check legacy bypass.

## Actual verification and retained review failures

[Checks](ci-dag-05-corrective-review-support/checks.json) records exact argv,
timestamps, selections/omissions, counts, stream hashes and excerpts. Each command
was invoked by the one-shot recorder as:

```sh
TMPDIR='<repo-root>/_tmp-c5cr-5m91q69w' python3 _tmp-c5cr-5m91q69w/run_review_check.py <label>
```

This is a historical template requiring the omitted scratch recorder and installed
dependencies; replace placeholders before any separately authorized use.

- `static-review`: exit **0**; eight R2 syntax parses/five preimages plus strict
  parsing of five touched YAML files and graph/evaluator/script preservation.
  Saved JSON captures **476** checks; stdout reports **482** because six metadata
  `fingerprint()` calls at driver lines 209-214 occur after the counter is captured.
  Neither is a runtime-test total. No static discrepancy remained.
- `ci-contract-check`: `pnpm test:ci:check`, **611 passed**, exit **0**,
  `17:04:48.002517–17:05:15.649092 UTC`.
- `group-validation-check`: subsequent `pnpm test:groups:check`, **18 passed**,
  exit **0**, `17:05:19.086015–17:05:23.136425 UTC`; validates **12 groups / 25
  workspaces**, not package execution.
- Both validators report **zero failed/cancelled/skipped/TODOs**. CI selected all
  five helper test files and both unchanged model/workflow checks; there was no
  fresh package/browser/database/consumer lane selection.
- `targeted-eslint`: all **17 corrective code paths**, exit **0**.
- `maintained-prettier`: all **24 maintained paths**, exit **1**, Q1 above.
- `verified-actionlint`: workflow only, exit **0**, with optional shellcheck and
  pyflakes **disabled**. The existing archive hash
  `023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757`
  and executable/member hash
  `9f7dedb4e23f89f2922073d1a6720405b7b520d4f5832ebb96f0d55a2958886c`
  matched locally, mode **0755**. No new network/signature verification or those
  disabled checks is claimed.

The read-only evidence audit has two distinct retained attempts in
[reconciliation](ci-dag-05-corrective-review-support/evidence-reconciliation.json):
attempt 1 **3,257 checks / exit 1 / seven discrepancies**, and corrected attempt 2
**3,507 checks / exit 0**. These were reviewer stage/diff/formatting assumptions,
not demonstrated implementation defects. Corrections distinguish historical versus
current scope, encoded formatter deltas, README provenance and pre/post-format
verification. No failed test/quality command or historical helper was repeated.
All meaningful historical failures remain distinguishable from later passes.

## Required coordinator / maintainer decisions

1. Reconcile this new report/support and protected scope before any shared status
   change; the historical finishing report stays sealed.
2. Obtain the owned workflow-format correction and appropriately scoped subsequent
   evidence. This reviewer cannot implement it or silently refresh reviewed inputs.
3. Dispose of the original R2 causal uncertainty, focused abort failure,
   observer-timing risk and incomplete packed-consumer verification. Further package
   execution requires renewed explicit authorization, not an assumed retry allowance.
4. Separately authorize the missing genuine native-root, Node-20 and runner
   main/post acceptance evidence without selector overrides, copied history/config,
   fetches, retries or weaker fsck. Local setup scope approval is already resolved;
   runtime acceptance is not.
5. Authorize hosted healthy/fault/preparation/validation/cancellation/missing/skipped
   evidence, required-check confirmation and comparable budget/risk measurements
   before final CI-DAG-05 rollout acceptance. Repository settings changes are separate.

**Review delivered; acceptance remains scoped as above. Stop idle for coordinator
reconciliation. No implementation or status update is authorized by this report.**
