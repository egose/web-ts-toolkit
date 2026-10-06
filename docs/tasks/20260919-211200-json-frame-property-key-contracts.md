# JSON Frame Property-Key Contract Follow-Up

Created: 2026-09-19 21:12:00 (local timestamp)

## Objective and Product Context

Continue the json-frame review requested after the completed business-contract plan. The package bridges pandas JSON and TypeScript reporting/analysis applications. Arbitrary string column names are valid business data: names matching JavaScript Object members and numeric-looking labels must retain the same values, metadata, and useful row typing as ordinary columns.

Scope: `packages/json-frame` runtime override normalization and inferred records API, focused regression/declaration tests, shipped README and corresponding website guidance when contracts need clarification. No root `CHANGELOG.md` edits. Record release evidence in this document. Preserve all existing and concurrent unrelated worktree changes and previous json-frame work.

Related completed plan: `docs/tasks/20260926-184842-json-frame-business-contract-review.md`. Earlier health/initial/boundary plans linked there were checked for overlap. This follow-up addresses new counterexamples, not a claim that previously recorded checks were never run. JFP-02 extends JFC-02 with Object-member and mixed numeric/string spelling cases absent from its regression matrix.

Non-goals: new query/aggregation engine, row/column accessor features, full Table Schema validation, deep immutability, new runtime dependencies, changes to known orient dimensional loss, or reopening documented `maxNodes` exclusions as vulnerabilities. Slice/iterator/column-access additions remain optional future product work without enough evidence to justify API growth here.

## Review Coverage and Evidence

- Read-only isolated reviewer examined runtime column/schema/export behavior and public inference after JFC completion, checked historical plans/tests, and reproduced the three findings below through public CJS/ESM entrypoints and strict source/emitted declaration probes. Coordinator inspected the implicated type helpers, option normalization, state builder, and existing declaration fixture.
- Runtime probes used existing built outputs; TypeScript probes used 6.0.3, strict NodeNext ESM/CJS and Bundler. No new baseline package/full-repository suite was run during planning. Implementation verification is required below.
- A bounded pandas 3.0.3 categorical read-back probe passed; no categorical defect was promoted to a task. No general pandas compatibility, fuzzing, hostile getter/Proxy sandboxing, or every-version TS/runtime claim is made.
- The preceding independent review passed 367 json-frame tests and root lint/build, but full-workspace checks recorded failures outside json-frame plus concurrent worktree activity. Preserve that historical record. This narrow zero-dependency follow-up requires fresh package, artifact, declaration, and focused lint checks; another hour-long unrelated full-workspace test continuation is not required. Broaden checks if a change reaches shared infrastructure or creates an integration concern.

## Priorities, Sequencing, and Verification

P1 = corrupted supported runtime data/metadata; P2 = incorrect inferred public contract. User requests a **fresh isolated sub-agent for each task, sequentially**. Initial sequence was JFP-01 → JFP-02 → JFP-03. The review discovered JFP-04; continue with a fresh JFP-04 implementation session, then a fresh independent JFP-03 closure session. No overlapping builds or agents. JFP-03 reviewers must not implement the fixes they review.

Each agent reads this document, sets only its task `in_progress`, implements within ownership, and records `Status: completed` with **Completion evidence** only after required checks and acceptance pass. Preserve historical findings; append evidence. New acceptance-required work must be recorded in requirements before implementation; independent findings need a concrete follow-up task rather than an untracked fix.

Commands run from repository root, using installed supported Node/pnpm:

- V1 focused: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts <test-path>` (test paths relative to package).
- V2 package: `pnpm --filter @web-ts-toolkit/json-frame test` — builds package and runs source/NodeNext/Bundler/browser declaration checks, runtime tests, benchmark and packed consumers.
- V3 lint: `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"`.
- V4 final diff: `git diff --check`; confirm `git diff -- CHANGELOG.md` is empty. Do not hand-edit generated `dist/`.
- Strict source fixture command when demonstrating type failures: `pnpm --filter @web-ts-toolkit/json-frame typecheck:source`. The existing reusable inference fixture is also exercised against installed CJS/ESM/Bundler declarations by V2.

## Current Final Task Status

**JFP-01, JFP-02, JFP-03 and JFP-04: completed.** Fresh independent JFP-03 closure passed all scoped acceptance, including the JFP-04 pattern-index correction. The initial blocked review below is historical evidence, superseded by the closure Completion evidence. No acceptance blocker remains. Coordinator final sign-off is a separate subsequent confirmation and is not claimed by this reviewer.

## Tasks

### Task JFP-01: Restrict Logical-Type Overrides to Own Properties

Status: completed

Implementation session: fresh isolated JFP-01 session; no subagents, per scoped user instruction. Entire shared context/task and prior JFC completion evidence reviewed.

Kind: defect

Priority: P1 — valid column names receive non-ColumnType metadata and table export fails.

Suggested agent: runtime dictionary-boundary specialist (fresh session)

Dependencies: none

Primary ownership: `packages/json-frame/src/options.ts`, `src/frame/column.ts`, focused column/options/runtime/packed tests, README/website override guidance if needed.

Finding: `normalizeFromOrientOptions` rebuilds `columnTypes` with `Object.fromEntries`, which creates an ordinary-prototype dictionary. `buildFrameState` reads `options.columnTypes?.[column]` without checking ownership. For `fromOrient([{constructor:1,n:2}], {columnTypes:{n:'integer'},packThreshold:1})`, `columnInfo.get('constructor').type` is the inherited Object constructor function; `toTable()` rejects unsupported type. Empty overrides also reproduce, as do `toString`, `hasOwnProperty`, and computed `__proto__` columns. Omitting `columnTypes` works. Existing tests do not combine these labels with empty/partial overrides.

References (under `packages/json-frame`): `src/options.ts` normalization around lines 159–174; `src/frame/column.ts` (`buildFrameState`, `isColumnValueCompatible`, `validateExplicitColumnTypes`); `src/export/payload.ts` (`mapColumnTypeToSchemaField`).

Requirements:

1. Only explicit own normalized keys can be overrides. Use a null-prototype normalized dictionary and an own-property lookup at the state boundary as appropriate; avoid banning valid labels or changing ordinary overrides.
2. Read the same own override for type resolution and explicit-cell validation. Unexpected inherited values must not become logical metadata or packing hints. Keep table metadata precedence and normal validation contracts.
3. Test normalized caller dictionary and internal state entry boundaries where applicable, without exposing internals publicly. Preserve caller objects/prototypes and never write Object.prototype.
4. Document own-key override semantics and record release notes here; root CHANGELOG stays untouched.

Acceptance criteria:

- Regression fails before fix and passes for prototype-sensitive labels with omitted/empty/unrelated/explicit overrides and ordinary/null-prototype option dictionaries.
- Threshold 0/1 controls produce valid string ColumnInfo types and equal values; explicit mismatched own overrides still fail with structured diagnostics.
- Transform chains, empty filters and table/string exports preserve valid metadata; table source metadata retains precedence. No caller/prototype mutation occurs.

Verification: V1 column/options plus other changed runtime tests, V2, V3; public-root reproduction of corrected case.

Completion evidence:

