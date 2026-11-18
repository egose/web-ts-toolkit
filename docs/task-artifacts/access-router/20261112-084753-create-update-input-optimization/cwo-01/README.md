# CWO-01 current write-input baseline

Owner: BASELINE-01. Related task:
[CREATE/UPDATE input optimization](../../../../tasks/20261112-084753-access-router-create-update-input-optimization.md),
CWO-01 only. The coordinator owns task status. This bundle records investigation,
not acceptance of any future optimization.

**CWO-01 completed as a bounded baseline investigation.** V1/V2 passed; new seal,
work attribution and both fixed calibration packets completed. **0/40 calibrated
cells are usable**, so performance retention remains blocked. No candidate was
implemented or timed and no CPU, latency, allocation or heap benefit is claimed.

## Outcome and boundary

Production source remains at `23848c60ab172e5d421ee651c26dce41fd9410b0`.
No production optimization, authorization/API change, dependency change, commit,
publication, root/grouped test or downstream-package test was made/run.
Original seals/protocols/results remain historical. New current fixture/tool hashes
must not be compared using historical ARPC calibration.

Current verification: V1 **1,199 tests / 17 files passed**; package typecheck passed.
The one unfiltered package V2 run passed **8,119 tests / 222 files**, including the
exact layer union and installed/packed/documentation consumers. New baseline freeze,
232 diagnostic records, eight fixed-count profile cells and both preregistered
calibration packets subsequently completed serially. No performance benefit or
non-regression claim exists.

## Maintained additions and test layers

- `packages/access-router/test/access-router-crud-fixture.ts`: original 432-case
  catalog/IDs preserved; 180 optional input cases cover direct/public single/bulk
  CREATE, UPDATE by ID/filter and both UPSERT branches, two output modes, widths
  1/16, absent/sync/async document hooks, ordinary nesting, native Date/Buffer/BSON/
  Map data, narrow-output function rules, three date markers and real target READ
  subqueries. Registration, seed/reset and fresh Core/services are outside timing;
  input/native construction and the actual write/output work are inside.
- `test/internal/access-router-crud-harness.unit.test.ts`: all 16 ordinary mode
  tuples remain covered; 64 mixed write/target-READ subquery cases additionally
  verify actual stage origins. New input cases repeat equivalent state twice.
- `scripts/benchmarks/access-router-crud-v2.mjs`: optional input panels only;
  original `core` case IDs and all window/noise rules remain unchanged. Formatting
  changes alter the tool hash, so new calibration is required.
- `scripts/benchmarks/access-router-input-work.mjs` and
  `test/internal/access-router-input-work.unit.test.ts`: finite exact-source anchors
  instrument actual private visit/construction/conversion sites **only in a new
  ignored diagnostic bundle**, never production files or the timing bundle. Source
  bytes are checked before/after. A real-worker output/state fingerprint comparison
  catches changed marker behavior. PROMISE resources use `async_hooks`, not a fake
  Promise implementation. First synchronous owner attribution has explicit limits.
- `scripts/benchmarks/access-router-crud-v2-worker.mjs`: separate fixed-count CPU
  profile mode records actual invocation windows, with counters off and reset/checks
  outside. Its wiring/window-clipping regression is internal tooling coverage.
- `test/invariants/write-input-native-observations.unit.test.ts`: hydrated receiver/
  actor/facts, pre-write native view observations and errors, native-induced input
  mutation across public/worker admission, and per-row mutable field-rule ownership.
- `test/invariants/write-input-lifecycle-observations.unit.test.ts`: mutable retained
  contexts and separately observable snapshot/diff/change/output native conversions.
- `test/internal/write-input-parser-scheduling.unit.test.ts`: actual write parser
  scheduling plus marker truthiness, sparse-array normalization/order and parser
  native identity. These are not promoted into public contract promises.

