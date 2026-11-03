> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-03 trusted query runtime evidence

Scope: sequential FP-03 implementation after verified FP-01/FP-02. The coordinator
owns `docs/tasks`; no task documents, dependencies, lockfiles, historical evidence,
commits or publication are changed by this session. No agents are spawned. All
builds/tests/timings run serially and finish before return.

Authoritative contract: `docs/tasks/20261030-142406-access-router-unsafe-authorization-fast-path.md`
resolved FP-01 table and `docs/task-artifacts/access-router/authorization-fast-fp01-20261030-142730/coordinator-notes.md`.
FP-02 handoff: `docs/task-artifacts/access-router/fp02-recovery-20261030-153025/coordinator-notes.md`.

This file records implementation and verification as work proceeds. FP-03 is not
complete until its acceptance criteria and genuine paired pilot verification pass.

## Outcome

FP-03 runtime, focused gates and genuine final-source paired pilot are delivered.
The coordinator owns task-status reconciliation. No task document was edited.
Performance is **provisional** pending FP-05's full package/downstream/runner/guard
matrix and FP-06's independent review. No security equivalence, historical parity,
full-workspace or final retention claim is made.

The implementation is a borrowed query pipeline, not publication fusion: ordinary
active rows omit source/stage/hook/grant/context defensive copies and output graph
passes. The original operation/row/field evaluators, actor, planning, target gates,
mandatory hooks, getter semantics and request work gates remain.

## Architecture / actual-state boundaries

- `src/acl/captured-authorization-configuration.ts` privately brands detached model
  captures. `service-authorization.ts` shares one authenticated captured view only
  for active calls. Embedded scopes share policy/catalog/permissions/preparation;
  related targets keep their own captured configuration and operation/row policy.
  READ retries retain their initiating capture. No live/ambient lookup selects mode.
- `document-authorization.ts` has discriminated source and output records. Trusted
  stages have **no snapshot property**; copied stages own real detached snapshots.
  Grant records distinguish borrowed/copy-fallback state. Trusted output records
  contain root ownership plus issued-member registries, **no snapshot/identity array**.
  Frozen empty WeakMap handles and exact call/stage/request/runtime/model/name/scope/
  access/root associations remain. Private optional cells have own properties so
  inherited setters cannot expose/hijack memo/capture records.
- Ordinary lean hook inputs are borrowed. Hydrated roots use one
  `toObject({virtuals:false,flattenMaps:true})`; shallow-unproven roots use compatible
  copies before their hook. Per-call private normalization/reference origins retain
  actual fetched target identity through hydration, not ID-based decision caches.
  Unknown replacements have no normalization/issued-member authority.
- Trusted field memo hits return settled booleans directly. Pending and failure
  promises are retained per stage; no defensive `Promise.resolve().then`, observer or
  hit-validation wrappers on this branch. The shared grammar/extractor/classifier,
  ancestor delegation and short-circuit remain. Actual async results recheck cheap
  bindings. Default/copied branches retain their old copies/checks/scheduling.
- `output-field-policy.ts`, `output-projection.ts` and embedded plan preparation
  reuse active scope/config preparation, not per-row results. Each element still has
  a distinct stage/decisions and its owning parent's grants/memo identity. Active
  planner/reconstruction writes use data descriptors, including after native code
  installs inherited setters.
- `trusted-output-materialization.ts` provides shallow shells, selected native/value
  materialization, named Map scopes, safe array slots and dotted spines. New work
  uses shared 20,000-slot/issued-root and depth-100 budgets. Cycles/unsupported selected
  proxies/custom objects/functions/symbols reject with controlled authorization errors;
  invalid virtual return values omit fail-closed. Supported native fallbacks normalize
  once; BSON wire expansion is safely reconstructed/budgeted without second serialization.
- The modern finalizer resolves grants once, finalizes children before getters,
  retains stable-base/per-getter document copies and return staging when needed, and
  shares grant/context leaves. Private getter argument-four admission/projection/
  isolation is unchanged. Specialized private-populate transport/view copies remain;
  they are not claimed to be zero-copy or historical parity.
