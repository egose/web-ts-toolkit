# JSON Frame Health Review Remediation

Created: 2026-08-23 15:21:51 PDT

Package: `packages/json-frame`

Related completed plan: `docs/tasks/20260814-170611-json-frame-package.md`

## Objective

Remediate confirmed correctness, resource-safety, public-type, runtime-validation, performance, fixture-provenance, and documentation gaps in `@web-ts-toolkit/json-frame`. The end state must state and test row-order limits honestly, reject malformed or pathological input with bounded structured diagnostics, emit valid table primary keys, make exported payloads reusable as typed inputs, avoid whole-frame work for single-row access, and keep runtime behavior, declarations, README guidance, and pandas fixtures aligned.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Preserve the six supported pandas orients, named-export-only package root, zero runtime dependencies, Node 22 support, and isomorphic source.
- Treat parsed payloads as untrusted input. Validation failures must not escape as native `RangeError`/`TypeError` solely because input is deeply nested or malformed.
- Prefer one iterative JSON validation/cloning boundary and small stored-column accessors over duplicate traversal logic.
- Preserve the existing structural, shallow immutability contract. Do not silently introduce expensive deep cloning of every cell.
- Do not add a custom JSON parser solely to preserve integer-like object-key order without the maintainer decision recorded below. `Object.keys()` and `Object.entries()` have the same ordering behavior and are not a fix.
- Do not manually edit `packages/json-frame/dist/`; regenerate it through the package build.
- Update source JSDoc, emitted declarations, package README, and release notes together when a public contract changes.
- Preserve unrelated worktree changes. The repository was already dirty outside `packages/json-frame` and this task file when reviewed; agents must not revert or include those changes.
- Run package build/test commands serially. Package tests rebuild this package and declaration consumers inspect the generated `dist/` output.
- Keep benchmark-only work out of correctness tasks. Performance changes require a reproducible baseline and must preserve all existing observable behavior.

## Non-Goals

- MultiIndex or duplicate-column support
- Non-string column labels
- JSON Lines, compression, file I/O, streaming parsing, or a general-purpose replacement for `JSON.parse`
- Deep freezing or deep immutability of nested cell values
- A lazy query engine, sort-permutation layer, Arrow backend, or dataframe computation API
- Sandboxing JSON input or enforcing an application-specific schema for row values
- Byte-for-byte reproduction of every pandas serializer detail by package exporters
- New package entrypoints, default exports, or runtime dependencies

## Review Baseline

Confirmed on 2026-08-23 before this file was created:

- `pnpm --filter @web-ts-toolkit/json-frame test`: passed, 7 files and 100 tests. The command rebuilt CJS, ESM, `.d.ts`, and `.d.mts` output and passed source, NodeNext, Bundler, and browser-Bundler typechecks.
- `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"`: passed with no findings.
- Vitest reported the repository-level warning that `vitest.config.ts` uses ESM syntax while loaded as CommonJS. This is not specific to `json-frame` and did not fail the package suite.
- A runtime probe of raw `index` JSON `{"10":{"v":"first"},"2":{"v":"second"}}` produced index `['2', '10']` and reversed rows because `JSON.parse()` materializes an ordinary object and `Object.keys()` applies ECMAScript integer-key ordering.
- A runtime probe accepted split index `['same', 'same']` and `toTable()` emitted duplicate values under `primaryKey: ['index']`.
- A runtime probe of a cyclic cell showed the resulting `JsonFrameValidationError.value` retained the cyclic root object.
- A 20,000-level nested programmatic value escaped `fromOrient()` as native `RangeError: Maximum call stack size exceeded`.
- The prior plan is complete and remains historical evidence. This is a follow-up; do not rewrite its completed findings or evidence.
- The package has no matching source page under `website/docs/packages/`, although `package.json` advertises `https://web-ts-toolkit.pages.dev/docs/packages/json-frame`.

## Priority Definitions

- P0: supported data is silently reordered/corrupted, or an exporter claims an invalid relational invariant.
- P1: untrusted input can cause uncontrolled failure or retained-memory amplification; public declarations reject central supported workflows.
- P2: runtime misuse creates invalid frame state, a documented contract is false, or avoidable full-frame work materially harms common operations.
- P3: optional typing precision, documentation discoverability, or optimization without demonstrated user impact.

## Confirmed Findings Summary