The new invariant/parser characterization adds 58 cases; the diagnostic harness adds
two tooling cases. Existing public contracts were neither rewritten nor moved.
[native-observations.json](native-observations.json) losslessly curates the 46 native/
mutable-rule records from final V1: 30 success traces, eight view-only native errors,
four public/worker mutation rejections and four field-rule records. Common options/
event streams are factored out; reconstruction was checked against the original data.

## Observable equivalence gates found before timing

### CWO-02: the discarded view is not generally observation-free

`resolveInputDocumentGrants` ignores the staged view and passes the original hydrated
document to the UPDATE hook. Nevertheless, a BSON `Code.prototype.toBSON` data method
is invoked by **both** initial source materialization and the later discarded view.
The second invocation survives native round-trip normalization through inherited
prototype lookup. This happens before the hydrated hook, with absent, synchronous
and asynchronous hooks, in both output modes and all five tested UPDATE/upsert entries.

A method throwing only in the pre-write view produces a controlled `bad_request`
before the document hook/save. Removing that view outright would remove a supported
native observation and change failure/persistence behavior. It is not a copying defect.
Initial source admission, private fact commit, actor/binding/publication ownership
remain independently mandatory. Trusted write output does not make input trusted.
Absent output hooks already omit their post-write disposable view; absent UPDATE
input hooks still perform the pre-write discarded view. Do not redo ARPC-04.
Repeated normalization of already owned document facts is an existing constant-time
admission path, not presumed repeated whole-map copying.

### CWO-03: same-phase fusion only; raw identity is not admission

A custom Date `getTime` mutating the original input during the first public preflight
can add a 501-node denied subtree after that pass captured its entries. The worker's
second whole-input preflight rejects it before parsing/query/save on CREATE and
UPDATE in both modes. These apparently adjacent checks are not interchangeable
with a raw-object “already checked” cache. A queued-only mutation was an unsuitable
CREATE characterization: CREATE reaches its second preflight synchronously before
that queued callback. The final test uses the actual synchronous native exposure.

Same-boundary prepared normalization + scrub is the narrower design to investigate.
It must still bound discarded branches, preserve native normalization/callback
ordering and reject cycles/depth/sparse/unsafe expansion before persistence. Existing
input/complexity/nested-update contracts cover trusted prepare additions and scoped
array replacement versus descendant patching. No cross-hook reuse is authorized.

### CWO-04: ordinary parser scheduling is observable

On real marker-free writes, a queued mutation to a later nested sibling is admitted
by UPDATE with parser concurrency 1, but not by CREATE or concurrency-3 UPDATE.
CREATE parses items as already-scheduled; UPDATE's entry scheduler traverses siblings
at its existing awaits. The first sibling must itself contain ordinary nesting to
expose this boundary; a scalar first sibling settles too soon for that experiment.
Arrays currently densify holes to own `undefined` slots in parsing, although input
preflight itself preserves sparse slots. Falsy markers are ordinary data; genuine
date/subquery markers still execute their real handlers/target authorization.

A marker-free fast path must not silently become synchronous or move entry capture,
permits/FIFO/reentry/error draining. Existing no-work scheduling characterizations
remain requirements, not an optimization to revive.

### CWO-05: structural work is separate from mutable rule decisions

An alternating function rule is called once per CREATE row with original actor and
frozen empty facts. Three rows persist `one`, omitted value, `three`; exposed allowed-
field arrays are distinct. Function identity, source identity or shared empty facts
cannot authorize sharing the result. Lazy bounded call/catalog-local grammar and
membership preparation is the possible scope, not an eager schema/string-rule cache.
Map `$*`, Mixed/scoped virtuals, protected metadata, IDs and existing-index patching
remain separate correctness controls in the package contracts.

### CWO-06: native snapshots and lifecycle contexts are observable

