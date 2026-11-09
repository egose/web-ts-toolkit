# ARPC-08 — independent final retained-scope review

Date: 2026-11-07. Related [task and execution reconciliation](../../../tasks/20261105-084939-access-router-performance-cleanup.md).

## Decision and findings

**Accept the explicitly revised maintainability/test/tooling scope. No blocking
correctness, authorization, public-API or tooling defect was found.** The single
final access-router suite passed **7,558 tests / 210 files**, with fresh package
typecheck and whole-package/scoped-tooling lint also passing. This reviewer was
not an implementer and made no production/test/tooling/shared-task edits.

**The original speedup objective is not complete.** ARPC-02 and ARPC-05 remain
withdrawn/deferred; none of their performance changes is retained. Passing tests
and identical work records are not CPU, allocation, latency or performance
non-regression measurements. No new paired timing/heap experiment was necessary
or performed for this cleanup-only acceptance.

Nonblocking archive observation (P3, formatting only): the sealed historical
[`arpc-01-v2/timeout-excerpt.log:16`](arpc-01-v2/timeout-excerpt.log) has one trailing
space after the error's final colon. The first generic hygiene scan flagged it;
the final audit explicitly classifies that exact historical byte rather than
rewriting the log or its hash seal. No malformed/duplicate-key/non-finite JSON,
broken file link, credential/private-session identifier or machine-local path
was found in the reviewed evidence.

## Reviewed identity and independence

HEAD: `6c3ceee4433daf203d4625d70b0ef5c4b7009529`, plus the retained working diff.
The production diff is exactly eight files, **17 added / 132 removed lines**.

| Identity (SHA-256) | Value |
| --- | --- |
| Original 151-file source, independently reconstructed from HEAD | `f2d472bbe1f390005f0ebe62f548608a1a155d7c9dc8bc1e85f2122559999480` |
| Final 151-file source | `072039b46ed3603f995bd04a9b0e09817dce13cef58679774b45da5efa02caef` |
| `git diff HEAD -- packages/access-router/src` | `573c36a5fe089da5eafb61bb0228d8f2290f01e76bfdde3c7b9c54b59328d9b2` |
| Tracked source + test diff | `136d3f67bfc680dc842320bf0aa3795d7edb1819ccf50d60c04ef6c8d79b053b` |
| Maintained fixture | `f63cb41394ec473abe463794f720247b00644f0238b9d0016e6b3d8ed2bd7e4d` |
| Four CRUD driver/worker scripts + two protocol guides | `4c983aa0d757be85ffda78c7106d6570cf5ad2ac73f332971a508191510d9bd9` |
| Complete 247-file test/fixture tree | `16cdad676e6cae71b0a9d683498b37740c4fd8c57901c2fde5bcbea87a21bf6d` |

Tree hashes use the maintained driver's recursive per-directory English
`localeCompare` ordering and SHA-256 of `JSON.stringify([relativePath, fileHash][])`.
Exact inventories, command arguments/results, declaration hashes and audit details
are in [verification data](arpc-08-verification.json); concise actual output is in
[the verification log](arpc-08-verification.log). Node `v26.12.1`, pnpm `11.18.0`,
Vitest `4.1.11`; the lock hash is recorded there.

All 2,353 checkpointed tracked/nonignored-untracked files remained byte-identical
through review and execution, including the coordinator's task and all prior
evidence. Only this report and its new verification JSON/log are added. No commits,
resets, broad deletes, delegation, background jobs or progress polling occurred.

## Independent source, caller and contract assessment

Paths below are under `packages/access-router/` unless otherwise stated.

- **Reachability, not just reported deletion:** baseline repository code search
  found all 15 removed-symbol hits confined to the two private modules and their
  own dead chain. A fresh scan of 1,541 current code/distribution files found zero
  remaining hits. I inspected the bodies/callers, package manifest, three tsup
  entries, root/advanced/interface barrels and generated declarations. No downstream
  source caller or supported export needs the removed chain. The
  [keep/remove ledger](arpc-07-keep-remove-ledger.md) agrees with this inspection.
- **Active authorization remains:** `src/acl/output-field-policy.ts:54–154` retains
  call-owned preparation, per-stage decisions, binding checks and work charges.
  The six removed names are five unreachable functions and one private interface,
  not a live static-policy fast path. Mode admission/defaults/inheritance/capture,
  field/row/input/related authorization, native materialization and limits remain
  at baseline. Neither withdrawn candidate has returned.
- **Finalizer authority:** `src/output/finalize-model-output.ts:145–225,458–465`
  authenticates the private plan/call/binding, derives captured policy, resolves
  stage facts, enforces publication/budgets, then closes the stage before exposing
  diagnostics. The deleted `snapshot` member was never read. Removing its
  subdocument caller expression drops only a private memo-wrapper read, not a
  native/configuration copy or source-authority input; child and owning-stage
  checks remain. `FinalizeSnapshot`, public `captureVirtualSnapshot()` and populate
  inspection metadata remain live and retained.
