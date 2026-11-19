# CI-DAG-05 R2 bounded attestation investigation

Prepared: **2026-11-19T07:17:07.703458+00:00**. Owner alias: **R2 attestation
investigation agent**. Delivery is local, uncommitted and unpushed.

Related: [bounded assignment](ci-dag-05-r2-handoff.md),
[authoritative task](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-05-verify-rollout-measure-tradeoffs-and-update-testing-guidance),
[sealed finishing review](ci-dag-05-finishing-review.md),
[coordinator sequencing](ci-dag-05-remediation-coordination.md), and
[support index/manifest](ci-dag-05-r2-support/README.md).

## Verdict and acceptance blockers

**Diagnostic gap confirmed; fixture-only diagnostics and bounded causal controls
delivered. Original-cause attribution remains unresolved and awaits explicit
maintainer risk disposition. No production correction is selected.**

This is not a confirmed-fix or resolved-R2 verdict. Three material limitations
remain visible:

1. The original readable `403` result omitted the retry-preparation exception;
   injected errors cannot identify it retrospectively.
2. A focused, unchanged Node replacement-load abort assertion failed. One
   byte-verified baseline comparison passed, and a later complete Node lane
   passed; neither establishes provenance or mechanism for the failure.
3. The one justified complete affected-package invocation was interrupted after
   four passing lanes. Packed-consumer has no result and complete-script
   verification is **incomplete**, not an assertion failure or a pass. The
   one-script allowance is spent; further execution needs explicit authorization.

R2's bounded code work and documentation/evidence closeout are delivered. This
finalized report is the **idle handoff** for coordinator reconciliation, with no
further tests/builds/setup/resource work queued. Coordinator reconciliation and
fresh non-implementer acceptance remain pending. The authorized local checkout
setup implementation must follow R2 idleness/reconciliation and precede fresh
independent corrective review. R2 did not delegate, perform setup or perform
R3/hosted rollout work.

## Original evidence and inspected production contract

The [original failure excerpt](ci-dag-05-r2-support/historical-failure.log)
preserves historical V5 lines 388–446. Original scratch
`_tmp-ci-dag-05-v5-bzejoa/v5-grouped.log` remains unchanged, SHA-256
`d9f10335e8d4ff34d3baf228a1739110d2763546f55dd17458381d5e96649c69`.
The immutable finishing review remains SHA-256
`f96fa3f21bd701a1862823eae388c78fb189f296bd6f40c4cfe975767f3ba02b`.

Installed Chromium **151.0.7922.34** failed
`cross-origin explicit cookies recover once from an exposed stale-key challenge`:
expected API statuses `[403, 200]`, observed `[403]`. There was one
preflight/discovery/key/runtime module, one rotation and zero reservations or
business effects. Page JavaScript observed `type: cors`, `marker: stale-key`,
`bodyUsed: false`, `bodyLocked: false`. Its **535 ms** duration is not evidence
of the **5,000 ms** default signer-load deadline or **10,000 ms** consumer
lifetime expiring. Later unchanged-source green repetitions establish
intermittency, not cause.

Inspected unchanged implementation:
`packages/express-request-attestation/src/attested-fetch.ts`
(`isStaleKeyRetryCandidate`, `signWithFreshProof`, retry preparation, lines
484–493 and 703–795),
`packages/express-request-attestation/src/signer-client.ts` and
`packages/express-request-attestation/src/request-signer.ts`.

- Retry selection requires `403` plus a readable `stale-key` marker. Missing
  exposure is contradicted by the saved page observation, not a selected fix.
- Invalidation exceptions are swallowed, but replacement preparation still runs.
  A failed invalidation is not itself an unconditional no-retry branch.
- Replacement load/sign/native request-construction failure or an identical
  proof returns the untouched first stale response. Caller abort instead rejects
  with its reason; dispatched transport failures propagate and never cause an
  application-level retry.
- Native default Fetch is bound to `globalThis`; explicitly injected transports
  retain caller-selected binding. Real signers are frozen; client methods are
  closure-owned. Those facts alone do not identify the original exception.

