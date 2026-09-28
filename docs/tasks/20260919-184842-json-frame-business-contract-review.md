# JSON Frame Business Contract Review and Implementation

Created: 2026-09-26 18:48:42 (local timestamp)

## Objective, Product Purpose, and Scope

`@web-ts-toolkit/json-frame` is a zero-runtime-dependency, isomorphic bridge from pandas tabular JSON to TypeScript applications. Its business value is predictable data exchange for reporting, dashboards, and analysis: normalize six wire layouts, retain row/index/schema meaning, transform data without changing the source, and export usable JSON. Trustworthy inferred types, metadata identity, empty report dimensions, and controllable processing costs matter more here than adding a general query engine.

Review and implement concrete gaps in `packages/json-frame`, its shipped README and corresponding website page. Preserve named root exports, CJS/ESM and strict declaration consumers, shallow nested-cell semantics, and existing orient behavior. **Do not edit the root `CHANGELOG.md`.** This document's release/contract notes are the release evidence for this work. Preserve all unrelated worktree changes.

Non-goals: joins/group-by/aggregation, MultiIndex, streaming/file I/O, general pandas schema enforcement, deep immutability, hostile JavaScript sandboxing, and blanket runtime dependencies. No unmeasured performance claims or broad rewrites.

## Analysis Coverage and Previous Work

Inspected README, manifest, entry overloads, options, iterative JSON clone/validation, datetime validation, frame transforms/schema partitioning, orient parsers and exporters, strict consumer coverage, and the relevant historical task evidence. A read-only isolated reviewer reproduced transform/export and inferred-type issues against the existing ESM build and strict TypeScript declarations. Coordinator reviewed traversal/date/options and docs. No package or repository baseline suite was run during planning; implementation and integration checks below are required. Existing build probes establish findings, not a fresh build baseline. No fresh pandas experiment, fuzzing campaign, or exhaustive Node/browser matrix was run.

Related plans (do not duplicate their completed outcomes):

- `docs/tasks/20260814-170611-json-frame-package.md`
- `docs/tasks/20260823-152151-json-frame-health-review-remediation.md`
- `docs/tasks/20260908-180959-json-frame-boundary-health-follow-up.md`

This is a continuation with new residual findings. JFC-01 narrows an uncovered JFB-01 field-order case. JFC-03 implements an opt-in variant of JFB-04's bounded-expansion recommendation; JFB-10 was mentioned but never created. JFC-04 implements JFB-07's calendar-valid recommendation. Historical verification failures remain historical; this plan records new integration results without rewriting them.

## Decisions, Priorities, and Execution Rules

- P1: silent data/schema corruption. P2: incorrect public contracts or useful bounded resource controls. P3: documentation/ergonomics.
- User requests implementation of all selected items and **a fresh isolated sub-agent for every task, sequentially**. Execute JFC-01 through JFC-06 in order, with no overlapping agent/build sessions. The final reviewer must be distinct from implementers.
- Resource decision: add optional `maxNodes` positive-safe-integer budgets to ingestion and string serialization. Count each scalar/container occurrence, including the root and repeated aliases, per traversal. Omitted means current unlimited breadth behavior. Preserve detached clone semantics; do not silently change alias identity or impose a default quota. This controls traversal expansion, not input bytes, object-key allocation, rectangular frame densification, native serialization hooks, or total process memory. Clearly disclose residual limits.
- Datetime decision: accept calendar-valid four-digit naive ISO years 0000–9999 using Gregorian validity; do not imply pandas nanosecond read-back supports the entire range. This resolves the old implicit `Date.UTC` behavior using the prior investigation's recommendation.
- Shared hotspots (README, types, tests, task file) are safe only because execution is sequential. Each agent sets its task `in_progress`, implements/tests, then records `Status: completed` with **Completion evidence** only after acceptance passes. Record blockers honestly.
- New necessary findings belong in the current task's requirements with explanation; independent findings get a concrete follow-up task before implementation. Coordinator verifies final evidence and statuses.

## Shared Verification

Run from repository root with installed workspace dependencies and supported Node/pnpm. Never hand-edit generated `dist/`.

- V1 focused: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts <test-path>` (paths relative to package).
- V2 package: `pnpm --filter @web-ts-toolkit/json-frame test` (build, source/NodeNext/Bundler/browser declarations, runtime, benchmark and packed consumers).
- V3 focused lint: `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"`.
- V4 packed consumer if needed separately: `pnpm --filter @web-ts-toolkit/json-frame test:packed-consumer`. Manifest placeholders are intentionally rewritten by the release harness; do not 'fix' them.
- V5 integration, serially: `pnpm lint`, `pnpm build`, `pnpm test`. Record exact unrelated failures; do not alter unrelated packages to force green. Full-suite all-green is informative for this scoped review; package checks and acceptance are mandatory. An unrelated full-suite failure does not imply json-frame failed, but must remain visible in the final verdict.
- Existing performance harness: `pnpm --filter @web-ts-toolkit/json-frame bench:jfh-07`. Use deterministic visit counts for budget behavior, not timing thresholds.

## Tasks

### Task JFC-01: Preserve Schema Roles When a Colliding Rename Follows Arbitrary Field Order

Status: completed

Implementation session: fresh isolated JFC-01 session; no subagents, per scoped user instruction.

Kind: defect

Priority: P1 — valid transforms silently attach string-index metadata to numeric data and vice versa.

Suggested agent: schema identity specialist (fresh session)

Dependencies: none

Primary ownership: `packages/json-frame/src/frame/DataFrame.ts`, `src/export/payload.ts` if necessary, frame/export regression tests.

Finding: `#renameSchema`'s unique-name branch preserves source field order even when the result introduces duplicate internal names. `partitionSchemaFields` and exporter template selection then assume index-first canonical order. For fields `[value: integer, pk: string]`, primary key `pk`, data `{pk:'r0',value:42}`, `rename({value:'pk'}).toTable({indexField:'row_id'})` emits integer `row_id='r0'` and string `pk=42`. Existing collision tests use index-first order; non-first-index tests do not collide.

References: `src/frame/DataFrame.ts` (`#renameSchema`, `partitionSchemaFields`); `src/export/payload.ts` (`getIndexFieldTemplate`, `getDataFieldTemplates`); `test/export/export.test.ts` non-first index and colliding rename tests (all paths under `packages/json-frame`).

Requirements:

1. Partition original index/data identities before a colliding rename; canonicalize ambiguous internal results without guessing from renamed names.
2. Preserve arbitrary field metadata, primary key, column order, original frame, and supported rename/export override behavior.
3. Keep the correction narrow and encapsulated; avoid publicly exposing internal state.

Acceptance criteria:

- Regression fails before fix and passes for index before/between/after data fields, with collision before and after index position.
- Direct export and select/second rename/reset/filter-empty/sort chains retain correct types, custom metadata, values, and primary-key roles.
- Existing prototype-sensitive and ordinary transform controls pass.

Verification: V1 frame/export, V2, V3. Record corrected public-root reproduction.

Completion evidence:

- Changed: `packages/json-frame/src/frame/DataFrame.ts`, `packages/json-frame/test/export/export.test.ts`, and this task's status/evidence. The private rename helper now receives the validated next columns and uses original role-aware partitioning whenever the result collides with the retained index name. Ambiguous results are canonicalized to index-first/data-column order before downstream transforms/exporters consume them; ordinary unique-name renames retain their existing field-order behavior. No new public state/API or exporter changes were needed.
- Regression: 42 public-source-entry cases (all six permutations of index/value/note fields × seven direct/transform paths) check types, nested custom field/schema metadata, primary-key roles, column/index/value order, table/string exports, reparsing, and source/input preservation. Paths cover direct export, select, second rename, resetIndex, filter-empty, sorting with reordered rows, and a composed select/sort/rename/reset/filter-empty chain. Existing prototype-sensitive and ordinary transform controls remain green.
- Pre-fix V1: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/frame test/export` — **21 failed / 86 passed, 3 files**. All seven new paths failed for each of `[value,pk,note]`, `[value,note,pk]`, and `[note,value,pk]`, with string-index and integer-data types/custom metadata swapped. The other 21 new cases passed as field-order controls.
- Post-fix checks ran **serially**, each exiting 0:
  - V1: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/frame test/export` — **107/107 tests, 3/3 files passed** (including all 42 new cases).
  - V2: `pnpm --filter @web-ts-toolkit/json-frame test` — **211/211 tests, 8/8 files passed**; CJS/ESM/declaration build, source typecheck, strict NodeNext/Bundler/browser declaration consumers, runtime, existing benchmark, and packed consumers passed.
  - V3: `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — **passed**, no diagnostics.
- Corrected public-root reproduction: executed `pnpm --filter @web-ts-toolkit/json-frame exec node --input-type=module -e '<script below>'` against the V2-built package. Both **ESM and CJS passed** and printed `{"schema":{"fields":[{"name":"row_id","type":"string"},{"name":"pk","type":"integer"}],"primaryKey":["row_id"]},"data":[{"row_id":"r0","pk":42}]}`. Reproducible script (formatted for readability):

  ```js
  import assert from 'node:assert/strict';
  import { createRequire } from 'node:module';
  import { fromOrient } from '@web-ts-toolkit/json-frame';
  const require = createRequire(import.meta.url);
  const input = {
    schema: {
      fields: [
        { name: 'value', type: 'integer' },
        { name: 'pk', type: 'string' },
      ],
      primaryKey: ['pk'],
    },
    data: [{ pk: 'r0', value: 42 }],
  };
  const expected = {
    schema: {
      fields: [
        { name: 'row_id', type: 'string' },
        { name: 'pk', type: 'integer' },
      ],
      primaryKey: ['row_id'],
    },
    data: [{ row_id: 'r0', pk: 42 }],
  };
  for (const [format, factory] of [
    ['ESM', fromOrient],
    ['CJS', require('@web-ts-toolkit/json-frame').fromOrient],
  ]) {
    const actual = factory(input, { orient: 'table' }).rename({ value: 'pk' }).toTable({ indexField: 'row_id' });
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
    console.log(format + ' public-root PASS: ' + JSON.stringify(actual));
  }
  ```

- Review: `git diff --check` passed; `git diff -- CHANGELOG.md` is empty. No unrelated worktree files were edited by this session. JFC-02..06 remain pending. V1/V2 emitted the existing root Vite config future-native-loader warning; no JFC-01 acceptance blocker remains. Full-repository V5 belongs to JFC-06 and was not run here.

### Task JFC-02: Make Automatically Inferred Row Types Match Normalization

Status: completed

Implementation session: fresh isolated JFC-02 session; no subagents, per scoped user instruction. JFC-01 completion evidence reviewed.

Kind: defect

Priority: P2 — declarations admit code that throws or silently filters incorrectly on valid input.

Suggested agent: TypeScript API contract specialist (fresh session)

Dependencies: JFC-01 (execution sequencing)

Primary ownership: `packages/json-frame/src/api.ts`, `src/types.ts`, `src/index.ts` if needed, API/runtime tests, `test-decl-consumer`, README type guidance.

Finding: records inference accepts row arrays; `fromOrient([[1]], {columns:['n']})` infers `DataFrame<[number]>` although runtime rows are `{n:1}`. Separately, `fromOrient([{n:1}, {}])` infers missing `n` as undefined/absent, while the parser produces `null`; an undefined-only guard followed by `toFixed()` compiles and throws.

References: `src/api.ts` records overload; `src/types.ts` (`JsonCompatibleRow`); `src/parse/parse.ts` (`parseRecords` null backfill); `test/api.test.ts`; strict `.mts`/`.cts` consumers.

Requirements:

1. Exclude arrays from records inference, or provide safe values-array overload ordering for omitted/auto orients, including readonly tuples.
2. Inferred sparse/heterogeneous/optional record fields must include runtime null filling. Preserve useful homogeneous inference; use conservative fallbacks where sound inference cannot be proven. Implementation clarification: potentially missing fields must also allow `undefined` because a column absent from every input row is not created; flatten heterogeneous variants rather than implying discriminant-based cell presence. Null filling is top-level only.
3. Preserve intentional explicit domain-generic workflows, documenting that caller assertions still are not runtime schema validation.
4. Public JSDoc and emitted declarations must explain the inference boundary; avoid accidental deep imports or runtime dependencies.

Acceptance criteria:

- Strict source and published declaration consumers reject array-method calls on auto values rows; omitted/auto/explicit values yield safe rows.
- Missing-field examples require a null-safe guard; optional declared properties and heterogeneous literals are covered alongside homogeneous controls.
- Runtime tests confirm null normalization and object-shaped values rows. Existing explicit generic consumers remain valid.

Verification: V1 API, V2 (all declaration modes and packed consumers), V3.

Completion evidence:

- Changed: `packages/json-frame/src/api.ts`, `packages/json-frame/README.md`, `packages/json-frame/package.json`, `packages/json-frame/test/api.test.ts`, `packages/json-frame/test/packed-consumer.test.ts`, `packages/json-frame/test-decl-consumer/inference-contract.mts`, `packages/json-frame/test-decl-consumer/tsconfig-source.json`, `packages/json-frame/test-decl-consumer/tsconfig-bundler-browser.json`, and this task's status/clarification/evidence.
- Contract: a records-input generic distinguishes automatic inference from explicit domain-row assertions. Array inputs (mutable or readonly tuples) infer object-shaped `JsonRow`, including omitted/auto/explicit values orients. Known fields required in every record variant retain their value precision; potentially missing fields are optional and include `null`. Heterogeneous variants become one column shape; nested cells retain their original types. Broad string/number dictionary records, broad orient options, and other layouts use conservative `JsonRow` inference. The explicit-domain overload suppresses accidental inference with `NoInfer` and preserves intentional caller models, including optional interfaces. Explicit generics remain assertions, not runtime application-schema validation. README and emitted public JSDoc explain these choices. No runtime parser change or new public export/dependency was needed.
- Regression proof: temporarily restored the original records overload and ran `pnpm --filter @web-ts-toolkit/json-frame typecheck:source` against the new fixture — **exit 2, 9 diagnostics** (2 incorrect array-row assignments and 7 unused negative assertions covering array methods and missing nullability). Restored the fix afterward. The final fixture includes **9 negative compile-time assertions**, positive homogeneous/literal/nested controls, sparse/heterogeneous/optional records, entirely absent optional columns, all six mutable/readonly values-orient combinations, dictionary/options fallbacks, and explicit domain workflows. It is compiled through the public root against source and shipped declarations, then copied into installed `.mts`, `.cts`, and Bundler/browser consumers without source-path aliases.
- Added **7 runtime API cases**: omitted/auto/explicit values object rows (3), omitted/auto/explicit sparse and heterogeneous records with null-safe filter/sort and preserved inputs (3), and optional-column presence/absence, shallow nested cells, and explicit-generic normalization (1). Installed CJS and ESM scripts each additionally exercise all three values modes, all three records modes, and entirely absent columns. Existing JFC-01 regressions remain green.
- Required checks ran **serially**, each exiting 0:
  - V1: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/api.test.ts` — **12/12 tests, 1/1 file passed**.
  - V2: `pnpm --filter @web-ts-toolkit/json-frame test` — **218/218 tests, 8/8 files passed**; CJS/ESM/declaration build, strict source/NodeNext/Bundler/browser checks, runtime, existing benchmark, release-transformed tarball installation, CJS/ESM runtime consumers, strict installed declarations, and shipped README examples passed. The packed surface checks also verify inference JSDoc survives emission, named-only exports, and no runtime dependencies.
  - V3: `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — **passed**, no diagnostics.
- Review: inspected emitted `dist/index.d.ts` and the JFC-02 diff; `git diff --check` passed and `git diff -- CHANGELOG.md` was empty. JFC-01 source/tests and unrelated concurrent worktree changes were not edited by this session. JFC-03..06 remain pending. The existing Vite future-native-loader warning appeared in V1/V2; no JFC-02 acceptance blocker remains. Full-repository V5 and website alignment remain assigned to their existing later tasks.

### Task JFC-03: Add Opt-In Traversal Budgets for Ingestion and Serialization

Status: completed

Implementation session: fresh isolated JFC-03 session; no subagents, per scoped user instruction. Shared decisions and JFC-01/JFC-02 completion evidence reviewed.

Kind: improvement

Priority: P2 — applications accepting parsed JSON graphs need a controllable expansion boundary.

Suggested agent: iterative traversal/resource-boundary specialist (fresh session)

Dependencies: JFC-02

Primary ownership: `packages/json-frame/src/json.ts`, `src/options.ts`, `src/parse/parse.ts`, `src/frame/DataFrame.ts`, `src/types.ts`, parser/export/options tests, README and declaration consumers.

Finding: JFB-04 measured 13 distinct aliased containers expanding to 8,191 clone containers. `cloneJsonCompatible` and `assertJsonCompatible` only track ancestors/depth, so breadth and repeated-alias processing remain unlimited. README explicitly discloses this; it is an optional control gap, not a claim of universal remote exploitability.

References: `src/json.ts` clone and validation loops; `src/parse/parse.ts` (`parseInput`); `src/frame/DataFrame.ts` (`toJSONString`); old JFB-04/JFB-06/D1 evidence.

Requirements:

1. Implement the shared `maxNodes` decision above through validated public options. Reject zero, negatives, fractional/nonfinite/unsafe integers and nonnumbers as `JsonFrameOptionError`.
2. Charge root and every property/element value occurrence before traversing/cloning it; fail exceeding budget with path-bearing `JsonFrameValidationError` and known orient. Exact-budget succeeds. Counters reset per call and are local to traversal.
3. Share budget accounting across clone/validation paths without an unnecessary full clone or separate pre-pass. Preserve cycles, depth, holes, prototype safety, detached alias semantics, and shallow exported cell identity.
4. Serialization options must work for all six orients, including table options together with maxNodes. Refactor duplicated dispatch/validation only as necessary to apply one consistent boundary.
5. Update README/JSDoc/strict consumers with opt-in ingestion and serialization examples plus honest limits. No default limit and no claim that ingestion maxNodes persists to later exports.

Acceptance criteria:

- Deterministic tests cover scalar/container counting, exact/one-over boundaries, repeated aliases, raw JSON and parsed inputs, all six serialization orients, table metadata, mutation-introduced alias graphs, independent repeated calls, and omitted-option controls.
- Existing cycle/depth/prototype/shallow-identity tests pass; no naive alias memoization bypasses deep-second-path validation.
- Small graph/high expansion rejection is demonstrated with bounded deterministic tests rather than wall-clock assertions. Existing benchmark continues to run; record overhead observations only if actually measured.

Verification: V1 parser/export/options, V2, V3, bounded operation-count evidence.

Completion evidence:

- Changed **13 files** (paths below relative to `packages/json-frame` except this task document): `src/json.ts`, `src/options.ts`, `src/parse/parse.ts`, `src/frame/DataFrame.ts`, `src/export/payload.ts`, `src/types.ts`, `README.md`, new `test/max-nodes.test.ts`, new `test-decl-consumer/budget-contract.mts`, `test-decl-consumer/tsconfig-source.json`, `test-decl-consumer/tsconfig-bundler-browser.json`, `test/packed-consumer.test.ts`, and this task's status/evidence. Prior JFC-01 schema-role and JFC-02 inference changes are preserved.
- Implementation: one shared private counter factory is instantiated locally for each clone/validation traversal and charges before scalar checking or container descent/allocation. Roots, scalars, containers and repeated aliases each count per occurrence; exact budgets succeed, excess throws path-bearing `JsonFrameValidationError` with known orient. Public ingestion and serialization share positive-safe-integer validation; omitted/undefined means unlimited. All six string orients normalize options before dispatch and converge on one validation/stringification boundary. Table `indexField` uses shared validation and combines with `maxNodes`; existing object-returning exporters keep their shallow-cell behavior. No ingestion budget is stored on frames, no alias memoization is introduced, and serialization adds no full clone or pre-pass.
- Added **48 deterministic focused cases** covering 13 invalid budget values, invalid options/indexField for all six string orients, scalar/container roots, exact/one-over parsed/raw inputs, explicit/auto/omitted ingestion orient, aliases and detached ownership, independent repeated calls, omitted/MAX_SAFE_INTEGER controls, all six input/output layouts, nested schema/field metadata with colliding rename/index override, mutation graphs, prototype-sensitive keys, cycles, holes, non-JSON values, and shared containers reached again through an over-depth second path. Existing depth-boundary/prototype/identity and JFC-01/JFC-02 regressions pass.
- Accounting results: one-cell source-index frames require **3** nodes in records/index/columns/values, **8** in split, **15** in table; nested field/schema metadata raises the table fixture to **21**. The mutation-alias fixture requires **7/12/13** nodes in shallow/split/synthetic-index table layouts. A graph of **13 distinct containers** expands to **8,191 container occurrences**: records ingestion succeeds at **8,193** including wrappers, and mutation serialization succeeds at **8,194** including its extra cell holder. Budget **64** stops on attempted occurrence **65**, after **62** measured graph-edge reads for ingestion or **61** for mutation serialization; the offending value is read before its charge rejects descent. Successful ingestion reads exactly **8,190** graph edges once; successful serialization reads **16,380** (validation plus native stringification), preserving the original shared cell graph. These are operation counts, not timing thresholds.
- Declaration/installed surface: the new public-root fixture has **6 negative compile-time assertions** and positive ingestion/raw/explicit-domain, all-six serialization and table-combination examples. It passes source, NodeNext and Bundler/browser modes, and is copied into installed `.mts`, `.cts` and `.ts` consumers without source aliases. Installed CJS and ESM runtime scripts each check exact/one-over budgets for every orient and invalid ingestion options. Inspected emitted `.d.ts`/`.d.mts`: optional numeric options, per-call/root/alias semantics, residual limits and JSDoc examples survive emission; internal accounting is not public. Shipped README examples compile.
- Required checks ran **serially**, each final command exiting 0:
  - V1: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/parse test/export test/options-and-errors.test.ts test/max-nodes.test.ts` — **216/216 tests, 4/4 files passed**.
  - V2: `pnpm --filter @web-ts-toolkit/json-frame test` — **266/266 tests, 9/9 files passed**, including CJS/ESM/declaration build, strict source/NodeNext/Bundler/browser checks, runtime, existing benchmark, release-transformed tarball/installed consumers, and README examples.
  - V3: `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — **passed**, no diagnostics.
- Verification note: the first V1 invocation had **45 failures / 171 passes** because the new fixture mixed the stale built package root with current source traversal helpers (including distinct error-class identities). The fixture now consistently imports the public source entry, matching export regression conventions; V1 then passed. V2 separately rebuilt and verified the installed package. No runtime fix was needed for that fixture-resolution issue. Subsequent cleanup only adjusted comment/test whitespace.
- Review/limits: `git diff --check` passed and `git diff -- CHANGELOG.md` was empty. README/JSDoc explicitly exclude input/output bytes, native parsing, key/diagnostic allocation, rectangular densification, export/schema construction, hooks and total memory from the traversal budget; auto-ingestion orient is unknown until cloning finishes. The existing benchmark ran, but no before/after budget timing-overhead comparison was made. The existing Vite future-native-loader warning appeared in V1/V2. No JFC-03 acceptance blocker remains; JFC-04..06 remain pending, including website alignment and repository integration. Unrelated worktree files were not edited by this session.

### Task JFC-04: Validate Four-Digit Datetimes by Calendar Rules

Status: completed

Implementation session: fresh isolated JFC-04 session; no subagents, per scoped user instruction. Shared context and JFC-03 completion evidence reviewed.

Kind: defect

Priority: P2 — accepted date syntax accidentally excludes valid early years.

Suggested agent: datetime interoperability specialist (fresh session)

Dependencies: JFC-03

Primary ownership: `packages/json-frame/src/frame/column.ts`, column tests, README and datetime JSDoc.

Finding: `isPandasNaiveIsoDatetime` uses `Date.UTC`, which remaps years 0–99 to 1900–1999 and consequently rejects calendar-valid `0000`, `0001`, and `0099`. Old JFB-07 already established pandas emission/read-back range asymmetry; this task implements the recorded calendar-only recommendation, not another investigation.

References: `src/frame/column.ts` (`isPandasNaiveIsoDatetime`); old JFB-07 completion evidence; README logical datetime contract.

Requirements:

1. Validate Gregorian calendar dates for four-digit years 0000–9999 without Date.UTC's special-year behavior; preserve current naive ISO grammar/time/fraction restrictions.
2. Cover Gregorian leap rules (including year 0000, 0100, 1900, 2000), invalid days/months/times, and existing numeric epoch/timezone rejection.
3. Document calendar validity versus pandas dtype/resolution/read-back limits; cite prior pinned pandas evidence without claiming new experiments ran.

Acceptance criteria:

- Public fromOrient with explicit datetime accepts valid early years and boundaries; invalid leap dates/time values still fail with structured row/column diagnostics.
- Values and metadata survive packed/unpacked transforms/export unchanged; ordinary inferred strings remain strings.
- README and public declaration docs do not promise universal pandas read-back for the full year range.

Verification: V1 column tests, V2, V3; prior pandas evidence review (fresh pandas run optional unless making a new interoperability claim).

Completion evidence:

- Changed: `packages/json-frame/src/frame/column.ts`, `packages/json-frame/src/types.ts`, `packages/json-frame/test/frame/column.test.ts`, `packages/json-frame/test/packed-consumer.test.ts`, `packages/json-frame/README.md`, and this task's status/evidence. The validator now uses month lengths and Gregorian divisibility rules, including leap year 0000, instead of constructing a `Date`. The existing regex and time/fraction/timezone/numeric-epoch restrictions are preserved. No cell coercion or pandas-range restriction was added.
- Added **63 column cases** through the public source entry: 18 valid dates (early years, 0000/0400/2000 leap controls, century controls, proleptic-calendar cutover date, year 9999 and 1/6/9-digit fractions), 38 invalid date/time/grammar/epoch cases, five non-table orient diagnostic cases with both parsed/raw inputs, and two packing-threshold transform/export cases. Invalid cells retain `JsonFrameValidationError` with orient/path/row/column/value. At thresholds 0 and 1, numeric companion storage is verified unpacked/packed while datetime strings stay unpacked; null filtering, sorting, selection, rename, resetIndex, all six object/string exports and reparsing retain exact dates and logical/schema metadata. Inputs/source frames and ordinary string inference are preserved.
- Regression proof: pre-fix V1 `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/frame/column.test.ts` — **15 failed / 69 passed, 1 file**. Eight valid early-year cases and both transform cases were rejected; all five orient diagnostic cases incorrectly stopped at the valid early-year first row instead of the invalid century-leap second row.
- Required checks ran **serially**, each final command exiting 0:
  - V1: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/frame/column.test.ts` — **84/84 tests, 1/1 file passed**.
  - V2: `pnpm --filter @web-ts-toolkit/json-frame test` — **329/329 tests, 9/9 files passed**; CJS/ESM/declaration build, strict source/NodeNext/Bundler/browser checks, runtime, existing benchmark, release-transformed tarball and installed consumers, and shipped README examples passed. Installed CJS and ESM scripts each exercise early/boundary years, both packing thresholds, transform/all-six string round trips, datetime schema, inferred-string controls, and invalid dates with structured diagnostics.
  - V3: `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — **passed**, no diagnostics.
- Documentation/evidence review: inspected emitted `dist/index.d.ts` datetime JSDoc; packed tests verify the calendar range and pandas limitation survive in both `.d.ts` and `.d.mts`. README specifies the grammar, Gregorian rules, exact string preservation, and dtype/resolution limits. Reviewed prior **JFB-07** evidence in `docs/tasks/20260908-180959-json-frame-boundary-health-follow-up.md:344–385`: its pinned pandas **3.0.3** / CPython **3.14.6** investigation recorded early-year ISO emission at microsecond resolution and table read-back failure outside nanosecond bounds. README cites this historical evidence explicitly; **no fresh pandas experiment was run**, and full-range pandas read-back is not promised.
- Review/concerns: `git diff --check` passed; `git diff -- CHANGELOG.md` is empty. Prior JFC work and unrelated concurrent edits were preserved. The existing Vite future-native-loader warning appeared in V1/V2; no JFC-04 acceptance blocker remains. JFC-05/JFC-06 remain pending; website alignment and full-repository integration were not executed in this scoped session.

### Task JFC-05: Document Empty-Dimension Fidelity and Align Business Guidance

Status: completed

Implementation session: fresh isolated JFC-05 session; no subagents, per scoped user instruction. Shared context and all JFC-01..04 requirements/completion evidence reviewed; dependencies completed.

Kind: improvement

Priority: P3 — reporting clients need to select a wire layout that retains an empty result's shape.

Suggested agent: consumer documentation and round-trip specialist (fresh session)

Dependencies: JFC-04

Primary ownership: `packages/json-frame/README.md`, `test/export/export.test.ts`, `website/docs/packages/json-frame.md`, contract/release notes in this task file.

Finding: `fromOrient([{a:1},{a:2}],{orient:'records'}).select().toColumns()` returns `{}`, which reparses with zero rows. Conversely records/index do not retain declared columns when no rows exist. Existing round-trip prose has no empty-dimension exceptions. Website guidance also omits the serialization depth/mutation and bounded diagnostic preview contracts added in the previous review.

References: `src/export/payload.ts` (`exportColumns`, `exportRecords`, `exportIndex`); `src/parse/parse.ts` empty parsers; README Round Trips; website Limits And Errors; existing export round-trip tests.

Requirements:

1. Preserve standard orient output; document a precise lossiness matrix for zero-row, zero-column, and fully empty frames. Recommend split/table for preserving dimensions, and note values needs supplied columns. Do not invent sentinel fields or reject previously valid exports.
2. Add meaningful round-trip contract tests across all six orients for these shapes.
3. Bring website guidance into agreement with shipped README, including new inference, budget, datetime contracts and previous serialization/diagnostic limits. Keep README self-sufficient.
4. Append concise release/contract notes here for externally observable fixes/additions; root CHANGELOG must stay untouched.

Acceptance criteria:

- Tests establish the documented empty-shape matrix, including synthetic/source indexes where relevant.
- README/website examples use public named exports and correct options; no claims that all layouts retain dimensions.
- Documentation and release notes accurately summarize JFC-01..04 and residual limits.

Verification: V1 export, V2, V3, manual documentation-to-runtime review; no special tests for prose alone.

Completion evidence:

- Changed only for this session: `packages/json-frame/test/export/export.test.ts`, `packages/json-frame/README.md`, `website/docs/packages/json-frame.md`, and this task document's JFC-05 status/evidence and Release / Contract Notes. Existing JFC-01..04 edits in shared files and unrelated worktree changes were preserved. Runtime implementation and standard orient outputs were not changed.
- Added **38 contract cases**: 36 combinations of three empty shapes × source/synthetic indexes × six orients, plus two controls showing `options.columns` cannot restore zero-row records/index columns. Each matrix case checks exact exported payload, string parity, parsed and raw-string re-ingestion, dimensions, rows, column order, labels, publicly observable index provenance via subsequent table export, source/input preservation, and table field/schema metadata. Source table fields put the primary key last; synthetic fixtures have filtered index gaps `[0, 2]`. Values cases also verify missing-column-option rejection. These characterize current behavior rather than claim a runtime defect correction.
- Required checks ran **serially**, each exiting 0:
  - V1: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/export` — **112/112 tests, 1/1 file passed**.
  - V2: `pnpm --filter @web-ts-toolkit/json-frame test` — **367/367 tests, 9/9 files passed**; CJS/ESM/declaration build, strict source/NodeNext/Bundler/browser consumers, runtime, existing benchmark, release-transformed packed CJS/ESM and declaration consumers, and shipped README examples passed.
  - V3: `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — **passed**, no diagnostics.
- Manual documentation-to-runtime review: read all three linked historical plans (including prior completion evidence/requirements), current JFC-01..04 evidence, public entry/types/options, all orient parser/export paths, datetime validation, JSON traversal and diagnostic implementation, package metadata/build configuration, and emitted `dist/index.d.ts`. Reviewed the README/website matrix against the 36 cases. Confirmed source/synthetic index caveats, metadata versus dimension fidelity, required values columns, inference/nullability/explicit-generic boundaries, maxNodes accounting and residual limits, calendar-only datetime range, shallow mutation/serialization depth/hooks, and the 5-key/200-character diagnostic preview. README key-count wording now explicitly matches `Object.keys()`'s own enumerable string-key scope. All examples use named public-root imports and current options.
- Public-root runtime documentation probe: ran `pnpm --filter @web-ts-toolkit/json-frame exec node --input-type=module -e` with assertions for the README/website examples against the V2-built ESM package — **passed**. The empty-report example returned dimensions **0×1, 2×0, 0×0, 0×1**; an empty numeric column became `unknown` via split but retained `integer` via table. Sparse records normalized to null, values rows exposed object cell `n`, the documented **3/8/15** node budgets succeeded, the website's non-first-index rename retained string `row_id`/integer `pk`, and documented year-0000/2000 leap dates passed while 0100/1900 leap dates failed. No fresh pandas experiment or interoperability range claim was made.
- Release evidence: appended concise JFC-01..05 externally observable changes/clarifications and earlier serialization/diagnostic contracts below, explicitly retaining resource, index/order, metadata, shallow ownership, and pandas read-back limitations.
- Review/results: `git diff --check` passed; `git diff -- CHANGELOG.md` was empty. V1/V2 emitted only the existing non-failing Vite future-native-loader warning. No JFC-05 blocker remains. **JFC-06 remains pending**; its independent criterion-level review and repository V5 integration were not performed by this implementation session. Final post-check edits only clarified prose/comment wording and recorded this evidence.

### Task JFC-06: Independently Review Integration and Every Acceptance Criterion

Status: completed

Review session: fresh independent JFC-06 reviewer; no previous implementation role and no subagents, per scoped user instruction. Entire task file read; JFC-01..05 are completed. Initial worktree status captured, including existing unrelated access-router, express-runtime, message-service, pdf-reader and other edits; initial root `CHANGELOG.md` diff is empty.

Kind: improvement

Priority: P2 — ensure fixes compose and completion claims match evidence.

Suggested agent: independent integration reviewer (fresh session, not an implementer)

Dependencies: JFC-01, JFC-02, JFC-03, JFC-04, JFC-05

Primary ownership: this task file's final review/evidence; read package source, tests, generated declarations/pack, README and website. Correct narrowly scoped findings only with explicit task requirement updates and re-verification.

Finding: prior suites missed a schema field-order interaction and inferred API mismatches; a passing unit suite alone cannot establish the entire contract.

References: all task findings/evidence above; `packages/json-frame/package.json`, packed consumer tests, `AGENTS.md`.

Requirements:

1. Independently audit each acceptance criterion and completion record. Reproduce schema collision and inferred typing through public entrypoints; review budget alternate paths, datetime boundaries, and empty-frame contracts.
2. Run V2/V3 and V5 serially. V2 includes packed artifact and strict declaration consumers; inspect shipped surface for accidental internal exports/runtime deps. Record integration results separately from historical runs.
3. Check runtime, emitted types, README/website/release notes agree; preserve encapsulation and shallow ownership. Verify root CHANGELOG has no diff from this work and unrelated changes remain intact.
4. Record any residual limitations and exact blockers. Do not mark all tasks complete while package acceptance is unverified or a required criterion fails.

Acceptance criteria:

- JFC-01..05 have verified completion evidence, and reviewer supplies an independent criterion-level verdict.
- V2/V3 pass, V5 is executed with exact results, and any unrelated repository failures are explicitly attributed with evidence rather than hidden or repaired out of scope.
- Entire task document has truthful final statuses and release evidence; no new unresolved json-frame defect required by this plan remains.

Verification: V2, V3, V5, source/declaration/artifact/doc review and bounded public-root probes.

Completion evidence (independent JFC-06 review, 2026-09-26):

- **Verdict: scoped acceptance PASS; repository integration NOT all-green.** JFC-01..06 are completed. No new json-frame defect necessary for this plan's acceptance was found, so no implementation requirement addition or runtime/type/test fix was needed. Coordinator sign-off is a subsequent handoff, not claimed by this reviewer.
- Changed in this session: **only this task document** in the workspace. The reviewer read the entire plan, package source (including every parser/exporter, schema partitioning, column storage, options, traversal and diagnostics), runtime/regression tests, declaration fixtures/configs, manifest/build configuration, emitted declarations, packed-consumer harness, shipped README and website. Historical pre-fix runs were reviewed as historical evidence, not represented as rerun here. The current additions reconcile the package totals: original 169 + 42 schema + 7 API + 48 budget + 63 calendar + 38 empty-shape cases = **367**.
- Environment: Linux, Node **v26.7.0**, pnpm **11.18.0**, Vitest **4.1.11**. All this review's V2/V3/V5 commands and continuations were issued serially; workspace tests retained `--workspace-concurrency=1`. Other sessions were observed running a root test and message-service tests in this same worktree; the continuation waited for those observed PIDs to exit. Further unrelated edits/runs occurred during the long review. These results describe the observed live worktree, not an isolated immutable repository snapshot; no claim that unrelated failures existed at review start or were caused by json-frame is made.

### Independent Criterion-Level Verdicts

Criteria below follow the bullet order in each task's Acceptance criteria.

| Criterion                                                | Verdict                                   | Independently checked evidence                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JFC-01.1 — field order regression                        | PASS                                      | `test/export/export.test.ts:665–753` covers all six permutations × seven paths; the original role partition occurs before collision in `DataFrame.ts:558–604`. Historical 21 failures identify precisely the three permutations with data before index. Current V2 passes all 42 cases.                                                                                            |
| JFC-01.2 — composed transforms/metadata                  | PASS                                      | Direct/select/second rename/reset/filter-empty/sort/composed assertions check exact schema, custom field/schema metadata, primary key, rows/index and untouched source; exporter templates agree with canonical collision order. Independent built CJS/ESM public-root reproduction below confirms original reported case.                                                         |
| JFC-01.3 — ordinary/prototype controls                   | PASS                                      | Existing `test/frame/DataFrame.test.ts` ordinary and `__proto__` rename/select/export cases, defensive access and storage controls pass in V2. Index identity remains private; no runtime constructor/state helper export.                                                                                                                                                         |
| JFC-02.1 — object-shaped values inference                | PASS                                      | Public-source and shipped `.mts`/`.cts`/Bundler/browser fixtures reject array methods for omitted/auto/explicit values, including readonly tuples. Additional independent compiler-host probes pass all six strict configurations below.                                                                                                                                           |
| JFC-02.2 — null-safe missing fields                      | PASS                                      | Sparse/heterogeneous/optional/entirely absent columns, precise dense/literal controls and shallow nested fields checked against parser null filling and emitted conditional types. Independent probes also check numeric literal keys and discriminant non-correlation.                                                                                                            |
| JFC-02.3 — runtime and explicit generics                 | PASS                                      | Seven API runtime additions and installed consumers confirm object rows and null filling. Explicit optional/domain generics remain assertions and compile. Broad dictionary/options fallback remains conservative.                                                                                                                                                                 |
| JFC-03.1 — deterministic budgets/all paths               | PASS                                      | 48 focused cases pass: root/scalars/containers, 13 invalid budgets, exact/one-over, parsed/raw, explicit/auto, all six string orients, metadata/index override, aliases, mutation, repeated calls and omission. Independent public-root counts agree with **3/3/3/3/8/15** for records/index/columns/values/split/source-index table.                                              |
| JFC-03.2 — existing validation/ownership                 | PASS                                      | Shared local counter charges before clone allocation/validation descent; no alias memoization. Existing cycles/depth/holes/prototype and shallow identity cases pass, including over-depth second alias paths. Every ingestion layout converges on `parseInput` cloning and every string orient on complete-payload validation; auto orient is genuinely unknown before detection. |
| JFC-03.3 — bounded expansion/benchmark                   | PASS                                      | Deterministic graph tests confirm 13 containers → 8,191 occurrences, budget 64 rejects occurrence 65, **62/61** edge reads for ingestion/mutation rejection and **8,190/16,380** for successful clone/string export. Existing benchmark ran in V2 and root test. No before/after budget overhead claim is made.                                                                    |
| JFC-04.1 — calendar and diagnostics                      | PASS                                      | 18 valid + 38 invalid + five orient diagnostic cases pass. Independent public CJS/ESM sweep of February 29 for **all 10,000 years** matches a separate `Date#setUTCFullYear(year, 1, 29)` rollover oracle: **2,425 accepted / 7,575 rejected per format**. Early/year-9999 controls and five trailing line-terminator rejection probes also pass.                                  |
| JFC-04.2 — packing/transforms/export                     | PASS                                      | Both threshold 0/1 cases verify numeric storage, unchanged datetime strings, null filtering, sort/select/rename/reset, six object/string exports/reparse and preserved logical/schema metadata; installed CJS/ESM controls pass. Ordinary inferred dates remain strings.                                                                                                           |
| JFC-04.3 — pandas claims                                 | PASS                                      | README, website and emitted datetime JSDoc distinguish Gregorian acceptance from dtype/resolution read-back. Reviewed historical JFB-07 lines 344–385; pinned pandas 3.0.3/CPython 3.14.6 evidence is explicitly historical. No fresh pandas experiment performed.                                                                                                                 |
| JFC-05.1 — empty dimensions/indexes                      | PASS                                      | 36 shape × provenance × orient cases plus two lost-column-option controls pass, checking exact parsed/string payloads, source indexes, gapped synthetic indexes and table metadata. Independent public CJS/ESM 18-combination matrices agree.                                                                                                                                      |
| JFC-05.2 — public documentation examples                 | PASS                                      | Shipped README examples compile in installed browser/Bundler consumer; manual website review confirms named root imports/options, explicit values columns and exact dimension matrix. Public probes reproduce the illustrative outputs.                                                                                                                                            |
| JFC-05.3 — release guidance/limits                       | PASS                                      | Release notes agree with JFC-01..04, complete-root depth, mutation validation, diagnostic previews and documented exclusions. Source table metadata construction/cloning precedes string-budget validation and is explicitly outside its resource guarantee.                                                                                                                       |
| JFC-06.1 — independent prior acceptance audit            | PASS                                      | All fifteen prior acceptance bullets have current evidence above; prior completion totals, claimed coverage and implementation boundaries were reconciled.                                                                                                                                                                                                                         |
| JFC-06.2 — package and repository checks                 | PASS for required execution/scoped checks | V2/V3 pass; exact V5 commands executed. Root test failure, all remaining script attempts, timeout interruption/resumption and unrelated failures are recorded below. This is not a repository all-green verdict.                                                                                                                                                                   |
| JFC-06.3 — truthful statuses/no unresolved scoped defect | PASS                                      | All six task statuses completed; release integration note updated; no acceptance-required json-frame defect remains. Final `git diff --check` passed and `git diff -- CHANGELOG.md` was empty.                                                                                                                                                                                     |