- Changed **9 files** in this session: `packages/json-frame/src/options.ts`, `packages/json-frame/src/frame/column.ts`, `packages/json-frame/src/types.ts` (option JSDoc only), `packages/json-frame/test/frame/column.test.ts`, `packages/json-frame/test/options-and-errors.test.ts`, `packages/json-frame/test/packed-consumer.test.ts`, `packages/json-frame/README.md`, `website/docs/packages/json-frame.md`, and this task document. Existing JFC changes in shared files were preserved; no public helper/export or dependency was added.
- Implementation: normalization validates and copies own enumerable string entries into a frozen null-prototype dictionary. The common state builder checks ownership before reading an override and reuses that single value for type resolution and explicit-cell validation. Source Table Schema types retain precedence. Unknown own column names and incompatible own types retain their existing errors; inherited values never become metadata, validation requirements, or packing hints. Neither caller dictionaries nor Object.prototype are modified.
- Added **51 focused cases**: **40** public-source cases (five labels × ordinary/null-prototype dictionaries/options × omitted/empty/unrelated/explicit overrides), **5** own-mismatch/table-precedence cases, **2** internal parsed/data entrypoint cases, and **4** normalization/invalid-own-type cases. Labels are `constructor`, `toString`, `hasOwnProperty`, computed `__proto__`, and `valueOf`. Runtime cases exercise thresholds **0/1**, exact values and logical/schema types, Int32/Float64/unpacked storage, sorting/filtering/select/rename/reset chains, empty filters, table/string exports and reparsing. Tests check input/source/prototype preservation, frozen detached option snapshots, ignored custom inherited entries/getters and non-enumerable keys, and structured own-cell diagnostics. Installed CJS and ESM scripts each add **50** prototype-key ingestion combinations plus transformed-empty exports.
- **Pre-fix regression:** `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/frame/column.test.ts test/options-and-errors.test.ts` — **exit 1, 25 failed / 128 passed, 2 files**. Twenty public empty/partial cases and both internal entrypoints exposed inherited metadata; three normalization cases exposed the ordinary-prototype snapshot. Omitted/explicit overrides, table precedence and all previous focused tests passed as controls.
- Required checks ran **serially**, each final command exiting 0:
  - **V1:** `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/frame/column.test.ts test/options-and-errors.test.ts` — **153/153 tests, 2/2 files passed**.
  - **V2:** `pnpm --filter @web-ts-toolkit/json-frame test` — **418/418 tests, 9/9 files passed** (previous 367 + new 51); CJS/ESM/declaration build, strict source/NodeNext/Bundler/browser checks, runtime, benchmark, release-transformed packed/installed consumers and shipped README examples passed. The changed packed runtime assertions ran against the fresh build here.
  - **V3:** `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — **passed**, no diagnostics.
- **Acceptance verdicts:** (1) PASS — failing-before/passing-after prototype-label matrix plus own/omitted controls; (2) PASS — both packing thresholds preserve values/string logical metadata and mismatches retain orient/path/row/column/value errors; (3) PASS — composed/empty transforms, exports, table metadata precedence/custom field metadata and caller/prototype preservation verified. Normalization and both existing internal state entrypoints are covered without public exposure.
- **Public-root reproduction:** `pnpm --filter @web-ts-toolkit/json-frame exec node --input-type=module -e '<script below>'` — **exit 0, ESM and CJS PASS**, both printed `{"schema":{"fields":[{"name":"constructor","type":"integer"},{"name":"n","type":"integer"}]},"data":[{"constructor":1,"n":2}]}`. Script (formatted for readability):

  ```js
  import assert from 'node:assert/strict';
  import { createRequire } from 'node:module';
  import { fromOrient } from '@web-ts-toolkit/json-frame';
  const require = createRequire(import.meta.url);
  for (const [format, factory] of [
    ['ESM', fromOrient],
    ['CJS', require('@web-ts-toolkit/json-frame').fromOrient],
  ]) {
    const frame = factory([{ constructor: 1, n: 2 }], { columnTypes: { n: 'integer' }, packThreshold: 1 });
    assert.deepEqual(frame.columnInfo.get('constructor'), { type: 'integer', nullable: false });
    assert.equal(frame.row(0).constructor, 1);
    const table = frame.toTable();
    assert.deepEqual(JSON.parse(JSON.stringify(table.schema.fields)), [
      { name: 'constructor', type: 'integer' },
      { name: 'n', type: 'integer' },
    ]);
    assert.deepEqual(JSON.parse(frame.toJSONString('table')), JSON.parse(JSON.stringify(table)));
    console.log(format + ' public-root PASS: ' + JSON.stringify(table));
  }
  ```

- Probe note: the first scratch assertion compared null-prototype exported schema fields directly against ordinary object literals with Node strict equality and failed on prototypes after the corrected metadata/value checks passed. The final probe above compares JSON payloads, respecting the existing prototype-safe export contract; no package change was required.
- Documentation/artifact review: README, website and emitted `dist/index.d.ts` / `dist/index.d.mts` document own enumerable string keys and valid prototype names. README/website explain computed `__proto__` syntax and Table Schema precedence. Packed tests preserve the existing named-only public surface and zero runtime dependencies. `git diff --check` passed; `git diff -- CHANGELOG.md` was empty. Generated output was built, never hand-edited.
- Concerns/scope: no JFP-01 acceptance blocker remains. V1/V2 emitted the existing non-failing Vite future-native-loader warning. Verification is package-scoped; historical unrelated full-workspace failures above are not rerun or reclassified. JFP-02's known inference defects and JFP-03's independent review remain **pending**, with no implementation performed for either task. Unrelated concurrent worktree changes were preserved.

### Task JFP-02: Normalize Declared Record Keys Before Inferring Cells

Status: completed

Implementation session: fresh isolated JFP-02 session; no subagents, per scoped user instruction. Full shared context/task and preceding JFP-01/JFC completion evidence reviewed; JFP-01 dependency completed.

Kind: defect

Priority: P2 — inferred types admit null crashes or erase valid columns.

Suggested agent: TypeScript key-normalization specialist (fresh session)

Dependencies: JFP-01 (sequential execution/shared documentation)

Primary ownership: `packages/json-frame/src/api.ts`, `test-decl-consumer/inference-contract.mts`, `test/api.test.ts`, installed-consumer harness only if necessary, inferred-row README/JSDoc/website guidance.

Findings (same inference normalization boundary):

1. `RequiredRecordKeys` uses `[T] extends [Record<K, unknown>]`; TypeScript inherited Object members let `{}` satisfy some property checks despite lacking declared keys. `fromOrient([{toString:'ok'},{}] as const).row(1).toString.toUpperCase()` compiles while runtime cell is null and throws. `constructor` and `valueOf` also reproduce.
2. `RecordKeys`/`RecordCell` handle numeric literal `1` and string `'1'` separately. `fromOrient([{1:1},{'1':'x'}] as const)` infers `DataFrame<{}>` although runtime columns is `['1']`. With common `id`, only the numeric-named column disappears. This is distinct from documented integer-key enumeration order.

References: `src/api.ts` (`RecordKeys`, `RequiredRecordKeys`, `RecordCell`, `NormalizedRecord`); `src/parse/parse.ts` (`parseRecords` own-key/null-fill behavior); existing inference-contract fixture lacks these combinations.

Requirements:

1. Decide requiredness distributively by declared keys and optionality per variant, rather than Object-member structural assignability. Missing/optional prototype-named fields must include normalization null and possible absence; fields supplied in every variant retain precision.
2. Canonicalize numeric literal keys to their runtime string spelling before requiredness/cell union calculations. Merge equivalent spellings, preserve dense/sparse access and both numeric/string indexing. Keep broad numeric/string index signatures conservatively JsonRow; do not accidentally promise an infinite present dictionary.
3. Preserve explicit domain-generic assertions, values-array inference, homogeneous precision, flattened union/non-correlated semantics, and shallow normalization.
4. Extend reusable strict source/installed fixtures with positive exact-type checks and negative unsafe-use checks. Runtime companions establish actual cells/columns for all newly represented cases.
5. Keep private type helpers readable and document why key normalization/declared-key checks are necessary. Public JSDoc/README/website must state resulting semantics without implying runtime application schema validation.

Acceptance criteria:

- Readonly and mutable sparse `toString`/`constructor`/`valueOf` records require null-safe guards in row/filter/sort across omitted/auto/records inference; dense controls retain correct scalar/literal types.
- Numeric-only, string-only, mixed-spelling, sparse, optional-declared and common-other-field cases retain canonical columns with correct value unions. Dense example `'1'` is `1 | 'x'`, accessible via `[1]` and `['1']`.
- New declaration regressions fail before fix; V2 proves source and shipped CJS/ESM/Bundler/browser consumers agree and prior JFC-02 controls remain valid. Runtime tests confirm values/prototype-safe rows are unchanged.

Verification: strict source fixture before/after, V1 API, V2, V3, bounded public inference/runtime reproduction.

Completion evidence:

- Changed **7 files** in this session: `packages/json-frame/src/api.ts`, `packages/json-frame/test-decl-consumer/inference-contract.mts`, `packages/json-frame/test/api.test.ts`, `packages/json-frame/test/packed-consumer.test.ts`, `packages/json-frame/README.md`, `website/docs/packages/json-frame.md`, and this task document. Prior JFC/JFP-01 edits in shared files and unrelated worktree changes were preserved. API runtime companions now import the public source entry; installed runtime scripts retain public package-root CJS/ESM imports.
- Contract choices: distributively map each finite record variant's string/number keys to runtime string spellings before cell/requiredness aggregation. For every canonical key, require declared `keyof` membership and non-optional `Pick<T, K>` in **every** variant; inherited Object members cannot prove presence. Comparing the declared property with its `Required` form also preserves required object-valued Object-member columns. Potentially missing columns remain optional with normalization `null`. Broad string/number index signatures are checked **before** canonicalization and retain `JsonRow`; explicit domain assertions, values-array inference, dense scalar/literal precision, flattened non-correlated unions and shallow nested types retain their contracts. Helpers remain private; no runtime parser, public export or dependency was added.
- Declaration evidence: extended the reusable public-root fixture with **20 exact field-shape/optionality assertions** and **22 new negative assertions** (**31 total**, retaining JFC-02's nine). Readonly and mutable sparse `toString`/`constructor`/`valueOf` cases check row/filter/sort in omitted/auto/records modes; dense literal, widened and object-cell controls retain precision. Numeric-only/string-only/mixed/reversed/sparse/optional/absent/common-field cases check canonical keys and numeric/string access, including negative/fractional labels and distinct `'01'`. Broad string/number union dictionaries, explicit-domain, values and shallow/flattened controls pass. The existing harness copies this fixture into installed `.mts`, `.cts` and Bundler/browser `.ts` consumers without source aliases.
- **Pre-fix:** `pnpm --filter @web-ts-toolkit/json-frame typecheck:source` — **exit 2, 34 diagnostics** at the regression checkpoint: **19 unused negative assertions**, **8 exact-shape failures**, **7 missing numeric-key indexing errors**. The readonly/mutable Object-member unsafe calls compiled, while mixed numeric/string columns disappeared. Dense/optional/broad-input controls passed. An earlier fixture-drafting run also exposed readonly-snapshot comparison and native Object-member input-assignability mistakes; those fixture issues were corrected before this definitive pre-fix command. After the helper fix and final control additions, the same command passed with zero diagnostics.
- Added **57 runtime API cases**: **18** sparse/dense Object-member controls (three keys × mutable/frozen input × three orients), **3** optional Object-member/object-cell cases, **33** numeric-label cases (11 layouts × three orients, each with mutable and frozen inputs), and **3** shallow/flattened/dictionary/explicit-domain controls. These establish exact columns/cells, actual null crashes for deliberately unsafe calls, null-safe filtering/sorting, absent columns, prototype-safe own rows, records string exports and input preservation. Installed CJS and ESM scripts each add **27** key/orient combinations (nine Object-member and 18 numeric-layout combinations), plus an absent numeric-column check.
- Required checks ran **serially**, each final command exiting 0:
  - **Source:** `pnpm --filter @web-ts-toolkit/json-frame typecheck:source` — passed, zero diagnostics.
  - **V1:** `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/api.test.ts` — **69/69 tests, 1/1 file passed**.
  - **V2:** `pnpm --filter @web-ts-toolkit/json-frame test` — **475/475 tests, 9/9 files passed** (418 preceding + 57 new); CJS/ESM/DTS build, strict source/NodeNext/Bundler/browser checks, runtime, benchmark, release-transformed packed/installed consumers and shipped README examples passed.
  - **V3:** `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — passed, no diagnostics.
  - **V4:** `git diff --check` — passed; `git diff -- CHANGELOG.md` — empty.