The saved one-discovery/no-second-POST result is compatible with an early
replacement-preparation failure, but cannot identify the failing operation,
native error, race or exception category. Later-boundary injected controls have
different discovery counts; their observations must not be substituted for the
original record.

## Delivered scope and observer limitations

The eight R2 test/fixture paths are fingerprinted in
[ownership.json](ci-dag-05-r2-support/ownership.json). All **24 production source
files** and package metadata/build configuration remain unchanged.

| Path under `packages/express-request-attestation/`                     | Delivered purpose                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `test-packed-consumer/consumer/installed-browser-observer.mjs` (new)   | Bounded test-only load/sign/invalidate/dispose and terminal-response/error observations.                                                    |
| `test-packed-consumer/consumer/installed-browser-observer.d.mts` (new) | Matching fixture diagnostic types, without adding a public package export.                                                                  |
| `test/installed-browser-diagnostics.cases.ts` (new)                    | Fifteen maintained forwarding/identity/settlement/bounds/redaction/serialization controls.                                                  |
| `test/fetch-client.test.ts`                                            | Import/register those controls only; existing assertion chains are retained.                                                                |
| `test-packed-consumer/consumer/installed-browser.mjs`                  | Return diagnostics before external assertions; retain rejection observations for the harness; separate opt-in fault adapter.                |
| `test-packed-consumer/consumer/installed-browser-server.mjs`           | Serve observer bytes and inject only the explicit native HTTP transport control after received body capture/authentication.                 |
| `test/installed-browser-harness.ts`                                    | Safe native request/response/failure correlation on ordinary returns and errors; retrieve observations before cleanup.                      |
| `test/packed-consumer.test.ts`                                         | Copy observer fixture, assert retained diagnostics/native events and add six installed causal controls without removing existing scenarios. |

The observation facade does not substitute Fetch/import, introduce retries or
timers, mutate frozen owners, or consume response bodies. Native defaults and
existing installed public-export resolution are retained. Opt-in faults are
separate from the no-fault observer; final transport injection uses no Playwright
routing. Existing fixture/harness lifetime and cleanup deadlines were not
extended.

Forwarding uses original receivers/arguments and exact synchronous/asynchronous
errors. Caller-selected ordinary, bound and closure receivers have maintained
controls. Native **sign-promise identity** is retained, as are shared-load and
shared-signer **identity equivalence** among facade callers. Malformed/accessor
signer substitutes are left for production validation rather than made valid by
observation.

**The observer is not proven timing-neutral.** Observing a frozen signer requires
a facade and one mapped load-promise reaction; the facade is not the original
native signer/load-promise identity. A maintained settlement control establishes
that it does not resolve before native load settlement and retains the original
sign promise, not zero microtask perturbation. This limitation must remain part
of independent review and any future causal interpretation.

Fixture/native event bounds are **32/64**, with detached snapshots and separate
overflow counters. Diagnostic fields allowlist error names/codes, resource/method
classes, numeric request IDs, prior response status, booleans and proof-equality
only. They omit raw messages, URLs, cookies, key bytes, nonces and full proofs;
the temporary first-proof reference is cleared on disposal.
`InstalledBrowserScenarioError` retains raw HTTP evidence privately in `#report`
for explicit assertions, not ordinary serialization; the original error is not
attached as `cause`. Existing raw body/proof/cookie assertion evidence remains
available to tests, not copied into the curated causal observations.

## Maintained red/green and causal observations

### Diagnostic-gap red, not reproduction of the original product failure

Before changing the fixture/harness, one new assertion was selected in the
existing missing-exposure scenario: require `diagnostics.events` on the returned
browser result before external assertions. It failed solely on that missing
property: **1 failed, 11 skipped, 12 total**, recorder exit 1. The old fixture
returned its expected readable stale response; this demonstrates lost diagnostic
visibility, not the original exposed-marker recovery exception.

After delivery, the correlated selection passed both ordinary exposed-marker
recovery and the missing-exposure case, plus five causal faults. Its remaining
transport fault failed for the independently observed control defect below.
The final revised transport selection passed. These are bounded diagnostic/control
corrections with their failed evidence retained, not red/green proof of a
production recovery fix or a final all-installed selection pass.

