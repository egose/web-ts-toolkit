# CI-DAG-05 saved local execution evidence

Coordinator reconciliation of the independent reviewer's saved runs, after a
provider usage limit interrupted its finishing review. This is local execution
evidence, **not independent finishing sign-off or live Actions certification**.
Related [handoff](ci-dag-05-handoff.md) and
[task](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-05-verify-rollout-measure-tradeoffs-and-update-testing-guidance).

A subsequent [fresh independent finishing review](ci-dag-05-finishing-review.md)
confirmed the saved accounting and returned **CHANGES REQUIRED/BLOCKED** for R1's
resource-helper socket-path budget. The coordinator ledger below preserves the
earlier reconciliation; its finishing-review addendum records that historical blocker.

**Current state:** the sequential R1/R2/setup implementations and fresh
non-implementer corrective review are delivered, idle and coordinator-reconciled.
The [corrective report](ci-dag-05-corrective-review.md) returns **CHANGES REQUIRED /
BLOCKED**, accepting only scoped R1 allocation/rejection, narrow diagnostics and
local setup contracts. Q1 workflow formatting, native/Node-20/runner acceptance,
unresolved R2 and R3 hosted/maintainer prerequisites remain. No setup/reviewer
assignment is pending and no R2 investigation is still running.

The [separate coordination record](ci-dag-05-remediation-coordination.md) and
[coordinator support](ci-dag-05-corrective-review-coordinator-support/README.md)
retain new results independently of this historical V5 ledger. Original runs,
coverage rows and log fingerprints are unchanged, not recertified by later review.
Current authorization is **saved-evidence reconciliation and coordinator
documentation only**. Reviewer CI/group allowances and R2's package allowance are
spent; correction/delegation, package/focused execution, source/native/runner probes,
runtime/tool installation and hosted work require renewed explicit authorization.
No commit/push/dispatch/publication/settings change or unjustified full-suite rerun
is authorized. Earlier remediation/scope-blocked statements describe their capture
times, not current permission.

## Provenance and limits

- Source: uncommitted working tree based on
  `0fda5197c5b950e865af73681225c8bbf5533775`.
- Each attempt used a fresh ignored repository-local scratch copy, with copied
  `node_modules` and scratch-local `TMPDIR`. Commands ran sequentially in each
  copy: `pnpm lint`, `pnpm build`, `pnpm test:grouped`. Numbered groups ran
  sequentially; members within one group ran concurrently under the maintained
  safety checker. No complete suite was rerun by the coordinator.
- Third copy: `_tmp-05c-G8SORQ/c`; logs were saved beside it. Coordinator compared
  **1,987 comparison files** against this copy: 1,976 tracked files outside
  `docs/`, excluding the root README/AGENTS, plus 11 new CI helper/composite files,
  with **zero byte differences**. Package-local documentation remains in that
  comparison; generated outputs and copied dependencies were excluded.
  The five CI-DAG-04 delivered-file fingerprints and eight
  CI-DAG-03 model/helper/composite fingerprints also matched accepted handoffs.
- Local Node `26.12.1` / pnpm `11.24.0`, Linux x64 / 16 logical CPUs. Browser,
  database and package caches were already available. Copying dependencies and
  rebuilding is not a cold independent install or a hosted runner/artifact restore.
  V5 did not capture comprehensive cache, environment, peak-memory or resource
  telemetry; no comparable hosted timing/cost claim follows.
- Raw logs, scratch copies, binaries, credentials, session metadata, caches and
  generated consumers are omitted. The snippets below replace the machine root
  with `<repo-root>`; that is a documentation placeholder, not an executable path.
  Original scratch contents are unchanged.

## Sequential attempts

| Attempt            | Lint exit / seconds | Build exit / seconds | Grouped exit / seconds | Outcome                                                              |
| ------------------ | ------------------- | -------------------- | ---------------------- | -------------------------------------------------------------------- |
| First              | 0 / 45              | 0 / 193              | 1 / 207                | Stopped in group 3: one attestation packed-browser assertion failed. |
| Second             | 0 / 37              | 0 / 179              | 1 / 251                | Stopped in group 4: overlong scratch Unix-socket paths.              |
| Third (short path) | 0 / 32              | 0 / 160              | 0 / 3,606              | All 12 groups and 25 complete workspace scripts finished.            |