### Fresh Verification and Public/Artifact Evidence

1. `pnpm --filter @web-ts-toolkit/json-frame test` — **exit 0**, **9/9 files, 367/367 tests**, Vitest start **19:18:00**, duration **25.13s**. CJS/ESM/DTS build, source typecheck, strict NodeNext/Bundler/browser checks, runtime, benchmark and all three packed-consumer tests passed.
2. `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — **exit 0**, no diagnostics.
3. `pnpm lint` — **exit 0**, no diagnostics.
4. `pnpm build` — **exit 0**, scope **25 of 26 workspace projects**, including package and example app builds. Output retained at `<tool-output>/tool_0e0ac17170012ze7PbvcyxLyR7`. Non-failing output included starter dependency/peer notices, the Vite future-native-loader warning and react-vite's >500 kB chunk notice.
5. `pnpm test` — **exit 1**, scope **25 of 26**, serialized root script. First failure was mongoose-rxdb; json-frame passed again (**367/367**, **9/9**, start **19:31:22**, duration **21.95s**). Per-package results below preserve this run separately from later continuations.

Public-root runtime probe used `pnpm --filter @web-ts-toolkit/json-frame exec node --input-type=module -e '<assertion script>'`, importing `fromOrient` from the package name for ESM and using `createRequire(import.meta.url)` for CJS. Both printed:

```json
{
  "schema": {
    "fields": [
      { "name": "row_id", "type": "string" },
      { "name": "pk", "type": "integer" }
    ],
    "primaryKey": ["row_id"]
  },
  "data": [{ "row_id": "r0", "pk": 42 }]
}
```

The input and transformation are the reproducible JFC-01 script above. Independent assertions additionally counted output nodes recursively (root plus `Object.values` descendants), checked exact/one-less budgets for six exports and raw/parsed re-ingestion, object-shaped values, sparse nulls, all-year leap validity, boundary years, and the three empty shapes across six orients. Both formats reported **PASS** and exactly the nine intended runtime exports. The independent strict compiler probe (`node <repo-root>/_tmp/jfc06-types.cjs`, virtual public-root consumer; no workspace fixture written) checked **six exact cell types + four negative assertions** and explicit/dictionary workflows in NodeNext ESM/CJS and Bundler browser with `noUncheckedIndexedAccess`, each with `exactOptionalPropertyTypes` false/true: **six configurations, zero diagnostics**, exit 0. Initial probe expectations incorrectly assumed widened `number` for three inline-literal cases, producing three diagnostics per configuration; checker inspection showed safe retained literal `1`, and correcting only those scratch expectations made them pass. No package correction was involved.

Artifact audit: the actual release-manifest transformation is used before `pnpm pack`, `npm pack --dry-run --json`, installation, runtime and strict declaration consumers. The seven-file allowlist is **LICENSE, README.md, index.js, index.mjs, index.d.ts, index.d.mts, package.json**; release metadata resolves placeholders and rewrites `dist` entry paths. No runtime/peer/dev dependencies, scripts, maps or internal subpaths leak into this artifact. Root runtime exports are only the factory, depth constant and seven error classes; `DataFrame` is a public type, not a constructor. Inspected emitted declaration overloads/options/JSDoc and the export list; the bundle is self-contained (`bundle: true`, `splitting: false`) and has no Node builtin runtime imports. This is package-artifact evidence, not a claim that the whole asdf release artifact was assembled.

### Full Workspace Results and Coordinator Handoff

The root runner bailed after mongoose-rxdb. To reach every remaining workspace test script, the reviewer waited for the two observed external runs to exit, then invoked:

```sh
pnpm -r --if-present --workspace-concurrency=1 --no-bail --filter '!@web-ts-toolkit/asset-inliner' --filter '!@web-ts-toolkit/create-access-router-mongo-starter' --filter '!@web-ts-toolkit/express-oidc-vault' --filter '!@web-ts-toolkit/express-runtime' --filter '!@web-ts-toolkit/json-frame' --filter '!@web-ts-toolkit/mongoose-rxdb' test
```

The starter is actually unscoped, so that exclusion did not match: it ran a second time and passed **335 tests / 18 files**. This continuation selected **20 projects** and hit the shell's **3,600,000 ms** limit (including the initial wait), terminating an access-router-runtime dependency build with SIGTERM; this is a harness interruption, not a tested package assertion failure. Output: `<tool-output>/tool_0e0e3ca6a001hU8FjKu1mJG9hf`. All unfinished scripts were then resumed serially:

```sh
pnpm -r --if-present --workspace-concurrency=1 --no-bail --filter @web-ts-toolkit/access-router-runtime --filter @web-ts-toolkit/access-router-react --filter './apps/*' test
```

Resume result: **exit 1**, summary **1 fails / 2 passes** (other selected apps have no test script). Access-router-runtime rebuilt successfully and passed; access-router-react failed its nonruntime packed test; react-vite passed. Output: `<tool-output>/tool_0e0fb4bef001th094DyUejIb1I`.

| Package/app                        | Tests passed / failed / todo | Files passed / failed | Run / result                                                                                         |
| ---------------------------------- | ---------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| asset-inliner                      | 566 / 0 / 1                  | 32 / 0                | Root PASS                                                                                            |
| create-access-router-mongo-starter | 335 / 0 / 0                  | 18 / 0                | Root PASS; repeated continuation also PASS                                                           |
| express-oidc-vault                 | 260 / 0 / 0                  | 19 / 0                | Root PASS                                                                                            |
| express-runtime                    | 341 / 0 / 0                  | 11 / 0                | Root PASS; intentional invalid-TypeScript fixture diagnostic is not a failure                        |
| json-frame                         | 367 / 0 / 0                  | 9 / 0                 | Root PASS, including all declaration/artifact checks                                                 |
| mongoose-rxdb                      | 351 / 17 / 0                 | 36 / 1                | Root FAIL, selector-recheck assertions                                                               |
| express-oidc-vault-memory-store    | 36 / 1 / 0                   | 1 / 1                 | Continuation FAIL, packed manifest test timeout 5,000 ms                                             |
| express-oidc-vault-mongodb-store   | 43 / 1 / 0                   | 2 / 1                 | Continuation FAIL, packed metadata/allowlist test timeout 5,000 ms                                   |
| express-oidc-vault-redis-store     | 89 / 1 / 0                   | 7 / 1                 | Continuation FAIL, packed manifest test timeout 5,000 ms                                             |
| pdf-reader                         | 192 / 1 / 0                  | 3 / 1                 | Continuation FAIL, strict declaration consumer timeout 15,000 ms; chained browser stage not reached  |
| utils                              | 120 / 0 / 0                  | 17 / 0                | Continuation PASS                                                                                    |
| http-errors                        | 71 / 1 / 0                   | 1 / 1                 | Continuation FAIL, production-transformed manifest/allowlist test timeout 5,000 ms                   |
| moo                                | 153 / 0 / 0                  | 15 / 0                | Continuation PASS                                                                                    |
| express-response-handler           | 215 / 0 / 0                  | 8 / 0                 | Continuation PASS                                                                                    |
| express-json-router                | 43 / 1 / 0                   | 1 / 1                 | Continuation FAIL, installed ESM/CJS/NodeNext/Bundler consumer timeout 60,000 ms                     |
| access-router                      | 812 / 0 / 0                  | 59 / 0                | Continuation PASS                                                                                    |
| message-service                    | 332 / 4 / 0                  | 20 / 3                | Continuation FAIL, three 5,000 ms timeouts and one declaration fixture failure                       |
| access-router-client               | 516 / 1 / 0                  | 32 / 1                | Continuation FAIL, packed manifest timeout 5,000 ms; chained browser stage not reached               |
| access-router-deco                 | Not reached                  | Not reached           | Continuation FAIL before Vitest: typecheck exit 2, eight TS2307/TS2882 module-resolution diagnostics |
| access-router-runtime              | 135 / 0 / 0                  | 12 / 0                | Resume PASS                                                                                          |
| access-router-react                | 263 + 263 + 17 / 1 / 0       | 20 + 20 + 2 / 1       | Resume: React 19/18 runtime lanes PASS; nonruntime packed manifest timeout 5,000 ms                  |
| apps/react-vite                    | 3 / 0 / 0                    | 2 / 0                 | Resume PASS                                                                                          |

Attribution and exact failure evidence for coordinator follow-up:

- **mongoose-rxdb:** `test/selector-recheck.test.ts`, RMRX-02 native selector parity, **17 failures / 351 passes** (start 19:31:54, duration 112.40s). Eleven memory predicate cases failed (array eq/ne/in/nin; null eq/ne/in/nin; dotted-array traversal/nin; and/or/nor), three deletion cases failed, two conflict-retry cases called the updater twice instead of once, and SQLite parity failed. Examples: array equality returned `[]` instead of `['a','b']`; deletes returned zero/null instead of the matching record. The test imports its own query compiler/Rx adapter/storage; it does not use json-frame. Related coordinator plan: `20260926-185018-mongoose-rxdb-business-integrity-review.md`. The file and implementation evolved concurrently after this observed failure; no later run by another session is substituted for this result.
- **Consumer timeouts:** exact files/test names and stacks are in the continuation logs, notably memory/mongodb/redis `test/packed-consumer.test.ts`, pdf `test/decl-consumer.test.ts`, http-errors `test/strict-consumer-types.test.ts`, express-json-router `test/packed-consumer-compatibility.test.ts:702`, client `test/access-router-client.packed-consumer.test.ts:70`, react `test/access-router-react.packed-consumer.test.ts:72`. These are failures of those packages' declared time limits. Load sensitivity is possible but not proven; they are not silently dismissed as flakes or repaired here.
- **message-service:** `test/message-service.action-target-authz.test.ts:78` stale-recipient denial and `test/message-service.readme-contract.test.ts:33,70` both README cases timed out at 5,000 ms. The strict packed consumer failed with **four TS2300 diagnostics**: duplicate `InterpolatedAction` at generated `consumer.bundler.ts:62,241` and `UiTemplate` at `85,241`. Stack: `test/support/packed-consumer-harness.ts:80` → `test/message-service.packed-consumer.test.ts:1146`. Related coordinator plan: `20260926-185326-message-service-residual-workflow-health.md`.
- **access-router-deco:** `tsc --noEmit -p tsconfig.typecheck.json` failed resolving `express-serve-static-core` and `@web-ts-toolkit/http-errors` from express-response-handler's emitted `create-handler.d.mts`, `http-response.d.mts`, `index.d.mts`, and `public-types.d.mts`; **eight diagnostics**, exit 2. Runtime tests did not execute. This is distinct from the subsequent harness SIGTERM, whose dependency rebuild passed on resume.
- No other package manifest references json-frame (package-manifest search confirms); its runtime has no workspace dependencies. These failures are outside the reviewed contracts and are handed to the coordinator/package owners. **All workspace test scripts were attempted to a natural result after resuming the interrupted ones**; stages gated behind a package's own failed `&&` remain explicitly unverified. No repository-wide pass is claimed.

Residual risks and final preservation check:

- `maxNodes` is opt-in and traversal-local. Native parse/string bytes, key enumeration and diagnostic allocation, densification, export/schema construction (including metadata cloning before budget validation), hooks/getters/Proxies and total memory are outside it. Serialization performs validation then native stringification; alias expansion and caller changes between passes remain as documented. Object exporters have no budget. These are accepted explicit design limits, not unresolved acceptance defects.
- Inferred shapes depend on TypeScript's visible input model; broad input remains `JsonRow` and explicit domain generics are assertions. Nested cells stay shallow/mutable. Object-key enumeration/stringification and negative-zero text loss remain native JSON limits. Empty shapes/index provenance and pandas read-back limits are documented, not hidden by the fixes.
- No fresh pandas experiment, cross-version TypeScript/Node matrix, browser runtime matrix, or timing-overhead comparison was performed. Installed strict browser declarations and package runtime/artifact checks did pass.
- Final `git diff --check` — **exit 0**. Final `git diff -- CHANGELOG.md` — **empty**, root CHANGELOG untouched by this review. Existing unrelated changes were not edited/reverted; later concurrent worktree additions were left intact. No generated `dist` was hand-edited. Only this document was changed by JFC-06 in the workspace; the independent compiler probe is scratch material under `<repo-root>/_tmp`.

## Release / Contract Notes

Recorded by JFC-05 and independently verified by completed JFC-06. Root `CHANGELOG.md` is excluded by user instruction.

- **Schema-role correction (JFC-01):** colliding data-column renames preserve original index/data types and custom metadata regardless of source Table Schema field order, including composed transforms. Table export still requires unique emitted names; use `indexField` when a data name collides with the retained index name.
- **Sounder inferred rows (JFC-02):** auto/omitted values arrays, including readonly tuples, infer object-shaped `JsonRow`. Parsed records retain precise required fields; sparse/heterogeneous/optional fields include normalization `null` and remain optional when a column may be entirely absent. Union variants are flattened rather than promising discriminant-based cell presence; broad inputs/options fall back conservatively. Code relying on incorrect array rows or undefined-only missing-cell guards may need adjustment. Explicit domain generics remain caller assertions, not runtime schema validation.
- **Opt-in traversal control (JFC-03):** ingestion and all six string exporters accept positive-safe-integer `maxNodes`. Each root/scalar/container occurrence counts, including repeated aliases; exact budgets succeed and excess produces path-bearing `JsonFrameValidationError` with known orient. Invalid budgets produce `JsonFrameOptionError`. Counts reset per call, ingestion budgets are not inherited, and omission remains unlimited. Table `indexField` combines with the serialization budget. Detached ingestion aliases and shallow exported cells retain existing semantics.
- **Calendar-valid datetime range (JFC-04):** explicit non-table datetime accepts Gregorian-valid four-digit years 0000–9999, correcting rejection of early years. Existing naive ISO/time/fraction grammar, no-coercion behavior, and timezone/numeric-epoch rejection remain. Calendar acceptance is not universal pandas read-back support; historical JFB-07 pandas 3.0.3 / CPython 3.14.6 evidence distinguishes microsecond early-year emission from nanosecond table read-back limits. No new pandas experiment is claimed.
- **Empty-report fidelity guidance (JFC-05):** README/website now give all-six matrices for `0 × C`, `R × 0`, and `0 × 0`, backed by parsed/string round trips with source and gapped synthetic indexes. Standard outputs are preserved: records/index lose columns with zero rows; columns loses rows/index with zero columns; values needs separately supplied columns; split/table carry dimensions. Split promotes emitted index labels to source provenance; table regenerates synthetic indexes, losing filtered gaps. Only table carries logical/schema metadata. Existing uniqueness/collision restrictions apply.
- **Earlier serialization/diagnostic contracts synchronized:** the website now documents complete-output-root depth (1000), mutation-introduced JSON/cycle/depth failures before stringification, per-occurrence alias traversal, and caller hook/getter/Proxy responsibility. Diagnostic object previews retain at most 5 keys / 200 key-text characters with complete counts and accurate truncation; scalar/context fields may remain input-sized and key counting allocates all keys. These are prior behavior contracts, not new JFC-05 runtime changes.
- **Residual limits:** `maxNodes` bounds traversal expansion, not bytes/native parsing, key or diagnostic allocation, rectangular densification, export/schema construction, native stringification/hooks, or total memory. Object exporters have no budget option. Object-key layouts retain JavaScript enumeration/stringification limits; nested cells remain shallow and mutable. Named-only CJS/ESM/declaration exports, zero runtime dependencies, and the existing unsupported-feature scope remain. JFC-06 independently passed scoped acceptance and executed repository integration: root lint/build passed, while root tests and serial continuations recorded unrelated failures above. Historical integration failures are not rewritten by these notes.

## Definition of Done

Every task above is completed with changed-file and actual verification evidence, final independent review is recorded, package checks pass, full-repository results and residual limitations are explicit, and coordinator confirms the final document is consistent. Saving this plan alone does not complete implementation.

## Coordinator Final Sign-Off

Follow-up lifecycle: `docs/tasks/20260926-211200-json-frame-property-key-contracts.md` records newly discovered prototype-sensitive override/inference and mixed numeric/string key cases from the user's subsequent review request. The checks and completion evidence below remain historical results for this plan.

- Confirmed all six task entries have `Status: completed` and concrete Completion evidence. Each implementation task and the independent review ran in a separate fresh agent session, sequentially.
- Reviewed final source diffs for schema identity, inferred rows, shared budget accounting/options, serialization dispatch, and calendar validation; checked package/typecheck configuration changes and scoped tracked/untracked files against task ownership.
- Accepted the independent criterion-level audit and current 367/367 package result. Root lint/build passed; repository tests are explicitly **not all-green**: 29 failed tests across the recorded package runs and one pre-test access-router-deco typecheck failure. These out-of-scope results and concurrent-worktree limitations remain visible above, with no claim they were fixed by this work.
- Coordinator `git diff --check` passed. Scoped status/diff confirmed root `CHANGELOG.md` has no changes. No further implementation changes followed independent verification; this final addition records evidence review only.
- Final outcome: all selected json-frame tasks delivered; no unresolved decision blocks this plan. Opt-in budget exclusions, pandas range limitations, shallow cell ownership, and format-specific empty-dimension loss remain documented contract boundaries.