- Service/include/populate/reference assembly retains authenticated target DTO roots
  directly. Source and produced include lanes remain separate. Unused correlated
  whole-source clones are gone; actual correlated reference inputs alone are captured.
  Metadata/exposed keys/request-only `_view`/`_edit` and attachments finish **before one
  root association/context**, without a post-finalizer whole-response copy/graph transfer.
- Builders collect **issued document roots**, never arbitrary business/native graphs.
  Registry union/lookup work is bounded; repeat unions short-circuit. Dotted spines
  preserve actual issued owners/membership cheaply (including nested child spines),
  without refreshing an original association or upgrading trusted objects to strict
  authority. A removed original child can remain discoverable; replacement objects
  are not automatically members. Another row's embedded handle is not reused under
  this parent, even with the same ID/provenance. Actual shared fetched targets can be
  intentionally issued in both rows.
- Retained-handle helpers authenticate before fresh runtime capture, filter current
  values with captured stale memo/shared grants, and resolve unknown embedded children
  with the owning parent's grants. Unknown referenced targets use ID fallback/omission,
  never parent grants. Fresh raw helpers remain strict/known-trimmed fail-closed.
- Writes/new/create/update/upsert/delete, write-derived output, dedicated subdocuments,
  off/dormant and all original modes stay on their original paths. Four untouched
  incoming FP-02 source files are byte-preserved, and all 192 original tracked tests
  remain byte-identical to HEAD. Only FP-02's *new* configuration-only tests/warnings/
  JSDoc were explicitly transitioned to the real runtime contract.

All source paths above are under `packages/access-router/`. Main changes also include
`src/services/service.ts`, `src/services/base.ts`, `src/output/finalize-model-output.ts`,
`src/output/include-output.ts`, `src/output/permissions-alias.ts`, option/handle JSDoc,
and two new `test/authorization-fast-path-runtime.*.test.ts` files.

## Deterministic proof / retained risks

`test/authorization-fast-path-runtime.unit.test.ts` contains 44 passing cases;
`test/authorization-fast-path-runtime.integration.test.ts` contains 8. Configuration
tests now contain 319 passing cases (the prior 315 plus off/dormant counterparts for
the former configuration-only handle test). No old strict/native/grant/copy/fusion-
absence tests were amended.

Six dynamic rows, 24 callback fields, two embedded children per row:

| Work | FP-01 original eight ON/new OFF | Active candidate |
| --- | ---: | ---: |
| Stage/hook-input copies | 36 | **0** |
| Grant copies | 384 | **0** |
| Deep diagnostic contexts | 24 | **0** |
| Whole lean source normalizations | 24 | **0** |
| Graph transfer calls | 390 | **0** |
| Identity walks / clone-free admissions | 30 / 36 | **0 / 0** |
| Full call resolution | 7 | **1** |
| Embedded scope derivation | per row | **1 shared descriptor** |
| Service contexts | 12 | **6** |
| Actual root hooks / field callback bodies / adapter reads | 6 / 144 / 1 | **6 / 144 / 1** |

Counts are passing assertions on real Service/PublicService paths, not timing
instrumentation or simulated activation. `v2-work-counts-visible.log` reruns the two
work cases (2 passed/42 excluded by the explicit filter). Vitest did not emit the
fixture's console lines in this environment; do not fabricate additional numeric
configuration-copy totals beyond the asserted one-resolution/one-scope boundary.

New regressions cover READ/LIST/opposite flags/off/dormant, actual root/retry/rollback
and reentry, metadata on/off/dotted/request-only maps, embedded/named Map selection,
includes/correlations/populate/actual shared targets, private inputs, virtual stable
views/errors, same-ID/concurrent stages, cheap wrong tuple/root/stage/forgery, removed
members/replacements/stale memo, mixed copied/trusted rows, native/value fallback,
selected slot/depth/cycle failures and safe writes after inherited-setter installation.
Focused old suites cover additional ownership/actor/default/write/helper/public paths.

Intentional counterexamples reproduce:

1. Source/grant Date mutation (also across actual async rule awaits) permits a later
   field active mode denies with old detached grants. Hook/rule bodies still run.
2. Omitted fetch-only Date **and BSON** observations allow a field the current all-eight
   path denies before its hook. The hook still runs exactly once.
