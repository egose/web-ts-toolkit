# CWO-05: retain bounded input-path preparation boundaries

Owner: PATHS-05R, the fresh sequential replacement executor. Related task:
[CREATE/UPDATE input optimization](../../../../tasks/20261112-084753-access-router-create-update-input-optimization.md),
CWO-05 only. The coordinator alone owns task/status edits; this executor did not edit it.

**Completed bounded investigation: no production change.** Unconditional grammar,
static-rule-result and admission-to-patch reuse are not equivalent at the inspected
seams. A narrower privately proved structural index is not ruled out, but equivalence
and usable measured benefit were not established. No runtime candidate was created,
retained, timed or withdrawn. No speedup or CPU/allocation/heap benefit is claimed.

Filtered dependency build/source typecheck and focused V1 passed: **2,103 tests /
42 files**, including **17 new cases**. Exact layer checker and scoped lint/format
passed. Production remains `23848c60ab172e5d421ee651c26dce41fd9410b0`; all 153 source
files and 15 rebuilt dist files/eight declarations match CWO-01. Current P remains
**0/40 usable cells**. Full integrated V2 belongs to CWO-07, not this no-change item.

## Retained scope

Only these maintained additions and this three-file bundle are retained:

- [Structural input invariants](../../../../../packages/access-router/test/invariants/write-input-structural-boundaries.unit.test.ts):
  12 cases for mixed static/function CREATE rules, fresh exposed fields/data, trusted
  service overrides mutating UPDATE boundaries, repeated existing-index expansion,
  and own-undefined versus omitted input catalog slots.
- [Private path observations](../../../../../packages/access-router/test/internal/write-input-path-preparation.unit.test.ts):
  five cases for bracket/index aliases, native-installed repeated-key grammar and
  own catalog construction provenance/explicit clear.
- This README, [observations.json](observations.json) and
  [verification.json](verification.json).

Withdrawn paths/source changes: **none**. Existing source, tests, tooling, fixture,
task, preceding evidence and historical/operational seals remained read-only. No
agents, commits, dependencies, host/configuration/public-API changes or root/grouped/
downstream tests were introduced/run. At entry there was no `cwo-05` bundle or production
diff; this report describes PATHS-05R's actual run, not the failed child's tool error.

## Source evidence and structural-versus-decision assessment

Paths/line ranges below refer to unchanged `packages/access-router/` source. These
are bounded design assessments, **not executed optimization prototypes**.

1. [`model-input-admission.ts`](../../../../../packages/access-router/src/acl/model-input-admission.ts),
   `requestBoundaries` (123–135), `sanitizePreparedInput` (199–225) and
   `admitModelInput` (252–331), rebuild `set` shapes, split logical/concrete paths and
   scan requested prefixes. Lazy call-local tokens/depth/prefixes could address
   structural work, but cannot simply replace the current native call sites. A Date
   normalization installs `String.prototype.replace`: the two identical `value`
   keys subsequently parse as `value` and forbidden `execution`. Scrub retains only
   the first value. Per-key memoization changes current behavior even within one
   normalized stage. CWO-03's normalization-before-grammar/first-error and shell/array
   observations remain prerequisites; no raw-input admission certificate was added.
2. [`field-catalog.ts`](../../../../../packages/access-router/src/acl/field-catalog.ts),
   `isSafeInputPath`, `isCatalogInputPath`, `isInputVirtualPath` (145–183), and
   `forbidden` in admission (148–156), repeat input-specific grammar/membership work.
   Fixed input-control membership already has a private set. An additional catalog index
   would require closed own primitive slots, exact Map `$*`/Mixed/virtual-scope and
   metadata-ancestor semantics, and unchanged native observations; freeze alone does
   not establish that computation is inert. Constructor provenance (14–17, 352–375)
   is private identity, not a copied/inherited marker; explicit clear (43–51) deletes it.
3. Existing output preparation is **not input authority**. In
   [`service-authorization.ts`](../../../../../packages/access-router/src/acl/service-authorization.ts),
   `captureAuthorizationCatalog` (278–315) projects an output catalog separately from
   `readServiceAuthorization`'s input configuration (748–756). An own `undefined`
   `schemaVirtualPaths` slot remains own on the input capture, while output projection
   omits it. An omitted input slot observes a subsequently installed inherited getter;
   an own undefined or constructor-owned empty slot does not. All three output paths
   remain eligible while the omitted-slot input becomes ineligible. Do not substitute
   the warmed output result, flatten undefined slots or duplicate its cache as proof.
