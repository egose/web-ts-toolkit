# CI-DAG-05 R1 resource-path remediation

**R1 implementation delivered with scoped local verification; fresh independent
acceptance is still required.** This is not CI-DAG-05 completion, hosted readiness
or rollout authorization. R2 and R3 remain unresolved and outside this handoff.

Created: **2026-11-18T20:45:30-08:00**. Runs below have UTC timestamps on
2026-11-19. Input: the existing uncommitted proposal at unchanged `HEAD`
`0fda5197c5b950e865af73681225c8bbf5533775`. Owner alias: **R1 resource-helper
implementation agent**; no delegation or independent-review claim.

Related: [authoritative CI-DAG-05 task](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-05-verify-rollout-measure-tradeoffs-and-update-testing-guidance),
[sealed changes-required review](ci-dag-05-finishing-review.md),
[historical local execution ledger](ci-dag-05-local-evidence.md), and
[new supporting evidence](ci-dag-05-r1-support/README.md).

## Delivered boundary

Only these five existing files changed relative to the R1 preflight snapshot:

- `scripts/ci-test-workspace.mjs`: UTF-8 socket-budget enforcement in restore,
  resolution and preparation; direct isolated-root `TMPDIR`; directory-integrity
  recheck before preparation.
- `scripts/ci-test-workspace.test.mjs`: maintained byte-boundary, early-failure,
  real-allocation, alias/ignore, isolation and command-preservation regressions.
- `scripts/ci-test-artifacts.mjs`: only `ignoredScratch(root, 'resources')` uses
  compact `_tmpXXXXXX`; prepare/restore/tools scratch naming is unchanged.
- `scripts/ci-test-artifacts.test.mjs`: compact, distinct, real, ignored allocation
  regression, alongside the existing artifact-integrity coverage.
- Root `README.md`: Linux checkout-limit and outstanding hosted prerequisite.

This handoff and its new support directory are additional durable files. The
[R1-only diff](ci-dag-05-r1-support/implementation.diff) uses the retained pre-R1
copies, not `HEAD`, which does not contain the already-uncommitted helpers.
Package scripts, lockfile, workflow, composites, dependency model, result helper,
`AGENTS.md`, R2 source/tests, existing task/index/handoff documents and sealed
reports were not edited. Coordinator-owned preflight changes were retained.

## Socket budget and supported paths

Linux's `sun_path[108]` needs a terminating NUL: reserve at most **107 pathname
bytes**. BroadcastChannel 7.4.0's Node reader socket suffix is
`/pubkey.bc/A<20 hash characters>/rdrs/<reader UUID>.s`, with **40 fixed ASCII
bytes**. The reader UUID is `Math.random().toString(36).substring(2)`.

The **22-byte UUID allowance is conservative for the reviewed pinned native
engine**, not an observed-length limit or a bound for arbitrary finite Numbers:

1. Node **26.12.1**, V8 **14.6.202.34-node.40**, maps a 53-bit integer to
   `k / 2**53`. Its smallest positive native random value is `2**-53`.
2. V8's radix conversion starts with half the distance to the next double. For
   these possible positive values, that rounding delta is at least `2**-106`.
3. Each fractional base-36 digit multiplies the delta by 36. After 21 digits,
   `36**21 * 2**-106 > 1`; the remaining fraction is less than 1, so conversion
   stops. Rounding carry cannot add a fractional digit. The inequality has ample
   margin for floating-point multiplication rounding.
4. Reserve **22 bytes**, one beyond that 21-digit bound. Zero has no fractional
   token. Observed 10–11-character tokens are not the bound.

The maintained test checks the pinned Node/V8 and the BroadcastChannel resolved
through this workspace's RxDB dependency. It checks the inequality, 21-character
small native-random values and additional power-of-two boundary values. In
contrast, `Number.MIN_VALUE` produces a 208-character token on this engine and is
not a possible positive native random value. Mocked/replaced `Math.random`, other
engines and dependency upgrades require a fresh contract review.

Reviewed upstream pinned-source references:

