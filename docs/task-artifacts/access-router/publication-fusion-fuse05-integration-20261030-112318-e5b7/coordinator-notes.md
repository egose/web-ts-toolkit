> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FUSE-05 coordinator-ready handoff

**Disposition: WITHDRAWN unshipped prototype, including both new option properties,
configuration/capture/warnings, runtime seam, advertised documentation/examples and
the benchmark third group.** The performance-and-regression retention gate failed.
Small embedded wins were observed; this is **not** a claim that every timing showed
no benefit. Mixed wide/narrow results, document-rule regressions and repeated
100-row populate regressions do not justify retaining the additional security risk.

Final V1–V6 and artifact/preservation checks passed. FUSE-05 is ready for coordinator
reconciliation as a completed **investigation with withdrawal**, not a delivered
speedup. FUSE-06 independent review remains separate and pending.

Task: `docs/tasks/20261030-082847-access-router-unsafe-output-publication-fusion.md`.
This child did **not** edit task/status documents, spawn agents, commit, publish,
change versions/workspace dependencies/locks, or reset/checkout/revert user work.
Commands ran from the repo root, one task command at a time, in the foreground.
Transitive builds used concurrency one. The final downstream gate explicitly
disabled Vitest file parallelism; an earlier default downstream invocation also
passed but is not used as the fully serialized final evidence.

Evidence directory: `_tmp-publication-fusion-fuse05-integration-20261030-112318-e5b7/`.
All paths below are relative to it unless otherwise specified.

## Exact changes and withdrawal attribution

Net deliverable versus the pre-FUSE repository is **five modified tracked files
plus two new tests/fixtures**:

- `packages/access-router/README.md`: short explicit unshipped-withdrawal notice;
  the original six comparison/two copy descriptions are restored.
- `packages/access-router/test/strict-consumer-types.test.ts`: five installed
  Bundler/NodeNext/Node16 negative API checks with `skipLibCheck: false`.
- `packages/access-router/test/packed-consumer-compatibility.test.ts`: include the
  withdrawal fixture in actual packed/release-shaped consumer matrices.
- `packages/access-router/test/output-publication-fusion-withdrawal.types.fixture.ts`
  (new): root/advanced/default/extended types have no former options; all eight
  original options remain optional booleans.
- `packages/access-router/test/output-publication-fusion-withdrawal.unit.test.ts`
  (new, seven tests): no shipped option/helper surface, original direct/public
  READ/LIST publication counts, and original third-Date-observation/later same-ID
  denial even when JavaScript supplies the former unknown option names.
- `scripts/benchmarks/README.md`: no third selection; explicit withdrawal notice
  and serialized four-candidate comparison/copy smoke commands.
- `scripts/benchmarks/access-router.test.mjs`: retain exact exported six/two/eight
  group inspection rather than a raw-source occurrence regex; only the original
  three internal array exports exist.

The authorized inverse patches affect **only 35 known FUSE-02/03/04 files**:
25 existing files restored, ten known new prototype test/fixture files removed.
Every removed file was preserved in `start-surface/` and `candidate-current-v1/`;
all older phase artifacts/logs remain untouched. `withdrawal-plan.json` records
every path, starting/restored hash, authoritative original and preservation path.
`withdrawal-*.patch`, `restoration-verification.json` and `fuse05-only.diff` retain
the exact inverse/delivered diff; no generic git restoration was used.

The eleven restored runtime files are:

- `packages/access-router/src/interfaces/root.ts`
- `packages/access-router/src/acl/unsafe-snapshot-options.ts`
- `packages/access-router/src/runtime.ts`
- `packages/access-router/src/acl/service-authorization.ts`
- `packages/access-router/src/acl/model-output-planning.ts`
- `packages/access-router/src/validation/public-admission.ts`
- `packages/access-router/src/services/service.ts`
- `packages/access-router/src/output/finalize-model-output.ts`
- `packages/access-router/src/acl/document-authorization.ts`
- `packages/access-router/src/acl/output-projection.ts`
- `packages/access-router/src/output/include-output.ts`

All **137 access-router source files** now equal the official FUSE-01 before
artifact, not merely those eleven files. Thus earlier delivered optimizations,
the eight existing flags, original source/callback/grant/getter isolation,
permissions/ordering, standalone/write/template/subdocument paths, publication
copy/association/context checks and structural limits are retained exactly.