The ordinary UPDATE path has seven library root `toObject` sites, plus one adapter
storage conversion in this fixture. A native override labels each conversion:
original `@1`, pre-write source `@2`, virtual cleanup `@3`, adapter `@4`, final `@5`,
diff `@6`, change input `@7`, output source `@8`. Retained contexts mutate the original
and final snapshots independently; `onChange` receives the distinct change input
and can mutate the live document observed by later output source preparation.
Reusing the final snapshot for diff/change/output would change those observations.
No registered virtuals still leaves Mongoose's default schema `id` virtual captured.
An empty registered registry is not an empty excluded-virtual-set proof.

## Measurement design (fixed before measurements)

[preregistration.json](preregistration.json) selects ten panels / 40 cells, seven
alternating pairs and two repeats, concurrency one, one bounded attempt per cell and the
unchanged **20% maximum noise** rule. Single direct/public CREATE/UPDATE and both
UPSERT branches, public async/native wide bulk CREATE/LIST, tiny absent-hook writes,
shared READ/LIST, native UPDATE by ID/filter, public date markers and direct narrow-
output function-rule writes are individually reported. Only unaffected sibling
mode axes are timing-deduplicated. Subquery target READ mode is **not** assumed
irrelevant; that shape has correctness/work coverage but no calibrated timing cell.
Before any pilot/profile/calibration data, the same selection was grouped into two
non-overlapping five-panel packets (`writes`, `inputs`). Each keeps the documented
30-minute hard budget; cells are never retried, dropped or chosen using results.
Grouping bounds each packet's runtime without changing P's windows, pairs or gates.

Separate diagnostic counters distinguish normalized graph visits/constructions,
selected-copy and scrub work, parser entries/promises, request rules/path preparation,
stage source/views/native conversions, lifecycle conversions and adapter/query/save
traces. Counts are not allocated bytes or latency benefit. Separate CPU profiles use
128 warmup / 256 measured operations per case and a 500µs sampling interval; only
samples overlapping invocation windows are attributed. Inclusive synchronous stacks,
bundled source positions, async continuation/engine ambiguity, sampling overhead,
idle/GC and timer bookkeeping must remain explicit.

There is no MongoDB latency or heap-allocation/retained-heap measurement. Package
Mongo integration tests establish behavior, not a benchmark. Profiled CPU means are
not P acceptance data. No counter/profiler/forced GC runs with calibration.

## Actual work and bounded CPU attribution

[data/work.json](data/work.json) preserves all **232 real-worker diagnostic records**
losslessly, including phase and callback/query traces. Native/admission attribution
uses synchronous stack ownership; deep/async frames can be `other`. In particular,
admission-native clone counts combine normalization and selected copying. Preflight
also invokes the complexity validator after normalization; its second traversal is
not separately node-instrumented. Selected construction counters omit the separate
`allowedData` root. These are explicit work-site observations, not allocated bytes.

| Real path (input counts match both output modes)      | Whole-input preflight normalized nodes | Admission normalized / selected visits | Prepared normalized / scrub visits | Input rule scans / function calls | Parser entries / total PROMISE resources |
| ----------------------------------------------------- | -------------------------------------- | -------------------------------------- | ---------------------------------- | --------------------------------- | ---------------------------------------- |
| Direct single CREATE, ordinary 1x4                    | 1 pass, 8                              | 8 / 6                                  | 7 / 7                              | 1 × 11 / 0                        | 7 / 136                                  |
| Public single CREATE, ordinary 1x4                    | 2 passes, 16 total                     | 8 / 6                                  | 7 / 7                              | 1 × 11 / 0                        | 7 / 166                                  |
| Direct UPDATE by ID, ordinary 1x4                     | 1 pass, 8                              | 8 / 6                                  | 7 / 7                              | 1 × 11 / 0                        | 7 / 145                                  |
| Public UPDATE, ordinary 1x4                           | 2 passes, 16 total                     | 8 / 6                                  | 7 / 7                              | 1 × 11 / 0                        | 7 / 167                                  |
| Direct native/nested UPDATE, 1x16                     | 1 pass, 35                             | 35 / 33                                | 34 / 34                            | 1 × 23 / 0                        | 30 / 265                                 |
| Public date-marker UPDATE, 1x16                       | 2 passes, 76 total                     | 35 / 33                                | 34 / 34                            | 1 × 23 / 0                        | 33 (3 dates) / 321                       |
| Direct function-rule bulk CREATE, 8x16, narrow output | 1 pass, 281                            | 280 / 264                              | 272 / 272                          | 8 × 23 / 136                      | 240 / 1,498                              |
| Absent-hook tiny CREATE / UPDATE, 1x1                 | 1 pass, 5                              | 5 / 3                                  | 4 / 4                              | 1 × 8 / 0                         | 4 / 122 or 123                           |

