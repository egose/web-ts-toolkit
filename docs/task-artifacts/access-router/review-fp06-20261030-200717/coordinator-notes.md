> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-06 independent review — findings require sequential resolution

## Outcome

**Do not mark the feature/review acceptance complete yet. Two retained-contract
findings are reproduced below.** This is an independent review, not the runtime
implementation session. No delegation, product/test/task-doc edits, dependency
installation, lock changes, commits, publication or reverts. Only this new ignored
review directory was created. All commands were foreground, serial and awaited.

The accepted weaker source/grant/context/configuration/native-observation/stale-memo/
descendant contract is not being challenged. No finding requires restoring the
waived whole-source snapshots, detached grant copies or current-graph identity walks.
Default/write/wire admission did not show a relaxation in the reviewed tests. These
are bounded review results, **not independently proved security equivalence**.

## Actionable findings

### FP06-R1 — P1: trusted related derivation skips parent request/runtime ownership

- **Evidence:** `packages/access-router/src/acl/service-authorization.ts:522-582`
  (`deriveTrustedQueryAuthorization`), especially the return before the existing
  `resolveServiceAuthorization:624-628` parent request/runtime comparison.
  `nestedQueryResponse:498-505` authenticates the parent's supplied binding and the
  target model/name/scope, but does not compare the **receiving child's** request or
  runtime to the parent's. Embedded/retry branches do have corresponding checks.
- **Actual result:** start from a legitimately issued active parent with a captured
  target; supply its correct `parentBinding` and the exact captured target model/name,
  but change either child `binding.request` or `binding.runtime`. Active resolution
  issues a trusted child and carries over `parent.permissions`, policy/config and
  provenance. Its own binding readers accept the foreign tuple. The same setup with
  the new flag OFF rejects with `derived call request/runtime mismatch`.
  `v2-adversarial-handoff.log` prints `inheritedReaderPermission: true`,
  `inheritedProvenance: true`, `capturedMode: active` for both foreign cases, even
  though the child input supplied an empty permission view.
- **Retained-contract impact:** cheap exact request/runtime ownership and no
  cross-request authority sharing were expressly retained, not waived native/config
  isolation. The copied path's check is accidentally bypassed by the early return.
  This proof is at a **private derivation seam**; no direct HTTP exploit or final
  response disclosure is claimed. Later attachment checks may reject a foreign DTO,
  which does not make issuing/using the wrong-owner call correct.
- **Resolution:** reject a related derivation whose receiving request/runtime differ
  from the parent's before issuing any shared trusted view/call. Preserve captured
  target model/name/scope checks, originating READ/LIST capture and target-own policy.
  This needs a cheap tuple check, not another graph/snapshot pass.
- **Repro tests:** final two cases in `review-adversarial.test.ts`, describe
  `FP06 related derivation cheap owner boundary`. Both fail only for active mode;
  OFF assertions inside each case pass. Promote to the product option/authority
  suite, including `createRelatedExecution`/real receiver coverage if practical.

### FP06-R2 — P1: selected BSON fallback is not bounded by the retained output budget

- **Evidence:** `packages/access-router/src/acl/trusted-output-materialization.ts:233-256`
  (`materializeTrustedOutputValue`). It serializes/deserializes before budget
  admission of any normalized container, then skips recursion entirely whenever the
  normalized result is itself a BSON value. BSON `Code` can contain a full scope
  graph; BSON family membership does not prove a scalar leaf.
- **Actual results:**
  1. Selecting `new BSON.Code('return 1', { expanded: Array(20001).fill('selected') })`
     succeeds in genuine service LIST **and READ**, once-per-row hooks still run.
     A selected Code scope 110 levels deep also succeeds in the value materializer.
     A Code scope with ten entries succeeds even after 19,995 shared budget slots
     have already been consumed.
  2. A selected ObjectId `toBSON` returning an object with 21,000 enumerable accessor
     slots causes **all 21,000 reads** in the library's BSON serializer before its
     later reconstructed output is rejected. Rejecting after the full serialization
     does not bound that library-owned traversal.
  3. **Actual packed public HTTP reproduction:** unmodified real production-transformed
     tarball + existing current peers + real MongoDB, ordinary stored `Code.scope`
     with 20,001 selected entries: both public LIST and filter READ return HTTP **200**
     and all **20,001 scope entries**. Two hooks total. See
     `packed-public-bson-complete-result.json` / `.log`.
- **Retained-contract impact:** this concerns **selected** data and new library-owned
  materialization/compatibility work, not accepted unvisited-source limits or arbitrary
  computation inside an application native method. The retained shared 20,000-slot /
  depth-100 promise is false for these selected native/container cases. No prototype
  pollution or broader native security equivalence is claimed.
