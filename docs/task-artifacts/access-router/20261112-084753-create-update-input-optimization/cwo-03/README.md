# CWO-03: retain phase-local input normalization boundaries

Owner: INPUT-03, a new sequential child session. Related task:
[CREATE/UPDATE input optimization](../../../../tasks/20261112-084753-access-router-create-update-input-optimization.md),
CWO-03 only. The coordinator owns task/status; this executor did not edit it.

**Completed bounded investigation: no production change.** Eager fusion, unselected
branch skipping and unconditional normalized-container reuse are not equivalent at
the inspected seam. A still-narrower privately proved structural design is not ruled
out, but is neither proved nor measurable under current P. No production candidate
was created, retained, timed or withdrawn. No speedup or CPU/allocation/heap benefit
is claimed.

Filtered build/source typecheck and focused V1 passed: **1,074 tests / 30 files**,
including **34 new cases**. Exact layer checker, scoped lint/format and source/evidence
checks passed. Production remains at `23848c60ab172e5d421ee651c26dce41fd9410b0`;
15 rebuilt dist files, including eight declarations, match CWO-01. Current P remains
**0/40 usable cells**. Full integrated V2 belongs to CWO-07, not this no-change item.

## Retained paths and source decisions

Retained additions only:

- [Prepared-input invariants](../../../../../packages/access-router/test/invariants/write-input-prepared-normalization.unit.test.ts):
  31 cases, covering discarded bounds, native return bounds, normalized snapshot
  semantics, selected-native multiplicity, prepared shape/ownership and actual
  service validate/prepare overrides with retained-context/native mutations.
- [Private construction observations](../../../../../packages/access-router/test/internal/write-input-prepared-construction.unit.test.ts):
  three internal cases for normalization/catalog order, actual first-error identity
  and native-induced exposure of intermediate shells. These are mechanism evidence,
  not new public API promises or measured allocation totals.
- This README, [verification.json](verification.json),
  [observations.json](observations.json) and [work.json](work.json).

Withdrawn source/files: **none**. Existing production, public contracts, CWO-01/02
tests/tooling/fixture/evidence and historical/operational seals were not edited.
No agents, commits, dependency/host/configuration/public-API changes, root/grouped/
downstream tests or changes to grants/input/output-stage semantics were made.

The source anchors below are in
[`model-input-admission.ts`](../../../../../packages/access-router/src/acl/model-input-admission.ts),
relative to `packages/access-router/`:

1. **Validate raw input without constructing its normalized snapshot:**
   `assertModelInputComplexity` (117–121) first bounds/normalizes, then validates that
   result. A later Date callback can remove an earlier raw `constructor` key, while
   validation still rejects the normalized snapshot. A raw second scan would see
   different data. Do not replace this with identity/freeze admission caching.
2. **Throw validation or scrub decisions during the normalizer walk:**
   `boundedInputValue` (70–114) finishes before `validateRequestComplexity` or scrub.
   A later native failure currently wins over an earlier unsupported key or throwing
   catalog string observation. Deferred decision bookkeeping would need its own
   normalized-native/first-error proof; eager fusion is not equivalent.
3. **Normalize only selected/surviving branches:** `admitModelInput` (252–331) and
   `sanitizePreparedInput` (199–225) bound all supplied containers before selection/
   scrub. Dense arrays, sparse arrays and Maps in discarded `_permissions` overflow
   the same 20,000-node cap. A Mongoose normalization result is bounded too; the original
   document is not a certificate.
4. **Reuse normalized selected native values:** `copyInputValue` (163–192) performs
   a separately observable native copy. An inherited Date method sees requested raw,
   discarded raw, then selected normalized receivers, in that order. Its selected
   value becomes 21 rather than the first normalized 11. Removing that copy changes
   observations/value, not just construction work.
5. **Fuse prepared normalization with scrub construction:** `sanitizePreparedInput`
   calls `boundedInputValue` before any scrub/catalog lookup. A later Date normalization
   precedes all seven observed earlier-field `String.split` calls. Trusted native
   callbacks can change prototypes/observations before scrub; moving those calls into
   recursion is not justified by owned output alone.