- **Acceptance:** (1) PASS — strict readonly/mutable Object-member row/filter/sort guards across all three inference modes, with dense controls; (2) PASS — finite numeric/string spellings aggregate into canonical columns with precise dense unions and sparse/optional nullability, both indexing forms and broad fallback verified; (3) PASS — failing-before/passing-after declarations agree across source and installed consumers; runtime/prototype-safe rows and prior JFC/JFP-01 controls pass. Inspected emitted `dist/index.d.ts` / `dist/index.d.mts` helpers, JSDoc and named export list; README/website explain the same contract and explicit-generic schema-validation boundary. Generated outputs were built, never hand-edited.
- **Bounded public-root reproduction:** `pnpm --filter @web-ts-toolkit/json-frame exec node --input-type=module -e '<script below>'` — **exit 0**, ESM/CJS each printed `public-root PASS: [{"1":1},{"1":"x"}]`. The strict counterpart is the reusable fixture above, including the same numeric literal union and unsafe Object-member operations.

  ```js
  import assert from 'node:assert/strict';
  import { createRequire } from 'node:module';
  import { fromOrient } from '@web-ts-toolkit/json-frame';
  const require = createRequire(import.meta.url);
  for (const [format, factory] of [
    ['ESM', fromOrient],
    ['CJS', require('@web-ts-toolkit/json-frame').fromOrient],
  ]) {
    for (const key of ['toString', 'constructor', 'valueOf']) {
      const sparse = factory([{ [key]: 'ok' }, {}]);
      assert.equal(sparse.row(1)[key], null);
      assert.equal(Object.getPrototypeOf(sparse.row(1)), null);
      assert.throws(() => sparse.row(1)[key].toUpperCase(), TypeError);
      assert.equal(sparse.filter((row) => row[key] != null && row[key].toUpperCase() === 'OK').length, 1);
    }
    const dense = factory([{ 1: 1 }, { 1: 'x' }]);
    assert.deepEqual(dense.columns, ['1']);
    assert.deepEqual(dense.toValues(), [[1], ['x']]);
    assert.equal(dense.row(0)[1], 1);
    assert.equal(dense.row(1)['1'], 'x');
    const common = factory([
      { id: 'a', 1: 1 },
      { id: 'b', 1: 'x' },
    ]);
    assert.deepEqual(common.columns, ['1', 'id']);
    assert.deepEqual(common.toValues(), [
      [1, 'a'],
      ['x', 'b'],
    ]);
    console.log(format + ' public-root PASS: ' + dense.toJSONString('records'));
  }
  ```

- Verification scope: package-scoped checks passed; the existing non-failing Vite future-native-loader warning appeared in V1/V2. Historical unrelated full-workspace failures remain historical. No JFP-02 acceptance blocker remains. JFP-03 remains **pending** for its independent session.

### Task JFP-03: Independently Verify Property-Key Contract Integration

Status: completed

Closure review session: fresh independent reviewer, not an implementer of any task; no agents spawned. Entire plan, initial blocked review and JFP-04 completion evidence read. JFP-01, JFP-02 and JFP-04 dependencies confirmed completed before setting JFP-03 in_progress. Current code/tests/docs and fresh serial checks independently passed; Completion evidence follows the preserved initial review. Initial shared worktree status captured.

Review session: fresh independent JFP-03 reviewer, not a JFP-01/02 implementer; no subagents, per scoped user instruction. Full plan and pertinent prior JFC evidence reviewed; both dependencies are completed. Initial worktree status captured with existing json-frame and unrelated edits preserved.

Historical blocker / owner (initial review): coordinator handoff for **JFP-04**, the independently confirmed pattern-index dictionary inference gap below. Original JFP-01/02 regression matrices and initial package checks passed, but the broader dictionary safety/documentation contract had an outstanding counterexample. **Resolved:** JFP-04 is implemented and fresh independent closure verification passed. No coordinator sign-off is claimed.

Kind: improvement

Priority: P2 — dictionary runtime and TypeScript property rules must agree across supported entrypaths.

Suggested agent: independent reviewer (fresh session, not a prior implementer)

Dependencies: JFP-01, JFP-02, JFP-04 (added at coordinator handoff for closure; initial review discovered JFP-04)

Primary ownership: this task file evidence, read-only review of changed source/tests/declarations/README/website and packed consumers. Record new necessary fixes in requirements before making any narrow correction.

Finding: previous package and strict-consumer checks passed without these key combinations. Review the new matrix through public exports and inspect implementation rather than assuming a green unit test proves dictionary safety or inference soundness.

References: findings/acceptance above; preceding JFC review and final verification limitations; `packages/json-frame/package.json` and packed-consumer harness.

Requirements:

1. Independently check each JFP-01/02 acceptance bullet and record concise criterion-level verdicts. Reproduce all three original cases through built public ESM/CJS and strict declarations.
2. Review own-property runtime lookup, null-prototype behavior, inherited keys, explicit table metadata precedence, numeric key aliases, sparse optionality and broad-index fallbacks. Verify no public helper/dependency leaks.
3. Run V2/V3/V4 serially. Inspect published declarations, docs and release notes for agreement. No need to rerun unrelated full-workspace failures absent shared-scope changes; state that scope clearly.
4. Mark complete only if package acceptance passes and no required defect is outstanding. Preserve all prior/unrelated changes and root CHANGELOG exclusion.
5. Review-discovered requirement (recorded before any correction): close the pattern-index dictionary gap tracked by JFP-04 before completing this integration review. This significant independent inference case is handed to the coordinator rather than folded into an untracked reviewer fix. JFP-04 has not been implemented in this session.

Acceptance criteria:

- Both implementation tasks have concrete changed-file/regression/verification evidence and independent criterion-level PASS verdicts.
- Fresh V2/V3 pass, public runtime/type repros pass, V4 passes, package docs/types/runtime agree, and root CHANGELOG remains untouched.
- Every task status is truthful; remaining limitations and actual checks are recorded. Coordinator performs final sign-off afterward.

Verification: V2/V3/V4, public-root runtime and strict type probes, source/declaration/artifact/documentation review.

Historical initial review evidence (independent JFP-03 session, 2026-09-26; **not completion evidence**; blocked verdict superseded by the fresh closure below):

- **Verdict: original regression matrices PASS; integration closure BLOCKED by JFP-04.** JFP-01 and JFP-02 retain their completed implementation records for the original cases. JFP-03 is blocked; new JFP-04 is pending coordinator assignment. No package implementation, fixture, manifest, README, website or root CHANGELOG change was made by this reviewer. The only workspace edit is this task document; independent scripts are scratch files under `<repo-root>/_tmp`.
- Read the full current plan and all current package source files, JFP runtime/declaration tests, strict consumer configs, manifest/build configuration, packed-consumer harness, emitted declarations, README and website. Reviewed the full preceding JFC plan, particularly JFC-02 inference, JFC-06 criterion/probe evidence, unrelated workspace failures and coordinator sign-off. Historical pre-fix results are reviewed evidence, not reruns by this session. Current totals reconcile: **367 prior JFC + 51 JFP-01 + 57 JFP-02 = 475 tests**.
- Runtime boundary audit: `src/options.ts:149–180` copies `Object.entries` into a frozen null-prototype dictionary; `src/frame/column.ts:462–505` reads one own override, reuses it for validation/resolution, and prioritizes schema metadata. `parse/parse.ts:213–257`, JSON cloning, frame row creation and all exporters preserve own string-key/null-fill behavior. Rebuilt transforms carry metadata through maps, including empty results. Caller dictionary/prototype preservation and both internal parsed/data entrypoints are tested without public exposure.
- Type boundary audit: `src/api.ts:15–55` checks broad `string`/`number` keys before canonicalization, distributes declared-key and optionality checks across variants, merges equivalent numeric spellings, and excludes top-level undefined cells. Object-valued Object-member controls are genuinely required; optional members remain optional. The private helpers are present as necessary declaration implementation details but are absent from the export list. **The broad-key guard does not detect infinite template-literal key domains; JFP-04 records the confirmed consequence.**

#### Independent Criterion-Level Verdicts

Numbering follows each task's acceptance bullet order. PASS for an original matrix does not claim the new pattern-index case passes.

| Criterion                                                   | Verdict                             | Independently checked evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JFP-01.1 — prototype-sensitive regression matrix            | PASS                                | `test/frame/column.test.ts:204–255` covers five labels × ordinary/null dictionaries × omitted/empty/unrelated/explicit overrides; `test/options-and-errors.test.ts:111–143` checks detached frozen normalization/custom inheritance/invalid own types. Reviewed historical 25 pre-fix failures; fresh V2 passes. Independent public ESM/CJS additionally covers all 12 Object.prototype names, six orients and parsed/raw input.                                                                      |
| JFP-01.2 — thresholds/types/diagnostics                     | PASS                                | Both thresholds 0/1 assert exact values, integer/float string metadata and Int32/Float64/unpacked storage; own mismatches retain structured orient/path/row/column/value diagnostics. Independent public checks confirm valid table schema/string exports and own-mismatch rejection.                                                                                                                                                                                                                 |
| JFP-01.3 — transforms/empty/schema/preservation             | PASS                                | Sort/filter/select/two renames/reset/empty-filter chains preserve logical/schema types and source values; table metadata wins over conflicting own overrides. Both internal state boundaries ignore inherited getters. Independent matrix verifies export parity, caller dictionary descriptors and unchanged Object.prototype descriptors.                                                                                                                                                           |
| JFP-02.1 — sparse Object-member guards/dense precision      | PASS                                | Reusable fixture `inference-contract.mts:102–195` checks readonly/mutable row/filter/sort across omitted/auto/records modes. Fresh V2 plus independent strict probes cover eight Object-member names, optional string/object/null/tuple cells, required scalar/object controls and both exact-optional settings. Unsafe sparse calls are rejected.                                                                                                                                                    |
| JFP-02.2 — finite numeric/string aliases                    | PASS for listed cases               | `inference-contract.mts:174–234` and `test/api.test.ts:152–187` cover numeric-only/string-only/mixed/reversed/sparse/optional/absent/common-field layouts, both indexing forms and distinct `'01'`. Independent probes also pass negative/fractional/exponent/zero aliases. Ordinary `Record<string, number>` / `Record<number, number>` and their finite-union/intersection controls retain `JsonRow`. Infinite pattern-index dictionaries expose an additional requirement-2 gap tracked by JFP-04. |
| JFP-02.3 — regression proof/source/shipped/runtime controls | PASS for original regressions       | Reviewed historical 34 pre-fix declaration diagnostics. Fresh V2 compiles source, workspace and installed CJS/ESM/Bundler/browser fixtures, including all prior JFC-02 controls. Public runtime probes confirm null filling, canonical columns and prototype-safe rows. Six additional strict emitted-declaration configurations pass the independent finite-key matrix.                                                                                                                              |
| JFP-03.1 — implementation evidence and criterion review     | PASS for original task bullets      | Changed-file/regression/check records are concrete and reconcile with current code/tests and the six verdicts above. The newly found inference gap is explicitly tracked rather than hidden by those passes.                                                                                                                                                                                                                                                                                          |
| JFP-03.2 — fresh checks and docs/types/runtime agreement    | BLOCKED                             | V2/V3/V4 and all three original public repros pass; root CHANGELOG is untouched. Broad dictionary guidance is incomplete for pattern-index declarations, which admit a null crash; agreement cannot receive an unqualified PASS until JFP-04 closes.                                                                                                                                                                                                                                                  |
| JFP-03.3 — truthful states/limits/handoff                   | PASS for recording; closure pending | JFP-01/02 completed, JFP-03 blocked, JFP-04 pending. Actual checks, significant gap, scratch-probe corrections and limits are recorded. Coordinator final sign-off remains subsequent work.                                                                                                                                                                                                                                                                                                           |

#### Actual Fresh Checks and Public Probes

Environment: Linux, Node **v26.7.0**, pnpm **11.18.0**, TypeScript **6.0.3**, Vitest **4.1.11**. Commands issued serially; no overlapping reviewer builds/agents.

