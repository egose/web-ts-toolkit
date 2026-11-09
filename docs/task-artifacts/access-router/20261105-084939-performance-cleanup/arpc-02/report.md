# ARPC-02 implementation candidate

> **Final disposition: candidate withdrawn; no production optimization retained.**
> The sections below preserve candidate-era evidence. The completed retained-tree
> checks and withdrawal rationale are in [the final report](withdrawal/report.md).

## Outcome

**Candidate implemented and focused checks pass; performance acceptance is
blocked.** The complete focused baseline calibration has **0/16 usable cells**;
no protocol-P candidate comparison, speedup or non-regression claim is made. The
shared task file and all pre-existing harness/artifact files are preserved. No
commit, reset, root/grouped/downstream tests, full-package test rerun, whole-repo
build or whole-repo lint sweep is included.

Changes:

- `packages/access-router/src/acl/output-field-filter.ts`: explicit immutable
  selected-copy inputs, construction-local reuse, and per-value binding/scope/
  mutable-selection validation with the existing preparation as fallback.
- `packages/access-router/src/output/finalize-model-output.ts`: lazy single-row
  selected-copy reuse and a call-local finalizer factory sharing only captured
  configuration/document resolver preparation.
- `packages/access-router/src/services/service.ts`: actual LIST/bulk-CREATE row
  groups use that factory without replacing their existing row mapper/populate/
  completion/metadata/publication/decoration sequencing.
- `packages/access-router/test/service-output-preparation.unit.test.ts`: real
  direct/public LIST and bulk-CREATE work scaling in both modes, READ/UPDATE
  controls, distinct contexts/facts, empty shapes, mutable-selection/binding
  boundaries, callable invocation lookup and next-call-only option replacement.

The [design](design.md) explains why current document-hook definition resolution
is shareable, unlike historic function-attached selectors, and why ordinary
virtual-name/native inspection is deliberately **not** hoisted. Related targets
and embedded parent occurrences keep their existing scope ownership. No cached
source values, stages, facts, contexts, references, row budgets or field decisions
are introduced. Selected materialization and its limits remain unchanged.

## Deterministic work, not a speedup

The new diagnostic test invokes actual service/public workers. At 16 rows and
16 generated fields plus `value`, in **both modes and both entries**:

| Work | Original baseline | Combined candidate |
| --- | ---: | ---: |
| LIST finalizer configuration/resolver preparation | 16 | 1 |
| Bulk CREATE finalizer configuration/resolver preparation | 16 | 1 |
| Selected-copy policy construction on those ordinary paths | 272 | 1 |
| Actual selected-value copies | 272 | 272 |
| Document output-hook invocations | 16 | 16 |