`packages/access-router/llms.txt`, `CHANGELOG.md`, the website configuration page,
old export/docs tests and the live core/worker/CLI/integration runner were restored
to their pre-FUSE content. No advertised permanently dormant API remains. Generic
JavaScript setters still tolerate unknown option data as before; the former names
have **no runtime capture/selection/publication path** and no public declarations.

## Bounded refinement investigation

**No refinement was implemented or measured.** The final prototype remained the
FUSE-03 candidate-v3 bytes throughout all OFF/ON measurements. Inspection confirmed
that its two bounded root admissions surround real context-native identity work and
the service await/resume. Dropping the resumed admission or treating the earlier
graph as a reusable certificate would not satisfy the retained contract. No
closed synchronous replacement for that whole final publication sequence was proved.
Local bookkeeping factoring was not presumed equivalent or used to weaken final
admission/identity/owner checks. With the retention guard already failing, the
authorized withdrawal was preferred to retaining or expanding risky complexity.

Before withdrawal, **575 tests in ten files** passed: all 434 FUSE-02/03 option,
capture, admission, runtime/work/native-risk tests plus 141 consumer/docs/export
tests (`v2-prototype-proof-before-withdrawal*`). Instrumented proof stays separate
from timings: six-row LIST was 12→6 contexts and 6→0 private copies, with six
document hooks/one read unchanged. The Date counterexample still showed default
three observations/denial versus active two observations/allowance, with two actual
document hooks, one getter and two row decisions of each field-rule kind.

After withdrawal, new regressions show three-row direct/public LIST has **six
contexts, three copies, three hooks, one read**; READ has **two contexts, one copy,
one hook, one read**. The later same-ID name remains denied after **three Date
observations**, even with the old names supplied as unknown JavaScript options.

## Uninstrumented measurements and retention decision

Common settings: **100 rows, 24 fields, 32 bytes, one client, hook concurrency ten,
five warmups**. Primary and bounded decision repeats use **100 requests/job**.
All six guards at **10/100 rows** and strict/dormant jobs use **50 requests/job**.
Every batch has two alternating rounds, reversing build/scenario order in round two.
The actual order, raw samples, statistics, flags/getters, reads/hooks/hydration and
fingerprints are preserved per job; no workload/response-check changes or extra
profiling/spies enter timing workers.

- Primary: 18 before/all-eight-ON, same-candidate OFF and ON jobs.
- Guards: 72 jobs; narrow, hydrated, global-rules, large-config, populate, virtuals
  remain separate at both row sizes.
- Bounded conflicting-case repeat: 36 jobs; wide/document-rules/embedded/populate/
  narrow at 100 rows plus hydrated at ten rows. This repeated both apparent wins
  and adverse/tail outliers, not a search for a winning batch.
- Default/strict and requested-dormant fusion: 18 jobs, all eight existing flags OFF.
- Withdrawn final artifact controls: 24 jobs, including one bounded repeat after
  substantial artifact-identical host/order outliers.

Total: **168 jobs / 12,300 measured requests**; prototype decision evidence is
144 jobs / 9,900 requests. All jobs passed the unchanged worker fixture checks.

### Bounded final prototype repeat

Values are **median / p95 / CPU ms per request**, individual jobs, not pooled or
significance estimates. Existing eight flags are ON in every column.

| Scenario / round | Official before | Same candidate OFF | Same candidate ON | ON/OFF median change |
| --- | --- | --- | --- | --- |
| wide / 1 | 21.885 / 26.519 / 28.749 | 21.791 / 25.825 / 28.284 | 21.698 / 25.865 / 27.922 | −0.43% |
| wide / 2 | 22.132 / 28.302 / 29.241 | 22.122 / 27.864 / 28.465 | 22.239 / 26.053 / 28.172 | +0.53% |
| document-rules / 1 | 27.116 / 31.181 / 33.664 | 27.877 / 36.401 / 35.064 | 27.637 / 32.380 / 33.898 | −0.86% |
| document-rules / 2 | 28.622 / 35.779 / 35.285 | 27.988 / 33.836 / 34.872 | 29.007 / 36.220 / 35.991 | +3.64% |
| embedded / 1 | 65.609 / 73.455 / 79.545 | 66.953 / 75.799 / 81.546 | 65.680 / 80.219 / 78.897 | −1.90% |
| embedded / 2 | 67.740 / 74.403 / 81.096 | 66.666 / 78.532 / 82.479 | 65.330 / 73.958 / 77.838 | −2.00% |
| populate / 1 | 28.432 / 33.128 / 34.806 | 28.711 / 33.323 / 34.882 | 31.745 / 43.097 / 39.350 | +10.57% |
| populate / 2 | 28.913 / 33.565 / 34.987 | 29.316 / 34.295 / 35.231 | 30.226 / 38.875 / 37.778 | +3.11% |