### Controlled boundary results

[observations.jsonl](ci-dag-05-r2-support/observations.jsonl) retains ten emitted
observations with original source line selections in the manifest. Here `null`
is a captured server POST with no valid HTTP response, not a `200` fallback.

| Observation line | Condition                        | API statuses  | Preflights / discoveries | Safe result and boundary                                                                                                                         |
| ---------------- | -------------------------------- | ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2                | No-fault exposed-marker recovery | `[403, 200]`  | 2 / 2                    | Returned `200`; distinct proof, one successful reservation/business effect.                                                                      |
| 3                | No-fault missing exposure        | `[403]`       | 1 / 1                    | Returned readable `403`, page marker `null`; no invalidation/replacement or effects.                                                             |
| 4                | `load-before-discovery`          | `[403]`       | 1 / 1                    | `load-error: SignerClientError / SIGNER_LOAD_FAILED`; first response remains readable.                                                           |
| 5                | `invalidate`                     | `[403, 403]`  | 2 / 1                    | `invalidate-error: Error`; fresh proof from cached old key is sent once; no effects.                                                             |
| 6                | `sign`                           | `[403]`       | 1 / 2                    | `sign-error: SignerClientError / SIGNER_PREPARATION_FAILED`; first response preserved.                                                           |
| 7                | `retry-header`                   | `[403]`       | 1 / 2                    | Second sign resolves to non-repeated invalid header value; no second POST; late native preparation interval, not a captured swallowed exception. |
| 8                | `repeat-proof`                   | `[403]`       | 1 / 2                    | Second sign resolves to identical proof; production suppresses envelope reuse and preserves first response.                                      |
| 10               | Final native `retry-request`     | `[403, null]` | 2 / 2                    | Invocation rejects with `TypeError`; second POST fails with `net::ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH`, prior status `null`.            |

The final transport control records two captured/authenticated/authorized POSTs,
one guard call/rotation, zero reservations/successful reservations/business calls
and an explicit server fault on POST 2. It exercises native CORS/credentials/body
transport before failure; original body/digest/nonce/proof expectations are not
weakened. Load/sign/header/repeated-proof faults demonstrate possible no-dispatch
paths; none is evidence that the historical run injected or encountered that
specific error. Retry-header observations localize an interval but do **not**
expose the swallowed native request-construction exception itself.

### Retained control defects and native abort interpretation

The first installed selection recorded **7 failed, 1 passed, 10 skipped, 18
total**. Newly added zero-native-failure assertions misclassified `ERR_ABORTED`
events after discovery/stale-response headers. Healthy recovery already had
`[403, 200]`; those abort events alone did not demonstrate failed preparation.

Numeric per-request correlation and prior response status were added without
discarding native failures. The final helper requires every permitted abort to
have its matching response and appropriate status/resource; a stale API abort
must also match the first POST. Unexpected categories remain assertion failures.
Observation 2 retains discovery abort
after `200` and stale API abort after `403`. Recording status before failure does
not prove the precise cancellation mechanism or all runtime behavior.

The initial Playwright route fault bypassed real CORS preflights: observation 1
has **zero** preflights and only one received POST. It was removed, not accepted
as a native transport control. The correlated server empty-close control then
failed: observation 9 returned `[403, null, 200]`, three captured/authenticated
POSTs but two Playwright POST request events, and one reservation/business effect.
This supports an internal Chromium network replay of the closed request, not an
extra application wrapper retry or historical-cause attribution.

The opt-in fault was revised to conflicting `Content-Length` headers after
capture/authentication and before guard/reservation/effects. The final selected
control passed **1 test, 17 skipped, 18 total**, with the rejected native phenotype
in observation 10. No retries, sleeps, success fallback or production changes
were added. The correlated selection's **7 passed, 1 failed, 10 skipped** remains
a failed historical run; it is not retrospectively relabeled green.

## Unexplained focused Node abort failure

The focused signer/fetch selection recorded **104 passed, 1 failed, 91 skipped,
196 total**, recorder exit 1. Failure:

`native Fetch ownership > stale-response ownership > aborts waiting for replacement load without disposing the shared client or sending late work`

