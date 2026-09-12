# MOO-07 Evidence: Orphan-Query Contract Investigation

Created: 2026-09-12. Investigation only — no source changes. Probes were throwaway
(`/tmp/opencode/moo-07-probe.mjs`, temp copies under `packages/moo/`, since removed);
no retained tests/fixtures were added, so per-task verification V2 is not triggered
(nothing to regress; `git status` shows only this file plus the task-file edit).

Environment: Node v26.7.0, linux x86_64, mongodb-memory-server 11.x (standalone,
wiredTiger), mongoose 9.x, workspace build via `pnpm --filter @web-ts-toolkit/moo... build`.
Scale fixture: 2000 parents / 2000 children (`pad: 'x'.repeat(50)`), index on
`Child.parent`, index on `Parent._id`. Elapsed/heap figures are observations, not thresholds.

## 1. Per-shape observed results

| #   | Shape                                                                              | Observed (reproducible)                                                                                                                                                                                                                                                                             | Classification                                                                                                |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Scalar `_id` ↔ scalar `{ type: ObjectId, ref: P }`                                 | `findOrphans(C)` returns exactly the 1 dangling row; map form keys correctly                                                                                                                                                                                                                        | Supported-correct (baseline)                                                                                  |
| 2a  | Non-`_id` local keys, String↔String (`code`↔`parentCode`)                          | Returns `null` (`isReference` fails: `type` is String, no ref target)                                                                                                                                                                                                                               | Unsupported (silent null)                                                                                     |
| 2b  | Non-`_id` local key (`localField: 'code'`) with ObjectId foreign ref               | Returns rows, but `localField` is never read — `distinct('_id')` is hardcoded, so the query compares parent `_id`s against `parentCode`. Correct only by accident when `_id`s coincide with the intended keys                                                                                       | Supported-but-incorrect                                                                                       |
| 3   | Dotted foreign field (`meta.parent`)                                               | Returns `null`: `Target.schema.obj['meta.parent']` is `undefined` (`obj` keys are top-level only; here `['meta']`)                                                                                                                                                                                  | Unsupported (silent null)                                                                                     |
| 4a  | Array-ref syntax 1, `parents: [{ type: ObjectId, ref: P }]` (array-valued foreign) | Works: full-orphan `[dead]` included, partial `[live, dead]` excluded, all-live excluded. Semantics = "no live parents". Empty array `[]` **included** as orphan                                                                                                                                    | Supported; semantics partly undocumented (empty-array inclusion)                                              |
| 4b  | Array-ref syntax 2, `parents: { type: [ObjectId], ref: P }`                        | Returns `null`: `isReference` requires `value.type` to be `ObjectId` or the class, but here `type` is `[ObjectId]` (array)                                                                                                                                                                          | Unsupported (silent null)                                                                                     |
| 5   | Missing/`null` foreign values (scalar case)                                        | Both `null` and missing-field rows are **included** as orphans (found=2 of 3; live excluded)                                                                                                                                                                                                        | Supported-but-undocumented; inconsistent with MOO-05 delete path (missing key = zero dependents, fail-closed) |
| 6   | Dynamic refs (`refPath: 'kind'`)                                                   | Returns `null`: `isReference(value, ref)` only compares `value.ref === ref`, ignoring `refPath`                                                                                                                                                                                                     | Unsupported (silent null)                                                                                     |
| 7   | `foreignFilter`-only config (no local/foreign fields)                              | Returns `null` (early return). Orphan-of-arbitrary-filter is contractually ill-defined                                                                                                                                                                                                              | Unsupported by design — needs explicit deferral, not silent null                                              |
| 8   | Relationship + `foreignFilter` both set                                            | `foreignFilter` ignored; `extraForeignFilter` conjunctively applied (`contents: ['to-delete']`, found=1). Consistent with delete path                                                                                                                                                               | Supported-correct (but asymmetry with #7 undocumented)                                                        |
| 9   | Dotted localField (`keys.code`), collection empty                                  | Returns `[]`/rows via hardcoded `distinct('_id')`; `localField` never used — same root cause as #2b                                                                                                                                                                                                 | Supported-but-incorrect                                                                                       |
| 10  | Session passthrough                                                                | Public static signature is `(modelName?)` only; wrapper hardcodes `findOrphans.call(this, {})`, so the internal `QueryOptions.session` is unreachable. `distinct`/`find` therefore never run in a caller session. Connection scoping works (model resolves via owning `collection.conn` per MOO-04) | Supported-but-incorrect (session silently dropped)                                                            |

`isReference` unit shapes: scalar ✓, array-syntax-1 ✓, string `'ObjectId'` type ✓,
wrong-ref correctly false; array-syntax-2 ✗ (false), `refPath` ✗ (false).

## 2. Scale comparison (2000 parents / 2000 children)

- Current client-side exclusion: `distinct('_id')` 8 ms, 2000 ids, ~54 KB JSON payload
  (~27 B/id → 16 MB BSON query-document cap ≈ 550k parent ids, by arithmetic, not measured
  at that scale); orphan query 16 ms, found 1000/1000 expected. `explain('executionStats')`:
  winning plan `FETCH`, `nReturned: 1000`, `totalDocsExamined: 1000` (foreign-field index used).
  Heap +5.3 MB across distinct+query.
- Server-side `$lookup` anti-join (`$lookup` parent on `parent`=`_id`, `$match: { __p: { $size: 0 } }`):
  21 ms, found 1000/1000 (identical result set), agg explain stages `[$cursor, $match]`.
  Heap +3 MB after agg. No client ID payload; no 16 MB cap; payload scales with result size only.
- Bounded-batching probe (10 pages × 200 ids, per-page `$not/$in` counts): 26 ms total.
  Note: per-page `$not/$in` is **not** a correct anti-join (page counts overlap) — recorded only
  to show paging cost shape, not as a candidate.
- Parity holds at this size (16 ms vs 21 ms); the client-side path's risk is superlinear
  payload/memory and the hard 16 MB ceiling, not latency at 2k rows.

## 3. Recommended support matrix

| Shape                                      | Recommendation                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scalar `_id` ↔ ObjectId ref                | Keep; regression-locked baseline                                                                                                                                                           |
| Array syntax 1 (array-valued foreign)      | Keep "no live parents" semantics; **exclude** empty arrays (a child referencing nothing has no dangling reference — see §4)                                                                |
| Array syntax 2 `{ type: [ObjectId], ref }` | Support in implementation: unwrap array `type` in `isReference` (small, bounded)                                                                                                           |
| Dotted foreign/local paths                 | Support in implementation: resolve via `schema.path(foreignField)` instead of `schema.obj[...]` (handles dotted + array-element paths, returns `SchemaType` with `instance`/`options.ref`) |
| Non-`_id` local keys                       | Support in implementation: `distinct(localField)` + MOO-05-style fail-closed on missing/null/empty (mirror delete path); reject only provably-deselected projections                       |
| `refPath` dynamic refs                     | **Defer explicitly**: anti-join spans multiple target collections per row value; unbounded scope for this lane. Return a documented error (not silent null) when detected                  |
| `foreignFilter`-only orphan query          | **Defer explicitly**: orphan-of-arbitrary-filter is ill-defined; document that `findOrphans` requires relationship mode                                                                    |
| Missing/`null`/empty foreign values        | Adopt strict orphan definition (§4); document                                                                                                                                              |
| Session/connection                         | Thread `QueryOptions` through the public static (session flows to `distinct`+`find`); keep MOO-04 connection resolution. Reject cross-client sessions per MOO-04                           |

## 4. Array orphanhood semantics (decision, not silent invention)

Observed current semantics: a row is orphan iff **none** of its foreign values is a live
parent id (full-orphan yes, partial no, live no). I recommend keeping exactly this
("no live parents") and additionally **excluding empty arrays**, with the strict definition:

> A dependent row is an orphan iff it holds ≥1 non-nullish foreign value and zero of
> those values resolve to a live parent row. Rows with missing/`null`/empty foreign
> values are not orphans under this definition.

Rationale: matches observed partial-row behavior; aligns the read path with the MOO-05
delete path (which refuses to act on missing keys); prevents an "empty = orphan" surprise
where a childless row is reported as parentless. This is a **product-contract proposal**:
the follow-up task (MOO-12 below) carries maintainer confirmation as acceptance, and until
then the current inclusive behavior stays as-is and must be documented as such by MOO-10.

## 5. Decision

- **Implement** relationship-mode correctness (MOO-12): `localField`-aware keys, dotted
  paths via `schema.path`, array-syntax-2, strict orphan definition (pending maintainer
  confirmation), session passthrough, documented errors replacing silent `null`s.
- **Implement** server-side `$lookup` anti-join with foreign-field index requirement
  (MOO-13); keep result-shape identical to today; document the 16 MB ceiling only as the
  rationale for the legacy path's removal/deprecation.
- **Explicitly defer** `refPath` and `foreignFilter`-only orphan queries with documented
  errors. No speculative rewrite was made here.

## 6. Follow-up tasks

### MOO-12: Correct findOrphans relationship-mode contract

- Ownership: `packages/moo/src/plugins/cascade-delete.ts` (`findOrphans`, `isReference`
  in `packages/moo/src/utils/index.ts`); Mongoose lifecycle agent; MOO-10 owns doc consolidation.
- Dependencies: MOO-07 (this investigation).
- Acceptance: each shape in §1 rows 2–6, 9–10 has a MongoDB-backed regression that fails
  on current code (null or wrong set) and passes after; strict §4 definition locked
  (empty arrays excluded, partial included-only-when-zero-live); `refPath`/full-filter
  configs throw a documented error instead of returning null; session option reaches
  `distinct`+`find` (replica-set abort covers orphan reads); MOO-04/05/06 suites green.
- Verification: V1 new tests + V2.

### MOO-13: Server-side orphan anti-join with bounded resources

- Ownership: same plugin file; Mongoose lifecycle agent; MOO-10 owns index/limit docs.
- Dependencies: MOO-12 (correct predicate first, then move it server-side).
- Acceptance: `$lookup`-based `findOrphans` returns result sets identical to MOO-12 semantics
  on parity fixtures (scalar, array-syntax-1/2, dotted, non-`_id` keys); requires/documents
  the foreign-field index (`explain` shows index use, recorded); 2000/2000 parity run re-recorded
  with sizes/environment; no client-side ID materialization (no `distinct`-into-`$in`);
  session/connection behavior from MOO-12 preserved.
- Verification: V1 parity + scale experiment, V2.