1. **V2** `pnpm --filter @web-ts-toolkit/json-frame test` — **exit 0**, **475/475 tests, 9/9 files**, start **21:27:10**, Vitest duration **32.79s**. CJS/ESM/DTS build, strict source/NodeNext/Bundler/browser checks, runtime and existing benchmark passed. All three packed-consumer tests passed: release-transformed tarball/allowlist, staged `npm pack --dry-run --json`, installed public CJS/ESM/declaration consumers and shipped README examples. Existing non-failing Vite future-native-loader warning only; no performance comparison claim.
2. **V3** `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — **exit 0**, no diagnostics.
3. **V4** `git diff --check && git diff -- CHANGELOG.md` — **exit 0**, empty output. Repeated after final evidence edits, also passed.
4. `node <repo-root>/_tmp/jfp03-types.cjs` — final **exit 0**. Virtual consumers import only the public package name and verify resolution to fresh `dist/index.d.mts` or `dist/index.d.ts`, without source aliases. **361 exact row-shape assertions + 20 additional exact indexing/domain/shallow assertions + 150 negative assertions per configuration**; **six configurations**, NodeNext ESM/CJS and Bundler with `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: false/true`, `strict: true`, `skipLibCheck: false`, ES2022 library and no ambient Node types. Eight Object-member names × readonly/mutable sparse and five optional/dense cell types × three inference modes; six numeric spellings including exponents/negative zero, optional aliases, broad dictionaries, original partial-override typing, common fields, distinct `'01'`, explicit domain, values, shallow/flattened and five private-export rejection controls all pass.
5. `node <repo-root>/_tmp/jfp03-runtime.cjs` — **exit 0**, public package-root ESM/CJS each report **3,456 override matrix cases PASS** (12 Object.prototype names × three dictionary prototypes × four override modes × two thresholds × six orients × parsed/raw input). Additional sparse/dense/absent member, numeric alias/common-field, structured mismatch, unchanged caller/prototype and exact nine-runtime-export assertions pass. The original `{constructor:1,n:2}` partial override exports integer fields correctly; sparse Object members produce guarded null cells; `[{1:1},{'1':'x'}]` has column `['1']` and values `[[1],['x']]`. This script also confirms the **new** pattern-dictionary undefined-only row/filter/sort guards throw `TypeError` at actual null cells in both formats.
6. `node <repo-root>/_tmp/jfp03-pattern-keys.cjs` — **exit 0 as a defect reproduction**, not a safety pass. The unsafe program below compiles with **zero diagnostics** in **seven configurations**: the same six strict emitted-declaration modes above plus strict source/Bundler with public-root source mapping and `noUncheckedIndexedAccess`. The string-pattern row/filter/sort reproduces in omitted/auto/records modes; numeric-string pattern row access also compiles unsafely. Neither an explicit domain generic nor an `any`/type assertion is involved.
7. Artifact/source review: `git diff --no-index -- packages/json-frame/dist/index.d.ts packages/json-frame/dist/index.d.mts` — **exit 0**, byte-identical declarations. Build is bundled, non-splitting and self-contained; emitted runtime/declarations contain no dependency imports. Root metadata offers only `.` with aligned CJS/ESM/type conditions. Packed harness confirms exactly **LICENSE, README.md, index.js, index.mjs, index.d.ts, index.d.mts, package.json**, no runtime/peer/dev dependencies, scripts, maps or internal subpaths. Named-only runtime exports remain the factory, depth constant and seven error classes; `DataFrame` remains a public interface. No whole asdf artifact claim is made.

Scratch-probe corrections/limits: the initial independent finite-key script produced 31 diagnostics per configuration because its expectations omitted nested readonly modifiers, expected widened `number` rather than retained literal `1`, admitted `Partial<Record<number, number>>` (whose possible own undefined values fail the JSON-compatible input constraint), and assumed computed `[-0]` in a type literal was represented as numeric `0`. Checker inspection showed that declaration spelling as string `"-0"` and a conservative `JsonRow` fallback; the numeric optional probe now uses `Partial<Record<-0, number>>`. Correcting those scratch assumptions gave the clean finite-key result above; no package code was changed. Pattern-index null unsoundness is a separate confirmed finding, not one of those expectation corrections.

Scope/residual limits: verification is package-scoped as authorized. Historical unrelated JFC full-workspace failures were read, not rerun or reclassified; the live shared worktree is not an isolated immutable snapshot. No fresh pandas experiment, cross-version TS/Node or browser-runtime matrix, general fuzzing, or hostile getter/Proxy sandboxing is claimed. Explicit-domain assertions, shallow nested cells, native key enumeration/JSON spelling, orient dimensional loss and documented maxNodes exclusions retain their existing limits. No acceptance-required runtime override defect remains; integration completion is withheld for JFP-04's inferred dictionary nullability gap.

#### Completion evidence — Fresh Independent JFP-03 Closure (2026-09-26)

- **Final verdict: PASS; all four tasks completed.** The JFP-04 blocker is resolved by independently verified current behavior. Initial blocked-review findings, commands, failed/successful probe evidence and verdict table above remain historical. No new acceptance-required defect or follow-up was identified. Coordinator final sign-off remains separate.
- **Changed:** only this task document in the workspace, using apply_patch. Review scripts are `<repo-root>/_tmp/jfp03-closure-types.cjs`, `<repo-root>/_tmp/jfp03-closure-runtime.cjs`, and `<repo-root>/_tmp/jfp03-closure-artifact.cjs`. No implementation task was performed by this reviewer. Existing package and unrelated shared-worktree changes were preserved; generated dist was rebuilt by V2, never hand-edited.
- **Read/audited:** entire plan, initial blocked review, JFP-04 completion evidence, pertinent preceding JFC integration/limitations/sign-off, current `src/api.ts`, own-override normalization/state builder, record parser/null filling, row construction and metadata rebuild/export paths, focused column/options/API tests, complete reusable inference fixture and packed-consumer harness, compiler configs, package metadata/build/public entrypoint, emitted declarations and relevant README/website contracts. Historical pre-fix failures were reviewed, not rerun or represented as new closure results.
- **Structural detection audit:** `src/api.ts:15–57` distributes `IndexRecordKeys` over original key domains before canonicalization. Empty-record assignability to `Record<K, never>` distinguishes open mapped/index signatures from finite required keys; the `never` sentinel avoids inherited Object-member satisfaction. Input property optionality is deliberately not used to classify a domain as open. Finite optional fields proceed to declared-key/`Required<Pick<...>>` checks and acquire normalization null/possible absence. Any open domain widens the complete inferred row, including known intersection fields, to JsonRow. Independently tested nested templates, nested uppercase interpolation, overlapping open-pattern intersections, separate intersected dictionaries, mixed finite/open template branches and boolean/numeric patterns. Finite nested templates, finite intersections of a pattern with literal unions, optional finite intersections, required-plus-optional finite record intersections and finite union variants retain exact fields/requiredness. This is structural checker behavior, not a prefix heuristic.

##### Fresh Criterion-Level Verdicts

Numbering follows each task's acceptance bullets. These are current closure verdicts, including the follow-up, rather than extensions of the initial blocked table.

| Criterion                                                        | Verdict | Independent closure evidence                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JFP-01.1 — prototype-sensitive override matrix                   | PASS    | Current five-label ordinary/null-prototype omitted/empty/partial/explicit tests and normalization tests pass in fresh V2; independent public ESM/CJS matrix also covers all 12 Object.prototype names and a custom inherited throwing getter. Historical pre-fix 25 failures reviewed.                                                                                                                                                                                     |
| JFP-01.2 — packing/types/diagnostics                             | PASS    | Source tests assert Int32/Float64/unpacked storage at thresholds 0/1 and equal values/string logical metadata; public matrix checks both thresholds and table fields. Ten own-mismatch cases per format retain exact orient/path/row/column/value diagnostics.                                                                                                                                                                                                             |
| JFP-01.3 — transforms/empty/schema/preservation                  | PASS    | Public sort/filter/select/two-renames/reset/empty-filter chains preserve metadata and export/reparse values; ten source-table precedence/custom metadata cases per format pass. Caller dictionary descriptors/prototypes and Object.prototype remain unchanged. Source tests independently cover both internal state boundaries and ignored inherited getters/non-enumerable keys.                                                                                         |
| JFP-02.1 — sparse Object members/dense precision                 | PASS    | Reusable strict fixture verifies readonly/mutable row/filter/sort guards in all three inference modes. Fresh source/installed checks and independent exact optional/dense Object-member types pass, including object-valued cells. Public null-safe member operations and absent/dense controls pass for 12 labels.                                                                                                                                                        |
| JFP-02.2 — canonical finite aliases and dictionary fallback      | PASS    | Source/runtime fixture layouts retain canonical numeric/string columns, sparse/optional nullability, numeric/string indexing and common fields. Independent strict matrix preserves aliases/finite optional unions; full string/number and open-pattern dictionaries safely widen. Public mixed/reversed/sparse/common-field alias repros pass.                                                                                                                            |
| JFP-02.3 — regression/source/shipped/runtime controls            | PASS    | Historical failing declarations reviewed; fresh V2 checks reusable JFP/JFC controls against source and installed CJS/ESM/Bundler/browser declarations. Independent original repro types and public runtime values/prototype-safe rows pass.                                                                                                                                                                                                                                |
| JFP-04.1 — unsafe pattern operations/safe guards/null behavior   | PASS    | Exact JsonRow checks plus undefined-only row/filter/sort negatives and scalar-guard positives pass for 21 open-domain layouts across mutable/readonly × omitted/auto/records. Source and emitted consumer matrices use unchecked-index checking and both exact-optional settings; V2 verifies installed formats/browser declarations. Actual null crashes for intentionally unsafe runtime operations, scalar-safe operations and absent-column undefined are established. |
| JFP-04.2 — open presence vs finite precision                     | PASS    | Structural audit and 18 finite-layout controls preserve nested finite unions/intersections, optionality, aliases and Object-member fields. Original values-array, explicit-domain, shallow-cell and flattened-union controls pass. An open nested/intersected domain cannot imply matching columns are present in the tested matrix.                                                                                                                                       |
| JFP-04.3 — checks/docs/private surface/handoff                   | PASS    | Fresh V2/V3/V4, pack/install, matching shipped declaration/JSDoc/README/website semantics and dependency/export audits pass. Implementation handoff is now independently closed, without circular dependency or coordinator sign-off.                                                                                                                                                                                                                                      |
| JFP-03.1 — concrete implementation evidence/independent verdicts | PASS    | JFP-01/02/04 changed-file, failing-before/passing-after and verification evidence reconciles with current implementation/fixtures and the nine criterion verdicts above.                                                                                                                                                                                                                                                                                                   |
| JFP-03.2 — fresh verification/public repros/docs agreement       | PASS    | All required serial commands, original ESM/CJS runtime/type repros, pattern cases and artifact/doc checks below pass. The initial pattern-nullability documentation disagreement is resolved. Root CHANGELOG diff is empty.                                                                                                                                                                                                                                                |
| JFP-03.3 — truthful final status/limits                          | PASS    | All four task statuses completed with Completion evidence; historical blocker preserved and explicitly resolved. Actual scope, scratch-probe correction and limitations recorded; coordinator sign-off is subsequent.                                                                                                                                                                                                                                                      |

##### Actual Closure Commands and Counts

Environment: Linux, Node **v26.7.0**, pnpm **11.18.0**, TypeScript **6.0.3**, Vitest **4.1.11**. Required checks and probes ran serially; no agents or overlapping reviewer builds.

1. **V2:** `pnpm --filter @web-ts-toolkit/json-frame test` — **exit 0; 531/531 tests, 9/9 files**, Vitest start **21:46:57**, duration **42.66s**. Counts reconcile: **367 prior JFC + 51 JFP-01 + 57 JFP-02 + 54 JFP-04 runtime + 2 source-consumer compiler tests = 531**. CJS/ESM/DTS build, source/workspace strict checks, runtime, existing benchmark, both alternate source-consumer settings, release-transformed pack/allowlist and staged npm dry-run, installed CJS/ESM runtime, six installed compiler invocations (NodeNext checks both formats), browser/no-Node-ambient declarations and shipped README examples passed. Existing non-failing Vite future-native-loader warning only.
2. **V3:** `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — **exit 0**, no diagnostics.
3. **V4:** `git diff --check && git diff -- CHANGELOG.md` — **exit 0**, empty output; repeated after final task-document edits.
4. `node <repo-root>/_tmp/jfp03-closure-types.cjs` — final **exit 0**, **241 exact assertions + 385 negative assertions per configuration**, **8 configurations**, zero diagnostics. **(21 open + 18 finite layouts) × mutable/readonly × omitted/auto/records = 234 exact row-shape cases**, plus seven original-repro/alias-index/domain/values/shallow exact controls. The 385 negatives include 378 open-domain row/filter/sort operations, original sparse Object-member/flattened-union unsafe uses, and five private-helper imports. Six public-root emitted configurations are NodeNext ESM/CJS and Bundler without Node ambient types, each with exactOptionalPropertyTypes false/true, strict true, skipLibCheck false and noUncheckedIndexedAccess true. Two source/Bundler configurations resolve the public name to `src/index.ts`; they check options/global/syntax and consumer semantic diagnostics, following the documented JFP-04 boundary. Fresh V2 separately checks implementation bodies under package settings. Emitted consumers have no source aliases and verify resolution to the expected fresh `.d.ts`/`.d.mts`.
5. `node <repo-root>/_tmp/jfp03-closure-runtime.cjs` — **exit 0**. Public-root ESM and CJS each report **288 override + 36 sparse-member + 48 pattern + 12 alias cases = 384 matrix cases PASS**, plus the exact original partial-override reproduction and ten own-mismatch/ten schema-precedence controls. Overrides cover 12 Object.prototype labels × three dictionary prototypes × four override modes × two thresholds. Pattern cases cover eight labels (including nested-template examples) × mutable/frozen × three orients; row/filter/sort undefined-only guards intentionally throw on null, scalar guards work, and absent columns read undefined. Original output is `{"schema":{"fields":[{"name":"constructor","type":"integer"},{"name":"n","type":"integer"}]},"data":[{"constructor":1,"n":2}]}`; mixed `[{1:1},{'1':'x'}]` retains column `'1'` and `[[1],['x']]`. Entrypoint resolution is asserted as public dist/index.mjs and dist/index.js; exact nine-runtime-export surface also passes.
6. `git diff --no-index -- packages/json-frame/dist/index.d.ts packages/json-frame/dist/index.d.mts` — **exit 0**, byte-identical declarations. `node <repo-root>/_tmp/jfp03-closure-artifact.cjs` — **exit 0**: AST audit finds no dependency imports/requires in either runtime or declaration format; private helpers are absent from exports, manifest has only aligned root entrypoints and no runtime/peer dependencies, emitted JSDoc and matching README/website pattern/override guidance agree. Fresh V2's actual release transformation/pack/install confirms exactly **LICENSE, README.md, index.js, index.mjs, index.d.ts, index.d.mts, package.json**, without runtime/peer/dev dependencies, scripts, maps or internal subpaths. This is package-artifact evidence, not whole asdf-artifact assembly.