Initial primary ON/OFF median changes were wide **+2.23%, −1.47%**;
document-rules **+1.52%, +4.12%**; embedded **−1.54%, −3.51%**. The small embedded
wins are disclosed, but were not uniform against official before or in p95/CPU.
Populate at 100 rows was slower in both original guards (**+3.47%, +10.11%**) and
both 100-request repeats; repeat CPU was approximately **+12.8%, +7.2%**. The
material repeatable guard regression alone fails retention.

Narrow 100-row apparent guard gains (**−6.82%, −5.41%**) did not repeat with
100-request jobs (**+3.84%, +0.48%**). Hydrated ten-row p95 outliers were repeated
rather than promoted to a benefit/regression claim. Other guards and every full
median/p95/CPU table are in `timings-overview.md` / `.json`; none establishes a
universal speedup. Default/dormant wide varied **+5.03%, −2.19%**, document-rules
**+0.06%, −1.97%**, embedded **−0.25%, −2.37%** versus same-candidate OFF; no
repeatable default/dormant median regression was established. Their actual mode,
original publication and output checks passed, not a zero-overhead equivalence claim.

### Final withdrawn artifact controls

These two artifacts have **identical all-14 dist bytes**, so latency differences
are not delivered code gains. Final bounded-repeat values:

| Scenario / round | Official before | Withdrawn final |
| --- | --- | --- |
| wide / 1 | 22.739 / 26.762 / 29.036 | 22.255 / 26.992 / 29.037 |
| wide / 2 | 25.894 / 31.967 / 32.602 | 22.835 / 29.725 / 30.008 |
| document-rules / 1 | 27.478 / 32.935 / 34.176 | 26.998 / 31.496 / 33.649 |
| document-rules / 2 | 31.937 / 38.846 / 38.196 | 30.675 / 36.521 / 37.680 |
| embedded / 1 | 66.142 / 75.257 / 80.461 | 66.391 / 75.431 / 85.427 |
| embedded / 2 | 67.025 / 75.840 / 80.832 | 67.001 / 74.556 / 81.392 |

The earlier control round had wide 22.865 versus 30.160 and embedded 95.425
versus 85.409 despite identical runtime bytes. Those outliers and their raw samples
are retained, not discarded. Host/JIT/OS variation is substantial; no causal host
diagnosis, statistical significance, restored application performance or historical
parity is claimed. No further repetitions were used to hunt a win.

### Modes, workloads and limitations

All timed builds share the exact lock and 134-package/3,498-file runtime/peer closure:
Mongoose **9.11.4**, Express **5.2.1**, Zod **4.4.3**, MongoDB **8.2.6**, Node
**26.12.1**. Both actual single-option and option-bag getters were verified on
BenchSource and BenchTarget. Candidate ON requested both new flags with all four
prerequisites and reported LIST/READ active; OFF reported off; strict ON reported
dormant. Official before and withdrawn final have zero fusion declarations and
apply **no fabricated fusion flags**. Only LIST is timed; READ configuration and
runtime regression verification is **not READ latency** or proof each graph fused.

All jobs retained ordinal order, requested/denied fields and exact first/final
common fixture equality; measured requests retain the worker's original row-count
check. Wide/document-rules/embedded fingerprints respectively:

- `165d378f09870e575203f9e2c8f012b0778715ecc0c2fdd9b03f4bd436536ea3`
- `1c6e7ecaf6f8e6c2f4d6b57530734750466ff5a9a96869ed3d05641979c070ae`
- `4a32e28713aa14dc5248f87eda344bb089958fc984d4c50598c278651f656f13`

Hidden fields stay denied; non-owner document-rule rows omit all 24 selected
fields; embedded children retain four ordered label/amount DTOs without hidden
fields; populate returns target name without secret. Each ordinary job uses **one
read/request**, populate **two**. Document-rules runs **100 document hooks/request**;
other workloads zero. Virtuals runs **two getters/row/request**; others zero. Only
the hydrated scenario actually fetches hydrated documents; every other job is lean.
Full fingerprints and counts for every size/scenario are in the summary JSON.