Third run summary (saved process results):

```text
lint exit=0 elapsed_s=32 finished=2026-11-18T17:10:46-08:00
build exit=0 elapsed_s=160 finished=2026-11-18T17:13:26-08:00
grouped exit=0 elapsed_s=3606 finished=2026-11-18T18:13:32-08:00
ALL_OK finished=2026-11-18T18:13:32-08:00
```

### Third-run coverage ledger

Counts below sum Vitest summaries for each complete script. They are **execution
counts, not unique tests/files**: React lanes, client type tests and browser/node
runs may exercise the same files more than once. The root group's 18 checker
tests and compile-only phases are excluded. Every listed workspace logged `Done`;
the accounting includes pnpm's abbreviated `.../create-access-router-mongo-starter`
prefix, not just full `packages/` and `apps/` prefixes.

| Workspace (scope omitted)          | File executions passed | Test executions passed | TODO  | Vitest runs |
| ---------------------------------- | ---------------------- | ---------------------- | ----- | ----------- |
| utils                              | 17                     | 120                    | 0     | 1           |
| express-runtime                    | 11                     | 341                    | 0     | 1           |
| json-frame                         | 9                      | 531                    | 0     | 1           |
| http-errors                        | 2                      | 72                     | 0     | 1           |
| asset-inliner                      | 38                     | 772                    | 1     | 1           |
| express-request-attestation        | 24                     | 864                    | 0     | 5           |
| express-response-handler           | 8                      | 215                    | 0     | 1           |
| mongoose-rxdb                      | 45                     | 632                    | 0     | 1           |
| express-json-router                | 2                      | 44                     | 0     | 1           |
| express-oidc-vault                 | 43                     | 2,696                  | 0     | 1           |
| access-router                      | 232                    | 8,398                  | 0     | 1           |
| express-oidc-vault-memory-store    | 4                      | 179                    | 0     | 1           |
| access-router-deco                 | 23                     | 779                    | 0     | 1           |
| access-router-client               | 46                     | 964                    | 0     | 2           |
| express-oidc-vault-mongodb-store   | 8                      | 246                    | 0     | 1           |
| express-oidc-vault-redis-store     | 12                     | 462                    | 0     | 1           |
| access-router-react                | 43                     | 554                    | 0     | 3           |
| oidc-vault-dpop-client             | 21                     | 1,505                  | 0     | 1           |
| message-service                    | 29                     | 622                    | 0     | 1           |
| pdf-reader                         | 6                      | 237                    | 0     | 2           |
| access-router-runtime              | 12                     | 135                    | 0     | 1           |
| oidc-vault-dpop-example            | 14                     | 130                    | 0     | 2           |
| moo                                | 18                     | 344                    | 0     | 1           |
| react-vite                         | 4                      | 43                     | 0     | 1           |
| create-access-router-mongo-starter | 18                     | 339                    | 0     | 1           |
| **Total**                          | **689**                | **21,224**             | **1** | **34**      |

- No failed or skipped tests were reported by the third-run summaries. The
  existing `asset-inliner` TODO is
  `test/legacy-contract.test.ts`'s image replacement / ASSET-06 case; its source
  is unchanged. This is not a zero-TODO certification.
- DPoP: 5 unit files / 55 tests, then 9 browser files / **75 tests**. This matches
  the default **Chromium-only** selection in `test/browser/harness.ts`; neither
  Firefox nor WebKit is certified by this V5 run. The separate accepted
  CI-DAG-03 three-engine run had 225 browser tests / 280 total, and is not a second
  V5 result. The delivered CI helper also defaults to Chromium, with explicit
  validated engine selection support.
- PDF: 4 node files / 205 tests plus 2 Chromium browser files / 32 tests.
- React: three maintained Vitest invocations passed (default runtime, React 18,
  types). The React 18 stderr cycle/depth errors match the deliberate
  `expect(...).toThrow(...)` cases in `test/dependency-policy.test.tsx`; the log
  contains no Vitest unhandled-error summary. This is not a claim of empty stderr.