Scratch correction: the first strict probe and its diagnostic-inspection rerun each reported two exact-expectation failures per configuration. Checker inspection showed retained literal `n: 2` in the original inline override example and nested `1 | undefined` in the shallow example, rather than the probe's assumed widened number types. Correcting only these scratch expectations produced the clean final result. All 234 open/finite matrix shapes and all negative assertions already passed; no package correction or new defect was involved.

Limitations: package-scoped review as authorized; historical unrelated full-workspace failures remain historical and were not rerun/reclassified. No full-workspace all-green, cross-version TS/Node, fresh pandas, browser-runtime, exhaustive exotic-key/fuzzing or measured performance-improvement claim. JsonRow intentionally widens known intersection fields; unchecked-index checking exposes possible absent reads, and scalar guards handle JSON unions/null. Explicit domain generics remain assertions, nested cells remain shallow, native key/JSON spelling and orient dimensional losses remain documented. Alternate consumer compiler settings do not claim whole implementation-body exact-optional compatibility. Scratch probes are local evidence under `<repo-root>/_tmp`; durable regressions are the reviewed package fixtures. The shared worktree remains live rather than an isolated immutable snapshot. No residual acceptance blocker remains.

### Task JFP-04: Conservatively Infer Pattern-Index Record Dictionaries

Status: completed

Implementation session: fresh isolated JFP-04 session; no subagents, per scoped user instruction. Shared context, initial independent JFP-03 review evidence and JFP-04 requirements read; JFP-02 dependency completed. JFP-03 remains blocked for a subsequent fresh independent closure review.

Lifecycle resolution: the preceding implementation-session handoff and blocked statements in its Completion evidence are historical. Fresh independent JFP-03 closure above has now passed and completed; coordinator final sign-off remains separate.

Kind: defect

Priority: P2 — accepted inferred input permits null-dereferencing row/filter/sort code under strict TypeScript.

Suggested owner: coordinator-assigned TypeScript inference specialist; subsequent independent JFP-03 closure review.