- `index` and `columns` inputs derive row order from ordinary object property enumeration, so integer-like keys can reorder valid pandas output (`src/parse/parse.ts:304-320`, `src/parse/parse.ts:354-405`, `src/parse/parse.ts:837-855`).
- Recursive JSON validation and schema cloning can overflow the stack, while validation errors can retain complete large or cyclic containers (`src/parse/parse.ts:137-199`, `src/export/payload.ts:22-37`, `src/errors.ts:14-30`).
- `toTable()` declares every source index as a primary key without checking uniqueness, and table ingestion also accepts duplicate primary-key values (`src/parse/parse.ts:765-833`, `src/export/payload.ts:293-339`).
- Exported `SplitPayload`/`TablePayload` values are not guaranteed assignable to `fromOrient()`'s `JsonValue` input, normal interface-based row types fail the `Record<string, JsonValue>` generic constraint, and metadata types admit explicit `undefined` that runtime rejects (`src/types.ts:5-13`, `src/types.ts:43-98`, `src/types.ts:145-172`, `src/api.ts:16-30`).
- `rename()` trusts TypeScript at runtime and can install non-string column labels or throw native errors for malformed JavaScript input (`src/frame/DataFrame.ts:241-267`, `src/frame/DataFrame.ts:389-405`).
- `row()` copies every stored column, and `filter()`/`sort()` materialize the full frame before `#rebuild()` materializes it again and re-infers each selected column (`src/frame/column.ts:198-220`, `src/frame/DataFrame.ts:147-204`, `src/frame/DataFrame.ts:287-356`).
- Fixture generation parses pandas output and reserializes it with Python, contradicting the claim that committed files are verbatim pandas output (`test/fixtures/generate.py:105-110`, `test/fixtures/generate.py:146-153`, `test/fixtures/README.md:3-6`).
- Published JSDoc says all `values` payloads require explicit orientation even though runtime and README auto-detect non-empty values; README also overstates exporter detachment and uses the pandas library version where `pandas_version` means Table Schema version (`src/api.ts:7-14`, `README.md:83-94`, `README.md:227-235`).
- Explicit `columnTypes` can claim types incompatible with actual cells, allowing misleading Table Schema output (`src/frame/column.ts:241-246`, `src/export/payload.ts:74-105`).

## Wave 1: Compatibility Contract And Regression Evidence

### Task JFH-01: Resolve Integer-Like Object-Key Row Ordering

Status: pending

Priority: P0

Suggested agent: pandas/JavaScript serialization compatibility specialist

Dependencies: maintainer decision `D1`

Primary ownership:

- `packages/json-frame/test/fixtures/generate.py`
- `packages/json-frame/test/fixtures/generated/**`
- `packages/json-frame/test/parse/parse.test.ts`
- `packages/json-frame/README.md`
- `packages/json-frame/src/parse/parse.ts` only if `D1` selects exact raw-string order preservation
- release notes for a narrowed or changed order contract

Finding:

The package promises that row order survives label-bearing orient round trips, but `parseInput()` first calls `JSON.parse()` and `parseIndex()`/`parseColumns()` then call `Object.keys()`. ECMAScript enumerates canonical non-negative integer property names in numeric order. A pandas frame deliberately indexed `[10, 2]` can therefore arrive textually as `"10"` then `"2"` and be normalized as `['2', '10']`. For an already-parsed ordinary object, the original JSON text order is unrecoverable.

References:

- `packages/json-frame/src/parse/parse.ts:304-320`
- `packages/json-frame/src/parse/parse.ts:354-405`
- `packages/json-frame/src/parse/parse.ts:837-855`
- `packages/json-frame/README.md:265-274`
- `packages/json-frame/test/parse/parse.test.ts:104-149`
- `docs/tasks/20260814-170611-json-frame-package.md:296-304`

Implementation requirements:

1. Generate pandas fixtures from a deliberately non-ascending integer index for both `index` and `columns`; include the equivalent `split`/`table` controls.
2. Add tests for raw JSON string input and already-parsed object input. Do not use object literals alone to claim textual order preservation.
3. Apply `D1` consistently. The recommended minimal contract is to document that object-key orients follow JavaScript property enumeration for integer-like keys and recommend `split` or `table` when exact row order matters.
4. If exact order for raw strings is selected instead, use a narrowly scoped, well-tested order-preserving parser/tokenizer for the relevant object-key structure; parsed-object input must still document its unavoidable limitation. Reject malformed JSON with `JsonFrameParseError` and do not duplicate the full orient validator.
5. Remove or qualify unconditional README claims that all label-bearing orients preserve row order.
6. Record the external behavior clarification in release notes.

Acceptance criteria:

- Tests demonstrate the behavior of raw and parsed `index`/`columns` payloads with textual key order `"10"`, then `"2"`.
- `split` and `table` controls preserve `[10, 2]` exactly.
- README and declarations make no stronger ordering guarantee than runtime can provide.
- No proposed fix relies on replacing `Object.keys()` with another ordinary-object enumeration API.
- `pnpm --filter @web-ts-toolkit/json-frame test` passes.

### Task JFH-02: Preserve Raw Pandas Fixture Bytes

Status: pending

Priority: P2

Suggested agent: Python fixture and interoperability specialist

Dependencies: JFH-01

Primary ownership:

- `packages/json-frame/test/fixtures/generate.py`
- `packages/json-frame/test/fixtures/README.md`
- `packages/json-frame/test/fixtures/generated/**`
- `packages/json-frame/test/fixtures/manifest.json`

Finding:

The generator calls pandas `to_json()`, immediately parses the string with `json.loads()`, and writes a new string with `json.dumps()`. The fixture README nevertheless says each committed file is produced verbatim by pandas. Numeric formatting, escaping, key order, and future serializer differences can be normalized away before parser tests see them.

References:

- `packages/json-frame/test/fixtures/generate.py:9-17`
- `packages/json-frame/test/fixtures/generate.py:105-110`
- `packages/json-frame/test/fixtures/generate.py:146-153`
- `packages/json-frame/test/fixtures/README.md:3-18`

Implementation requirements:

1. Preserve the exact string returned by `DataFrame.to_json()` for JSON fixtures, adding only a documented final newline if that remains repository policy.
2. Keep semantic parsing separate from fixture writing when the generator needs to inspect values.
3. Add serialization-sensitive fixture values: non-ASCII text, escaped control/quote characters, exponent notation or very small/large finite floats, negative zero where pandas preserves it, and configured precision boundaries.
4. Add a generator self-check that compares committed payload bytes with direct pandas return values in the pinned environment.
5. Update fixture documentation and manifest notes to describe byte-level versus semantic guarantees precisely.

Acceptance criteria:

- Every generated JSON fixture body, excluding only an explicitly documented trailing newline, equals the direct pandas `to_json()` return value.
- Re-running the generator in the pinned environment is byte-stable.
- Serialization-sensitive fixtures are parsed by the package and preserve the expected JSON values.
- No Python parse/reserialize step sits between pandas and committed fixture bytes.

## Wave 2: Resource Safety And Export Invariants

### Task JFH-03: Bound JSON Traversal And Error Diagnostics

Status: pending

Priority: P1

Suggested agent: defensive parsing and resource-safety specialist

Dependencies: none

Primary ownership:

- `packages/json-frame/src/parse/parse.ts`
- `packages/json-frame/src/errors.ts`
- `packages/json-frame/src/export/payload.ts`
- focused parser/export/error tests
- README resource-limit and error-contract documentation

Finding:

`validateJsonCompatible()` and `cloneJsonValue()` recurse once per nested array/object level. Deep input escapes as a native stack-overflow `RangeError`, bypassing the structured error contract. In addition, `JsonFrameError` stores `context.value` directly and multiple parser branches attach complete rows, arrays, objects, or cyclic roots, so retaining one error can retain the caller's full payload. The existing test describes non-retention only "by convention" and tests a scalar.

References:

- `packages/json-frame/src/parse/parse.ts:137-199`
- `packages/json-frame/src/parse/parse.ts:159-173`
- `packages/json-frame/src/parse/parse.ts:187-199`
- `packages/json-frame/src/export/payload.ts:22-37`
- `packages/json-frame/src/errors.ts:3-30`
- `packages/json-frame/test/parse/parse.test.ts:566-595`
- `packages/json-frame/test/options-and-errors.test.ts:81-99`

Implementation requirements:

1. Replace recursive compatibility validation with an iterative traversal, or enforce one documented maximum depth that fails as `JsonFrameValidationError` before the JavaScript stack is exhausted.
2. Apply the same traversal/depth policy to Table Schema metadata cloning and other recursive clone paths. Define how `toJSONString()` reports a nested-value serialization depth failure rather than leaking an undocumented native error.
3. Preserve path-aware diagnostics and cycle/sparse-array detection without quadratic path construction for normal inputs.
4. Introduce a bounded diagnostic-value policy. Scalar offending values may be retained; arrays/objects/functions and cyclic values must be represented by a small immutable summary rather than a caller-owned object reference.
5. Keep error objects safely inspectable and serializable. Do not invoke user-defined serialization hooks while constructing diagnostics.
6. Document any numeric maximum depth as public behavior and test its exact boundary.
7. Do not impose arbitrary row/column count limits without a separate documented API contract; this task concerns traversal stack safety and retained diagnostics.