- **Hooks and decoration:** dropping `finalizeDirectOutput.sharedGate` removes an
  unread slot; finalizer hooks still use the request/runtime gate. Populate gates
  remain wired. The three private prepared workers never used `decorate`; actual
  dispatch already omitted that argument. Unchanged
  `src/acl/prepared-query.ts:151–188,226–278` settles output before row decoration.
  Public decoration arguments, callback receiver/arguments/order, `decorateAll`
  and error propagation remain intact.
- **Contexts and write ownership:** `src/output/model-output-context.ts:55–76`
  still builds exact frozen diagnostics, not lifecycle data or reusable authority.
  `src/acl/document-stage.ts:543–615` still detaches both write modes from live
  post-write storage; trusted omits only the later disposable hook view. CREATE,
  UPDATE and both UPSERT branches retain pre-write checks/lifecycle/persistence.
  Related targets keep their own READ/LIST selectors; embedded scopes keep owner
  semantics. No ID/source-keyed row decision cache, new exposure or budget bypass
  was added.
- **Regression preservation:** all six tracked test/fixture diffs are mechanical
  unused snapshot property/import/capture removals. No assertion, case or skip was
  removed/relaxed (the five assertion-bearing files retain 81/195/176/294/20
  `expect` calls). Historical candidate-only scaling/lazy-work tests are preserved
  in the two withdrawal patches, not falsely claimed to pass on baseline. The
  replacement contract suites are separately named and do not require wasteful
  baseline preparation or disabled-summary traversal.
- **Public/installed boundary:** all eight generated declaration files match both
  original baseline and ARPC-07 bytes after the fresh builds. The full suite keeps
  export, strict-consumer, packed-consumer, tree-shaking and shipped guide checks.
  Strict-consumer staging uses copied dist plus linked dependencies; the separate
  packed checks use the real manifest transformer/local tarballs and a bounded
  artifact assembler with a prebuilt CLI fixture. Their existing minimum/current
  peer and ESM/CJS/Bundler/NodeNext/Node16 workflows passed. This is **not** a root
  release run, registry publication, downstream acceptance, or an exhaustive
  installed-package all-16-tuple CRUD matrix.

## Matrix and retained tooling assessment

The new fixture generates all 16 literal tuples in READ/LIST/CREATE/UPDATE order,
asserts exact/bulk resolved options and observes actual admitted stage modes. Its
432 real-service cases cover direct/public READ hit/miss, public actual fallback
versus the explicitly labeled direct LIST-access control, LIST empty/single/many,
single/bulk CREATE, UPDATE ID/direct filter and both UPSERT branches. There is no
invented public filter-update API. Persistence, denied input/output, negative
selection, native/embedded data, metadata and post-publication write detachment
have substantive assertions, not only hashes or success checks.

I also inspected existing mode/default/capture and target-ownership tests:
`query-snapshot-options.unit.test.ts`, `authorization-fast-path-options.integration.test.ts`,
`write-output-populate.unit.test.ts`, `write-output-modes.unit.test.ts`, prepared
query and LIST preparation tests, plus the new scheduling/metadata/logging suites.
These supply parent×target READ/LIST, embedded/populate/correlated include,
duplicate-identity, in-flight changes, failure/draining, concurrency, metadata,
sort and unaffected-operation/raw-helper correctness controls. Their presence and
the full-suite pass are not performance coverage for those dimensions.

Driver review confirmed source-selected frozen bundles (dist is provenance only),
exclusive destinations, fixture/source/dependency/runtime identities, exact case
labels, stable per-invocation output/state checks, alternating fresh-worker pairs,
seven rounds/two repeats, unchanged noise caps and v2 warmup/window gates. Actual
write/service work is timed; reset/request construction/checks are excluded.
Counters/spies belong only to separate diagnostics. Package harness tests exercise
wrong labels/modes/source/dependencies, corruption, distinct loaded code and fixed
write windows. The final suite's smoke timers are wiring tests, **not** new
acceptance-grade timing evidence. Deterministic adapters do not measure DB latency.

The final suite exported **96 CRUD + 32 preparation work/trace records**. They are
byte-identical to ARPC-07's before/after hashes; all 96 CRUD records also deep-equal
the original archived baseline. This confirms unchanged observed work/traces on
those fixtures, not unmeasured runtime non-regression.

## Task-by-task conclusion and performance deferrals

