# ARPC-05 final disposition: production candidate withdrawn

## Outcome

**No ARPC-05 production optimization remains.** The coordinator rejected retention
under original protocol P: 0/8 usable timing cells, uncertain slower public
singleton control, no measured allocation benefit and no all-path non-regression
evidence. The acceptance rule was not lowered. No further calibration, timing,
allocation probe, full package suite or root/downstream suite was run.

Only the hash-verified ARPC-05 edits to
`packages/access-router/src/logger-helpers.ts` and the `beginOp`/`completeOp` regions
of `packages/access-router/src/services/service.ts` were reverted, using a patch.
Before reverting, the **complete production diff** was checked byte-for-byte against
the historical owned candidate patch, SHA-256
`38f26d6bdb0fd6bdc47eac6ddd04a570a0b62d00e93d25608d3439285c0c6fa8`.

The restored **151 source files and 15 compiled distribution files** match the
original baseline exactly. Production diff is empty; there are no untracked
production source files. Restored/original source hash:

```text
f2d472bbe1f390005f0ebe62f548608a1a155d7c9dc8bc1e85f2122559999480
```

See [retained state](retained-state.json). All **92 pre-existing unrelated/evidence
files** checkpointed before withdrawal remain hash-identical, including the shared
task, other owners' tests/harnesses, benchmark README and **all 17 historical parent
ARPC-05 files**. No earlier report/data was rewritten. Their claims about the
candidate remaining in the working tree describe the historical pre-withdrawal
state, not this final state. No commits, resets or unrelated deletions occurred.

## Candidate preserved before withdrawal

- [candidate-production.patch](candidate-production.patch): exact two-file
  production patch, hash above; identical to the unchanged historical
  [candidate.patch](../candidate.patch).
- [candidate-90-tests.patch](candidate-90-tests.patch): exact original **58 unit +
  32 integration tests**, adding the former `service-lazy-logging.*.test.ts` files.
  Patch SHA-256:
  `b2a516a2ceeed59dbc54da9fd99d8d193a60d12171dcc05f65440497b745610c`.
- [before-withdrawal.json](before-withdrawal.json): exact candidate source/test
  hashes, original/candidate seals, protected-file checkpoint and reconstruction
  checks proving both test files are reproduced exactly from the archived patch.
- The original [design/preregistration](../protocol.md),
  [candidate report](../report.md), [paired workers](../timing-raw.json),
  [noise](../timing-noise.json), [comparison](../timing-comparison.json) and
  [work evidence](../logging-work.json) remain unchanged historical evidence.

The candidate used a private context factory after the existing single level
check, no level cache or redundant service-side probe, with start/end timing outside
lazy construction. Its guard tests covered zero disabled summary traversal,
enabled/fallback/throwing loggers, receiver/replacement behavior, midcall levels,
complex/native filters, CRUD and mixed related/embedded scopes. Those design and
work observations were real, but are **not** measured allocated bytes or accepted
performance. A future attempt must satisfy original P rather than inheriting a
performance pass from correctness tests.

The two archived patches pass `git apply --check` against the restored tree without
overwriting retained tests, because their original candidate test paths are absent.
That check does not apply them or authorize another implementation attempt.

## Test disposition: separate baseline characterization, not weakened acceptance

After verifying exact original file hashes, removed only the two owned candidate
test files. Their complete 90-test implementation is preserved unchanged above,
including all zero-summary-work assertions. It is **not** claimed to pass on the
baseline or silently relabeled as a 90-test baseline suite.

Retained instead:

- `packages/access-router/test/service-logging-contract.unit.test.ts` — **16 tests**:
  native/logical-filter query arguments and exact structure-only messages, disabled
  handlers, missing/throwing level probes, throwing debug handlers, receivers,
  replacement/default loggers, midcall level/timing, CREATE's existing silent debug
  behavior, and DELETE success/miss/denial in direct/public calls.
- `packages/access-router/test/service-logging-contract.integration.test.ts` —
  **8 tests**: both parent/target modes with direct parent READ and public parent
  LIST; each case exercises target READ/LIST, correlated includes and embedded
  fields. Enabled versus disabled logging preserves output and callback/query traces.

These explicitly named baseline contract tests contain **no summary-helper spy,
summary traversal counter or summary scheduling/count assertion**. They neither
require the baseline's wasteful traversal nor hide the rejected optimization's
missing performance criteria. Future equivalent lazy implementations may pass them.
The historical 704-test candidate run and current 638-test run differ by replacing
90 candidate tests with these 24 characterizations; there are no skipped or failing
tests in the current focused run. All other test/harness files are unchanged.

## Verification actually executed on the restored tree

Repository-root working directory. Fresh ignored
`TMPDIR='<repo-root>/_tmp-arpc-05-withdraw-ytjtUOUN'`, confirmed with
`git check-ignore`. Replace `<repo-root>` with the actual checkout root at runtime.
Commands ran **foreground and sequentially**, not concurrently:

| Command | Result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Passed, **28.46s**; includes required filtered package/transitive dependency builds |
| Focused Vitest command below | **638 tests / 11 files passed**, **17.50s** command wall / **16.18s** Vitest |
| Scoped ESLint command below | Passed, **2.73s** |
| Source/dist and preservation audit | Original baseline match; 92 protected files and historical seals unchanged; see [audit](audit.json) |

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/service-logging-contract.unit.test.ts \
  test/service-logging-contract.integration.test.ts \
  test/logger-redaction.test.ts \
  test/filter-denial.integration.test.ts \
  test/read-list-fallback-authorization.integration.test.ts \
  test/write-output-modes.unit.test.ts \
  test/write-output-authorization.unit.test.ts \
  test/write-output-origin-ownership.unit.test.ts \
  test/write-output-populate.unit.test.ts \
  test/access-router-crud-harness.unit.test.ts \
  test/access-router-crud-work.unit.test.ts

pnpm exec eslint \
  packages/access-router/src/logger-helpers.ts \
  packages/access-router/src/services/service.ts \
  packages/access-router/test/service-logging-contract.unit.test.ts \
  packages/access-router/test/service-logging-contract.integration.test.ts
```

Exact arguments, environment, results and final log hashes are in
[verification.json](verification.json); final logs are [typecheck](typecheck.log),
[focused tests](focused.log) and [lint](lint.log). The Vite native-config-loader
warning was informational. No runtime verification failed or was interrupted.
One artifact-generation script had a syntax typo before executing any statements;
it was corrected without changing tested code or historical evidence.

The **full package suite remains reserved for the coordinator's final tree once**.
The other owners' `no-work-output-scheduling.unit.test.ts` and
`bulk-create-metadata-filter-trace.integration.test.ts` were neither edited nor run
in this withdrawal. No root/grouped/downstream commands or new performance
calibration were run. Nothing remains queued.

## Archive and reproduction limits

This new subdirectory supplements, rather than rewrites, the historical parent
bundle. [audit.json](audit.json) inventories its files/hashes and records structured
data, privacy, link, whitespace, patch-reconstruction and protected-file checks.
Useful candidate patches and contract evidence are preserved; generated source/
dist/bundle/dependency trees, MongoDB files and disposable scratch contents are not
copied. Original baseline and rejected candidate seals remain unchanged in their
checkout-local historical scratch locations; they are not portable installed
runtimes. Source hash reproduction can use revision `6c3ceee`; replaying the
candidate additionally requires both archived patches, existing fixture sources
and compatible dependencies. No replay or acceptance-grade rerun is claimed here.