CPU covers Node HTTP server/client, not MongoDB; HTTP latency includes loopback,
serialization/parsing. Setup/warmup are excluded. Field-callback counts are verified
by separate deterministic regressions, not added to timing workloads. Matching
outputs/counts do not establish security equivalence. **Real application and
v0.51.0 performance were not measured**.

All prototype jobs used the live FUSE-04 diagnostic worker/core before withdrawal.
Their exact bytes are frozen in `start-surface/scripts/benchmarks/`; the final
artifact controls and replay driver use those identical frozen diagnostics after
the live third group was removed. Summary JSON distinguishes measured runner hashes
from final live preparation hashes. This preserves reproducibility without retaining
an advertised experimental CLI/API or changing workload/response checks.

## Final serial verification

Commands below ran from repo root. Reporter arguments are recorded verbatim in
each command JSON; no test selections/filters were applied to full package gates.

| Gate | Command / selection | Result / evidence |
| --- | --- | --- |
| V1 | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` | passed; `v1-final-withdrawn-build*` |
| V2 | package `exec vitest run` on new withdrawal, original copy/config/native/owner/public-boundary and strict consumer suites | **799 / 17 files**; `v2-final-withdrawal-boundaries*` has exact 17-file command/results |
| V3 | `pnpm --filter @web-ts-toolkit/access-router test` | **5,906 / 174 files**, zero failures/skips; `v3-final-access-router-full*` |
| V3 types | `pnpm --filter @web-ts-toolkit/access-router typecheck` | passed; `v3-final-access-router-typecheck*` |
| V4 | `pnpm --filter @web-ts-toolkit/access-router-deco test --no-file-parallelism --maxWorkers=1` | **691 / 22 files**, typecheck/packed/docs included; `v4-final-access-router-deco-serialized*` |
| V5 lint | `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks` | passed; `v5-final-scoped-eslint*`; root ESLint user file unchanged |
| V5 format | changed/restored 25-file Prettier check plus llms Markdown check | passed; `v5-final-changed-prettier*`, `v5-final-llms-prettier*` |
| V5 diff | `git diff --check` | passed; `v5-final-diff-check*` |
| V6 | `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs` | **21 passed**, including eight live four-mode embedded/document-rule worker jobs; `v6-final-runner-integration*` |
| Artifact/preservation | `node _tmp-publication-fusion-fuse05-integration-20261030-112318-e5b7/verify-final.mjs` after unrelated run finished | passed; `verify-final-artifact-and-preservation-quiet*`, `verification-final.json` |

Full V3 includes **ten actual packed/release-shaped consumer tests, 57 executable
documentation tests, 45 export tests and 34 strict consumer tests**. New negative
fixture compilation runs in installed Bundler/NodeNext/Node16 forms. Packed minimum
and current-major peers are separate test fixtures, not performance dependencies.
No whole-workspace build/test or release/publish was performed.

Historical whole `CHANGELOG.md` remains formatter-failing. Its final bytes equal
the captured pre-FUSE-04 original exactly; both original/current formatter checks
return false, and there is **no new changed release entry**. Only the unshipped
experimental entry was removed. This is the preserved formatting exception, not a
claimed passed whole-file check or unrelated reformatting.

The first extra final verification exited one because an **unrelated OIDC browser
test** was active after content checks. No FUSE job remained and no user process
was killed. This child awaited the observed shell/test through Linux pidfd exit
notifications, then reran verification successfully. Detection is not evidence of
that unrelated run's exact start or overlap with earlier samples; timings retain
their host-noise limitation. `process-check-after-external-oidc-run.json` recorded
no relevant active jobs before the successful final check.

A later final process audit observed an unrelated root `pnpm test`, started after
all FUSE timings and gates. This child did not start it, claim its result or send
signals. After awaiting the observed process, `final-after-external-workspace-run.json`
and `post-external-workspace-preservation.json` again confirmed no active relevant
jobs, all 8,204 protected hashes, all 137 original source files, all 14 measured
retained dist bytes and unchanged delivered-file hashes. This later audit did not
invalidate the scoped verification or require additional timing jobs.

## Final identities and preservation

- Final rebuilt **14 dist files** equal both measured `withdrawn-final-v1/` and
  official FUSE-01 `before-v1/`; all **137 runtime source files** equal official before.
- Retained ESM: `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`.
- Retained CJS: `64a2b78480a8c22f8ddfe1fe6c7c2b49404f324bd26a37286125ee97eb1ab52d`.
- Retained runner declaration hash:
  `85a7fa10ea3fb85b55523f746015f99944aebc753548a6c710d42d562fd8f65e`.
- Retained dist manifest:
  `10c84461e9ea6223a4363ecfb38c3b8692dd6fbb8ba9e6e37bf3e45d2858b908`.
- Preserved prototype `candidate-current-v1/` equals FUSE-03 candidate-v3 all 14
  dist bytes; ESM `6a25bd0d008333f4261bda6f58285456501c56a573456f863c047a8aacae0ec4`.
- Lock unchanged: `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- Dependency identity manifest unchanged:
  `542aa784aa03bc49f8976cb9c4e088b015e88b950863734373c8808f2aa47461`.
