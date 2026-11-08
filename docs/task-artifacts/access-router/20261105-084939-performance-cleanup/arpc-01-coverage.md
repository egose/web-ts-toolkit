# ARPC-01 coverage and claim boundaries

Task: `docs/tasks/20261105-084939-access-router-performance-cleanup.md`, ARPC-01 only.
Production source is unchanged. This is an executable baseline prerequisite, not
acceptance of any later optimization or universal performance conclusion.

## New maintained coverage

See [`scripts/benchmarks/access-router-crud.md`](../../../../scripts/benchmarks/access-router-crud.md)
for commands, state/timing boundaries, sealed-source checks and the preregistered
decision rule. Maintained implementation lives in:

- `packages/access-router/test/access-router-crud-fixture.ts`
- `packages/access-router/test/access-router-crud-harness.unit.test.ts`
- `packages/access-router/test/access-router-crud-driver.unit.test.ts`
- `packages/access-router/test/access-router-crud-work.unit.test.ts`
- `scripts/benchmarks/access-router-crud.mjs`
- `scripts/benchmarks/access-router-crud-worker.mjs`

| Task matrix dimension | Concrete coverage | Limits / prerequisite for later claims |
| --- | --- | --- |
| 16 tuples | 368 compact real-worker cases: all independent READ/LIST/CREATE/UPDATE settings, direct and public; stage-mode spies, exact/bulk getters, mutation-distinguishing output assertions | Not 16 copies of every orthogonal payload/target shape |
| CRUD branches | READ hit/miss; direct effective LIST access and public actual READ-to-LIST retry; LIST empty/single/four; CREATE single/four; direct UPDATE ID/filter, public ID; both direct/public UPSERT branches | No invented public filter-update method; direct effective-access control is not a direct retry API |
| Rich work | Additional 64 homogeneous-mode controls: bare singleton; 16 rows/16 fields; async hook, one virtual, embedded arrays, hydrated input, native Date/Buffer; negative select/denied fields; metadata maps; disabled-debug large LIST filter | No dynamic field-function timing, explicit nested-sort timing, enabled/level-changing logger timing or related-target timing |
| Ownership | Each real compact worker's originating mode is checked through actual admission; upsert branch settings vary independently; rich embedded facts; post-write live mutation cannot change published output | New compact fixture has no related models. Do not infer related-target timing non-regression |
| Stable work/state | Every measured/warmup output checked; equivalent seeds and fresh request/Core/services per sample; create/save actually inside timing; branch saved count and detached state assertions | No real MongoDB latency, transaction/index/network/projection-cost simulation |
| Harness failure cases | Wrong case label, malformed tuple, unapplied runtime mode, wrong output/denied field, skipped persistence, candidate/fixture/dependency/source selection mismatch, corrupted bundle; marker test verifies distinct compiled source actually executes | Smoke is a wiring regression, not a performance claim |
| Deeper work | Separate 96-cell real-service Vitest probe counts wrappers, selected copies, policy reads, empty scheduling, logging summaries and queries/callback traces | Spied counts are never timed; counts alone do not establish cost attribution or equivalence |

## Existing package-local contracts reused (not new timing evidence)

These are concrete suite locations inspected for the stated behavior. Actual
baseline suite results and any failures are recorded in the ARPC-01 report; this
ledger does not independently certify unrun cells or claim an exhaustive product.
All paths below are relative to `packages/access-router/test/`.

| Concern | Suites / inspected anchors |
| --- | --- |
| Default/inherited four-mode resolution, atomic changes, exact/bulk getters | `owned-authorization-modes.unit.test.ts` (`exact server mode admission and atomic configuration`, `actual source-mode capture through both model getter APIs`) |
| Query target-local modes and embedded scopes | `query-snapshot-options.unit.test.ts` (`uses source read=.../list=... and target read=.../list=... through every edge`); real direct/public/root `authorization-fast-path-options.integration.test.ts` (`selects independent mode pair=...`) |
| Write parent × target READ/LIST, embedded populate | `write-output-populate.unit.test.ts` (`parent / target / shape / access retains target modes...`), plus equal-ID, denial and failure tests |
| Correlated includes and explicit target policy | `service-authorization-related.integration.test.ts` fixture's `include(op, correlated)`; task V1 also names `virtuals-populate-include.integration.test.ts` |
| Post-write detachment, opposite upsert modes, in-flight capture, duplicate IDs, failure draining | `write-output-modes.unit.test.ts`; `write-output-origin-ownership.unit.test.ts`; `write-output-source-lifetime.unit.test.ts` |
| Metadata postures, duplicate IDs and native data | `service-list-preparation.unit.test.ts` (`preserves same-ID facts, native views, diagnostics and metadata...`); task V1 permissions/field-permissions suites |
| Static/dynamic field policy, lifetimes/publication/bounds | Task V1 preparation, facts/publication and concurrency families; no new exhaustive review claimed |
| Nested/virtual/denied-sort behavior | `sort-field-authorization.integration.test.ts`; task V1 `sort-policy.unit.test.ts`, `basic-list-sort.integration.test.ts`, `sort-options.integration.test.ts` |
| Logging | `logger-redaction.test.ts` (`does not call debug log handlers...`, redaction, failures, structured timing metadata); new work probe counts the previously untested disabled summaries |
| COUNT/DELETE/DISTINCT and raw helpers | `write-output-modes.unit.test.ts` (`all four trusted settings add no document-output authority...`); raw helper coverage in `owned-authorization-modes.unit.test.ts` |

## Uncovered acceptance / claim gates

1. Related-target READ/LIST parent×target timing cells (including populate and
   correlated includes) remain missing. Existing correctness suites are not timing
   evidence. A change affecting these paths needs targeted real-service cases and
   new same-fixture baseline/candidate seals/noise, preserving the original seal.
2. Explicit sort-heavy, dynamic-rule, enabled/level-changing logging, important
   failure/reentry/in-flight/limit and duplicate-identity performance controls are
   not generated by the timing driver. Add only the relevant shapes when a later
   change reaches them; do not claim this packet measured them.
3. No allocation or retained-heap measurements. No allocation/heap-saving claim is
   supported, and a retained-cache change needs a separate owned-lifetime probe.
4. Adapter timings cannot establish database latency/query equivalence. ARPC-06
   still needs its requested database-backed callback/query characterization.
5. Separate work counts identify repeated candidates but do not partition wall/CPU
   by helper. Attributable before/after changes (or separate profiles) remain
   necessary for ARPC-02–06 conclusions.

These gaps block the corresponding performance claims; they are not historical
passes, silently relaxed tolerances, or reasons to run downstream/root suites.