- Starter: all 18 included files / 339 tests passed, including the VERSION-guard
  documentation check and release-like packed-consumer suite. That suite installs
  the publication-transformed artifact, runs package bins and generated tooling,
  and rejects raw source packing/version mismatch. The `carmsf02 fake pnpm: registry unavailable`
  messages come from intentional stage-template negative
  fixtures. No actual npm publication or remote deploy was performed.

### Retained failures and isolation checks

First attempt, attestation packed Chromium consumer:

```text
scenario: cross-origin explicit cookies recover once from an exposed stale-key challenge
apiStatuses: [403]; preflights: 1; discoveries: 1; keyModules: 1
AssertionError: expected response status 200; received status 403, marker stale-key
Test Files 1 failed (1)
Tests 1 failed | 11 passed (12)
```

Three focused `test:packed-consumer` invocations in the same copy each reported
1 file / 12 tests passed; the maintained group 3 also passed. The second and
third full attempts subsequently passed that package. These passes establish an
intermittent result, **not its cause or a fix**. The first failure is not proven
environmental or pre-existing. No product/test modifications or automatic retries
were added; investigating or obtaining a maintainer disposition for this risk
remains necessary before final rollout acceptance.

Second attempt, representative error (21 failed tests were reported in
`mongoose-rxdb`; the recorded socket paths were 113-114 bytes):

```text
Error: listen EINVAL: invalid argument <repo-root>/_tmp-ci-dag-05-v5b-lw2nfp/tmp/pubkey.bc/A411283b7ec433ec1c1d3/rdrs/ax5xl7psyyq.s
at broadcast-channel/dist/esnode/methods/node.js
```

These paths exceed Linux's 108-byte `sun_path` field (the usable pathname is
shorter for a terminating NUL). This affected multiple SQLite smoke/selector/
storage/upsert cases, not just `selector-recheck.test.ts`. The third attempt used
a shorter scratch root and completed the same 45 files / 632 tests without the
socket error. The coordinator did not rerun the full suite: the saved successful
run already establishes the requested local script execution, with these risks
and limits retained rather than retrying for a cleaner history.

## Saved independent gate review and finishing validation

The saved independent gate-review JSON reports `ok: true`, **146 checks**, 31
jobs (28 generated + 3 preserved), 25 tested / 6 build-only workspaces, 26 declared
gates and 1 fixture gate, and 27 aggregate results. Its saved probe script checks each
package's exact prerequisites, composite/workspace/artifact wiring and independent
lanes, and calls the production evaluator with healthy, router, JSON-router,
vault, preparation, validation, cancellation, missing-result and false-success
payloads. Healthy exits 0; these non-success payloads exit 1. Its stderr is empty.
The coordinator inspected the saved script and JSON; other malformed-payload
coverage is certified by the maintained checks, not attributed to unsaved probes.

Coordinator finishing validation on the unchanged implementation:

- `pnpm test:ci:check`: **310 passed**, 0 failed/cancelled/skipped/TODO; checked
  model and active workflow/helper agreement passed.
- `pnpm test:groups:check`: **18 passed**, 0 failed/cancelled/skipped/TODO; 12
  groups / 25 workspaces validated.
- Targeted ESLint on all eight CI helper/test scripts: exit 0.
- `check-yaml` on the workflow and three composites: passed.
- Checksum-pinned actionlint `1.7.7`: exit 0 with shellcheck/pyflakes disabled,
  as in the accepted protocol. Tarball SHA-256
  `023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757` verified.

Document-format/link/privacy and final diff checks are recorded in the handoff
after the coordinator's documentation reconciliation. The original interrupted
reviewer did not finish reviewing these edits due to the provider limit; the later
fresh review is recorded separately and withheld acceptance under R1.

### Original local-log fingerprints

These SHA-256 values identify the inspected unmodified raw files; those files
contain machine paths and are intentionally not copied into durable evidence.
They are provenance, not a self-contained rerun or independent signature.

| Saved file        | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------ |
| Third summary     | `3709ee3f0c6a7d958c58218a67c2d3a3aeded8d3a7ed7d6c019a18006154e32d` |
| Third lint log    | `192904497e1d404db5e88f37fa40626e70af5ed75752856c8c986155c6bf8f26` |
| Third build log   | `4d57b5ff1d77843945bc09fa6b85959a18b3e00e592f505b38a8b0bf36d23759` |
| Third grouped log | `1b750bce5243882f4aec8fd8e344049100e49a5c795aea5fee9620420e782bf0` |