- **Resolution:** budget/validate native-contained graphs and wire-normalized
  containers before library-owned unbounded serialization/copy traversal; preserve a
  single native normalization observation and existing supported value semantics as
  appropriate. Keep the same shared remaining budget, controlled errors/no partial
  publication and safe selected reconstruction. Do not fix by restoring whole-source
  eligibility walks or simply weakening the accepted docs/tests.
- **Repro tests:** first five cases in `review-adversarial.test.ts` (LIST, READ,
  shared remaining budget, depth, pre-admission wire expansion). All fail. The packed
  repro command intentionally exits 1 because both statuses are 200 rather than 400.
  Add ordinary supported BSON controls plus retained-handle/virtual-return-channel
  cases when implementing the fix. Validate `Code` and other container-bearing BSON
  families, not just ObjectId wire hooks that normalize to a plain array.

## What was reviewed / preserved

Read task/AGENTS, FP-01 accepted matrix and all FP-02 recovery/FP-03/FP-04/FP-05
handoffs, then actual source/diff/tests, capture/derivation callers, private stage /
grant/output unions and WeakMaps, selected materializer/registries, field evaluator /
memo/preparation, service/finalizer/include/populate/reference lanes, getter/private
input gates, runtime normalization/warnings, descriptor admission and published
declarations/docs/metadata. No requested restoration of intentionally waived risks.

Positive reviewed/tested boundaries include independent literal-true flags and all
four matching prerequisites, off/dormant/default inheritance, origin capture before
hooks/awaits, READ retries, rollback/reentry, opposite target flags, injection presence
including inherited/non-enumerable/undefined, inert business names, actual writes /
write-derived output/dedicated children/raw helpers, mixed copied/trusted records,
mandatory hooks/actor/order/short-circuit, pending/failure memo sharing per stage,
same-ID independent rows, stale allow/deny, issued-vs-reachable membership, removed /
replacement/other-row children, unknown-target ID fallback, metadata/maps/aliases,
include source collisions, child-before-parent virtual views/private arg-four,
ordinary selected bounds/cycles and existing original-eight/fusion-withdrawal tests.

R1 specifically identifies a hole in the **derived** request/runtime boundary; the
positive forged root/stage/output tuple tests passing do not cover that omission.
R2 specifically identifies the remaining native-container budget hole; ordinary
array/depth tests and a BSON hook returning a plain giant array passing do not cover it.

## Checks actually run (repo root; SERIAL)

All log/fixture paths below are relative to this review directory unless shown in
full. V2 package-relative paths use this exact prefix:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1
```

1. **V1 passed:**
   `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
   (`v1-build.log`). Live 14 dist files subsequently equal measured final candidate.
2. **V2 focused: 1,035 passed / 16 files**, `v2-focused.log`, prefix above plus:
   - `test/authorization-fast-path-options.unit.test.ts`
   - `test/authorization-fast-path-options.integration.test.ts`
   - `test/authorization-fast-path-runtime.unit.test.ts`
   - `test/authorization-fast-path-runtime.integration.test.ts`
   - `test/query-snapshot-options.unit.test.ts`
   - `test/initial-output-snapshot-copy.unit.test.ts`
   - `test/list-snapshot-checks.unit.test.ts`
   - `test/read-snapshot-checks.unit.test.ts`
   - `test/authorization-snapshot.unit.test.ts`
   - `test/snapshot-review-regressions.unit.test.ts`
   - `test/service-authorization-boundary-admission.contract.test.ts`
   - `test/field-helper-request-boundaries.integration.test.ts`
   - `test/populate-operation-policy.helper-isolation.test.ts`
   - `test/request-hook-ownership.test.ts`
   - `test/request-hook-concurrency.test.ts`
   - `test/service-snapshot-builder.unit.test.ts`
3. **V2 consumer: 154 passed / 3 files**, `v2-consumer.log`, same prefix with
   `test/export-contract.test.ts test/strict-consumer-types.test.ts test/documentation-examples.test.ts`.
   Used `TMPDIR` pointing to the harness-approved scratch root. Actual README
   NodeNext workflow ran; negative/strict option/type/declaration examples compile.
4. **V2 original modes: 168 passed / 5 files**, `v2-original-modes.log`, same prefix
   with `test/output-publication-fusion-withdrawal.unit.test.ts test/query-snapshot-work.unit.test.ts test/default-model-options.unit.test.ts test/read-snapshot-checks.integration.test.ts test/list-snapshot-checks.integration.test.ts`.
   **Total independent package V2: 1,357 passed / 24 files.**