6. **Scrub the full normalized graph in place:** even after normalization finishes,
   an inherited array method installed by a Date callback can retain the normalized
   array and its child record during scrub. Today both are distinct from final output;
   the retained child still has discarded metadata and later mutation cannot change
   final output. Reusing those records, or bypassing the map observation, changes that
   alias/observation contract.

This rejects the **unconditional** variants, not every possible future structural
subcase. A privately constructed record-only region, closed against native/prototype/
catalog/array exposure while preserving existing lookups and leaf copies, might admit
narrower reuse. The current seam supplies no such proof. Discovering it by another
scan or adding shared bookkeeping is not presumed cheaper, and no broader normalizer
rewrite, public token, cross-hook sharing or mutable-payload cache was warranted here.
With required P unavailable, no unverified performance code should be retained merely
to reduce source-level constructions.

Mandatory public/worker whole-input preflight and parser/validate/prepare re-admission
remain unchanged. The [CWO-01 Date-induced public input mutation](../cwo-01/README.md#cwo-03-same-phase-fusion-only-raw-identity-is-not-admission)
still requires the worker check. [CWO-02](../cwo-02/README.md)'s pre-write-view removal
was not retried. Initial/post-write full-source admission, frozen literal facts,
hydrated hook receivers, publication ownership/lifetime and nontransactional output
failure behavior are untouched.

## Actual new characterization and work

[observations.json](observations.json) copies the final V1's **34 asserted records**
losslessly, with test hashes and original report byte hashes. It is not timing data.

- Nine discarded dense/sparse/Map bounds plus three Mongoose-return bounds cover all
  three input boundaries; rejection includes the actual controlled detail.
- One preflight snapshot case and one selected-native case establish that raw data,
  first normalized data and selected data cannot simply be interchangeable.
- One prepared Map/class/shared/sparse case preserves holes, per-occurrence native
  cloning, BSON/Buffer/Date types, virtual/control exclusion and distinct mutable
  copies. Existing contracts supply cycle/depth/scope/ID/array-patch coverage.
- Four direct CREATE/UPDATE cases in both modes retain `allowedData` across a suspended
  service `prepare` override, mutate a discarded branch, and reject before persistence.
- Four public CREATE/UPDATE cases in both modes have native prepared normalization
  expand a later protected subtree; all reject before create/save.
- Eight direct/public CREATE/UPDATE successes preserve service receivers/access/context,
  one `toObject({ virtuals: false, flattenMaps: true })`, one native normalization,
  trusted business additions and scrubbed, detached output. A later native mutation
  changes the original earlier sibling but not its already-normalized snapshot.
- The three construction records retain exact callback/error/alias observations;
  controlled errors share `Error.message`, so first-error checks compare identity.

The unchanged CWO-01 native invariant was freshly replayed: all **46 records** deep-equal
its archived native observations. Existing nested patch, complexity, parser scheduling,
native, dedicated-parent, facts/owner/draining and request concurrency cases passed
unchanged in V1. This is not a fresh full V2 certification.

[work.json](work.json) curates selected counters and state fingerprints from **14 new
real-worker diagnostic records** using the unchanged maintained
[`buildInputProbe` / `collectInputWork`](../../../../../scripts/benchmarks/access-router-input-work.mjs).
The diagnostic bundle, source, fixture and tool identities match CWO-01; relevant
counts, full phase/callback traces, adapter counts and state fingerprints matched all
14 corresponding records. Small direct writes, wide plain public writes, native
direct ID/filter UPDATE and eight-row function-rule CREATE are each present in both
output modes. Prepared normalize/scrub visits remain 4/4, 34/34 and 272/272 on those
shapes. These are unchanged executed sites, **not allocated bytes or measured benefit**.
Preflight's later validator traversal is uninstrumented; selected construction omits
the `allowedData` root, and admission native counts combine normalization/selected work.

## Commands, workdirs, preservation and limits

All working directories were repository root. Scratch was fresh, short ignored
`_tmpc03KSw4`, created with `mktemp -d "$PWD/_tmpc03XXXX"` and accepted by
`git check-ignore -v _tmpc03KSw4`. Runtime `TMPDIR` was its absolute checkout-local
path. Exact executed commands, selections/results, hashes and the initial fixture
corrections are in [verification.json](verification.json).

Build/typecheck/test/diagnostic commands did not overlap each other. **One operational
serialization deviation:** a read-only Prettier proposal command overlapped the initial
typecheck and wrote only to new CWO-03 scratch. It did not edit maintained files or
share build outputs; source-only typecheck was repeated serially. All subsequent
commands were serialized. No background command or active job remains.

Actual Node was **v26.12.1**, pnpm **11.18.0**, matching root `pnpm@11.18.0`.
The existing Vite native-config warning was not suppressed. Read-only preservation
checked 2,507 pre-existing files, 153 production source files, 15 dist files/eight
declarations, 14 CWO-01 payloads and 12 recorded scratch originals, including the
baseline seal manifest. Earlier evidence was neither overwritten nor recertified.

Preserved data uses repo-relative paths/task-local names and contains no private
session IDs, credentials or machine-local paths. Observation formatting changes bytes
but not records; hashes distinguish original reports from the archive. Work data is
a selected-metric summary: other counters/full traces, raw Vitest reports/terminal
logs, scratch runners, dependencies, builds/bundles/seals and database trees are
omitted. It cannot reconstruct omitted raw data or recalculate timing. The historical
scratch runner commands in verification are **not runnable from this archive**;
maintained tests/tools and ordinary dependency/Mongo test prerequisites support a
fresh replay. Own scratch is disposable provenance, not a continuation prerequisite.

To replay the new cases, use fresh short ignored scratch and its absolute `TMPDIR`,
then the normal filtered typecheck and:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/invariants/write-input-prepared-normalization.unit.test.ts test/internal/write-input-prepared-construction.unit.test.ts
pnpm --filter @web-ts-toolkit/access-router test:layers:check
```

The 14 diagnostic cases reconstruct from `work.json` IDs (`tuple/entry/operation/shape/
rowsxwidth`), with modes in READ/LIST/CREATE/UPDATE order. Build a fresh ignored probe
with `buildInputProbe(process.cwd(), path.join(process.env.TMPDIR, 'work'))`, pass those
case objects to `collectInputWork(api, cases)` serially, and compare the declared columns
and fingerprints. This is a diagnostic replay, not a request to recalibrate P.

P's [current calibration](../cwo-01/data/calibration-summary.json) remains **0/40 usable**
under the fixed one attempt/cell, seven pairs/two repeats and 20% cap. No cell was
retried, discarded, widened or replaced; no new protocol was introduced. A separately
named protocol needs coordinator approval and preregistration **before candidate
inspection**. No candidate/non-regression, allocation, heap, CPU-profile or MongoDB/
HTTP performance measurement was run. Counts/profiles alone cannot authorize retention.

## CWO-04 handoff

CWO-03 delivers the permitted no-change investigation, not a speedup or waived
measurement gate. The coordinator should reconcile it before handing off CWO-04.
Continue only the parser task: ordinary marker-free input still has observable
async scheduling. [CWO-01's handoff](../cwo-01/handoff.md) describes concurrency-1 UPDATE
admitting a queued later-sibling mutation that CREATE/concurrency-3 UPDATE do not.
Keep marker truthiness, entry capture/order, sparse-array behavior, target authorization,
FIFO/reentry/first-error/draining and supported overrides. Do not remove input
preflights/re-admission, retry view removal, share exposed graphs/fields/facts or make
marker-free parsing unconditionally synchronous. P still prevents retaining a
performance candidate; a bounded evidence-backed no-change outcome remains valid.
Final unfiltered package V2 and installed/packed/documentation consumers stay with CWO-07.