## Fresh finishing-review addendum

The new review independently matched all three source copies, all complete
third-run commands/completions and ledger rows, accepted fingerprints and four
raw-log hashes. It reproduced **310 CI-contract / 18 group-validation checks**
without a full-suite rerun or resource launch. Coordinator verified that the
reviewer added only its report and changed none of 2,535 protected regular files.
The report's input hashes precede these coordinator status addenda and remain
unchanged.

R1 distinguishes the delivered helper from the successful grouped run:
`restoreWorkspace` creates `_tmp-ci-test-resources-XXXXXX/tmp` and propagates it
as `TMPDIR`. At the reviewed checkout depth that is **67 bytes**; the observed
BroadcastChannel suffix adds **50-51 bytes**, projecting **117-118 bytes** against
Linux's **107-byte pathname budget**. The third grouped runner used the shorter
`_tmp-05c-G8SORQ/t`, so its pass does not validate the helper's unguarded allocation.
Coordinator read-only source/log calculations confirmed these lengths without
opening a socket. A supported-depth socket-safe allocation, unsupported-budget
failure handling and maintained/bounded runtime evidence require scoped
authorization; no implementation or test workaround was added.

No hosted occurrence, scheduling, artifact-service, required-check, timing, quota
or billing evidence is provided. CI-DAG-05 remains incomplete pending R1's
authorized correction/verification and independent acceptance of changed bytes,
R2's attestation investigation or explicit risk disposition, and R3's authorized
V6 evidence and maintainer decisions. The fresh review was delivered with changes
required, not finishing or rollout acceptance.

## R2 delivery and coordinator reconciliation addendum

The [bounded R2 investigation](ci-dag-05-r2-investigation.md) and
[support archive](ci-dag-05-r2-support/README.md) are delivered. The agent is idle;
read-only [coordinator reconciliation](ci-dag-05-r2-coordinator-reconciliation.json)
passed at **2026-11-19T08:07:18.374Z**, without a package test/build/resource launch.
It inspected **14 changed / 43 added** files against the **2,536-file fix baseline**
and preserved all **2,579 current regular files** at that time, **24 attestation
production files**, package scripts/metadata, historical logs and seals. The later
coordinator copy/status addenda are separate changes. Its durable JSON is an exact
copy, SHA-256 `f8efbfbfd4c0db94e36873fe0fc2f3a61ddcfadc506e1b7202333fa08128af8e`.

Reverified **10 payloads / 99,546 bytes**, **45 retained-source hashes**, **34
planning/staging seals**, closeout provenance and retained assertion ASTs. Exactly
one trailing ASCII space was removed only in the archived historical-excerpt line
**51** and interrupted-log line **64**; original/staged bytes remain sealed. AST
retention does not prove all surrounding behavior. The observer preserves native
sign-promise identity and shared facade equivalence but adds one mapped load
reaction, changes original signer/load identity and is **not proven timing-neutral**.

R2 remains **unresolved, awaiting explicit maintainer risk disposition**, not a
confirmed fix. The focused Node abort failure (**104 passed / 1 failed / 91 skipped**)
remains undisposed; baseline/later passes establish neither provenance nor mechanism.
The sole complete package invocation is **incomplete**: **633 Node / 62 Redis /
31 Mongo / 141 browser tests passed (867)**, but packed-consumer has no saved result;
recorder JSON is absent and **120 seconds / exit 143 / SIGTERM** are separately
attributed harness metadata. **Any additional package execution requires renewed
explicit authorization**. These diagnostics do not replace the original V5 evidence
or identify its unrecorded retry-preparation exception.

The fresh [short-real-checkout setup agent](ci-dag-05-checkout-setup-handoff.md)
delivered read-only stage 1 and was idle and
[coordinator-reconciled](ci-dag-05-checkout-setup-stage1-coordinator-reconciliation.json);
stage 2 was confirmed, not yet started at that historical record. Setup delivery
and fresh review were pending then; both subsequently delivered/reconciled. R2
cause/abort/verification and R3's hosted/required-check/risk/budget evidence still
block final acceptance. Historical review, R1/R2 reports and seals remain unchanged.