At `packages/express-request-attestation/test/fetch-ownership.cases.ts:793`, the
existing 500 ms bounded assertion received `undefined` rather than the exact
`{ status: 'rejected', reason }` result. Vitest recorded **508 ms** and
`AssertionError: expected undefined to deeply equal { status: 'rejected', …(1) }`.
Original failed log SHA-256:
`c5b4540accf5b100f19541bd3cd84f21383536510a8a109f401a8cc7845f969c`;
the [verification excerpt](ci-dag-05-r2-support/verification.log) preserves the
failure and location. No observer wrapper was selected or invoked in this run;
R2's import/registration was present but its observer cases were skipped.

One explicit baseline comparison removed only R2's import/registration lines
from `test/fetch-client.test.ts`, verified its exact preflight SHA-256
`aee09bddd95e77b75e18e40a67a1d9da40417be9041949a4e57ad2c0ecc144a3`,
and ran the identical selection: **105 passed, 76 skipped, 181 total**, exit 0.
Those R2 lines were restored and final delivery fingerprinted. The test-count
difference is the fifteen registered-but-unselected observer controls.

The passing comparison establishes neither a pre-existing abort failure nor an
observer regression, timeout mechanism or relationship to Chromium. A later
633-test Node lane also passed, without resolving that uncertainty. No further
baseline repetition, timeout extension or speculative abort/production correction
was selected. This remains an unexplained verification observation requiring
independent assessment and maintainer disposition, not a waived failure.

## Actual verification and interruption

All execution was sequential in the repository root, using the recorded ignored
checkout-local `TMPDIR` at runtime. Full argument arrays, timestamp/duration,
recorder exits and original log hashes are in
[commands.jsonl](ci-dag-05-r2-support/commands.jsonl); this table summarizes those
saved executions, not commands to repeat. The exact recorder is retained in
[run-recorder.py](ci-dag-05-r2-support/run-recorder.py).

| Recorder label                       | Actual scope                                                       | Recorded outcome                                                            |
| ------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `conditions`                         | Tool/owner/ignore/Docker/image inspection                          | Exit 0; image-inspection subcommand exit 1, both named Redis images absent. |
| `initial-build`                      | Affected-package `build`                                           | Exit 0.                                                                     |
| `diagnostic-red`                     | Packed config, existing missing-exposure selection                 | Exit 1; 1 failed / 11 skipped / 12 total.                                   |
| `observer-controls`                  | Node config, observer selection                                    | Exit 0; 14 passed / 107 skipped / 121 total.                                |
| `installed-causal-controls`          | Packed config, two ordinary cases and six faults                   | Exit 1; 1 passed / 7 failed / 10 skipped / 18 total.                        |
| `observer-settlement-controls`       | Node config, added settlement control                              | Exit 0; 15 passed / 107 skipped / 122 total.                                |
| `installed-correlated-controls`      | Same installed selection, native correlation/server fault          | Exit 1; 7 passed / 1 failed / 10 skipped / 18 total.                        |
| `installed-native-transport-control` | Revised native transport fault only                                | Exit 0; 1 passed / 17 skipped / 18 total.                                   |
| `signer-fetch-contracts`             | Node config, focused signer/fetch/ownership selections             | Exit 1; 104 passed / 1 failed / 91 skipped / 196 total.                     |
| `signer-fetch-baseline-control`      | Identical selection on byte-verified baseline registration         | Exit 0; 105 passed / 76 skipped / 181 total.                                |
| `scoped-lint`                        | ESLint on all eight R2 code files                                  | Exit 0.                                                                     |
| `scoped-typecheck`                   | Package/browser TypeScript plus three declaration-consumer configs | Exit 0.                                                                     |
| `scoped-format-check`                | Prettier check on eight files                                      | Exit 1; six files flagged.                                                  |
| `format-plan`                        | Six individual formatter invocations captured as plans             | Exit 0; planned changes applied with patches.                               |
| `final-static-audit`                 | Formatter-byte and original assertion/scenario AST comparison      | Exit 0; saved in `formatting.json`, not runtime-equivalence proof.          |
| `final-format-check`                 | Prettier check on delivered eight files                            | Exit 0.                                                                     |
| `final-lint`                         | ESLint on delivered eight files                                    | Exit 0.                                                                     |
| `complete-affected-package`          | Sole justified complete affected-package `test` script             | Recorder did not finish; harness timeout 120 seconds, exit 143, `SIGTERM`.  |