Wide function-rule bulk CREATE additionally executes 432 request-boundary grammar
fields, 1,536 admission pattern checks and 2,784 prepared-scrub pattern checks;
UPDATE builds its separate update boundaries (22 fields in native 1x16, 10 in
ordinary 1x4). `other` catalog checks include output planning/capture and must not
be called input-only work. Each UPDATE has one pre-write source materialization,
one pre-write disposable view in both modes, and one mandatory post-write source.
Only isolated hook-present output adds the post-write disposable view. Each CREATE
row has one mandatory post-write source and one final snapshot conversion.

Persistence/query observations remain separate from copying: single CREATE invokes
the adapter once, bulk CREATE once per row in the existing wrapper, UPDATE saves
once with one lookup, direct UPSERT creates after one lookup or updates after two,
and public UPSERT creates without a lookup or updates after one existence check and
one lookup. No optimization/batching decision follows from these local-adapter counts.
All branches/entries/modes and ordinary/native/marker/function/async shapes have
checked state/output fingerprints; installed/Mongo contracts supply behavior, not
MongoDB timing.

[data/cpu.json](data/cpu.json) preserves **4,965 in-window stack/weight records**, eight
cells, 2,048 profiled operations plus 1,024 excluded warmups. Dictionaries reconstruct
every curated row; outside-window samples, absolute clocks and profiled CPU means
are intentionally omitted. Descriptively, native UPDATE's in-window sampled weight
attributes roughly 2–3% to input normalization, 2% to selected copying, 5–6% to scrub,
5–6% to native clone/wire work, and about 4–5% each to source and view/resolution
stacks. The function-rule bulk CREATE samples attribute about 7–9% to normalization
and 16% to scrub. These inclusive categories include nested work and are **not**
exclusive CPU shares or performance claims: 41–56% remains unattributed, about 4–6%
is GC, async continuations/engine work lack phase provenance, and sampling/timer
bookkeeping affects the profiles. No comparison or heap/allocation measurement exists.

## Completed calibration and retention gates

[data/calibration-summary.json](data/calibration-summary.json) indexes the complete
byte-preserved [writes packet](data/writes/report.json) and
[inputs packet](data/inputs/report.json). Each contains protocol, fixed pilot plan,
separate work fingerprints, all raw pairs/batches and its report. Both reports were
recalculated exactly from archived raw data using the maintained `panelSummary`.

| Packet | Cells / usable | Timing workers | Measured operations / batches | Failed measured warmups | Short windows | Unsettled pilot cells |
| ------ | -------------- | -------------- | ----------------------------- | ----------------------- | ------------- | --------------------- |
| Writes | 20 / 0         | 140            | 177,408 / 1,680               | 183                     | 0             | 6                     |
| Inputs | 20 / 0         | 140            | 155,904 / 1,680               | 171                     | 0             | 10                    |
| Total  | 40 / 0         | 280            | 333,312 / 3,360               | 354                     | 0             | 16                    |

