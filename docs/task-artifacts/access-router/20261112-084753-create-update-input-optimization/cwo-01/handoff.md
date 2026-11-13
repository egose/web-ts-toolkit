# BASELINE-01 → CWO-02

**CWO-01 completed as the bounded baseline investigation.** Production remains
`23848c60ab172e5d421ee651c26dce41fd9410b0`; all four authorization option names,
input trust, public declarations/entries and persistence boundaries are unchanged.
No production optimization, commit, publication or dependency change was made.
The coordinator must reconcile task status; this handoff does not edit the task.

## Passed versus blocked

- V1: **1,199 tests / 17 files**. Typecheck passed.
- V2: one unfiltered package run, **8,119 tests / 222 files**; exact layer checker,
  installed/packed/documentation consumers passed. No reported failure/skip/pending.
- New source/fixture/runtime/tool seal, **232 diagnostic records**, eight separate
  CPU profile cells and both complete P packets delivered. Raw/plan/report
  recalculation and lossless work/CPU/native encodings verified.
- P: **0/40 usable cells**, 280 timing workers, seven pairs/two repeats, 333,312
  measured operations, no dropped samples/retries or widened 20% cap. All 40 cells
  block retention; these are baseline-vs-baseline measurements, not candidates.
- No CPU/latency/allocation/heap benefit claim follows from counts or profiles.
- Root/grouped/downstream tests and real MongoDB/HTTP latency/heap benchmarks were
  deliberately not run. Package Mongo contracts are behavior evidence only.
- Final scoped formatting/lint/source/seal/evidence checks are recorded in
  [verification.json](verification.json); no active job is left unowned.

Read [README.md](README.md), [native-observations.json](native-observations.json),
[data/source.json](data/source.json), [data/work.json](data/work.json) and
[data/calibration-summary.json](data/calibration-summary.json) before designing a
candidate. `data/manifest.json` records byte-copy/curation provenance and omissions.

## Bounded first CWO-02 decision

Do **not** merely pass `exposeSource: false` in `resolveInputDocumentGrants`.
The staged view is discarded, but inherited BSON normalization runs a second time
before the hydrated UPDATE hook, including with no hook. A view-only native exception
currently returns `bad_request` before the hook/save. This was observed on real
direct ID/filter/UPSERT and public UPDATE/UPSERT paths in both modes. Removing the
observation changes persistence/failure behavior, not just an implementation count.

The immediately feasible scope is a precise **no-change decision for unconditional
view removal**, with the current native/error regressions retained. A primitive-only
owned-source eligibility design is a possible bounded investigation, not pre-approved
implementation: prove private ownership, absence of native/prototype/callback effects,
structural/budget/publication equivalence and supported overrides without a raw-ID,
function-purity, freeze-only or caller-token cache. Initial source materialization,
hydrated arguments/receiver, literal frozen facts and lifecycle/actor binding stay
mandatory. Even a safe prototype cannot be retained without newly usable required P.

Relevant maintained cases:

```sh
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/invariants/write-input-native-observations.unit.test.ts test/invariants/write-input-lifecycle-observations.unit.test.ts test/internal/write-input-parser-scheduling.unit.test.ts test/invariants/write-output-modes.unit.test.ts test/invariants/write-output-origin-ownership.unit.test.ts test/invariants/write-output-source-lifetime.unit.test.ts test/contracts/service-authorization-input.integration.test.ts test/contracts/nested-update-integrity.integration.test.ts
```

Build the filtered dependency closure first if a later candidate invalidates dist.
Only one executor/build/test/profile/calibration may run at a time in this checkout.

## Remaining questions for CWO-02–06

1. Dedicated single/bulk subdocument mutation also calls the same pre-write grant
   resolver on its owning hydrated parent. Current package/nested-update contracts
   passed, but no dedicated native timing panel or new dedicated native-error
   characterization was added. Any candidate touching that shared seam needs one.
2. Same-phase prepared normalization + scrub has measurable executed work (wide
   eight-row CREATE: 272 normalized + 272 scrub visits), but no measured savings.
   Preserve native-return bounds, discarded branches, cycles, sparse arrays, Map/
   Mixed/BSON/class semantics, protected/virtual keys and trusted business additions.
   Do not cache public→worker admission: a native Date method can mutate the original
   input during the first preflight, requiring the second check before parsing/save.