Saved conditions: checkout owner/non-root, Linux x64, Node **v26.12.1**, pnpm
**11.18.0**, Vitest **4.1.11**, tsup **8.5.1**, installed Chromium
**151.0.7922.34**. Docker client/server **29.9.3** responded; initial
`redis:6.2`/`redis:7.2` image inspection failed as documented in
[conditions.json](ci-dag-05-r2-support/conditions.json). Later Redis lane counts
do not retroactively change that initial condition result.

Shared installed-consumer fixture/harness changes justified the **one** complete
package invocation:

```text
python3 _tmp-ci-dag-05-r2-J2LqEF/run.py complete-affected-package pnpm --filter @web-ts-toolkit/express-request-attestation test
```

This is a historical invocation requiring the omitted original scratch context
and external dependencies, not an archive-only runnable instruction. The package
script ran build, Node, Redis, Mongo, browser, then packed-consumer. Its
[entire saved output](ci-dag-05-r2-support/interrupted-package.log) establishes:

- Build succeeded; **633 Node**, **62 Redis**, **31 Mongo** and **141 browser**
  tests passed: **867 tests across four completed lanes**.
- Packed-consumer started but no counts/completion result were saved. There is
  no `complete-affected-package.json` and no full-package pass.
- Timeout/exit/signal are separately attributed harness-notification metadata,
  not recorder-emitted results; the recorder's subprocess call has no timeout.
  Its interrupted original log is **4,008 bytes**, SHA-256
  `86b3ea8f92d5649c9ed26cf5c70f98f4beb5cc8b13bb434ea3a4ace573dcc310`.

At **2026-11-19T06:15:16.277109+00:00**, read-only
[resource reconciliation](ci-dag-05-r2-support/resource-reconciliation.json)
found 65 readable process command lines, zero unreadable entries, no owned-run
or workspace-workload candidates, and three unrelated running containers (two
`postgres:17`, one `ubuntu:24.04`). They were untouched. This is point-in-time
visibility, not proof of historical cleanup or the cause of interruption. No
tests/builds/resources were started or stopped by that reconciliation or by
documentation closeout.

## Assertions, ownership and protected evidence

The saved AST audit retains original expectation chains in order:
**111 → 111** in `fetch-client.test.ts`, **128 → 184** in
`packed-consumer.test.ts`; `browserScenarios` is unchanged. Existing `200`,
CORS/credentials/body/digest/nonce/proof/single-reservation/business-effect
expectations were not removed or weakened. AST retention alone does not establish
that all surrounding runtime behavior is unchanged; retain the failed checks and
observer timing limitation alongside it.

[Pre-archive ownership](ci-dag-05-r2-support/ownership.json) reconciles the
**2,561-file** R2 preflight, SHA-256
`e7784dbc57aee0bf88493196d5869bc45122b9a4da29a0f841bfbd2f4108b64f`:

- **2,551 original files unchanged; 10 changed**: five R2 test/fixture edits and
  five legitimate coordinator document edits.
- **Five additions**: three R2 diagnostic files and two coordinator handoffs.
  The coordinator drift is explicitly enumerated, not claimed as R2 ownership
  or zero drift. No concurrent coordinator source/setup/test/build/resource
  execution was authorized during R2.
- All 24 attestation production files, inherited R1 delivery, R1's 21 manifested
  payloads, immutable report and original historical inputs were reverified.
  `HEAD` remains `0fda5197c5b950e865af73681225c8bbf5533775`.
- Three original snapshot comparisons each account for **14 differing paths**:
  2,521/2,535 unchanged in the review snapshot, and 2,522/2,536 unchanged in both
  fix-phase and R1-before snapshots. Full unchanged inventories are omitted;
  these retained derived comparisons are not archive-only recalculation.