5. **New independent scratch fixture: 2 work proofs passed, 7 adversarial cases
   failed**, `v2-adversarial-handoff.log`:

   ```sh
   pnpm exec vitest run --config _tmp-review-fp06-20261030-200717/vitest.config.ts --no-file-parallelism --maxWorkers=1
   ```

   Earlier narrowed work/owner/native runs retained; failures are not hidden or
   marked passing. Final whole-file command is the handoff reproduction.
6. **Actual packed public BSON probe reproduces R2 (intentional exit 1):**
   `node _tmp-review-fp06-20261030-200717/packed-public-bson.mjs`.
   Executed with approved scratch TMPDIR, current Mongoose 9.11.4 / Express 5.2.1,
   real owned MongoDB. No installation; only ignored extracted tarball and dependency
   links. Both queries and their hooks finish; server/connection/Mongo close in finally.
7. **Extra actual-packed strict/current consumer proof passed:**
   `node _tmp-review-fp06-20261030-200717/packed-current-consumers.mjs`.
   Recompiles exact published fast-path fixture, fusion-negative fixture and README
   against a real extracted tarball using **Bundler, Node16, NodeNext**, strict +
   `skipLibCheck:false`. Both .mts/.cts conditions participate. Actually executes
   newly emitted Node16 **ESM/CJS**, NodeNext **ESM/CJS**, and the preserved real
   package-inclusive bundled README workflow: **five executions**, not merely tsc.
   `packed-current-consumers-result.json` preserves focused configs/paths/results.
   No dependencies installed; current existing peer links only, Node runtime v26.12.1
   (Node16 here is TypeScript resolution/emission, not Node 16 runtime support).
8. **V6: 29 passed**, including 16 real worker cross-product jobs:
   `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs`
   (`v6-runner.log`). No timing/performance rerun claimed from these smoke jobs.
9. **V5 passed:**
   `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks`
   (`v5-eslint.log`); Prettier over **42 changed scoped files**, llms with explicit
   Markdown parser, extracted new CHANGELOG entry, and `git diff --check`.
   Exact formatter argv in `v5-prettier-*.command.json`; historical whole-CHANGELOG
   exception preserved without unrelated formatting. No formatting applied to product.
10. **Independent read-only audits passed:**
    - `python3 _tmp-review-fp06-20261030-200717/audit-evidence.py`
    - `node _tmp-review-fp06-20261030-200717/audit-public-surface.mjs`
    - `node _tmp-review-fp06-20261030-200717/audit-workloads.mjs`
    Result JSON/logs use `independent-*` names.

Reviewer fixture setup failures are retained: the first scratch Vitest import could
not resolve Mongoose from repo-root scratch; using the existing package dependency's
explicit module path fixes that setup without an install. The first public-surface
audit's overly exact risk-wording regex rejected equivalent READ prose; fixed the
reviewer assertion, not docs. The first audit script expected string hashes rather
than historical metadata's `{gitBlob,sha256}` records; corrected only the reader.
The first packed public probe read the READ HTTP presentation wrapper incorrectly;
the final run uses the actual bare READ body and proves both 20,001-slot results.

## Independently verified work removal (NOT timing counters)

New real-Service fixtures, six rows, 24 dynamic field callbacks, with and without
two children per row; original eight ON in both columns:

| Work, embedded case | New OFF | New active |
| --- | ---: | ---: |
| Stage/hook source copies | 36 | 0 |
| Grant copies | 384 | 0 |
| Deep diagnostic context copies | 24 | 0 |
| Whole-source normalizations | 24 | 0 |
| Graph transfers | 390 | 0 |
| Identity walks / clone-free admissions | 30 / 36 | 0 / 0 |
| Full resolutions / configuration copies | 7 / 77 | 1 / 1 |
| Service output contexts | 12 | 6 |
| Root hooks / callback bodies / adapter reads | 6 / 144 / 1 | 6 / 144 / 1 |

One active embedded scope derivation; distinct per-row handles remain. Nonembedded
OFF gives 12 stage / 318 grant / 6 context / 12 source / 342 transfer passes; active
gives zero, one resolution/config copy and six contexts, still 6/144/1 actual work.
Raw asserted counts are printed in `v2-adversarial-handoff.log`; they are not
attributed to all timed rows. Timing `runtimeOmissionCounts` stays null throughout.

## Artifact / public surface / workload evidence

Independent audit rehashed final-before **542 files**, final-candidate **549 files**,
each 14 dist / eight declarations, **134 pinned dependency identities / 3,500 files**,
actual dependency links, every job's selected dist/declaration identities and
**106 historical source files against actual v0.51.0 Git contents**. Live 14 rebuilt
dist files equal measured candidate byte-for-byte.