- [V8 `ToDouble`](https://raw.githubusercontent.com/nodejs/node/v26.12.1/deps/v8/src/base/utils/random-number-generator.h)
  (`random >> 11`, division by `2**53`).
- [V8 Math.random cache generation](https://raw.githubusercontent.com/nodejs/node/v26.12.1/deps/v8/src/numbers/math-random.cc)
  (calls `ToDouble`).
- [V8 `DoubleToRadixStringView`](https://raw.githubusercontent.com/nodejs/node/v26.12.1/deps/v8/src/numbers/conversions.cc)
  (initial delta, radix multiplication and fractional stopping/carry behavior).

The installed BroadcastChannel `src/methods/node.js` (`getPaths`,
`createSocketEventEmitter`, `create`) and `src/util.js` (`randomToken`) agree with
the measured runtime suffix. Full dependency/upstream sources are not archived;
a curation-only attempt to refetch the three upstream URLs returned errors. No
fresh upstream-source hashes or exhaustive random-value sampling are claimed.

Thus `TMPDIR` must be at most **45 UTF-8 bytes**: `107 - 40 - 22`. Compact
`/_tmpXXXXXX` adds 11 bytes, so a normalized real checkout root may be at most
**34 bytes**. There is no external-temp alias, shorter-path symlink, retry,
fallback script or multi-instance-disable mode.

| Checkout root | Compact `TMPDIR` | Socket bytes with reserved UUID | Result                               |
| ------------- | ---------------- | ------------------------------- | ------------------------------------ |
| 33 bytes      | 44 bytes         | 106                             | Supported; actual local probe        |
| 34 bytes      | 45 bytes         | 107                             | Supported boundary regression        |
| 35 bytes      | 46 bytes         | 108                             | Rejected, one byte over              |
| 47 bytes      | 58 bytes         | 120                             | Rejected representative hosted depth |

UTF-8 fixtures also check 34/35-byte roots using two-byte characters, where
JavaScript character counts would incorrectly accept the over-budget path.
Maximum/one-over evidence is a maintained budget regression, not an actual
maximum-length UUID/socket runtime experiment.

## Enforcement and retained behavior

- Restore validates its normal revision/run/artifact context, then checks the
  prospective compact path **before resource allocation, package resolution,
  resource probes or compiled-output restoration**.
- Resolution checks the actual ignored real resource directory and its real
  UTF-8 byte count before browser/Mongo resolution or configuration probes.
- Preparation rechecks that directory and budget and requires
  `plan.tmpdir === plan.resourceDirectory` before resource commands. The runner
  returns CLI exit 1 on an unsupported path, without launching its complete script.
- The whole package command remains exactly
  `pnpm --filter <manifest-name> test`, with existing rebuild/worker/environment
  controls. Failures propagate without retries or smaller fallback scripts.
- Browser cache paths remain dedicated download children; Mongo caches remain
  the exact validated binary. The resource root, `pubkey.bc`, database/test state,
  dependencies and compiled outputs are not added to caches or shared between jobs.

Existing integrity-success fixtures remain in their deep ignored checkout
locations. They explicitly inject `tmpdirByteLength` to simulate only a 33-byte
checkout prefix while retaining the allocation suffix and production comparison.
This is not real-depth runtime evidence. Production defaults, unsupported-path
cases, actual helper allocation and the two-process probe use `Buffer.byteLength`
without that seam. The CLI/environment exposes no measurement/budget override.
Symlink, hardlink, ignored-path, artifact/identity and failure-propagation assertions
remain active; browser/Mongo binary child boundaries were not weakened.

## Verification and retained failures

All commands ran from the repository root with freshly allocated ignored
checkout-local run directories set as absolute `TMPDIR` at runtime. The final
helper tests, CI validator and group validator ran **sequentially after formatting**.
Detailed argv, timestamps, exits and counts are in
[results](ci-dag-05-r1-support/results.json).

| Check                                                                                                    | Result             | Wrapper duration |
| -------------------------------------------------------------------------------------------------------- | ------------------ | ---------------- |
| `node --test --test-concurrency=1 scripts/ci-test-workspace.test.mjs scripts/ci-test-artifacts.test.mjs` | 134 passed; exit 0 | 6,864 ms         |
| `pnpm test:ci:check`                                                                                     | 326 passed; exit 0 | 14,960 ms        |
| `pnpm test:groups:check`                                                                                 | 18 passed; exit 0  | 4,303 ms         |
| Targeted ESLint on the four helper/test files                                                            | Exit 0             | 3,855 ms         |
| Targeted code/README Prettier check                                                                      | Exit 0             | 1,914 ms         |

All three test checks reported **0 failed/skipped/cancelled/todo**. The validators
are not package suites or substitutes for full integration. Final handoff/index
Prettier, `git diff --check`, protected-file/seal checks and manual evidence checks
are recorded in the support results/manifest.

The pre-change implementation plus the new restore-rejection regression produced
**51 tests: 50 passed, 1 failed**, exit 1, with `Missing expected exception`.
The same maintained regression now passes. Its
[baseline log](ci-dag-05-r1-support/baseline-regression.log) is preserved; this was
an expected red test, not a passing baseline. An initial Prettier check also exited
1 for two files; the [reviewed formatting delta](ci-dag-05-r1-support/formatting-review.json)
and [original formatting failure](ci-dag-05-r1-support/formatting-failure.log)
remain distinct from the later passes.

The first handoff-formatting check also exited 1, for Markdown table alignment
only. Its [failure](ci-dag-05-r1-support/handoff-formatting-failure.log) and
[reviewed table delta](ci-dag-05-r1-support/handoff-formatting.diff) are preserved;
the tables were corrected without further helper/test changes.

### Bounded two-process runtime probe

The probe allocated real compact directories through `ignoredScratch`, resolved
and prepared `@web-ts-toolkit/mongoose-rxdb` through the actual helpers, and loaded
BroadcastChannel **7.4.0 through RxDB's package resolution**. It used the default
Node transport and default fast path, not an in-memory transport or mocked UUID.
One parent sender and one distinct child receiver used the same helper `TMPDIR`.
Readiness and receipt were event-driven, with 10-second failure deadlines and no
arbitrary success sleeps or delivery retries.

- Actual checkout root **33 bytes**; helper `TMPDIR` **44 bytes**.
- Real sender/receiver sockets **95/94 bytes**, UUIDs **11/10 bytes**; both were
  verified as sockets, with a 40-byte fixed suffix.
- **One post, one received**, receiver exit 0, no child stderr/stdout, and no state
  in a second distinct allocation. Helper resource commands and package test
  commands: **0**.
- Corrected invocation: **exit 0**, **1,781 ms** wrapper time (**1,722 ms** probe
  time). See [full corrected observations](ci-dag-05-r1-support/probe-corrected.log).

Two preceding invocations remain failures, each **exit 101**: initial **11,740 ms**
and diagnostic **11,575 ms**, `Controller exceeded its bounded deadline`. The
diagnostic trace shows successful 95-byte socket creation, exactly one delivery
and receiver close acknowledgement before waiting for receiver exit timed out.
The controller still held the sender's outbound socket open. The
[teardown correction](ci-dag-05-r1-support/probe-teardown.diff) closes the sender
before awaiting receiver exit; it changed only the disposable probe's close
ordering, not production helpers, test expectations or delivery behavior.
[Initial failure](ci-dag-05-r1-support/probe-initial.log),
[diagnostic failure](ci-dag-05-r1-support/probe-diagnostic.log),
[diagnostic input delta](ci-dag-05-r1-support/probe-diagnostic.diff), and
[retained input hashes](ci-dag-05-r1-support/probe-inputs.json) preserve that history.
The corrected invocation does not erase or relabel the two failures.

This probes the relevant RxDB-resolved BroadcastChannel transport, **not RxDB
database instances or a complete mongoose-rxdb package script**. No Mongo,
Docker/Redis, browser or full-workspace suite was launched. Existing helper tests
exercise invalid-cache subprocess rejection without launching those resources.
The narrow allocation/guard change did not justify duplicating historical V5.
That earlier successful grouped V5 used a different shorter allocation and still
does not validate this helper or its hosted setup.

## Integrity, preservation and coordinator next steps

The [pre-R1 fingerprint snapshot](ci-dag-05-r1-support/before-fingerprints.json)
covers **2,536 protected regular files**. Final comparison changed only the five
listed files: **2,531 unchanged**, including **90 attestation files**, unchanged
`HEAD`, coordinator addenda and sealed report. The original four sealed V5 log
hashes and `_tmp-fix-w72mgx/baseline.json` hash matched. See
[protected-file verification](ci-dag-05-r1-support/protected-files.json).
The probe preceded formatting-only helper edits; the preserved preformat hashes
and reviewed formatter output match the final helper bytes. Final tests were rerun
against those formatted files.

The [support index](ci-dag-05-r1-support/README.md) and
[manifest](ci-dag-05-r1-support/manifest.json) distinguish original and curated
paths/hashes, scrubbing and omitted inputs. Originals remain unchanged in ignored
scratch for coordinator reconciliation; they were copied, not moved. This archive
is evidence, not a self-contained runnable probe or full integration bundle.

Coordinator actions, not performed here:

1. Reconcile these changed bytes and evidence, then obtain a **fresh
   non-implementer corrective review**. Do not infer R1/CI-DAG-05 acceptance from
   this implementation handoff or update sealed historical verdicts.
2. Obtain a scope decision for hosted setup: the **calculated 47-byte representative
   root is unsupported**. A shorter **real** checkout setup requires separate
   authorization and fresh hosted evidence; no checkout/action/composite redesign
   was made in R1. At that depth the guard intentionally blocks execution.
3. Continue the separately assigned R2 investigation and authorized R3/maintainer
   work. R2 assertions/source/tests remain untouched. Live healthy, failure,
   preparation-failure, cancellation and missing/skipped-result cases, required
   `unit-test` context, hosted artifact/scheduling evidence, performance/budget and
   maintainer risk decisions remain outstanding.

No commit, push, dispatch, repository-settings change, publication, hosted run,
new provider/model selection or task-status update was performed.