The ten support payloads were then copied/curated without altering originals or
staging. Eight match staged bytes exactly. Only one trailing ASCII space at
staged historical-excerpt line 51 and one at interrupted-log line 64 were removed
in the archive. [The support index](ci-dag-05-r2-support/README.md) and
[manifest](ci-dag-05-r2-support/manifest.json) distinguish original, staged and
actual archived hashes; staging `plan.json` fields still describe staging.

## Documentation/evidence closeout

Closeout is documentation/evidence-only. Its baseline was recorded at
**2026-11-19T07:11:56.234557+00:00**, with **2,576 regular files**, unchanged
`HEAD`, SHA-256
`03208c54f88e630ba35d9176a86914f647aac3ae328b819a2eb62b9061d4f344`.
Historical scratch `_tmp-ci-dag-05-r2-docs-muxm6m2b/baseline.json` remains
unchanged and omitted from the archive because its full inventory is redundant
and contains private machine-local operational context.

Documentation/evidence validation passed for the ten actual payload/staging
hashes and exact two whitespace deltas, all 45 unique retained original-source
hashes, 34 planning/staging seals, delivered code fingerprints, structured
JSON/JSONL, relative links/anchors, privacy-sensitive content, non-ignored
destinations, newlines/whitespace and `git diff --check`. All 2,576
finalization-baseline files remain unchanged; exactly three new closeout files
are allowed: this report, the support index and manifest. Scoped documentation
Prettier validation passed for those three files. Exact closeout commands,
recorded outcomes and check-scope limits are retained in the
[manifest](ci-dag-05-r2-support/manifest.json), separately from historical code
execution. Document hashes were refreshed after factual closeout edits; the
initial inspected/applied manifest and formatting plans remain sealed in
historical scratch. Saved code checks above were not rerun or recertified.

Documentation-tool failures remain distinguishable from product failures.
The initial formatting-plan invocation exited 1 because `--config` was renamed
to `--config-path`; the corrected plan passed. Its timing/nested numeric exit
were not captured and are not synthesized. The first scratch evidence checker
exited 1 because its allowlist omitted the retained historical `fault-injected`
event shape. The checker was corrected to distinguish that pre-correlation shape
and identifier-free console events; the corrected evidence check passed. No
archive, original, staging or product-test expectation changed to make it pass.
The first scoped three-document formatter check separately flagged only the
manifest's JSON array layout; the captured file-format plan retained the same
structured value. The final manifest corrects that layout while preserving the
inspected initial plan. Scratch checker/recorder outputs are historical closeout
provenance, not archive-only runnable tools or independent acceptance.

The archive intentionally omits full logs/snapshots, raw bodies/cookies/proofs/
nonces/keys, scratch drivers, generated consumers/tarballs/builds, dependencies,
caches, database files and browser binaries/profiles. It supports auditing the
retained safe observations and bounded conclusions, not self-contained
reproduction or recovery of the missing original exception.

## Idle coordinator handoff

1. Reconcile these eight R2 code files, new report and support manifest against
   protected inputs; retain the recorded failures, timing limitation and
   interrupted verification. Only the coordinator updates authoritative status,
   handoff, ledger and parent index; R2 left them unchanged during closeout.
2. Retain **awaiting explicit maintainer risk disposition** for the original
   recovery cause and unexplained focused abort observation. Do not convert
   fixture diagnostics, baseline/lane passes or injected phenotypes into causal
   resolution or independent acceptance.
3. After R2 idleness/reconciliation, start the already-authorized
   [local checkout setup implementation](ci-dag-05-checkout-setup-handoff.md).
   Then obtain [fresh non-implementer corrective review](ci-dag-05-corrective-review-handoff.md)
   of all delivered corrective bytes. Setup/review are pending, not performed
   here; additional package execution requires renewed explicit authorization.
4. R3/live healthy/failure/preparation/cancellation/missing/skipped-result evidence,
   hosted measurements and required-check/maintainer rollout decisions remain
   outstanding. No commits, pushes, dispatches, publication, settings changes,
   hosted runs or unjustified whole-workspace repetitions occurred in R2.