- Current ESM: `c26c217b9228be53cac54ed2a1bbde2920d04c61676569b7df32e3283e5dc401`.
- Current CJS: `3b9edf18c7132c495036802d92d4923cf7b4b1559b0b48872f306c1bc60f5b2f`.
- Declaration manifest: `5d7ce47c3ea6117c01e5a375f8a58a7637dcb976eaac9b50ea92fa01a0173468`.
- Lock: `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` unchanged.
- Actual tarball: `86b5b8a083a32b6edd9ed93fccd2377aa5fed06c79cb57f171cc8ebf72edf14f`,
  **19 files**, all 14 runtime/declaration outputs and shipped README/llms equal live;
  no source/test/scratch shipping. Package manifest/public entries unchanged from HEAD.
- Independently loaded CJS/ESM **exact runtime name sets** unchanged: root **46**,
  advanced **48**, processors **6**. TypeScript checker **exact declared name sets**
  unchanged in both conditions: **186 / 322 / 17**. Both new properties are optional
  `boolean | undefined`, with emitted default/prerequisite/risk JSDoc. No public
  issuer, private budget/view/member state or marker API added.
- Independently compared **30** workload/scenario/options/measurement/response-check
  blocks against **starting HEAD**, byte-identical; worker diff is mode verification /
  reporting only. Original six/two group meanings remain unchanged.
- All incoming **47** changed/task/lock file identities and Git status preserved.
  Prior task docs and prior ignored evidence were not edited.

## Measurement audit / honest retention disposition

**No new V7 timing run.** Independently read all five actual raw batches and jobs,
not just summaries; checked summary/result equality, artifact/manifests/getters on
both models, modes, settings, actual hydration/reads/hooks/getters and recomputed
median/nearest-rank p95/mean/min/max/throughput for **132 jobs / 8,100 samples**.
Independently reconstructed expected fixture rows and their **18 fingerprints**,
including row order, denied fields, document-rule denials, embedded and populated
fields, and virtual results. All agree.

Primary 100 rows / 24 fields / 32 bytes / one client / hook concurrency 10 /
five warmups / 100 samples, same candidate original-eight ON, OFF vs active medians:

| Scenario | Round 1 OFF / ON | Round 2 OFF / ON |
| --- | --- | --- |
| Wide | 18.705 / 13.920 ms | 18.463 / 14.218 ms |
| Document rules | 23.111 / 16.097 ms | 22.695 / 15.784 ms |
| Embedded | 58.421 / 26.654 ms | 58.105 / 27.170 ms |

Recomputed median improvements **23.0–25.6% / 30.4–30.5% / 53.2–54.4%**;
all primary p95s and recorded CPU/request stats improve. Independently verified
**all 24 active guard pairs** have lower median/p95/recorded CPU. Recorded CPU totals
were not retained as raw user/system counters, so CPU is audited **as recorded
statistics**, not claimed independently recomputed from latency samples.

Strict/dormant small-case adverse observations remain: up to ~**+7.0% median** and
**+19.5% p95**; reversal/repeat results do not rule out modest overhead or tail/order
noise. Alternating reversed sequential order is not randomized/statistical
significance. Official-before is close to OFF, not a weakened baseline. No pooling
of cross-session absolute times. Actual historical source-only/current-dependency
diagnostic remains **2.3–3.0x faster than active**; not frozen historical environment,
historical parity or security equivalence. No READ latency or real-application run.

Audited (not rerun) FP-05 actual command/result/log evidence for full V3 **6,296 /
178**, all **11** packed cases including three artifact-tree gates, package
typecheck, downstream **691 / 22** and V6 **29**. These are prior-agent results,
not independent full-suite claims. Runtime bytes are unchanged by this review.

**Recommendation:** keep the performance-first retention recommendation provisional;
relevant benefit is credibly supported, but resolve R1/R2 sequentially before final
acceptance. Promote failing regressions, rebuild and rerun affected authority/native /
helper/integration/consumer gates; then recheck any invalidated full gates and seal
new identities. Old measured bytes/results cannot simply be relabeled as a fixed
candidate. Recheck performance proportionately (especially affected populate/native
paths and final-artifact activation) without reintroducing the waived snapshots.

## Limits / completion handoff

This is not a full security audit of every custom-core adapter, every BSON family,
every exotic descriptor/native side effect or application callback. Private accessor
and selected-native combinations beyond the reproduced cases are not exhaustive.
No fresh minimum-peer install, full V3/V4 rerun or new V7/READ/real-app timing was
performed. No fixes are made in this review-only session; fixes and invalidated
gates require the coordinator's sequential implementer/reviewer follow-up.

Coordinator owns task status. Findings are open; feature acceptance should remain
blocked/in progress until resolved. Review ends here, with no owned jobs remaining
as verified separately in `handoff-state.json`.