Acceptance criteria:

- Deep programmatic cells and deep JSON-string cells either parse within the supported depth or fail with a path-bearing `JsonFrameValidationError`, never a native stack-overflow `RangeError` from package traversal.
- Deep Table Schema metadata and `toTable()`/`toJSONString('table')` follow the same documented policy.
- Cycle, sparse-array, malformed-row, and auto-detection errors do not retain the input root or a large caller-owned container through `error.value`.
- Diagnostic summaries have a documented bounded shape and are immutable.
- Existing paths and scalar diagnostics remain useful.
- Focused tests and `pnpm --filter @web-ts-toolkit/json-frame test` pass.

### Task JFH-04: Enforce Table Primary-Key Uniqueness

Status: pending

Priority: P0

Suggested agent: Table Schema interoperability specialist

Dependencies: JFH-03

Primary ownership:

- `packages/json-frame/src/parse/parse.ts`
- `packages/json-frame/src/export/payload.ts`
- `packages/json-frame/src/errors.ts` only if a dedicated structured error is justified
- `packages/json-frame/test/parse/parse.test.ts`
- `packages/json-frame/test/export/export.test.ts`
- table contract documentation

Finding:

Table ingestion validates primary-key shape but not value uniqueness. `toTable()` then promotes every source index to a declared one-column primary key without checking duplicates. A split frame with index `['same', 'same']` currently exports a schema declaring `primaryKey: ['index']` and two rows with the same key.

References:

- `packages/json-frame/src/parse/parse.ts:696-727`
- `packages/json-frame/src/parse/parse.ts:765-833`
- `packages/json-frame/src/export/payload.ts:293-339`
- `packages/json-frame/test/export/export.test.ts:146-163`
- `docs/tasks/20260814-170611-json-frame-package.md:286-292`

Implementation requirements:

1. Define primary-key equality explicitly for the supported scalar labels. Recommended: use JavaScript `Map`/SameValueZero identity so numeric `1` and string `'1'` remain distinct in table output, matching JSON value types.
2. Reject duplicate primary-key values while parsing `table` payloads before constructing frame state.
3. Reject `toTable()` when a source index contains duplicate labels. Do not silently omit `primaryKey`, drop rows, or rename values.
4. Return a structured package error identifying the duplicate label and later row position without retaining the complete table.
5. Preserve duplicate indexes for orients where pandas permits them; this is a table-boundary invariant, not a global index uniqueness requirement.
6. Verify emitted tables with pandas `read_json(..., orient='table')` in the pinned fixture environment.

Acceptance criteria:

- Duplicate table primary-key input fails deterministically with a structured error.
- Split-origin duplicate indexes remain usable until `toTable()` and fail there without partial output.
- Numeric `1` and string `'1'` behavior is tested and documented separately from object-key exporter stringification collisions.
- Unique source indexes still round-trip through pandas table input/output.
- Focused tests and `pnpm --filter @web-ts-toolkit/json-frame test` pass.

## Wave 3: Public API Safety And Type Reuse

### Task JFH-05: Make Exported Payloads And Domain Rows Valid Inputs

Status: pending

Priority: P1

Suggested agent: TypeScript public-API and declaration specialist

Dependencies: JFH-01, JFH-04

Primary ownership:

- `packages/json-frame/src/types.ts`
- `packages/json-frame/src/api.ts`
- `packages/json-frame/src/index.ts` only if exports change
- `packages/json-frame/test-decl-consumer/**`
- `packages/json-frame/test/packed-consumer.test.ts`
- README type examples

Finding:

`fromOrient()` accepts `JsonValue`, but exported `SplitPayload` and `TablePayload` interfaces do not carry the `JsonObject` index signature and are not reliably assignable back to that input. Public row generics use `TRow extends Record<string, JsonValue>`, which rejects common interface-based domain rows without an explicit string index signature. `JsonMetadata` additionally permits explicit `undefined`, although runtime JSON validation rejects it. Existing declaration tests use a type alias and never pass typed exporter results back into `fromOrient()`.

References:

- `packages/json-frame/src/types.ts:5-13`
- `packages/json-frame/src/types.ts:43-98`
- `packages/json-frame/src/types.ts:145-172`
- `packages/json-frame/src/api.ts:16-30`
- `packages/json-frame/test-decl-consumer/decl-consumer.strict.mts:12-15`
- `packages/json-frame/test-decl-consumer/decl-consumer.strict.mts:82-86`
- `packages/json-frame/dist/index.d.ts:29-65`
- `packages/json-frame/dist/index.d.ts:136-140`

Implementation requirements:

1. Add orient-specific overloads or adjust payload types so `SplitPayload` and `TablePayload` returned by exporters can be passed directly to `fromOrient()` with the matching explicit orient.
2. Redesign the public row generic constraint so a normal interface with known JSON-compatible properties is accepted without requiring a catch-all index signature.
3. Preserve negative type checking: rows with known function, symbol, bigint, `Date`, or other non-JSON properties must not become accepted merely to support interfaces.
4. Remove explicit `undefined` from arbitrary Table Schema metadata values. Optional named properties may still model absence.
5. Keep runtime validation authoritative and preserve the documentation that supplying `TRow` does not validate row schemas at runtime.
6. Add strict NodeNext, Bundler, CJS, and browser declaration-consumer cases for payload round trips and interface rows.
7. Consider literal-aware `select<K>() => DataFrame<Pick<TRow, K>>` as a P3 improvement only if it does not complicate the core constraint fix. Keep `rename()` conservatively typed unless robust mapped-type tests are added.

Acceptance criteria:

- `fromOrient(frame.toSplit(), { orient: 'split' })` and `fromOrient(frame.toTable(), { orient: 'table' })` compile without casts in every declaration-consumer mode.
- A normal `interface WeatherRow { city: string; temp: number | null }` works as the row generic.
- Compile-negative tests reject known non-JSON row properties and explicit `undefined` in arbitrary schema metadata.
- Emitted `.d.ts` and `.d.mts` expose the same API and contain no `any` introduced by this task.
- `pnpm --filter @web-ts-toolkit/json-frame test` and `pnpm --filter @web-ts-toolkit/json-frame test:packed-consumer` pass.

### Task JFH-06: Validate Transform Arguments At Runtime

Status: pending

Priority: P2

Suggested agent: JavaScript API robustness specialist

Dependencies: JFH-03

Primary ownership:

- `packages/json-frame/src/frame/DataFrame.ts`
- focused transform tests
- public error documentation if behavior changes

Finding:

`rename()` reads from `mapping` and installs mapped values without runtime shape/type validation. JavaScript consumers, `any`, or boundary data can pass `null`, arrays, or non-string values and trigger native failures or create a frame whose columns and `Map` keys violate the public string-label invariant.

References:

- `packages/json-frame/src/frame/DataFrame.ts:241-267`
- `packages/json-frame/src/frame/DataFrame.ts:301-309`
- `packages/json-frame/src/frame/DataFrame.ts:389-405`
- `packages/json-frame/test/frame/DataFrame.test.ts:109-124`

Implementation requirements:

1. Validate that `rename()` receives a non-null, non-array object before reading it.
2. Validate every applied mapping value as a string before collision detection or schema rewriting. Continue ignoring unknown mapping keys as documented.
3. Throw a structured package error with the offending key/path and a bounded diagnostic value.
4. Verify null-prototype mappings and prototype-sensitive column names without reading inherited properties.
5. Audit `filter()` and `sort()` only for similarly uncontrolled argument-shape failures. Add explicit callable checks if the package intends all public misuse to use structured errors; do not broaden this task into callback-result policy changes.

Acceptance criteria:

- `rename(null)`, arrays, and mappings to numbers, `null`, objects, or `undefined` fail before frame/schema reconstruction with a structured package error.
- Failed transforms leave the source frame observably unchanged.
- Null-prototype mappings and `__proto__`/`constructor`/`prototype` columns work as ordinary own keys.
- Valid rename behavior and collision handling remain unchanged.
- Focused tests and `pnpm --filter @web-ts-toolkit/json-frame test` pass.

## Wave 4: Measured Performance And Metadata Integrity

### Task JFH-07: Remove Whole-Frame Copies From Row Access And Rebuilds

Status: pending

Priority: P2

Suggested agent: TypeScript data-layout and benchmarking specialist

Dependencies: JFH-04, JFH-06

Primary ownership:

- `packages/json-frame/src/frame/column.ts`
- `packages/json-frame/src/frame/DataFrame.ts`
- focused performance tests or a package-local benchmark harness
- no public API changes unless separately approved

Finding:

`row(position)` calls `materializeFrameData()` and copies every cell before returning one row. `filter()` and `sort()` materialize all columns for callbacks, then `#rebuild()` materializes the source again, allocates selected arrays, scans them again for inference, and may allocate packed arrays. Typed columns amplify this allocation because each materialization calls `Array.from()`.

References:

- `packages/json-frame/src/frame/column.ts:198-220`
- `packages/json-frame/src/frame/column.ts:222-247`
- `packages/json-frame/src/frame/DataFrame.ts:147-204`
- `packages/json-frame/src/frame/DataFrame.ts:287-356`

Implementation requirements:

1. Add a reproducible benchmark or instrumentation baseline for tall and wide packed/unpacked frames covering `row`, `rows`, `filter`, `sort`, and `select`.
2. Add a scalar stored-column accessor so `row(i)` is O(column count) and allocates only the returned row container.
3. Reuse already-materialized data during `filter()`/`sort()` rebuilds, or rebuild selected positions directly from stored columns. Do not materialize the same full source frame twice.
4. Preserve existing `ColumnInfo` through value-preserving transforms rather than rescanning unchanged logical types; recompute only properties that can change, such as nullability after filtering, if the public contract requires it.
5. Keep repacking thresholds and values unchanged. Do not add lazy permutations or caching without separate benchmark evidence and an invalidation model.
6. Prefer allocation-count/complexity assertions or stable operation counters over brittle wall-clock thresholds in unit tests.

Acceptance criteria:

- A regression test or instrumentation proves `row(0)` does not clone columns proportional to row count.
- `filter()` and `sort()` do not perform two complete source-column materializations.
- Benchmarks record before/after time and allocation-relevant evidence for representative packed and unpacked frames.
- All transform alignment, schema, immutability, packing, and exporter tests remain green.
- `pnpm --filter @web-ts-toolkit/json-frame test` passes.

### Task JFH-08: Validate Explicit Logical Types Against Cells

Status: pending

Priority: P2

Suggested agent: schema and data-model integrity specialist

Dependencies: JFH-04, maintainer decision `D2`

Primary ownership:

- `packages/json-frame/src/frame/column.ts`
- `packages/json-frame/src/export/payload.ts`
- focused column/export tests
- README logical-type contract

Finding:

`options.columnTypes` is accepted as authoritative after validating only column names and enum values. Callers can label strings as `integer` or numeric epochs as `datetime`; `toTable()` then emits schema fields that can disagree with actual cells. The intended meaning of overrides is not explicit enough to determine whether this should be validation, encoding metadata, or caller responsibility.

References:

- `packages/json-frame/src/options.ts:93-119`
- `packages/json-frame/src/frame/column.ts:161-179`
- `packages/json-frame/src/frame/column.ts:241-246`
- `packages/json-frame/src/export/payload.ts:74-105`
- `packages/json-frame/README.md:251-264`

Implementation requirements:

1. Record `D2` before changing behavior: strict cell compatibility validation is recommended for `integer`, `float`, `string`, and `boolean`; datetime/categorical semantics require an explicit encoding contract.
2. Test pandas read-back behavior for epoch-number and ISO-string datetime cells under emitted Table Schema.
3. If validating, centralize compatibility rules and return path/column/row-aware structured errors before packing or export.
4. If retaining caller-responsibility semantics for some types, state this explicitly in JSDoc and README and prevent docs from claiming that generated schema is validated against values.
5. Do not coerce cell values silently.

Acceptance criteria:

- Every `ColumnType` has tests for compatible, nullable, and incompatible representative cells.
- The documented datetime and categorical policy matches `toTable()` output and pandas read-back evidence.
- No explicit type silently changes a cell value.
- Incompatible values either fail at the documented boundary or are clearly documented as caller responsibility under `D2`.
- Focused tests and `pnpm --filter @web-ts-toolkit/json-frame test` pass.

## Wave 5: Published Contract And Integration

### Task JFH-09: Align JSDoc, README, Homepage, And Immutability Claims

Status: pending

Priority: P2

Suggested agent: AI-friendly TypeScript package documentation specialist

Dependencies: JFH-01 through JFH-08

Primary ownership:

- `packages/json-frame/src/api.ts`
- `packages/json-frame/src/types.ts`
- `packages/json-frame/README.md`
- `packages/json-frame/package.json`
- `website/docs/packages/json-frame.md` only if the homepage remains unchanged
- declaration/documentation assertions

Finding:

Published `fromOrient()` JSDoc says every `values` payload requires explicit orientation, while runtime and README auto-detect non-empty arrays of arrays. README's statement that exporters always return fresh JSON-compatible containers does not explain that nested cell objects are shared under the shallow immutability contract. Its table example labels `pandas_version` as `3.0.3`, while pandas-generated fixtures use `1.4.0`; the field is the Table Schema format version, not the installed pandas package version. Finally, `package.json` points to a website page absent from this repository.

References:

- `packages/json-frame/src/api.ts:7-14`
- `packages/json-frame/dist/index.d.ts:127-140`
- `packages/json-frame/README.md:83-94`
- `packages/json-frame/README.md:108-125`
- `packages/json-frame/README.md:227-235`
- `packages/json-frame/README.md:287-302`
- `packages/json-frame/test/fixtures/generated/allSixStringIndex-table.json:1`
- `packages/json-frame/package.json:4`

Implementation requirements:

1. Correct JSDoc to state that non-empty values are auto-detected but still require `options.columns`; empty values require explicit orientation and columns.
2. Explain structural/shallow detachment precisely: frame-owned arrays, records, and maps are protected, but nested JSON cell objects/arrays may retain identity and remain caller-mutable.
3. Correct the `pandas_version` example to the schema version represented by pandas output and explain the field if retained.
4. Either add a maintained website page matching the shipped README/API or change the homepage to an existing durable URL. Do not leave a known dead documentation target for publication.
5. Ensure the README covers decisions `D1` and `D2`, primary-key uniqueness, depth/diagnostic policy, and any public type changes.
6. Verify high-value JSDoc survives in both declaration formats and examples compile against packed declarations.

Acceptance criteria:

- README, source JSDoc, `.d.ts`, `.d.mts`, and runtime behavior agree on auto-detection and required values options.
- Documentation distinguishes fresh structural containers from shared nested values with a concrete mutation example or explicit warning.
- The Table Schema example uses semantically correct metadata.
- The package homepage resolves to maintained documentation present in the repository or another verified target.
- Packed README examples and all declaration-consumer checks pass.

### Task JFH-10: Perform Independent Integration And Artifact Review

Status: pending

Priority: P0

Suggested agent: independent reviewer who did not implement JFH-03 through JFH-08

Dependencies: JFH-01 through JFH-09

Primary ownership:

- whole `packages/json-frame/` package
- relevant release notes and website page
- completion evidence in this task file

Finding:

The remediation changes parser limits, error diagnostics, table validity, public declarations, transform internals, fixtures, and documentation. Final review must validate the combined runtime and installed-consumer contract rather than infer completion from focused tests.

References:

- `AGENTS.md`
- `packages/json-frame/package.json:17-48`
- `packages/json-frame/test/packed-consumer.test.ts`
- `packages/json-frame/test-decl-consumer/**`

Implementation requirements:

1. Review every completed task against its acceptance criteria and inspect runtime behavior, not only source shape.
2. Verify alternate orient paths, object-key ordering semantics, primary-key uniqueness, prototype-sensitive labels, nested-input bounds, bounded diagnostics, shallow immutability, and packed/unpacked parity.
3. Verify public source types, emitted declarations, README, website, package metadata, CJS, and ESM agree.
4. Verify no internal parser, constructor, mutable state, Node-only dependency, or unintended file crosses the package boundary.
5. Run package checks first, then full-repository checks serially because tests rebuild shared outputs.
6. Record skipped environmental checks as blockers with exact reasons. Do not mark complete based only on code review.

Acceptance criteria:

- Every non-deferred acceptance criterion has direct completion evidence.
- No request-controlled recursive path escapes as a native stack overflow within the documented supported depth.
- Table exports never claim a duplicate primary key.
- Exported payloads round-trip through strict installed-consumer declarations without casts.
- CJS, ESM, NodeNext, Bundler, browser-Bundler, packed runtime, and pandas interoperability checks pass.
- No runtime dependency or unintended package entrypoint is introduced.
- Full repository build, test, and lint pass without changing serialized test orchestration.

Verification:

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @web-ts-toolkit/json-frame build`
3. `pnpm --filter @web-ts-toolkit/json-frame test`
4. `pnpm --filter @web-ts-toolkit/json-frame test:packed-consumer`
5. `npm pack --dry-run --json` from `packages/json-frame/`
6. Regenerate and byte-compare pandas fixtures in the pinned Python environment
7. Run pandas table read-back checks for unique and duplicate primary-key cases
8. `pnpm lint`
9. `pnpm build`
10. `pnpm test`

## Dependencies And Parallelization

Recommended sequence:

```text
D1 -> JFH-01 -> JFH-02 -----------┐
                                  ├-> JFH-05 ---------------------┐