Dependencies: JFP-02. JFP-03 closure is blocked on this finding; this task does not depend on JFP-03 completion.

Primary ownership: `packages/json-frame/src/api.ts`, `test-decl-consumer/inference-contract.mts`, focused `test/api.test.ts` runtime companions, README/website/JSDoc dictionary guidance and this plan's evidence. Preserve prior work and root CHANGELOG exclusion.

Finding: `InferredRecord` only recognizes broad dictionaries when `string extends RecordKeys<T>` or `number extends RecordKeys<T>`. Infinite string-pattern keys satisfy neither condition and flow into finite-key normalization/requiredness. `Record<\`metric\_${string}\`, number>[]` and `Record<\`${number}\`, number>[]`accept sparse plain records, but inferred cells omit normalization null. Even with`noUncheckedIndexedAccess`, guarding only undefined permits `toFixed()`on a runtime null. Current reusable fixtures cover full`string`/`number` index domains, not template-literal index signatures. This is independent of the corrected finite numeric/string alias repro and is not a runtime parser defect.

References: `src/api.ts:15–55` broad guard and requiredness helpers; `src/parse/parse.ts:213–257` actual own-key/null-fill semantics; `test-decl-consumer/inference-contract.mts:246–251`; README Inferred Row Types and website matching guidance. Public repro (strict source and emitted declarations compile this unsafe code):

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

const rows: Record<`metric_${string}`, number>[] = [{ metric_n: 1 }, {}];
const frame = fromOrient(rows); // also orient: 'auto' / 'records'
const value = frame.row(1).metric_n;
if (value !== undefined) value.toFixed(); // compiles; TypeError because value is null
frame.filter((row) => row.metric_n !== undefined && row.metric_n.toFixed() === '1');

const numericRows: Record<`${number}`, number>[] = [{ 1: 1 }, {}];
const numericValue = fromOrient(numericRows).row(1)['1'];
if (numericValue !== undefined) numericValue.toFixed(); // same null crash
```

Requirements (recorded before implementation):

1. Recognize non-finite/pattern index domains before promising finite required columns. Use conservative `JsonRow` fallback consistent with the existing broad dictionary contract, or document and verify an equally safe inferred shape that includes actual normalization null/possible absence. Do not reject valid runtime labels or coerce cells.
2. Cover numeric-string and prefixed-string pattern dictionaries, sparse/entirely absent columns, readonly/mutable arrays, unions with finite-key variants and ordinary finite-template-union controls. Preserve precise finite numeric/string aliases, declared Object-member optionality, explicit-domain assertions, values inference, shallow cells and flattened unions.
3. Add exact positive and unsafe-use negative source/installed declaration assertions for row/filter/sort across omitted/auto/records modes. Include `noUncheckedIndexedAccess` and both exact-optional settings in meaningful verification; add runtime companions demonstrating actual cells. Record failing-before/passing-after evidence.
4. Align public JSDoc, README, website and release notes with the selected dictionary boundary. Keep helpers private and add no dependencies. Run source/focused checks and V2/V3/V4 serially, then return to independent JFP-03 review closure.
5. Session clarification before implementation: use a general index-domain check rather than a prefix-specific heuristic; include suffix/infix patterns, numeric-string patterns and pattern intersections with known properties, while preserving finite template unions. Exercise both exact-optional settings in the reusable source and installed consumer checks.

Acceptance criteria:

- The repro's unsafe undefined-only row/filter/sort operations are rejected in source and shipped strict CJS/ESM/Bundler/browser consumers; safe guards work and runtime null/absence behavior is established.
- Infinite pattern dictionaries cannot imply all matching columns are present; finite template-key unions, original JFP/JFC inference precision and explicit-domain controls remain correct.
- Fresh V2/V3/V4 pass, docs/types/runtime agree, and no public helper/dependency leak occurs. Implementation completion hands off to JFP-03; independent review closure and final plan sign-off follow separately, avoiding a circular task dependency.

Verification: strict source fixture before/after; focused API runtime; V2/V3/V4 serially; public-root CJS/ESM runtime and strict pattern-index probes. Current evidence is the seven unsafe-compilation configurations and two-format null crashes above; **no fix or passing regression is claimed**.

Completion evidence (JFP-04 implementation session; supersedes the pre-implementation verification state immediately above):

- Changed **7 files**: `packages/json-frame/src/api.ts`, `test-decl-consumer/inference-contract.mts`, `test/api.test.ts`, `test/packed-consumer.test.ts`, `packages/json-frame/README.md`, `website/docs/packages/json-frame.md`, and this task document. Prior JFC/JFP changes and unrelated worktree edits were preserved. No runtime implementation, manifest, dependency, public export or root CHANGELOG change was made in this session.
- **Design:** the private distributive `IndexRecordKeys<K>` probes whether an empty mapped record (`Record<never, never>`) satisfies `Record<K, never>`. An open index domain accepts that empty record; a finite required key does not. The `never` cell sentinel prevents inherited Object members from falsely satisfying the probe. Apply it before numeric-key canonicalization; any open domain causes the entire inferred row to fall back to `JsonRow`. This uses TypeScript's index-signature assignability rather than parsing template prefixes or excluding a particular interpolation. String/number, prefix/suffix/infix, numeric-string/bigint, intrinsic uppercase, union/intersection and overlapping known-property controls pass. Existing finite-key normalization and requiredness helpers remain intact.
- **Declarations:** added **22 exact row-shape assertions** and **9 negative assertions** (40 negative assertions total with the preceding 31 retained). The shared public-root fixture covers omitted/auto/records options; readonly/mutable string-pattern and numeric-string arrays; suffix/infix, bigint and uppercase domains; unions with finite variants; intersections with known fields, matching known fields and other patterns; entirely absent columns; finite string/numeric/boolean template unions; optional finite templates; numeric aliases and prototype-member keys. Row/filter/sort undefined-only guards are rejected and scalar guards compile. Explicit pattern-domain assertions retain their caller-specified type. Previous values, shallow-cell, flattened-union and JFP/JFC precision controls still pass. The old fixture's `{ orient: undefined }` construction was changed to omitted options, so those same controls also run under exact-optional semantics without changing the API contract.
- **Pre-fix proof:** initial `pnpm --filter @web-ts-toolkit/json-frame typecheck:source` with the new regression fixture and original broad-key guard exited **2**, with **21 diagnostics**: 11 exact-shape failures, 9 unused negative assertions and one absent-property diagnostic. After extending the matrix, temporarily restored only the original `InferredRecord` guard and ran `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts -t 'checks source API inference'`: **exit 1, 2 failed / 3 skipped**. Both `exactOptionalPropertyTypes: false/true` configurations, with `noUncheckedIndexedAccess: true`, reported **24 fixture diagnostics each** (15 exact-shape failures, 8 unused unsafe-operation assertions and one absent-property diagnostic). The absence-only negative already passed with unchecked-index checking, distinguishing undefined from the missing null protection. Restored the fix using apply_patch; both tests then passed.
- **Source consumer verification boundary:** the new compiler-API tests resolve the public import to `src/index.ts`, check compiler/global/syntax diagnostics and semantic diagnostics for the entire reusable inference consumer under both exact-optional settings with unchecked-index checking. Package implementation bodies continue to be checked by `typecheck:source` with the package's own compiler settings. An exploratory whole-source `tsc ... --noUncheckedIndexedAccess --exactOptionalPropertyTypes` exited 2 on ten existing implementation-body exact-optional diagnostics in errors/frame code plus the old fixture's explicit-undefined options; it is not claimed as a passing whole-source build under alternate settings. The fixture options were corrected; implementation compiler-policy changes are outside this task. Installed declaration checks use full `tsc`, `strict: true`, `skipLibCheck: false`, `noUncheckedIndexedAccess: true`, both exact-optional settings, and no source aliases: NodeNext ESM/CJS, Bundler, and browser/no-Node-ambient consumers.
- **Runtime companions:** added **54 API cases** (eight dictionary layouts × mutable/frozen inputs × three orients, plus six union/finite-template controls). They establish actual numeric cells, null filling, absent columns/undefined, own null-prototype rows, deliberately unsafe row/filter/sort TypeErrors, safe scalar operations, records exports and input preservation. Installed CJS/ESM scripts each add **45** label/known-property/orient combinations with the same null/absence/unsafe/safe checks. Two additional source compiler tests bring the package total to **475 + 54 + 2 = 531**.
- **Serial verification, final results:**
  - Source: `pnpm --filter @web-ts-toolkit/json-frame typecheck:source` — **exit 0**, zero diagnostics (also rerun inside final V2).
  - V1: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/api.test.ts` — **exit 0, 123/123 tests**. Source matrix command above — **exit 0, 2 passed / 3 skipped**. After the lint-only probe spelling adjustment, focused `test/api.test.ts test/packed-consumer.test.ts -t 'property-key records|checks source API inference'` — **exit 0, 113 passed / 15 skipped**; final V2 reran every test.
  - V2: `pnpm --filter @web-ts-toolkit/json-frame test` — final **exit 0, 531/531 tests, 9/9 files**, Vitest start **21:42:42**, duration **56.58s**. CJS/ESM/DTS build; strict source/workspace declarations; runtime and benchmark; both source consumer configurations; release-transformed pack/allowlist, staged npm dry-run, installed CJS/ESM runtime, six serial installed compiler invocations (NodeNext includes both module formats), and shipped README examples all passed.
  - V3: `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` — final **exit 0**, no diagnostics. The first V3 rejected `{}` in the probe under `no-empty-object-type`; changed it to equivalent `Record<never, never>`, then reran focused checks, V2 and V3 successfully.
  - V4: `git diff --check && git diff -- CHANGELOG.md` — **exit 0**, empty output; repeated after final evidence edits.