The baseline finalizer/copy-call counts are preserved in
[ARPC-01's findings](../arpc-01-work-findings.md) and its raw work observations.
Baseline selected-copy construction is the direct per-call implementation of
`copyOutputValue`; it is not an allocation-profiler observation. The candidate's
32 named real-service observations are in [work.json](work.json).

Singleton 4-generated-field controls retain one finalizer preparation and five
actual copies, with one selected-copy preparation instead of five. Wider
READ/UPDATE controls retain one finalizer preparation and 17 actual copies, with
one selected-copy preparation. Empty LIST/CREATE perform no eager preparation.
All selection-content comparisons, authorization/binding checks, field decisions,
native materialization, budget charges and row hooks still execute where needed.
**No wall/CPU/allocated-byte/retained-heap gain is inferred from these counts.**

## Behavioral and source-selection evidence

Working directory: repository root. All executions use the fresh ignored
`TMPDIR='<repo-root>/_tmp-arpc-02-ZaZbr4lD'`, confirmed with `git check-ignore`.
The inherited passing package baseline is 7,403 tests / 204 files plus typecheck
and scoped lint; the full suite is not repeated in this task.

Executed initial/intermediate checks, in sequence:

| Command / selected files | Actual result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router... build` | Passed (23.59s) |
| Focused selected-copy files: `service-output-preparation`, `finalizer-preparation`, `service-authorization-reads`, `field-catalog` | 96 tests / 4 files passed (5.60s command wall) |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Passed (32.72s; includes necessary filtered transitive build) |
| Preparation/modes/harness/work focused files | 535 tests / 6 files passed (10.69s) |
| Publication/facts/boundaries/concurrency/write-lifetime focused files | 675 tests / 18 files passed (18.64s) |
| Related/subdocument/fallback/modes-integration/catalog/reads focused files | 175 tests / 7 files passed (19.82s) |
| `pnpm exec eslint` on the three changed production files and the new test | Passed (2.89s) |
| Original-baseline versus selected-only seal: maintained v1 `smoke` | 432 diagnostic cells matched (11.57s); not performance acceptance |
| Original-baseline versus initial combined seal: maintained v1 `smoke` | 432 diagnostic cells matched (11.71s); not performance acceptance |

Exact commands, individual log hashes and results are in
[verification.json](verification.json). These totals overlap; they are not summed
into a fictional full-suite result. Later small binding/type-boundary hardening
and callable-getter test additions require the final focused recheck recorded
below. The Vite native-config-loader warning is informational, not a test failure.

The diagnostics compare **actual frozen source-selected workers**, not directory
labels. Output/persisted-state hashes, actual resolved/configured modes, query/
write/hook counts and ordered traces match the original baseline on every cell;
the compact [concordance](smoke-concordance.json) records their fingerprints.
The full raw diagnostic trees are omitted, not falsely presented as archived.
The maintained v1 `smoke` command also executes one warmup and one timing sample
per case as wiring checks. Those tiny, uncalibrated values are **not inspected as
performance acceptance**, are not v2/protocol-P comparisons, and are omitted with
the raw smoke trees. "No candidate comparison" here means no acceptance-grade
paired v2 comparison, not that the smoke driver contains no timer.

### Final retained candidate checks

After review added early binding/type guards, an own lazy-copy slot, and their
regressions, these final-tree checks ran sequentially, **after calibration ended**:

| Exact command / recorded selection | Result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Passed, 33.47s; necessary filtered build included |
| `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts` plus the exact 30 affected files in `verification.json` (`final-tests`) | **1,376 tests / 30 files passed**, 49.36s command wall / 47.61s Vitest |
| `pnpm exec eslint packages/access-router/src/acl/output-field-filter.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/src/services/service.ts packages/access-router/test/service-output-preparation.unit.test.ts` | Passed, 2.27s |
| `node scripts/benchmarks/access-router-crud.mjs freeze _tmp-arpc-02-ZaZbr4lD/candidate-final` | Passed, 2.46s |
| `node scripts/benchmarks/access-router-crud.mjs smoke _tmp-arpc-01-4d6agBQe/baseline _tmp-arpc-02-ZaZbr4lD/candidate-final _tmp-arpc-02-ZaZbr4lD/final-smoke` | Passed, 13.19s; all **432** output/state/mode/count/ordered-trace cells match |

The new regression file has 13 tests, including mutable selections after an
awaited rule, invalid binding rejection **before** selection observation, invalid
selection fallback, own versus inherited lazy-copy slots, per-row `hook.call`
lookup, never-read function-attached selectors, option replacement, and empty
LIST/CREATE. No current failing package check or quota interruption is hidden.

### Operational sources and attribution limits

Original baseline, still immutable:
`_tmp-arpc-01-4d6agBQe/baseline/`, source
`f2d472bbe1f390005f0ebe62f548608a1a155d7c9dc8bc1e85f2122559999480`,
bundle `c3eaa928d506f8023b92061db8244e20549ea9b91c17faefd6b73767a7f4125c`.

Final candidate: `_tmp-arpc-02-ZaZbr4lD/candidate-final/`, source
`5223b96f9cfa7a9c70a39730aa94b06d0e12b427eca0eda814e63d517239a082`,
bundle `b11e661317a005adfa59557f2d5a4f2e71558474bad52817fce04e5dd3474d6f`.
Revision is still `6c3ceee4433daf203d4625d70b0ef5c4b7009529` plus the recorded
three-file production diff, SHA-256
`99f8912173d021cf49bf091962d4b80732e03bafef0943757d8200b3bf93a317`.

Earlier `_tmp-arpc-02-ZaZbr4lD/candidate-selected-only/` (`7236a7...`) and
`candidate-combined/` (`186104...`) are **historical engineering intermediates**,
not final accepted sources. They lack the later binding/type/prototype-slot
hardening. Their distinct sources and successful diagnostic checks are preserved
without overwriting those seals. Any future final-subchange timing attribution
must create a fresh selected-only source with the same final safety guards; it
must not substitute the earlier seal as though it were the final selected change.

[Provenance](provenance.json) records all source/bundle/fixture/dependency/Node/
pnpm/build-tool identities and reconstructable source patches against the original
baseline. Fixture and dependency identities are unchanged for every seal. Do not
overwrite any existing directory. Seals remain checkout-local operational entries;
generated bundles/dependency trees are not copied into this archive.

## Timing protocol and coverage

The saved earlier core-v2 calibration was inspected at the exact operational
directory `_tmp-arpc-01-v2-2rvJTj9O/core-noise-v2/`: `protocol.json`, `plan.json`,
`work.json`, `raw.json`, `failure.json`, **no `report.json`**. Its existing
[supplement](../arpc-01-v2/report.md) already preserves the 30-minute timeout and
zero accepted cells. No old job was restarted, polled or treated as a pass.

This task ran one new bounded, preregistered **claim-specific baseline-only**
v2 attempt, retaining the original source/fixture and unchanged noise/warmup/window/
slowdown rules. Selection: `scale-direct`, `scale-public`, plus exact isolated/
trusted direct hook-active READ, singleton LIST, singleton CREATE and UPDATE IDs.
That is 16 cells / 5 panels, seven fresh-worker pairs times two independent repeat
runs. No candidate is loaded by noise calibration. No build/test overlaps timing.

Historical executed calibration command (replace `<repo-root>` before replay;
choose a new destination rather than overwrite evidence):

```sh
export TMPDIR='<repo-root>/_tmp-arpc-02-ZaZbr4lD'
node scripts/benchmarks/access-router-crud-v2.mjs noise \
  _tmp-arpc-01-4d6agBQe/baseline "$TMPDIR/focused-noise-v2" \
  scale-direct scale-public \
  iiii/direct/read-hit/hooks/1x4 tttt/direct/read-hit/hooks/1x4 \
  iiii/direct/list-single/hooks/1x4 tttt/direct/list-single/hooks/1x4 \
  iiii/direct/create-single/hooks/1x4 tttt/direct/create-single/hooks/1x4 \
  iiii/direct/update-id/hooks/1x4 tttt/direct/update-id/hooks/1x4
```

### Actual measured outcome

**Execution completed, exit 0 after 1,317.30s; calibration unusable.** Unlike the
earlier core-v2 timeout, this packet has all **140/140 timing workers**, seven
pairs in each repeat for every panel, and a genuine `report.json`. All saved
workers load the original baseline source/bundle and match diagnostic output/
persisted-state hashes and pilot-fixed operation counts.

- **155,904 measured invocations**, **393,408 warmup invocations**.
- **154/448 worker/case warmups unsettled**; every one of the 16 cases has at
  least one unsettled warmup. No outlier or failed warmup is discarded.
- **Zero short windows**; summed measured service time per worker/case is
  **176.11–1,571.96ms**, above the unchanged 100ms eligibility floor.
- Wall noise exceeds the fixed 20% cap in **11/16** cells; CPU noise in **15/16**.
- **Usable cells: 0/16.** Noise/warmup uncertainty is not a non-regression pass.

All affected scale cells, with unchanged `max(3%, p95(abs(pair ratio - 1)))` bounds:

| Entry / operation / mode | Wall noise | CPU noise | Unsettled / 28 workers |
| --- | ---: | ---: | ---: |
| Direct LIST / isolated | 67.30% | 75.35% | 13 |
| Direct LIST / trusted | 61.39% | 87.49% | 9 |
| Direct bulk CREATE / isolated | 10.23% | 9.24% | 22 |
| Direct bulk CREATE / trusted | 35.43% | 41.16% | 21 |
| Public LIST / isolated | 22.87% | 22.56% | 7 |
| Public LIST / trusted | 14.85% | 24.21% | 6 |
| Public bulk CREATE / isolated | 16.70% | 23.68% | 27 |
| Public bulk CREATE / trusted | 28.74% | 28.06% | 23 |

[Noise summary](noise-summary.json) includes all 16 controls/affected cells;
[raw paired workers](noise/raw.json), [protocol](noise/protocol.json),
[fixed pilot plan](noise/plan.json), [diagnostics](noise/work.json), and
[maintained per-case report](noise/report.json) are preserved byte-for-byte with
[copy hashes](archive-manifest.json). The report exactly recalculates from the
raw packet using the maintained `panelSummary` function. These are baseline-only
statistics, **not optimization measurements**.

No v2 candidate comparison was run against this unusable calibration. No further
timing retry, tolerance increase, pair-count reduction or warmup-gate relaxation
was attempted. The exact blocker is failure of the preregistered eligibility
gates, not missing writes, an invented timeout or a production regression.

## Acceptance boundaries

- Both selected-copy and finalizer reuse are implementation candidates with
  deterministic work reduction; neither has an accepted mode-specific CPU,
  allocation or latency benefit yet. Unsupported timing is **excluded**, not
  borrowed from v1/core-v2 or from helper counts.
- Public singleton/READ/UPDATE/UPSERT control timing is outside this focused
  selection. Parent/related-target cross-products, embedded/native-rich paths,
  failure/reentry/limits and other specialized timing are missing for corresponding
  claims even though relevant package correctness tests run.
- Separate allocation/retained-heap probes are **not run**. Closure lifetime is
  justified by private local ownership, not by an invented retained-heap result.
- Deterministic adapters do not provide database-latency evidence.
- Final full-package acceptance is intentionally left to the coordinator's final
  acceptance agent, once on the final integrated tree. No task status is edited
  here. Until the missing measurement/gate evidence is supplied, ARPC-02 cannot
  meet all its acceptance criteria and must not be marked completed.
