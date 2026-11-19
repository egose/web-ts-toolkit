# CI-DAG-05 R2 bounded investigation handoff

Prepared: **2026-11-18T21:05:23-08:00**, following reconciled R1 delivery.
This is a durable handoff for the fresh R2 agent; the coordinator records actual
assignment separately in [remediation coordination](ci-dag-05-remediation-coordination.md).
The active user request authorizes necessary scoped fixes, not hosted work.
The coordinator alone updates the task/handoff/ledger/index. No further delegation.

## Objective

Answer why the original installed Chromium stale-key recovery returned the first
readable `403`, or retain a precise unresolved investigation/risk blocker if the
saved evidence cannot identify the cause. Implement only a confirmed minimal
defect with a maintained regression. Green repetitions are not causal evidence.

## Read first

- `AGENTS.md`, applicable nested instructions and task-as-you-go skill. The package
  skill applies to installed consumer/runtime boundaries, not a broad discoverability review.
- [CI-DAG-05 task](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-05-verify-rollout-measure-tradeoffs-and-update-testing-guidance),
  requirements 7/8 and local authorization.
- [Sealed finishing report](ci-dag-05-finishing-review.md), R2; never modify it.
- `packages/express-request-attestation/src/attested-fetch.ts`, especially
  `isStaleKeyRetryCandidate`, `signWithFreshProof`, invalidation and retry-preparation catch.
- Package `src/signer-client.ts`, `src/request-signer.ts`, `test/packed-consumer.test.ts`,
  `test/installed-browser-harness.ts` and `test-packed-consumer/consumer/installed-browser*.mjs`.
- `test/fetch-client.test.ts`, `test/signer-client.test.ts`, receiver/transport
  ownership cases and native-discovery tests as relevant.

## Established observations, not a cause

- Original historical log: `_tmp-ci-dag-05-v5-bzejoa/v5-grouped.log`, lines 388–435.
  Preserve its bytes and all earlier copies/logs. The
  [local ledger](ci-dag-05-local-evidence.md) retains a sanitized summary.
- Case: `cross-origin explicit cookies recover once from an exposed stale-key challenge`.
  Expected `[403, 200]`; actual API statuses `[403]`; one preflight/discovery/key/runtime
  module, one rotation, zero reservations or business effects.
- Page JavaScript observed `type: cors`, `marker: stale-key`, `bodyUsed: false` and
  `bodyLocked: false`. Missing exposure is not an evidence-backed explanation.
- Failure duration **535 ms**; default signer whole-load deadline **5,000 ms** and
  consumer lifetime **10,000 ms**. This is not evidence of default-deadline expiry.
- Three focused 12/12 passes and later full-group/full-V5 passes used unchanged
  source. They establish intermittency only.
- Production intentionally returns the original first response after reload/signing/
  native retry-construction failure or repeated envelope. The saved result omits
  the caught preparation error. Native request/console diagnostics are only added
  when the harness throws; assertion failures occur after the harness returns.
  The log therefore cannot distinguish every no-retry path.
- `createSignerClient` issues replacement discovery after installed-key invalidation;
  its real signer is frozen. `getSigner`/invalidation are closure-owned, not
  receiver-dependent. Default native Fetch is bound to `globalThis`; injected
  transports retain their own binding. Inspect instead of assuming any caused this event.
- Current tools run as the checkout owner, not root. Historical browser-ownership
  failures are separate evidence.

## Boundaries

- Own only relevant attestation tests/fixtures and source if a confirmed defect
  warrants it, plus a new curated `ci-dag-05-r2-investigation.md` and necessary
  supporting observations in this evidence bundle.
- Do not modify R1 helpers/tests/evidence, CI workflow/composites/model/results,
  lockfiles/manifests/scripts, root README/AGENTS, authoritative task, coordinator
  handoff/ledger/index or any historical report/log/copy.
- Preserve every existing `200` expectation and CORS/credential/body/digest/nonce/
  proof/single-reservation/business-effect assertion. No retries, arbitrary sleeps,
  success fallbacks, reduced coverage or speculative production changes.
- Use fresh ignored checkout-local `_tmp*` scratch and confirm `git check-ignore`.
  Set runtime `TMPDIR` to its absolute path. Do not run rebuilds/lanes concurrently.
- No commits, pushes, dispatches, settings changes, hosted runs or unjustified
  whole-workspace suites.

## Investigation and verification

Begin read-only. Choose a small causal experiment with explicit before/after events
rather than repeatedly running a green scenario. Observation-only wrappers must
preserve native defaults and exact caller-owned semantics. Diagnostics are not the
explanation. A controlled injected error can establish a possible phenotype, but
cannot retroactively identify the unrecorded original error.

Maintained diagnostics/regressions should distinguish retry selection, invalidation,
replacement load/sign/request preparation, request failures and preserved response
ownership, using bounded safe details. Do not log cookies, private IDs, key bytes
or full request proofs. A confirmed regression must fail on the old relevant
implementation/fixture and pass after correction, without weakening old expectations.

Use repository-backed focused Vitest configs and package build where required.
At most one complete affected package script requires justification from delivered
production/fixture changes; no full-workspace repetition is authorized. Record all
actual commands, failures, counts, skipped selection, tools/browser conditions and
scope. Unsupported prerequisites stay blocked.

Deliver changed-file fingerprints, original evidence references/hashes, experiments
and conclusions with alternatives/limits, maintained regression evidence, exact
checks and omitted inputs. Preserve sanitized causal observations needed to audit
claims; do not claim recalculation from omitted raw observations. State whether
R2 is resolved, confirmed-fix awaiting independent review, or awaiting an explicit
maintainer risk disposition. The coordinator obtains fresh non-implementer review
after reconciliation. R3 remains unperformed.