- Measured frozen worker/core:
  `66ef54819cca683134f8c70f46a85f0dc90a1d70b701d79c2a77e61c3ca602e0` /
  `837ce5a9431f7aeaabd2ddf552b2e863f70c71b771e55e1a45fab558788cf113`.
- Final live worker/core restored pre-FUSE:
  `02b75c8d0cba02afe0b23639d2736677511d2e6f5ac9d54642dadcf03fbe8c06` /
  `d233660b2e04d94c3adea9bf707a0b4bd8417d4ec023bd642c3f3b56f0ce3c09`.
- Public runtime export sets remain **46 / 48 / 6**, root/advanced/processors in
  CJS/ESM; declaration export-name sets remain **186 / 322 / 17**. The three package
  export paths and metadata are unchanged; no private fusion helpers ship in any
  of the fourteen dist files. **64 original option/optional-type/hover checks** pass.
- **8,204 protected regular files** verified unchanged: earlier FUSE/query evidence,
  official artifacts, actual runtime/peer dependencies, other dependency dist,
  lock/package/entry/build metadata. The final artifact's complete manifest is verified.
- Of 43 unrelated starting changed/untracked files, all source/example/client/root
  ESLint files remained byte-identical. Only
  `docs/tasks/20261030-004554-oidc-vault-client-optional-dpop.md` changed externally;
  this child did not edit it or restore it. The FUSE task itself is unchanged by this child.

Raw pointers: `candidate-current-v1-metadata.json`, `withdrawn-final-v1-metadata.json`,
all six timing directories' `summary.json` plus job/result/log files,
`timings-overview.md` / `.json`, `verification-final.json`, `fuse05-only.diff` and
the before/start/withdrawal/post-external manifests. Existing phase evidence was never overwritten.
`measure.mjs` can replay with a **new unused batch alias** using the frozen runner;
artifact capture/verification scripts use exclusive evidence writes.

## Criteria disposition, coordinator revisions and remaining risk

- Integrated correctness / required V1–V6: **met on the withdrawn final runtime**.
- Repeated identical-dependency V7 and negative/guard evidence: **delivered**;
  small embedded wins are disclosed, but acceptable benefit plus no material
  guard regression was **not established**. Retention is **rejected**.
- Authorized withdrawal / installed API / original-eight preservation / measured
  artifact / exports/dependencies: **verified**. No runtime refinement retained.
- Application/v0.51.0 gap: **unresolved, explicitly unmeasured**, not a delivered recovery.
- Remaining blockers for this child's required gates: **none** after quiet verification.
  Original eight unsafe switches retain their prior risks; no new fusion risk is shipped.

Coordinator-only task revisions recommended:

1. Append FUSE-05 completion as an evidence-backed **investigation with withdrawal**;
   do not call it a delivered speedup or claim all scenarios improved.
2. Mark the initial/new-flag contract and FUSE-02/03/04 implementation evidence as
   historical **unshipped prototype work withdrawn by FUSE-05**. Preserve their
   existing findings/results rather than rewriting history or leaving active API claims.
3. Reconcile objective/definition-of-done with no retained fusion API and unchanged
   original eight flags; keep original IDs/timestamp and all raw evidence pointers.
4. FUSE-06 should independently review withdrawal completeness, the exact preserved
   original runtime/eight-flag boundary, installed negative types/docs/exports,
   measured artifact/no-gain claims and the recorded timing confounds. This child
   does not perform or declare that separate independent review.