- **Public-root reproduction:** `pnpm --filter @web-ts-toolkit/json-frame exec node --input-type=module -e '<assertion script>'` — **exit 0**, both ESM and CJS printed `public-root PASS: 15 pattern/orient cases`. Imports use the package name and `createRequire(import.meta.url)`. For each omitted/auto/records orient and each of `metric_n`, `1`, `n_metric`, `pre_n_post`, `N`, the script passes `[{[key]:1},{}]`, asserts null/absent-undefined/null-prototype rows, asserts undefined-only row/filter/sort guards throw TypeError, and verifies scalar-guard filtering/sorting. The persistent packed runtime matrix contains the same assertions plus known-property combinations.
- **Artifact/docs review:** inspected both emitted declaration files: the private helper and new public JSDoc agree with README/website; the helper is absent from the public export list. Packed assertions verify the pattern and finite-template JSDoc in both declaration formats. Package artifact remains the seven allowed files, named public exports and zero dependencies; the new README example compiles after installation. Generated output was built, not hand-edited. Release note appended below.
- **Acceptance verdicts:** (1) PASS — source and installed negative/positive fixtures across requested compiler/mode combinations plus actual null/absence runtime companions; (2) PASS — open domains fall back safely and finite templates, aliases, prototype optionality and prior controls preserve precision; (3) PASS — final V2/V3/V4, shipped documentation and private/no-dependency surface checks passed. **JFP-03 remains blocked for fresh independent closure review of this implementation**; this session does not complete JFP-03 or claim coordinator/final-plan sign-off.
- **Design/verification limits:** `JsonRow` deliberately widens even known intersection fields and does not preserve numeric-only dictionary cell types; consumers should use scalar guards. Presence remains a runtime fact, with possible undefined indexed reads exposed by `noUncheckedIndexedAccess`. Explicit domain generics remain assertions, not runtime schema validation. The structural probe follows the supported TypeScript checker's mapped/index-signature semantics; no exhaustive compiler-version or exotic key-type proof is claimed. Tests used the installed TypeScript 6.0.3 toolchain. Verification is package-scoped, with no new full-workspace, pandas, browser-runtime or performance-comparison claim. Existing non-failing Vite future-native-loader warnings appeared.

## Release / Contract Notes

Append implementation evidence here; root `CHANGELOG.md` is excluded.

- **Own-key logical overrides (JFP-01):** empty/partial `columnTypes` dictionaries no longer attach inherited Object members to prototype-named columns or break table export. Only own enumerable string keys supply overrides; normalization creates a detached frozen null-prototype snapshot and the internal state boundary independently checks ownership. Ordinary/null-prototype caller dictionaries and explicit `constructor`, `toString`, `hasOwnProperty`, `__proto__`, and `valueOf` keys remain supported. Use computed `['__proto__']` in an object literal to create that own key. Explicit-cell validation, source Table Schema precedence, packing/value fidelity, transform/empty-result metadata, and prior JFC contracts are preserved. README, website and option JSDoc describe the contract; root CHANGELOG is untouched.
- **Declared property-key inference (JFP-02):** inferred sparse/optional Object-member columns such as `toString`, `constructor`, and `valueOf` now require guards for normalization `null` and possible absence. Inherited Object members no longer make those fields appear required. Numeric literal keys and equivalent string spellings are canonicalized before merging cell types and requiredness: `[{1:1},{'1':'x'}] as const` retains one `'1'` column of type `1 | 'x'`, accessible with `[1]` and `['1']`. Non-equivalent labels such as `'01'` stay distinct. Dense precision, broad string/number dictionary fallback, explicit-domain assertions, object-shaped values inference, flattened unions and shallow nested-cell semantics are preserved. Consumers relying on the former unsafe requiredness may need null-safe guards. README, website and emitted public JSDoc explain these type corrections without implying runtime application-schema validation; runtime normalization is unchanged and root CHANGELOG is untouched.
- **Historical initial review handoff (JFP-03/04):** original property-key regressions and 475-test package checks passed, but template-literal pattern dictionaries inferred cells without normalization null. JFP-04 tracked this gap and initially blocked integration closure. **Resolved by JFP-04 and the fresh independent JFP-03 Completion evidence above**; this is no longer the current release verdict.
- **Pattern-index inference correction (JFP-04):** open template-pattern dictionaries now infer `DataFrame<JsonRow>`, matching broad string/number dictionary behavior. This includes numeric-string patterns and unions/intersections with known properties. Undefined-only guards no longer authorize numeric operations on potentially null cells; use scalar guards such as `typeof value === 'number'`. Missing existing-column cells remain null and entirely absent columns remain absent at runtime. Finite template unions, numeric aliases, prototype-key requiredness, explicit-domain assertions and prior JFC/JFP behavior retain their contracts. Known fields in an open dictionary are conservatively widened too. README, website and emitted JSDoc describe this type correction. Implementation and fresh independent closure each passed **531-test** package and strict source/installed consumer checks. JFP-03 independently verified nested open templates and finite union/intersection optionality and is **completed**.
- **Current release handoff:** all four tasks are completed with concrete Completion evidence; independent scoped acceptance is PASS and no required defect remains. Required serial V2/V3/V4, original and pattern public ESM/CJS repros, strict type matrices and package artifact/docs/private-surface checks pass. The initial blocked handoff is historical. Coordinator final sign-off is recorded below; no full-workspace or whole-release-artifact claim is made.

## Definition of Done

All four tasks completed in separate sequential sessions, each with actual Completion evidence; fresh independent reviewer passes scoped acceptance, including the review-discovered JFP-04 correction. **Task delivery and independent-review requirements are met.** No full-workspace all-green claim or unmeasured performance claim is made.

## Coordinator Final Sign-Off

- Confirmed all four task statuses are completed with concrete Completion evidence, including the review-discovered JFP-04 and fresh independent JFP-03 closure. Each implementation and review session was isolated and sequential; no dependency cycle remains.
- Reviewed the final own-key override fix and inferred-key helpers, including structural open-index detection, declared optionality and numeric-key canonicalization. Reviewed current scoped file status and independent criterion-level verdicts, artifact checks and compiler/runtime evidence.
- Accepted the fresh **531/531** package result and eight-configuration independent type matrix. Scoped lint and coordinator `git diff --check` passed. Coordinator `git diff -- CHANGELOG.md` was empty. No implementation changes followed the passing independent review; this final edit records sign-off only.
- Final plan status: **complete**, with no outstanding acceptance blocker. This follow-up did not repeat the prior unrelated full-workspace failures or claim they were resolved. Explicit domain assertions, conservative open-dictionary typing, compiler-version coverage and other documented boundaries remain as stated above.