4. Grant expansion in `admitModelInput` (269–314) is a **row/data decision**, not path
   preparation. Reusing the same catalog/data/`rows.value` grant against existing
   object, empty and scalar/null slots yields respectively `rows.0.value`/
   `rows.3.value`, no fields and no fields. Patch preserves IDs, siblings and four-row
   cardinality; a separate container grant permits five-row replacement but strips
   elevated IDs. Logical Map/wildcard paths, concrete indices and scoped paths are
   not interchangeable. No row, source-ID or mutable-identity cache was investigated.
5. [`select-resolution.ts`](../../../../../packages/access-router/src/acl/select-resolution.ts),
   `collectModelRequestFields` (31–50), dispatches to
   [`collectSchemaFields`](../../../../../packages/access-router/src/core-shared.ts)
   (310–345): key order, live native string/array grammar and function awaits remain
   per invocation. New real bulk CREATE cases use a sync first function, static
   string/array rules and an async last function. A row-local native split change
   denies the second static-string value even with the same captured actor/rule.
   Both functions still run per row/order with the original actor/frozen empty facts;
   fields/data are fresh despite shared caller payload and retained validation context.
   A privately owned boolean-only key list might be narrower, but no purity/enumeration/
   override proof or measured benefit was established. No eager string compiler revived.
6. [`apply-update.ts`](../../../../../packages/access-router/src/helpers/apply-update.ts),
   `applyUpdate` (13–45), builds whole/partial boundaries from **current** exposed
   fields. `updateOnePrepared` in
   [`service.ts`](../../../../../packages/access-router/src/services/service.ts)
   awaits validate/prepare and scrubs before patching (2655–2684). A supported async
   `prepare` override appends `branch` to `['branch.value']`; current patching replaces
   the container instead of preserving its omitted sibling. Carrying admission's
   boundary sets across that callback changes trusted override behavior. Preparation
   after the current field read is potentially narrower, not proved/measured here.

Any future retained preparation must bound arbitrary keys/segments, reserve existing
work/payload budgets before buffers, own absent/lazy slots, and release call/publication
resources without refunding work or sharing row decisions. The existing collection
cleanup in `output-field-filter.ts:737–742` is not a general input-cache lifetime.
Adding several eager sets or a second whole-tree eligibility scan was not justified.
All-node limits, captured actor/configuration, protected metadata/IDs, own provenance,
array replacement-versus-existing-index patching and supported overrides stay unchanged.

## Actual observations and internal work

[observations.json](observations.json) losslessly factors **17 final-V1 asserted
records**: four mixed-rule CREATE, four prepare-boundary UPDATE, three optional-input
catalog, three alias and three single structural/provenance records. Tables reconstruct
with their `kind`/`common` plus `columns`/`rows`, then `singles`. New-case/final records
deep-equal. The unchanged CWO-01 native replay deep-equals all **46 archived records**.

The mixed-rule observation bounds per-call traversal to one through the supported
`getRequestComplexity` service seam; it does not resize the fixture's already-owned
request pool or create a new concurrency contract. Initial wiring had five failed
new assumptions: four attempted late pool changes and one incorrectly treated input
own-undefined as output omission. Only new tests were corrected. All 17 then passed.

**16 fresh real-worker diagnostic records** use the unchanged
[`buildInputProbe` / `collectInputWork`](../../../../../scripts/benchmarks/access-router-input-work.mjs),
with source instrumented only in new ignored scratch. Relevant counters, full phase/
callback traces, adapter counts and state fingerprints match corresponding CWO-01
records. Both affected output modes have identical input counts on each shown shape:

| Shape                                          | Input rule enumerations / keys / functions | Request grammar fields | Admission / prepared pattern checks | UPDATE boundary fields |
| ---------------------------------------------- | ------------------------------------------ | ---------------------- | ----------------------------------- | ---------------------- |
| Tiny direct absent-hook CREATE / UPDATE, 1x1   | 1 / 8 / 0                                  | 10                     | 42 / 36                             | 0 / 7                  |
| Wide plain public single CREATE / UPDATE, 1x16 | 1 / 23 / 0                                 | 52                     | 174 / 306                           | 0 / 22                 |
| Plain static public bulk CREATE, 8x16          | 8 / 184 / 0                                | 416                    | 1,392 / 2,448                       | 0                      |
| Function-rule direct bulk CREATE, 8x16         | 8 / 184 / 136                              | 432                    | 1,536 / 2,784                       | 0                      |
| Native direct UPDATE by ID/filter, 1x16        | 1 / 23 / 0                                 | 54                     | 192 / 348                           | 22                     |

These are executed work sites, **not allocated bytes or speedup evidence**. Registration,
reset/request construction and assertions are outside counters; `other` catalog
work can include output planning and is deliberately not called input-only work.
The preserved table selects input path/rule counters, not exclusive total cost.