There were additionally 20 diagnostic and ten pilot workers, and 946,240 measured-
worker warmup operations. Only four cells met both metric noise caps; every one
still failed warmup quality. All 40 cells therefore block retention. In the writes
packet, 56 failed cell warmups had fewer than four history blocks and 85 fewer than
five blocks (two consecutive checks cannot complete before the fifth). The existing
2500ms heuristic/64-operation blocks are themselves limiting on wide fixtures;
other warmup/noise variability remains. Do not describe every failure simply as
host noise, discard these workers, waive warmup, widen the 20% cap or silently reuse
this calibration for future candidates. A separately named preregistered protocol
on a suitable host/fixture runtime would require new matching seals/calibration.

## Execution and provenance

Working directory for commands: repository root. Operational scratch is the fresh,
short ignored `_tmpcwo.AvIq`; runtime `TMPDIR` is its absolute checkout-local path.
Shared commands use `TMPDIR='<repo-root>/_tmpcwo.AvIq'` (replace the placeholder).
Git ignore and ESLint `isPathIgnored` both accept scratch; source typecheck includes
only `src/**/*.ts`, tsup entries are explicit and workspace globs are `packages/*` /
`apps/*`. Tests discover only package `test/**/*.test.ts`; the layer walker excludes
`_tmp*`. No root sweep of scratch, dependency/test-group change or unrelated CLI build.
The existing packed-consumer read-only CLI fixture was already built.

Commands actually run, serially (full selections/expanded commands in
[verification.json](verification.json) and [handoff.md](handoff.md)):

1. Filtered transitive build: `pnpm --filter @web-ts-toolkit/access-router... build`;
   five packages only: utils, http-errors, express-response-handler,
   express-json-router, access-router. Passed.
2. Original V1 task selection, before fixture changes: seven named current-layer
   files from the task's V1 command; **212 tests / 7 files passed**.
3. New fixture/probe wiring: first run found 29 tooling/fixture failures, not
   production regressions. New rich bulk inputs exceeded the existing 500-node
   limit; new bulk rows were reduced to eight before any seal/measurement. A literal
   replacement-string `$$` escape changed diagnostic marker checks; the callback
   replacement now preserves them and real-worker fingerprints guard that behavior.
   Corrected three-file run: **731 tests passed**.
4. New observation wiring: nine provisional expectations were disproved by actual
   paths (absent output hook omits its view, queued CREATE mutation timing, and a
   too-simple parser first sibling). Final tests characterize those actual boundaries.
   Corrected four-file run: **736 tests passed**.
5. Final focused V1, after maintained test/tool formatting: **1,199 tests / 17 files**
   passed. Includes original seven, four CRUD harness/driver/work files, new diagnostic/
   native/lifecycle/parser files, existing no-work scheduling and native invariants.
6. `pnpm --filter @web-ts-toolkit/access-router typecheck`: passed (filtered closure
   rebuild plus source typecheck).
7. `pnpm --filter @web-ts-toolkit/access-router test`: passed **8,119 tests / 222 files**
   in 2,230.44 seconds; unfiltered, including layer checker and all installed/packed/
   documentation consumers. Exact union: 103 contract, 66 invariant and 53 internal
   files; public graph 137 files / 238 modules. No failed/skipped/pending test reported.
8. Explicit maintained changed-file Prettier and code-only ESLint: passed before
   measurements. Final post-measurement checks are recorded in `verification.json`.
9. Owned operational runner `node _tmpcwo.AvIq/run-baseline.mjs prepare`: passed.
   Expanded sequence: `freeze(root, '_tmpcwo.AvIq/b')`, diagnostic `buildInputProbe` /
   `collectInputWork` on input catalog + core + rich public + tiny writes on both
   entries, then two separate `node --cpu-prof --cpu-prof-interval=500` v2 profile
   workers (128 warmups / fixed 256 operations per case). Seal reverified afterward.