3. Marker-free parser scheduling is observable on real CREATE/UPDATE. Concurrency-1
   UPDATE admits a queued later-sibling mutation that CREATE/concurrency-3 UPDATE do
   not. Native leaves, marker truthiness, array holes/order, target authorization,
   permits/FIFO/reentry/first-error/draining cannot be bypassed. Subquery target READ
   mode has all-16 correctness and work coverage, but no calibrated timing panel.
4. Path/rule work is real: wide function-rule CREATE enumerates eight rule sets and
   invokes 136 input functions. Only bounded privately owned structural preparation
   is eligible for reuse; callbacks remain per row, in order, with original actor /
   facts and fresh exposed arrays. Do not revive eager string-rule/source-ID caches.
5. Seven ordinary library UPDATE root conversions are independently observable;
   native callbacks and retained mutable lifecycle contexts defeat blind final/diff/
   change/output reuse. Default schema `id` means an empty registered virtual registry
   is not an empty excluded-virtual-set proof. Explicit `id:false`/empty-catalog and
   narrower dirty-path cleanup designs still require their own characterization.
6. ARPC-04 scheduling and ARPC-06 blind metadata batching remain no-change decisions.
   ARPC-02/05 withdrawn candidates and their noisy packets are historical, not new
   permission to revive them or lower this task's gates.

## Replay the current protocol, not old noisy seals

Replace placeholders and create a fresh **short** ignored scratch directory. These
are equivalent expanded commands for the owned runner actually executed, not a
request to rerun calibration indefinitely:

```sh
scratch=$(mktemp -d "$PWD/_tmpcwo.XXXX")
git check-ignore "$scratch"
export TMPDIR="$scratch"
pnpm --filter @web-ts-toolkit/access-router... build
node scripts/benchmarks/access-router-crud.mjs freeze "$TMPDIR/b"
node scripts/benchmarks/access-router-crud-v2.mjs noise "$TMPDIR/b" "$TMPDIR/nw" single-direct single-public upsert-direct upsert-public rich-public
node scripts/benchmarks/access-router-crud-v2.mjs noise "$TMPDIR/b" "$TMPDIR/ni" input-small-direct control-direct input-native-direct input-markers-public input-functions-direct
```

The separate work run used `buildInputProbe`/`collectInputWork` from
`scripts/benchmarks/access-router-input-work.mjs`, with deduplicated `inputCatalog`
together with core, rich-public and tiny writes on both entries (232 IDs). CPU workers ran
`access-router-crud-v2-worker.mjs` with `phase: 'profile'`, exact input-native-direct /
input-functions-direct panels, `[256,256,256,256]` counts, 128 warmups and
`--cpu-prof --cpu-prof-interval=500`; these are not calibration runs.

Recorded runtime: Node v26.12.1, esbuild 0.28.2, actual pnpm 11.18.0, matching current
and HEAD root `package.json`'s `pnpm@11.18.0` pin. The earlier 11.24.0 annotation came
from misidentifying the different `.tool-versions` entry as this pin. Actual executable
and both sealed packet identities were already 11.18.0; no required comparison gate
used 11.24.0. This is an annotation-only correction, not a measurement rerun or a
change to frozen evidence. A different host/tool/fixture/source baseline needs new identities and
calibration. The current 2500ms/64-operation warmup heuristic limits wide fixtures:
56 failed write-cell warmups did not reach four history blocks. Do not waive those
failures; a redesigned, separately named protocol must be preregistered before new
candidate inspection and must preserve noise/non-regression requirements.

## Operational and preservation state

Own same-checkout `_tmpcwo.AvIq/b`, `iw`, `cp`, `nw`, `ni` originals remain untouched
for coordinator inspection; the commands above do not depend on them. They are
checkout-local operational artifacts, not relocatable publication evidence.
No other scratch/seal was reused, removed or overwritten. The durable data includes
complete P packets and losslessly reconstructed work/native/in-window CPU records;
dependencies, binaries, builds, tarballs, consumers/databases, outside-window profiles,
absolute clocks, profiled CPU means and redundant output-only scratch data are omitted.
No full private session ID or machine-local path is preserved.