3. Trusted root/helper accepts descendant replacement; old graph-backed roots reject.
   Removed issued children remain members; replacements/other-row children gain no
   lookup handle. Filtering still applies rules with stale decisions/shared grants.

Lost guarantees: full unvisited source/grant/context shape/depth/slot validation,
immutable source/native/configuration/context/grant leaves and current descendant
integrity. Source/grant mutations, stale authority and changed native observations
can change outcomes, including denial becoming allowance. Selected values, hydration,
getter views/private inputs and serialization can still normalize/execute native code.
Copied compatibility rows/grants and selected value fallbacks are actual states, not
fake live snapshots; they do not restore every active call's former context/config
isolation. Application direct fan-out/native side effects remain outside new budgets.

## Verification executed (SERIAL, repo root)

- Source typecheck:
  `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
  — passed, `source-typecheck-final.log`.
- **V1**:
  `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
  — passed, `v1-final-build.log`; 14 dist/8 declaration files.
- **V2** final command with all 58 package-relative arguments:
  `v2-broad-final.command.txt` — **2,585 passed / 58 files**, 244.34 s,
  `v2-broad-final.log`. Serial focused prefixes are the task's prescribed Vitest
  invocation (`--no-file-parallelism --maxWorkers=1`). An earlier 54-file milestone
  passed 2,498; subsequent expanded code was rebuilt and reverified, not assumed valid.
- **V5**:
  `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks`
  — passed, `v5-eslint-final.log`.
  Changed-file `pnpm exec prettier --check` — **27 files passed**; complete command
  in `v5-prettier-final.command.txt`, log `v5-prettier-final.log`.
  `git diff --check` — passed, `v5-diff-check-final.log`.
- Preservation/export/artifact verification:
  `node _tmp-fp03-20261030-155647/verify-final.mjs` — passed,
  `final-verification.json` / `final-verification.log`.
  Rehashed **548 sealed candidate files**, **542 official-before files**, all **192
  original tests**, task docs, lock and public entrypoints. Preservation also rehashed
  **134 pinned dependencies / 3,500 files**. Public export **exact name sets** remain
  CJS/ESM **46 / 48 / 6** and declarations **186 / 322 / 17**; no new private issuers,
  readers, budgets or marker API is exported.

Early failures are preserved, not hidden: new tests initially expected rejection
instead of the Service's controlled error result, used a synthetic child rather than
a genuine planner descriptor, supplied invalid mixed correlated/legacy arguments,
and omitted a count-specific fixture scope. These fixtures were corrected. Additional
regression-first safe-write/dotted-spine tests exposed and fixed active planner/memo/
reconstruction inherited setters and nested spine membership. Final focused gates pass.

Full V3 package/packed/strict consumers, V4 downstream and V6 complete runner tests
were **not run** by FP-03; they belong to later tasks. No full-workspace claim.

## Genuine paired pilot / actual artifacts

Commands (both runs serial; every job is the real repository worker):

```sh
node _tmp-fp03-20261030-155647/preserve-candidate.mjs
node _tmp-fp03-20261030-155647/pilot.mjs
node _tmp-fp03-20261030-155647/preserve-candidate.mjs final-candidate
node _tmp-fp03-20261030-155647/pilot.mjs v7-final-pilot final-candidate-metadata.json
```

First pilot artifacts remain at `pilot-candidate/`, `pilot-candidate-metadata.json`,
`v7-pilot/`; final artifacts at `final-candidate/`, `final-candidate-metadata.json`,
`v7-final-pilot/`. Each includes all raw samples, jobs, logs and summaries; original
FP-01/FP-02/historical diagnostic evidence was not overwritten. The unchanged workload
contract is 100 rows, 24 fields, 32 bytes, one client, hook concurrency 10, five warmups,
50 samples. Wide, document-rules and embedded are separate. Two paired batches alternate
OFF→ON then ON→OFF, with reversed scenario order. Official before is independently
rechecked/timed in each pilot, not treated as a same-build causal pair.