10. `node _tmpcwo.AvIq/run-baseline.mjs calibrate`: passed; internally ran `noise`
    once for each fixed five-panel packet, sequentially. Both complete reports,
    zero usable cells; no source/candidate comparison or retry.
11. `node docs/task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-01/curate.mjs _tmpcwo.AvIq docs/task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-01/data`:
    generated curated data with `wx` protection; 232 work records, 4,965 profile rows,
    both exact recalculations verified. Data is tool-generated; maintained code/docs
    edits used patches. Operational originals remain untouched.

The ordinary Vite native-config warning is retained; no suppression/configuration
change was made. No historical passing count substitutes for these completed runs.
Existing driver regressions construct a scratch source-selection marker and run
smoke wiring checks; those are not production optimization candidates or P timings.

New source identity: `2fa3dc6844bdc298581c5672db55b9fe8d2e9ee15830be2473cd419bea79676a`
(153 source files); fixture: `fbc80e87b6312af243e74f96395c57fc6ce49b8181d0f7be6e775ad8b7fc7eb3`;
selected source bundle: `bedc39ab29d52573945451bf8bd1f6404c8228394a3b72589febf153bd55fbf4`.
[data/source.json](data/source.json) records all source/dist hashes, eight declaration
hashes, 127 dependency identities, runtime binary/lock hashes and measured tool files.
Node was v26.12.1, esbuild 0.28.2, actual pnpm **11.18.0**, matching both current and
HEAD root `package.json`'s `packageManager: "pnpm@11.18.0"`. Future matching
comparisons must respect sealed identities. Both packets used the same WSL2 x64 /
i9-13950HX host with 16 logical CPUs and tool hash
`053fce14ef9561a207371fdc2481cb646f47ff64182c4b40ca35f76e2567e229`.

Coordinator-reconciliation correction: the earlier 11.24.0 “repository pin” annotation
incorrectly treated `.tool-versions`' pnpm entry as the root package-manager pin
without checking `package.json`. Direct current/HEAD inspection and the PATH-resolved
pnpm executable both confirm 11.18.0; package/lock diffs are empty. The verbatim
`.tool-versions` snapshot in `data/source.json` remains unchanged. The freezer records
`pnpm --version`, and comparison checks use those actual identities, not the mistaken
annotation: both frozen packets already record 11.18.0 on both sides. No measurement
identity or gate depended on 11.24.0, so this correction invalidates no measurement
data and requires no rerun. The existing **0/40 usable-cell** retention block remains.

## Preservation limits and next-agent decision

Maintained executable probes/tests stay in their normal repository locations.
[data/manifest.json](data/manifest.json) distinguishes original and archived hashes:
the two compact P packets are byte-preserving copies, work/CPU tables are lossless
curated encodings, and dependency file inventories/outside-window CPU data are
omitted explicitly. Fourteen payloads total about 1.16 MB, plus the small index and
native observations; no dependency/build/tarball/consumer/database tree is preserved.
`curate.mjs` is the reviewable generator, not an independent rerun/recertification.
Operational seals are checkout-local, not relocatable; reproduction requires the
maintained source/fixture/tools, dependency closure and a new matching seal. Archived
raw JSON stays compact and byte-preserved rather than reformatted; it is manually
validated for structure, privacy, references, hashes and whitespace. Historical
seals were not overwritten. Own scratch/seals remain for live same-checkout review;
no other task's scratch/seal was used, deleted or altered.

CWO-02 has a precise initial **behavior blocker** for an unconditional omitted-view
candidate: the inherited native second observation/error above. A narrower privately
owned primitive-only source design might avoid that exposure, but eligibility,
prototype/native/budget/ownership equivalence and P still need proof. This baseline
does not implement, accept or pre-authorize that design. In addition, **every required
calibrated claim cell is unusable**, so no performance candidate can be retained
under current P. [handoff.md](handoff.md) supplies bounded CWO-02 scope, remaining
native/dedicated/normalization questions and exact replay/continuation commands.