JFH-03 -> JFH-04 -----------------┤                              |
   |                              └-> JFH-07                      |
   └-> JFH-06                                                    ├-> JFH-09 -> JFH-10
D2 -> JFH-08 ----------------------------------------------------|
```

- JFH-01 and JFH-03 may run in parallel; their primary files overlap only if `D1` selects a custom parser. If so, complete JFH-01 before JFH-03.
- JFH-02 follows JFH-01 because both own fixture generation and the new numeric-index fixture.
- JFH-04 follows JFH-03 so duplicate-key diagnostics use the bounded error policy.
- JFH-05 waits for ordering and primary-key contracts because its round-trip declaration tests should encode final behavior.
- JFH-06 can follow JFH-03 in parallel with JFH-04 because it primarily owns `DataFrame.ts`, but coordinate structured-error helpers.
- JFH-07 follows correctness work touching parser/export/frame behavior and owns the main `DataFrame.ts` performance refactor.
- JFH-08 can run independently after `D2`, but must coordinate tests in `column.ts`/export paths with JFH-04 and JFH-07.
- JFH-09 is the single documentation convergence task after public behavior stabilizes.
- JFH-10 is strictly last and must be assigned independently.
- Agents must not run build/test commands concurrently when they can write `packages/json-frame/dist/`.

Shared hotspots:

- `src/parse/parse.ts`: JFH-01, JFH-03, and JFH-04; sequence any custom-parser decision before traversal and table validation changes.
- `src/errors.ts`: JFH-03 owns the bounded diagnostic contract; later tasks reuse it rather than inventing variants.
- `src/frame/DataFrame.ts`: JFH-06 validates transform arguments before JFH-07 refactors access/rebuild paths.
- `src/export/payload.ts`: JFH-03 owns recursive cloning safety, JFH-04 primary-key checks, and JFH-08 logical-type/schema compatibility.
- `src/types.ts` and declaration consumers: JFH-05 owns public typing; JFH-09 changes prose/JSDoc only after those types stabilize.
- fixtures: JFH-01 adds the ordering case; JFH-02 then changes byte-preservation mechanics and regenerates the complete set.

## Deferred Decisions Requiring Maintainer Input

### D1: Integer-Like Object-Key Ordering Contract

Recommended: explicitly document JavaScript enumeration order for `index`/`columns` object-key payloads and recommend `split`/`table` whenever exact integer-index order matters. This is small, honest, and applies consistently to JSON strings and parsed objects.

Alternative: preserve textual key order for raw JSON strings with a custom parser while documenting that parsed objects cannot recover it. This adds parser complexity, security surface, and divergent behavior between the two accepted input forms.

JFH-01 is blocked until this choice is recorded.

### D2: Meaning Of `columnTypes`

Recommended: validate scalar logical types against actual non-null cells, define accepted datetime encodings explicitly, and keep categorical values scalar with optional metadata. Never coerce values.

Alternative: retain `columnTypes` as unchecked caller assertions and document that `toTable()` may emit schema metadata not validated against cells.

JFH-08 is blocked until this choice is recorded. Other tasks can proceed.

## Definition Of Done

- JFH-01 through JFH-10 are `completed`, or an item is explicitly `deferred` with maintainer rationale and residual risk.
- Integer-like object-key ordering behavior is backed by pandas fixtures, raw-string tests, parsed-object tests, and accurate documentation.
- Recursive package traversal is stack-safe within a documented policy and errors retain only bounded diagnostics.
- Duplicate primary keys are rejected at table ingestion/export boundaries without globally prohibiting duplicate indexes.
- Exported payloads and ordinary interface-based row models work through installed strict declarations without unsafe casts.
- Runtime transform validation prevents malformed JavaScript inputs from corrupting frame invariants.
- `row()` no longer performs work proportional to total cell count, and transform-copy reductions have reproducible evidence.
- Explicit logical-type behavior is tested and documented for compatible and incompatible values.
- Raw pandas fixtures, package README, JSDoc, declarations, metadata, and website target agree.
- Package tests, packed consumers, pandas interoperability, `npm pack --dry-run`, repository lint, repository build, and serialized repository tests pass.
- An independent reviewer signs off JFH-10.

## Completion Evidence Template

Append this block only after implementation and required verification pass:

```markdown
Completion evidence:

- Changed: `paths`
- Verified: `exact commands`
- Result: `observable tests/artifacts`
- Follow-up: `task ID or none`
```