Cold/small overhead remains **unmeasured**: even the tiny control would pay index
allocation/density/ownership checks and lookups, and a fresh single-row call offers
little amortization. Lazy saturation/fallback checks also cost work. Wide/bulk counts
establish repetition but cannot prove setup is cheaper, measure allocation savings
or establish non-regression for cold controls. No runtime candidate was warranted
solely to lower these counts under unusable P.

## Verification, preservation and limits

All commands ran serially from repository root; pnpm executes Vitest in
`packages/access-router`. Fresh short ignored `_tmpc05s7Qk` was created with
`mktemp -d "$PWD/_tmpc05XXXX"` and accepted by `git check-ignore -v _tmpc05s7Qk`.
Runtime `TMPDIR` was its absolute checkout-local path. No background job was started
or remains. Exact commands/selections/results/identities are in
[verification.json](verification.json).

- Filtered `pnpm --filter @web-ts-toolkit/access-router typecheck`: passed, including
  the five-package transitive build and source-only `tsc`.
- Corrected new cases: **17 / 2**; final focused V1: **2,103 / 42**, zero reported
  failure/skip/pending. Includes all-mode CRUD/target/subquery, prior parser/native,
  Map/Mixed/scoped virtual/protected/ID/array, dedicated-parent, own-slot, budget,
  publication/owner/draining and shared READ/LIST paths, unchanged.
- Layer checker: **103 contracts / 70 invariants / 57 internal**, exact default
  union; public graph unchanged at **137 files / 238 modules**. Scoped ESLint and
  Prettier passed after patch-based corrections of new files only.
- Read-only protection checks: **2,503 pre-existing unignored files**, 153 source,
  15 dist/eight declarations, 11 sealed tool/test identities, 14 archived payloads,
  12 original CWO-01 payloads and its baseline seal/127 dependency packages unchanged.
- New JSON reconstruction/hash/link/privacy/ignore/whitespace checks passed. Actual
  runtime was Node **v26.12.1**, pnpm **11.18.0**, matching root `pnpm@11.18.0`.
  The existing Vite native-config warning was not suppressed.

P remains [0/40 usable](../cwo-01/data/calibration-summary.json), with one attempt
per cell, seven alternating pairs/two repeats and the 20% cap unchanged. No retry,
new baseline, host change, candidate comparison, profiler, allocation/heap or MongoDB/
HTTP performance measurement was run. A new protocol requires coordinator approval
and preregistration; none was introduced. Counts alone cannot authorize retention.

Following the [preservation workflow](../../../README.md), only useful reports and
actual observation/work summaries are preserved. Raw terminal/Vitest reports, full
work counters/traces, scratch runners/manifests/bundles/seals, dependencies, builds,
consumers/tarballs/databases are omitted. Hashes identify omitted originals; compact
behavior records reconstruct, but omitted raw reports or timing do not. Historical
scratch commands in verification are not runnable from this archive. Maintained
tests/tools, normal dependencies/Mongo test prerequisites and fresh scratch support
a new replay. No continuation step depends on this run's disposable scratch.

To replay only new cases, use fresh short ignored scratch with absolute `TMPDIR`,
replace placeholders, then run serially from repository root:

```sh
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/invariants/write-input-structural-boundaries.unit.test.ts test/internal/write-input-path-preparation.unit.test.ts
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router test:layers:check
```

Optional `CWO05_STRUCTURAL_REPORT`/`CWO05_PATH_REPORT` paths must be inside that fresh
`TMPDIR`; they report asserted test observations, not runtime admission flags. The
16 diagnostic IDs/columns in `observations.json` reconstruct case objects using
READ/LIST/CREATE/UPDATE mode order and the maintained fixture `caseId` grammar;
`buildInputProbe`/`collectInputWork` support a fresh serial replay, not P calibration.

## CWO-06 handoff

The coordinator should reconcile CWO-05 as **completed bounded no change**, not an
implemented optimization or waived retention gate. Continue only UPDATE serialization/
virtual-cleanup investigation. Preserve CWO-01/02/03/04 native/error/scheduling and
owned-source/facts/publication boundaries, plus current exposed UPDATE fields and own
undefined input catalog slots. Default schema `id` counts as a virtual; empty registered
virtuals are not an empty excluded-set proof. Independent original/final/diff/change/
output conversions and trusted service overrides remain observations, not reusable
snapshots. No row/source/ID/purity/path-cache shortcut is authorized by this report.
Current P still blocks retaining runtime candidates; final unfiltered V2/installed/
packed/documentation consumer acceptance remains CWO-07's responsibility.