Final tested/timed root ESM SHA-256:
`c26c217b9228be53cac54ed2a1bbde2920d04c61676569b7df32e3283e5dc401`.
Declaration hash:
`9593bea938e6cc14bf2857a3eedaa6d138d9d01c38709b64bb2422255bd7f537`.
Worker/core hashes and CJS/lock are in `final-verification.json`. Same candidate bytes
are used for new OFF vs ON. Supported declarations, both real server getter paths,
matching prerequisites/effective LIST/READ modes, actual LIST origin, lean hydration,
one read/request, row order/denied data/full before/after fixture and fingerprint,
0 getters and **5,000 document hooks** per document-rules job passed. No instrumentation
or monkeypatched activation is used during timing.

Final-source pilot (milliseconds; OFF is original eight ON/new OFF):

| Scenario / round | OFF median / p95 / CPU-request | ON median / p95 / CPU-request |
| --- | --- | --- |
| wide / 1 | 25.863 / 32.006 / 33.752 | **19.207 / 23.987 / 25.772** |
| wide / 2 | 25.869 / 31.910 / 34.304 | **19.419 / 24.010 / 25.518** |
| document-rules / 1 | 31.183 / 36.004 / 38.555 | **22.622 / 27.188 / 27.939** |
| document-rules / 2 | 32.630 / 40.473 / 40.299 | **21.668 / 26.562 / 26.851** |
| embedded / 1 | 80.012 / 92.031 / 97.415 | **36.128 / 47.409 / 48.455** |
| embedded / 2 | 77.023 / 86.772 / 93.503 | **35.593 / 44.566 / 47.861** |

Final official-before median/p95/CPU: wide **27.972 / 34.984 / 35.883**,
document-rules **32.568 / 38.172 / 40.806**, embedded **75.713 / 95.286 / 94.822**.
Final same-build median reduction is about **25–26% wide, 27–34% document-rules,
54–55% embedded**. First pilot also improved both paired rounds (wide 22.652/22.964
OFF vs 16.666/17.123 ON; document 29.512/28.840 vs 19.525/19.598; embedded 70.089/70.888
vs 32.434/33.660). Ambient absolute times drifted upward in the final run, including
official before: do not compare first/final absolute times as a causal regression or
combine batches selectively. Samples/p95/CPU are preserved; relevant repeatable
within-pair benefit supports delivery/refinement, not final FP-05 retention or v0.51 parity.

No new historical timing was run. FP-01's source-only same-current-dependencies
diagnostic remains available and explicitly is not frozen historical dependencies.

## FP-04/FP-05 handoff / remaining verification

- FP-03 moved forward **minimal independent third-group worker/core plumbing**:
  `UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS`, declaration inspection, flag options,
  effective mode computation/candidates, real getter checks and requested/effective
  result fields. Existing six/two modes, workloads and response checks are unchanged.
- FP-04 still owns interactive CLI selection, reports/labels, executable installed
  consumer docs/README/llms/release notes, packed/strict CJS/ESM/type examples and runner
  tests. Existing runner test `scripts/benchmarks/access-router.test.mjs` still expects
  the old private unsafe-options module's three runtime exports (around line 107);
  FP-02 already added independent exports, so reconcile that expectation **without
  weakening the original six/two group assertions**. It was inspected, not claimed
  as an executed baseline/V6 failure. No existing runner test was edited here.
- FP-05 must run all integrated V1–V6 plus strict/dormant/before and narrow/hydrated/
  global/large-config/populate/virtual/size guard V7 scenarios, declaration/getter/
  fingerprint/hydration/hook verification and bounded refinement if needed. No final
  speedup/security/historical claim before those gates and FP-06 independent review.
- Known retained-copy paths are deliberate: actual copied source/output rows, exotic
  grant fallback, selected native/value fallback, historical getter document views/
  return staging and specialized private populated input/transport isolation. They
  must not be reported as zero-copy or optimized write paths.
- No unfinished FP-03 core path or failing focused gate is known. Real-application,
  full consumer/downstream/runner and performance-guard coverage remains unverified
  within its later-task ownership. All commands were foreground/serial; owned Mongo
  workers and driver servers were closed in `finally`. No agents, commits, publishing,
  installs, dependencies/lock, historical or task-file edits.

Final process evidence: `process-final.json` reports **zero active build/test/
benchmark/Mongo processes**. All owned foreground commands have returned.