| Task | Independently reviewed disposition |
| --- | --- |
| ARPC-01 | Accept bounded baseline/instrumentation delivery, not the original complete performance matrix. Recalculated all 432 v1 cases: only 15 meet both noise caps. Core-v2 remains incomplete: 132/140 saved pairs, no calibration report; all eight fully paired cases unusable. See [baseline coverage](arpc-01-coverage.md) and [v2 supplement](arpc-01-v2/report.md). |
| ARPC-02 | **Deferred, production withdrawn.** Recalculated the complete focused calibration: 140 workers, 155,904 measured invocations, **0/16 usable cells**. Work reduction and guarded tests do not establish allocated bytes/benefit/non-regression. See [withdrawal](arpc-02/withdrawal/report.md). |
| ARPC-03 | Accept revised source-backed no-change investigation. Current sort capture/native/override/fallback observations and membership scans remain unchanged; no targeted sort timing or new equivalence proof is claimed. See [investigation](arpc-03-report.md). |
| ARPC-04 | Accept no-change investigation plus retained 26-case scheduling/accounting characterization. Empty-candidate yield and absent-root facts are observable; inherited facts are not EMPTY. Final suite verifies these alongside existing FIFO/reentry/draining controls. See [supplemental verification](arpc-046-verification.md). |
| ARPC-05 | **Deferred, production withdrawn.** Recalculated all eight exploratory noise/comparison cases: **0/8 within both caps**, acceptance explicitly false. The uncertain slower public singleton is not declared neutral. Retained 24 logging contracts preserve messages/redaction/receivers/level changes and related traces, not zero-summary work. See [withdrawal](arpc-05/withdrawal/report.md). |
| ARPC-06 | Accept no-change investigation plus retained 24-case real-MongoDB characterization. Per-row transforms, live policy/DB changes, duplicate IDs and failure draining rule out blind coalescing. Up to two visibility reads per emitted CREATE row remain. Query counts are not DB latency savings. See [investigation](arpc-06-report.md) and supplemental verification above. |
| ARPC-07 | Accept focused private complexity reduction. Reachability, caller/public declaration/decoration checks agree with actual diff; all applicable final gates pass. See [cleanup report](arpc-07-report.md). |
| ARPC-08 | Independent acceptance complete **only for the reconciled retained cleanup/tests/tooling scope**. No remaining package gate or review blocker; coordinator retains shared-task/status reconciliation. |

Still deferred/not measured: usable baseline/candidate timing for the rejected
preparation/logging changes; allocation/retained heap; related-target/populate/
correlated timing; sort-heavy/dynamic-rule/enabled-changing-log cases; relevant
failure/reentry/in-flight/limit/duplicate-identity performance controls; and real
DB latency. No cleanup speedup, bundle-size reduction, allocation saving, universal
equivalence or all-workload non-regression is asserted.

## Commands actually executed and preservation

Working directory: repository root. Fresh `_tmp-arpc-08-aiwhequb` was created and
confirmed ignored (`git check-ignore -v`, `_tmp*` rule). All runtime commands ran
**foreground, awaited, sequentially**, with absolute runtime
`TMPDIR='<repo-root>/_tmp-arpc-08-aiwhequb'` (replace `<repo-root>` before replay).
The package test additionally set `ARPC_CRUD_WORK_REPORT` and
`ARPC_OUTPUT_PREPARATION_REPORT` beneath that directory; only separate work probes
use them. A scratch runner captured status/logs without changing package commands.

| Effective command | Actual result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Exit 0; 27.223s, including necessary filtered transitive builds |
| `pnpm --filter @web-ts-toolkit/access-router test` — **once**, 2,400,000ms foreground tool timeout | Exit 0; **210 files / 7,558 tests passed**; command 1,682.598s, Vitest 1,661.54s; no failed/skipped/pending tests reported |
| `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks/access-router-crud-v2-worker.mjs scripts/benchmarks/access-router-crud-v2.mjs scripts/benchmarks/access-router-crud-worker.mjs scripts/benchmarks/access-router-crud.mjs` | Exit 0; 7.810s, no diagnostics |

The final console reporter emitted aggregate totals, not per-file counts; none
are invented. The nonblocking Vite native-config-loader warning also appears in
the historical baseline record. No root/grouped/downstream tests, root build/lint
sweep, root release command or additional benchmark/calibration was run.

Read-only audits independently reconstructed original source/declarations,
recalculated preserved measurements, and reverified the original frozen seal
(151 source files, 127 dependency packages, original manifest/bundle hashes).
Before adding this packet, 89 existing artifacts/55 JSON files/163 Markdown file
links were reviewed; all 41 copied/inventoried archived hash checks matched.
Final review also checks this packet's JSON/links/privacy/whitespace, destinations
not ignored, `git diff --check`, and unchanged protected files. Historical reports
are read with their supplemental withdrawal/reconciliation notes; no original
report, raw packet, protocol or hash seal was rewritten.

Only this report, concise scrubbed log and verification manifest are preserved.
Raw build/test logs, the complete new work-record bodies, generated consumers,
bundles/source copies, dependency trees and MongoDB files remain disposable.
Their hashes are not a self-contained reproduction bundle; reruns require the
checkout/diff, maintained tests/tooling, lock/toolchain, consumer-install and
MongoDB prerequisites. All necessary review evidence links resolve without this
reviewer's scratch directory. Test durations are runner diagnostics only.