The subsequent [pre-setup document/scope reconciliation](ci-dag-05-pre-setup-coordinator-reconciliation.json)
passed for **15 documents / 189 local links / 12 anchors**, with all inspected
R2 delivery and historical seals intact. This is a separately preserved historical
read-only check, not a package rerun or independent acceptance. Its later archival
copy/readiness notes are outside its sealed input fingerprints; the authorized
fresh setup implementer was subsequently launched for read-only preflight/design.

## Subsequent checkout-setup saved-evidence reconciliation

The setup implementer subsequently delivered stage 2 in the same session and is
idle. [Coordinator byte/scope reconciliation](ci-dag-05-checkout-setup-stage2-coordinator-reconciliation.json)
passed at **2026-11-19T14:29:16.540Z**: **2,582 originals / 2,568 unchanged**, exactly
**10 maintained changes + three new maintained files**, with four coordinator-only
document changes and one coordinator JSON addition separately accounted. Original
modes/seals, HEAD/refs, independent raw job blocks, all 31 job IDs/order, graph
prefix and evaluator negative assertions remain protected.

[Saved-evidence reconciliation](ci-dag-05-checkout-setup-stage2-coordinator-evidence.json)
passed at **2026-11-19T14:33:42.048567+00:00** for **169 setup files / 57 JSON files /
162 archive entries / 156 original sources / 64 raw outputs**, with **35 serial
observations** and all **11 initial nonzero results** retained. Exact thirteen-path
fingerprints/diffs, the sole approved R1-test line, two result-test amendments and
reversible archival redaction reconcile. Final saved **611 CI / 18 group checks**
and focused quality passes match the thirteen actual maintained fingerprints.
No coordinator test, build, resource or source operation was repeated.

[Curated coordinator support](ci-dag-05-checkout-setup-coordinator-support/README.md)
preserves exact results/drivers separately from unchanged delivered reports and
historical seals. This later status/evidence record is not covered by those earlier
input captures. The fresh non-implementer review was ready after the
document check and immutable snapshot, unassigned at that historical readiness record.
Positive full native short-root success, Node-20 execution, actual runner main/post,
R1 independent acceptance, unresolved R2 cause/abort/timing-neutrality/incomplete
package disposition and all R3 rollout evidence remain outstanding. R2's allowance
is spent; further package execution (including focused lanes), a separate source
probe, runtime installation or hosted work requires renewed explicit authorization.

## Fresh corrective-review coordinator addendum

The fresh reviewer launched at **2026-11-19T14:56:47.674093+00:00**, delivered and
stopped idle after the sequential reconciled implementation deliveries. Its blocked
verdict is now coordinator-reconciled, not merely pending review.

[Byte/scope reconciliation](ci-dag-05-corrective-review-coordinator-support/coordinator-byte-scope.json)
matched **2,771 originals / 24 maintained fingerprints / 33 historical seals**
and nine reviewer additions, with unchanged HEAD/refs/bytes/modes.
[Independent saved-evidence reconciliation](ci-dag-05-corrective-review-coordinator-support/coordinator-saved-evidence.json)
matched all six serial one-shot receipts, twelve retained streams, both reviewer
audits, the **582-source** inventory and final delivery capture boundaries without
executing historical drivers or repeating validators/packages/probes. Saved **611
CI / 18 group passes**, ESLint exit 0, maintained Prettier exit 1 and workflow-only
actionlint exit 0 remain reviewer results. Raw execution output was not persisted:
raw/retained equality is recorder metadata; retained streams/counts were independently
read. Inventory **52/53/55/56**, static **476/482**, audit **3,257/3,507** and
delivery **449/591/5,922** counts are accounting facts, not new test executions.

The historical third V5 still totals **12 groups / 25 full scripts / 34 Vitest
invocations / 689 file executions / 21,224 passes / one unchanged TODO**. That
different allocation and earlier byte set do not certify full native-root/Node-20/
runner acceptance, R2 causality/timing/completeness or hosted rollout.
The new [support index](ci-dag-05-corrective-review-coordinator-support/README.md)
preserves successful reconciliations and initial audit failures separately. The
historical four-entry manifest exception is not a Prettier pass or Q1 disposition.
These seven later coordinator-document edits are outside the earlier review snapshot
and receipt captures; unchanged source/report/history hashes remain protected.
