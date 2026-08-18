# JSON Frame Adapter: `@web-ts-toolkit/json-frame`

Created: 2026-08-14 17:06:11 PDT

Revised: 2026-08-18 13:13:56 PDT

Overall status: completed

Target package: `packages/json-frame/` (new)

## Objective

Create a zero-runtime-dependency, isomorphic TypeScript package named
`@web-ts-toolkit/json-frame` that:

- accepts a JSON string or parsed JSON value produced by pandas
  `DataFrame.to_json()`;
- ingests all six pandas DataFrame orients: `records`, `index`, `columns`,
  `values`, `split`, and `table`;
- normalizes supported inputs into one immutable, column-major `DataFrame`
  representation;
- provides predictable row access, filtering, stable sorting, column
  selection, column renaming, and index reset operations;
- exports normalized data to each of the six pandas orient shapes; and
- publishes CJS, ESM, and TypeScript declarations that work from an installed
  package under NodeNext and Bundler module resolution.

The package adapts pandas JSON wire shapes. It is not intended to reproduce
the complete pandas DataFrame type system or computation API.

## Confirmed Baseline

Baseline reviewed on 2026-08-18:

- `packages/json-frame/` does not exist.
- `tsconfig.base.json` has no `@web-ts-toolkit/json-frame` aliases.
- `pnpm-lock.yaml` already contains an empty `packages/json-frame` importer,
  but that does not mean the package is implemented.
- `pnpm-workspace.yaml` no longer contains the stale `patchedDependencies`
  entry described by the previous revision of this task.
- `pnpm install --frozen-lockfile` succeeds: 24 workspace projects, already up
  to date, pnpm 11.18.0.
- The worktree was clean when this revision began.
- The root commands are `pnpm build`, `pnpm test`, and `pnpm lint`.
- Root `pnpm test` deliberately runs workspace package tests serially because
  package test scripts rebuild shared `dist/` outputs.

There is no current environment blocker. If a future baseline command fails,
record the failure on the affected task rather than restoring the obsolete
patch workaround.

## Authoritative References

- `AGENTS.md`
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `vitest.config.ts`
- `packages/utils/package.json`
- `packages/express-response-handler/tsup.config.ts`
- `packages/access-router-client/test-decl-consumer/`
- `.opencode/skills/ai-friendly-ts-package/SKILL.md`
- pandas `DataFrame.to_json` documentation:
  <https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.to_json.html>
- pandas Table Schema documentation:
  <https://pandas.pydata.org/docs/user_guide/io.html#table-schema>

The committed fixtures required by JFRAME-00 are the executable compatibility
reference. When pandas documentation and a fixture disagree, first verify the
fixture generator and pinned pandas version; do not silently adjust a parser
to hand-authored test data.

## Working Rules

- Build from tracked TypeScript source. Never edit generated `dist/` files or
  ignored `src/**/*.js` files manually.
- Preserve unrelated worktree changes. Never revert another agent's work.
- Keep runtime `dependencies` and `peerDependencies` absent unless a later,
  separately approved contract requires one.
- Keep source isomorphic. Do not use DOM APIs, Node built-ins, `Buffer`,
  `process`, or environment-specific globals in `src/`.
- Use `tsup` with `bundle: true`. Published ESM must not retain extensionless
  internal imports that plain Node ESM cannot resolve.
- Use own-property-safe storage for user-controlled column and index names.
  `__proto__`, `constructor`, and `prototype` must behave as ordinary labels.
- Treat public immutability as structural and shallow. Clone input arrays and
  records at ingestion and never expose mutable internal containers. Nested
  JSON object values may retain identity and are not deep-frozen.
- Add focused tests with the implementation task that introduces behavior.
  JFRAME-08 fills integration and installed-consumer gaps; it is not a reason
  to defer all testing until the end.
- Do not run package tests/builds concurrently when they can write the same
  `dist/` output. Root `pnpm test` must remain serialized.
- Update task status before beginning work and append completion evidence only
  after the task's verification passes.

## Non-Goals

- React, Vue, Svelte, grid, chart, query, or transport integrations
- Danfo.js, Arquero, Arrow, or other optional compute adapters
- JSON Lines (`lines=True`), compressed streams, file I/O, or incremental JSON
  parsing
- pandas Series JSON formats
- arbitrary pandas extension dtype reconstruction
- MultiIndex or duplicate column labels in the initial release
- non-string column labels in the initial release
- byte-for-byte preservation of pandas JSON formatting, field ordering,
  floating-point formatting, or complete Table Schema metadata
- in-place mutation, deep freezing, Web Workers, or streaming transforms
- an app under `apps/`, website documentation, or `llms.txt`

## Locked Public Contracts

These contracts replace contradictory assumptions in the previous task
revision. A change to one of them requires a task-file update before dependent
implementation proceeds.

### Inputs And Detection

- `fromOrient(input, options)` accepts either a JSON string or a parsed JSON
  value. Invalid JSON strings throw `JsonFrameParseError` with the original
  `SyntaxError` available as `cause`.
- `options.orient` defaults to `auto`.
- `auto` detects only structurally unambiguous shapes:
  `table`, `split`, non-empty `values`, and non-empty `records`.
- Real pandas `index` and `columns` payloads are both nested objects and cannot
  be distinguished reliably from structure alone. `auto` throws
  `AmbiguousOrientError` with candidates `['index', 'columns']`; callers must
  pass an explicit orient.
- An empty array is ambiguous between `records` and `values`; `auto` throws an
  ambiguity error. Explicit empty `records` is allowed. Explicit empty
  `values` requires `options.columns`.
- An empty object is ambiguous between `index` and `columns`; `auto` throws.
- Explicit `values` always requires `options.columns`, including for empty
  input.
- The accepted parsed input domain is JSON-compatible values only. Reject
  `undefined`, functions, symbols, bigint, `Date`, cyclic objects, sparse
  arrays, and programmatic `NaN` or infinities with a path-bearing validation
  error. pandas itself serializes missing and non-finite values as JSON `null`.

### Correct Pandas Wire Shapes

```ts
type RecordsPayload = Array<Record<string, JsonValue>>;

type IndexPayload = Record<string, Record<string, JsonValue>>;

type ColumnsPayload = Record<string, Record<string, JsonValue>>;

type ValuesPayload = JsonValue[][];

interface SplitPayload {
  columns: string[];
  index: Array<string | number>;
  data: JsonValue[][];
}

interface TablePayload {
  schema: {
    fields: TableSchemaField[];
    primaryKey?: string[];
    pandas_version?: string;
    [key: string]: JsonValue | undefined;
  };
  data: Array<Record<string, JsonValue>>;
}
```

Unlike an earlier draft, pandas `orient='columns'` is not an object of arrays.
It is `{ column: { index: value } }`.

### Supported Labels And Index Provenance

- Public columns are unique strings.
- Public index labels are scalar strings or finite numbers.
- `records` and `values` do not carry index labels. Ingestion assigns a
  synthetic numeric index `0..n-1` and records that provenance.
- `index` and `columns` use JSON object keys, so their index labels are strings
  after parsing. Do not guess that a key such as `"1"` was originally numeric.
- `split` preserves scalar string/number index labels.
- `table` supports zero or one primary-key field. Zero means a synthetic
  numeric index. More than one primary-key field is a MultiIndex and must fail
  with a controlled unsupported-feature error.
- A non-string, duplicate, or MultiIndex column label is outside initial
  scope and must fail clearly where the orient can represent it.
- Filtering and sorting preserve source index labels. `resetIndex()` is the
  only transform that replaces them with `0..n-1` and marks the new index as
  synthetic.

### Canonical Frame And Immutability

The implementation may use private fields, `Map`, or null-prototype objects,
but it must represent this information:

```ts
type StoredColumn = readonly JsonValue[] | Int32Array | Float64Array;

interface ColumnInfo {
  type: ColumnType;
  nullable: boolean;
}

interface FrameState {
  columns: readonly string[];
  index: readonly (string | number)[];
  indexKind: 'source' | 'synthetic';
  data: ReadonlyMap<string, StoredColumn>;
  columnInfo: ReadonlyMap<string, ColumnInfo>;
  tableSchema?: TableSchema;
}
```

Do not add a sort-permutation overlay in the initial release. Transforms may
materialize new columns. This is simpler, makes index ordering explicit, and
avoids an unproven optimization becoming part of the correctness model.

Every transform returns a new `DataFrame`; no transform mutates its receiver.
`columns` and `index` accessors return readonly snapshots or defensive copies.

### Type Inference, Dates, Nulls, And Packing

- JSON values are preserved. There is no broad coercion pass and no heuristic
  conversion of ISO-looking strings to `Date`.
- Table Schema metadata is authoritative when present. For other orients,
  infer the narrowest logical type by scanning the complete column.
- `options.columnTypes` may provide explicit logical types when an orient does
  not carry schema, including epoch or ISO datetime columns.
- `ColumnType` is `integer | float | string | boolean | datetime |
categorical | mixed | unknown`.
- `null` affects `ColumnInfo.nullable`; it does not turn an otherwise numeric
  logical type into `mixed`.
- A value outside the signed INT32 range remains logical type `integer`; it
  merely prevents `Int32Array` storage.
- `packThreshold` defaults to `256`. It must be a finite non-negative integer.
  `0` disables packing.
- A non-null integer column of at least the threshold, with every value in the
  signed INT32 range, may use `Int32Array`.
- A non-null float column of at least the threshold may use `Float64Array`.
- Nullable, mixed, string, boolean, datetime, categorical, unknown, short, or
  out-of-range columns remain ordinary arrays.
- Packing is an internal physical representation and must never change
  exported values or logical type metadata.

Table Schema categorical fields are represented by normal scalar cells plus
schema metadata such as `constraints.enum` and `ordered`; pandas does not emit
`{ value, category }` objects for each categorical cell.

### Transform Behavior

- `row(i)` reads display order and throws `RangeError` unless `i` is an integer
  in `[0, length)`.
- `rows()` returns new row records.
- `filter(predicate)` calls the predicate in current row order and preserves
  surviving index labels.
- `sort(compare)` is stable. Ties preserve prior row order. It materializes
  data and index in sorted order.
- `select(...columns)` preserves requested order and rejects unknown or
  duplicate selections.
- `rename(mapping)` ignores mapping keys that are not current columns and
  rejects any result that would create duplicate columns. It updates retained
  Table Schema field names and primary-key references where applicable.
- `resetIndex()` preserves current row order and creates `0..n-1`.

### Export And Round-Trip Semantics

`DataFrame` exposes all six parsed-payload exporters:

- `toRecords()`
- `toIndex()`
- `toColumns()`
- `toValues()`
- `toSplit()`
- `toTable()`

It also exposes `toJSONString(orient, options?)`. Do not implement a public
`toJSON()` in the initial release because implicit `JSON.stringify(frame)`
would otherwise have an unclear orient.

Export rules:

- `toRecords()` and `toValues()` omit the index because those pandas orients
  do not carry it. Do not invent a synthetic `_index` column.
- `toIndex()` and `toColumns()` stringify index labels as JSON object keys and
  throw if distinct labels would collide after stringification.
- `toSplit()` preserves current columns and scalar index labels.
- `toTable()` emits valid Table Schema. It preserves supported source table
  field metadata where possible and deterministically reconstructs required
  fields after transforms or non-table ingestion. It excludes the primary-key
  field from DataFrame data columns. A synthetic index is omitted from table
  output. A source index uses its retained table primary-key name when one
  exists, otherwise `"index"`; if that name collides with a data column,
  `toTable()` throws unless the caller supplies a unique `indexField` option.
- `toJSONString()` uses `JSON.stringify` on the selected parsed exporter; it
  does not promise pandas whitespace or numeric formatting.

Round-trip equivalence is semantic, not byte-for-byte:

- column order, row order, JSON cell values, and supported source index labels
  must survive through label-bearing orients;
- label-free `records` and `values` receive synthetic indexes;
- object-key orients preserve key text, not an unknowable pre-JSON numeric key
  type; and
- Table Schema output must remain valid and preserve supported logical type
  information, but need not reproduce unknown pandas metadata exactly.

## Priorities

- P0: package cannot build or publish; valid supported pandas payloads parse
  incorrectly; values, row order, columns, or supported indexes are corrupted.
- P1: ambiguity or validation produces uncontrolled errors; transforms violate
  immutability; packing changes values; public declarations or packed imports
  fail.
- P2: diagnostics, JSDoc, README, or non-critical metadata are incomplete.
- P3: optional ergonomics or performance work outside the initial contract.

## Wave 1: Contract Fixtures And Package Boundary

### Task JFRAME-00: Commit Pandas-Generated Contract Fixtures

Status: completed

Priority: P0

Suggested agent: pandas compatibility and test-fixture specialist

Dependencies: none

Primary ownership:

- `packages/json-frame/test/fixtures/generate.py`
- `packages/json-frame/test/fixtures/generated/**`
- `packages/json-frame/test/fixtures/README.md`

Finding:

The prior task used hand-described fixtures that encoded incorrect pandas
behavior for `columns`, datetime defaults, and categorical table fields. The
package needs producer-generated evidence before parser implementation.

Implementation requirements:

1. Add a deterministic Python fixture generator and record its Python and
   pandas versions. The generator is maintainer tooling, not an npm runtime or
   CI dependency.
2. Generate all six orients from the same frame with a named string index and
   string columns.
3. Generate focused fixtures for a default RangeIndex, `index=False` where
   pandas supports it, null numeric cells, booleans, strings, integers,
   floats, default datetime encoding, ISO datetime encoding, categorical table
   schema, empty frames, and prototype-sensitive labels.
4. Add unsupported fixtures for MultiIndex and non-string columns so rejection
   behavior can be tested.
5. Store parsed `.json` payloads and a manifest containing the exact
   `to_json()` arguments. Do not normalize a fixture after pandas writes it.
6. Document regeneration without making Python or pandas a workspace install
   prerequisite.

Acceptance criteria:

- The `columns` fixture has `{column: {index: value}}` shape.
- Non-table default datetime output is epoch-form and table default datetime
  output is ISO-form, matching the recorded pandas version.
- The categorical table fixture carries schema constraints/ordering rather
  than fabricated categorical cell wrappers.
- Re-running the generator with the documented environment produces
  semantically identical JSON fixtures.

Verification:

- Run the generator in its documented Python environment.
- Review every generated orient against the fixture manifest.

Completion evidence:

- Changed: `packages/json-frame/test/fixtures/generate.py`, `packages/json-frame/test/fixtures/manifest.json`, `packages/json-frame/test/fixtures/README.md`, `packages/json-frame/test/fixtures/generated/**`
- Verified: `asdf set python 3.14.6 && python3 generate.py`; `python3 - <<'PY' ... parity check against a freshly generated temp tree ... PY`; `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm --filter @web-ts-toolkit/json-frame build`
- Result: 45 committed pandas 3.0.3 fixtures generated from Python 3.14.6, including all six orients for named-string and RangeIndex frames, `index=False` allow/deny cases, datetime epoch/ISO outputs, categorical table schema metadata, empty frames, prototype-sensitive labels, and unsupported MultiIndex/non-string-column references; temp-tree parity check matched committed fixtures byte-for-byte
- Follow-up: none

### Task JFRAME-01: Scaffold The Publishable Package

Status: completed

Priority: P0

Suggested agent: TypeScript package author

Dependencies: none

Primary ownership:

- `packages/json-frame/package.json`
- `packages/json-frame/tsconfig.json`
- `packages/json-frame/tsup.config.ts`
- `packages/json-frame/src/index.ts`
- `packages/json-frame/README.md`
- `tsconfig.base.json`
- `pnpm-lock.yaml` only if pnpm changes it

Finding:

The workspace already has a stable single-entry package pattern, but the new
package and source aliases are absent. The lockfile's empty importer is not a
substitute for a package manifest.

Implementation requirements:

1. Mirror current `packages/utils/package.json` release placeholders, files,
   dual exports, scripts, `sideEffects: false`, and Node `>=22` engine.
2. Use a named-export-only public entrypoint.
3. Omit runtime dependency and peer dependency fields when empty, matching the
   sibling convention.
4. Configure `tsup` for CJS and ESM, declarations, `clean: true`,
   `bundle: true`, `splitting: false`, and an isomorphic ES2020-or-newer target.
5. Configure strict TypeScript source checking with an ES library and without
   DOM or Node ambient types in package source.
6. Add root and wildcard aliases to `tsconfig.base.json` without reformatting
   unrelated aliases.
7. Create only a minimal compiling source entry and README placeholder; later
   tasks own the real public API and documentation.

Acceptance criteria:

- `pnpm install --frozen-lockfile` succeeds after any required lockfile update
  has been produced by a normal `pnpm install`.
- `pnpm --filter @web-ts-toolkit/json-frame build` emits CJS, ESM, `.d.ts`, and
  `.d.mts` entry artifacts.
- The ESM artifact has no unresolved internal relative module specifiers.
- `npm pack --dry-run --json` includes only `package.json`, `README.md`, and
  intended `dist/` artifacts.
- Source typechecking rejects direct use of `process`, `Buffer`, and DOM
  globals.

Verification:

- `pnpm --filter @web-ts-toolkit/json-frame build`
- `pnpm exec tsc --noEmit -p packages/json-frame/tsconfig.json`
- `npm pack --dry-run --json` from `packages/json-frame/`

Completion evidence:

- Changed: `packages/json-frame/tsconfig.json`, `tsconfig.base.json`
- Verified: `pnpm install --frozen-lockfile`; `pnpm --filter @web-ts-toolkit/json-frame build`; `pnpm exec tsc --noEmit -p packages/json-frame/tsconfig.json`; `npm pack --dry-run --json` from `packages/json-frame/`; `pnpm exec tsc --noEmit -p /tmp/opencode/json-frame-ambient-check.tsconfig.json`
- Result: confirmed the existing scaffold already matched the single-entry package pattern for manifest, exports, build script, minimal README, and empty named-export-only entrypoint; added the root and wildcard `@web-ts-toolkit/json-frame` source aliases and removed Node ambient types from package source typechecking; build emitted `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`, and `dist/index.d.mts`; the ESM entry contained no internal relative imports; `npm pack --dry-run --json` packed only `package.json`, `README.md`, and `dist/*`; the ambient-type check failed on `process`, `Buffer`, and `document` as required
- Follow-up: `JFRAME-02`

## Wave 2: Validation, Types, And Ingestion

### Task JFRAME-02: Define Public Types And Structured Errors

Status: completed

Priority: P0

Suggested agent: TypeScript public-API specialist

Dependencies: JFRAME-01

Primary ownership:

- `packages/json-frame/src/types.ts`
- `packages/json-frame/src/errors.ts`
- focused type and runtime tests

Finding:

The original plan referenced undefined errors, conflated row and cell generic
types, and used `Required<FromOrientOptions>` even though columns can remain
absent. A complete public vocabulary is required before parser delegation.

Implementation requirements:

1. Define `JsonPrimitive`, `JsonValue`, `JsonObject`, `Orient`,
   `ResolvedOrient`, payload types, `ColumnType`, `ColumnInfo`, supported label
   types, Table Schema types, `FromOrientOptions`, and exporter option types.
2. Keep row generics separate from matrix cell types. Do not model
   `SplitPayload<T>` as `T[][]` when `T` means a row record.
3. Define an internal normalized-options type with required scalar defaults
   and optional `columns`/`columnTypes`; do not use `Required<>` blindly.
4. Export structured `JsonFrameError` subclasses for JSON syntax, invalid
   options, payload validation, orient ambiguity, unsupported features, and
   export key collisions.
5. Errors must carry actionable fields where relevant: orient, JSON path,
   row, column, candidates, and offending value. Do not retain an entire large
   payload on every error.
6. Add concise JSDoc to public option and error types that must remain visible
   in emitted declarations.

Acceptance criteria:

- Public declarations contain no `any`.
- Ambiguity candidates use `ResolvedOrient`, never `auto`.
- Invalid `packThreshold` values (`-1`, fractional, `NaN`, and infinity) fail
  with `JsonFrameOptionError`.
- NodeNext and Bundler declaration checks can import every public type from
  the package root once JFRAME-07 completes the entrypoint.

Verification:

- `pnpm exec tsc --noEmit -p packages/json-frame/tsconfig.json`
- Focused Vitest tests for runtime error fields and option validation

Completion evidence:

- Changed: `packages/json-frame/src/types.ts`, `packages/json-frame/src/errors.ts`, `packages/json-frame/src/options.ts`, `packages/json-frame/src/index.ts`, `packages/json-frame/test/options-and-errors.test.ts`
- Verified: `pnpm exec tsc --noEmit -p packages/json-frame/tsconfig.json`; `pnpm --filter @web-ts-toolkit/json-frame test -- test/options-and-errors.test.ts`; `rg "(:|<)\s*any\b|\bany\[|\bArray<any>" packages/json-frame/dist/index.d.ts packages/json-frame/dist/index.d.mts`
- Result: added the public JSON/orient/payload/schema/column/exporter option vocabulary, an internal normalized options type with defaulted scalar fields and optional `columns`/`columnTypes`, and structured `JsonFrameError` subclasses for parse, option, validation, ambiguity, unsupported-feature, and export-collision failures; targeted tests passed for runtime error fields and invalid `packThreshold` values (`-1`, fractional, `NaN`, and infinities); the built declaration entries contained no `: any` occurrences
- Follow-up: `JFRAME-03`

### Task JFRAME-03: Validate And Parse The Six Orients

Status: completed

Priority: P0

Suggested agent: defensive parser specialist

Dependencies: JFRAME-00, JFRAME-02

Primary ownership:

- `packages/json-frame/src/parse/**`
- `packages/json-frame/test/parse/**`

Finding:

Each orient has different label and matrix rules. Validation must occur at the
ingestion boundary so malformed payloads cannot create inconsistent frame
state or generic `TypeError` failures later.

Implementation requirements:

1. Parse JSON strings once and recursively validate parsed/programmatic input
   as JSON-compatible with a path-aware error.
2. Implement ordered auto-detection for `table`, `split`, non-empty
   array-of-arrays `values`, and non-empty array-of-objects `records`.
3. Return controlled ambiguity errors for nested objects, empty objects, and
   empty arrays as defined by the locked contract.
4. Parse records using a stable first-seen union of own enumerable keys. Fill
   missing cells with `null`; reject non-object rows.
5. Parse index as `{indexKey: rowObject}` and preserve JSON key text.
6. Parse columns as `{column: {indexKey: value}}`. Require every column to
   expose the same ordered index-key set.
7. Parse values using explicit unique string columns and require each row width
   to match.
8. Parse split with unique string columns, scalar supported index labels,
   matching row/index lengths, and exact row widths.
9. Parse table using `schema.primaryKey` to separate an optional index field
   from data fields. Support zero or one primary key; reject more than one.
10. Preserve supported Table Schema field metadata, including categorical
    `constraints.enum`, `ordered`, `extDtype`, and timezone information.
11. Build maps or records without prototype-sensitive assignment hazards and
    clone caller-owned top-level containers.

Acceptance criteria:

- Every generated happy-path fixture produces the expected columns, index,
  index provenance, data, and schema metadata.
- Explicit real pandas `columns` and `index` fixtures parse with opposite axes
  as required; neither is silently auto-detected.
- Malformed row widths, unequal column index keys, unsupported MultiIndex,
  duplicate columns, non-JSON values, and prototype-sensitive labels have
  focused tests.
- No invalid input path escapes as a generic `TypeError`.

Verification:

- `pnpm --filter @web-ts-toolkit/json-frame test -- test/parse`

Completion evidence:

- Changed: `packages/json-frame/src/parse/index.ts`, `packages/json-frame/src/parse/parse.ts`, `packages/json-frame/src/parse/types.ts`, `packages/json-frame/test/parse/parse.test.ts`
- Verified: `pnpm --filter @web-ts-toolkit/json-frame test -- test/parse`; `pnpm exec tsc --noEmit -p packages/json-frame/tsconfig.json`
- Result: added an internal parser pipeline that parses JSON strings once, recursively rejects non-JSON programmatic inputs with path-bearing `JsonFrameValidationError`s, auto-detects only the locked unambiguous shapes, parses all six pandas orients into a consistent column-major frame shape, preserves source Table Schema metadata plus source table index-field names, rejects ambiguous nested-object and empty payloads under `auto`, and covers every committed happy-path fixture plus malformed widths, unequal column index keys, MultiIndex table rejection, duplicate/non-string columns, and prototype-sensitive labels in 63 passing targeted tests
- Follow-up: `JFRAME-04`

## Wave 3: Storage And Immutable Behavior

### Task JFRAME-04: Implement Logical Types And Lossless Packing

Status: completed

Priority: P1

Suggested agent: TypeScript data-layout specialist

Dependencies: JFRAME-03

Primary ownership:

- `packages/json-frame/src/frame/column.ts`
- `packages/json-frame/test/frame/column.test.ts`

Finding:

Logical type, nullability, and physical storage eligibility are separate. The
previous plan incorrectly changed logical types when `null` or an out-of-range
integer merely prevented typed-array storage.

Implementation requirements:

1. Map supported Table Schema field metadata to logical column types.
2. Otherwise infer each complete column without sampling.
3. Apply explicit `columnTypes` after validating that supplied names exist.
4. Track nullability independently from logical type.
5. Implement packing exactly as specified in the locked contract.
6. Implement a reusable materialization helper so exporters and transforms
   read arrays and typed arrays identically.
7. Never mutate parsed input arrays while inferring or packing.

Acceptance criteria:

- Nullable numeric columns retain `integer`/`float` logical type but remain
  ordinary arrays.
- An integer beyond INT32 range remains `integer` and uncompressed.
- Threshold boundaries, disabled packing, negative values, and both INT32
  endpoints are tested.
- Packed and unpacked frames export deeply equal JSON values.

Verification:

- `pnpm --filter @web-ts-toolkit/json-frame test -- test/frame/column.test.ts`

Completion evidence:

- Changed: `packages/json-frame/src/frame/column.ts`, `packages/json-frame/test/frame/column.test.ts`
- Verified: `pnpm --filter @web-ts-toolkit/json-frame test -- test/frame/column.test.ts`; `pnpm exec tsc --noEmit -p packages/json-frame/tsconfig.json`
- Result: added an internal frame-state builder that derives logical column metadata from full-column scans or authoritative Table Schema fields, validates explicit `columnTypes` against parsed columns, packs eligible non-null numeric columns into `Int32Array` or `Float64Array` without changing materialized JSON values, and provides reusable column materialization helpers; targeted verification passed with 69 tests across the package's current suite
- Follow-up: `JFRAME-05`

### Task JFRAME-05: Implement Immutable `DataFrame` Access And Transforms

Status: completed

Priority: P0

Suggested agent: immutable data-structure specialist

Dependencies: JFRAME-04

Primary ownership:

- `packages/json-frame/src/frame/DataFrame.ts`
- `packages/json-frame/test/frame/DataFrame.test.ts`

Finding:

The frame must preserve row/index alignment through chained operations without
relying on a fragile permutation overlay or leaking mutable internal storage.

Implementation requirements:

1. Keep construction internal or guarded so only validated consistent state
   can instantiate a frame.
2. Implement readonly `columns`, `index`, `columnInfo`, and `length` access.
3. Implement `row`, `rows`, `filter`, stable `sort`, `select`, `rename`, and
   `resetIndex` with the locked behavior.
4. Materialize transforms in current display order and keep every column,
   index label, logical type, and applicable schema field aligned.
5. Repack transformed numeric columns only when the resulting values still
   meet the same packing policy.
6. Protect internal maps and arrays from mutation through constructor inputs,
   getters, returned rows, and exporter results at the structural level.

Acceptance criteria:

- `filter().sort()`, `sort().filter()`, repeated sorts, ties, and
  `resetIndex()` after sorting preserve the specified row/index relationship.
- Invalid row positions, unknown selections, duplicate selections, and rename
  collisions throw documented errors.
- Mutating original payload containers, getter results, returned rows, or
  exporter containers does not mutate an existing frame.
- Labels named `__proto__`, `constructor`, and `prototype` survive access and
  transforms as ordinary labels.

Verification:

- `pnpm --filter @web-ts-toolkit/json-frame test -- test/frame/DataFrame.test.ts`

Completion evidence:

- Changed: `packages/json-frame/src/frame/column.ts`, `packages/json-frame/src/frame/DataFrame.ts`, `packages/json-frame/test/frame/DataFrame.test.ts`
- Verified: `pnpm --filter @web-ts-toolkit/json-frame test -- test/frame/DataFrame.test.ts`; `pnpm exec tsc --noEmit -p packages/json-frame/tsconfig.json`
- Result: added an internal immutable `DataFrame` over validated frame state with guarded construction, defensive `columns`/`index`/`columnInfo`/row access, stable sort, filter/select/rename/resetIndex transforms, transform-time repacking through rebuilt frame state, and table-schema alignment for select/rename/resetIndex; verification passed with the package's current 75-test suite green and package source typechecking clean
- Follow-up: `JFRAME-06`

### Task JFRAME-06: Implement All Orient Exporters

Status: completed

Priority: P0

Suggested agent: serialization and Table Schema specialist

Dependencies: JFRAME-05

Primary ownership:

- `packages/json-frame/src/export/**`
- `packages/json-frame/test/export/**`

Finding:

The objective promises six exporters, but the previous plan omitted `toIndex`
and `toTable` and did not define index key collisions or schema reconstruction.

Implementation requirements:

1. Implement all six parsed-payload exporters and `toJSONString`.
2. Emit fresh JSON-compatible containers on every call.
3. Detect key collisions after index-label stringification in object-key
   exporters instead of overwriting rows silently.
4. Emit valid Table Schema with index fields controlled by `indexKind`, data
   fields in frame column order, and supported metadata updated by transforms.
   Preserve a source table primary-key name; otherwise apply the locked
   `indexField` default and collision behavior.
5. Exclude table primary-key fields from ordinary data columns.
6. Keep exporter output independent of packed versus unpacked storage.

Acceptance criteria:

- Each generated fixture can be ingested and exported to every compatible
  orient with semantic equivalence under the locked rules.
- `toRecords()` and `toValues()` never invent an index column.
- Labels `1` and `"1"` in a split-origin index cause controlled collision
  errors in `toIndex()`/`toColumns()` but remain distinct in `toSplit()`.
- Table output is accepted by pandas `read_json(..., orient='table')` in the
  documented fixture environment.
- `toJSONString(orient)` parses back to the same value as the corresponding
  parsed exporter.

Verification:

- `pnpm --filter @web-ts-toolkit/json-frame test -- test/export`
- pandas table read-back check in the documented fixture environment

Completion evidence:

- Changed: `packages/json-frame/src/export/payload.ts`, `packages/json-frame/src/frame/DataFrame.ts`, `packages/json-frame/test/export/export.test.ts`
- Verified: `pnpm exec tsc --noEmit -p packages/json-frame/tsconfig.json`; `pnpm --filter @web-ts-toolkit/json-frame test -- test/export`; `pnpm --filter access-router-runtime-example exec tsx -e "import { readFile } from 'node:fs/promises'; import path from 'node:path'; import { createFrameState } from '/home/jahn/projects/_web-ts-toolkit/packages/json-frame/src/frame/column.ts'; import { DataFrame } from '/home/jahn/projects/_web-ts-toolkit/packages/json-frame/src/frame/DataFrame.ts'; import { normalizeFromOrientOptions } from '/home/jahn/projects/_web-ts-toolkit/packages/json-frame/src/options.ts'; import { parseInput } from '/home/jahn/projects/_web-ts-toolkit/packages/json-frame/src/parse/index.ts'; void (async () => { const dir = '/home/jahn/projects/_web-ts-toolkit/packages/json-frame/test/fixtures/generated'; const mk = (input, options) => { const normalized = normalizeFromOrientOptions(options); const parsed = parseInput(input, normalized); return DataFrame.fromState(createFrameState(parsed, normalized), normalized.packThreshold); }; const cases = await Promise.all(['allSixStringIndex-index.json', 'allSixRangeIndex-records.json'].map(async (name) => { const text = await readFile(path.join(dir, name), 'utf8'); const frame = mk(text, name === 'allSixRangeIndex-records.json' ? { orient: 'records' } : { orient: 'index' }); return { name, table: frame.toTable(), expectedRows: frame.rows(), expectedIndex: frame.index, expectSourceIndex: name !== 'allSixRangeIndex-records.json' }; })); process.stdout.write(JSON.stringify(cases)); })();" | python3 -c "import io, json, sys; import pandas as pd; cases = json.load(sys.stdin); results = []; for case in cases: frame = pd.read_json(io.StringIO(json.dumps(case['table'])), orient='table'); records = frame.to_dict(orient='records'); assert records == case['expectedRows'], (case['name'], records, case['expectedRows']); index_values = frame.index.tolist(); assert index_values == (case['expectedIndex'] if case['expectSourceIndex'] else list(range(len(case['expectedRows'])))), (case['name'], index_values, case['expectedIndex']); results.append(case['name']); print(json.dumps(results))"`
- Result: added all six parsed-payload exporters plus `toJSONString()` on the internal `DataFrame`, centralized object-key collision checks and table-schema reconstruction in a dedicated export helper, preserved source Table Schema metadata through table export, omitted synthetic indexes from table payloads, and added focused export tests covering semantic round trips across the canonical six-orient fixtures, fresh detached exporter containers, index-stringification collisions, index-field override behavior, packed-vs-unpacked equivalence, and `toJSONString()` parity; the export test run passed with the package's current 91-test suite green, and pandas 3.0.3 successfully read back representative source-index and synthetic-index table exports
- Follow-up: `JFRAME-07`

## Wave 4: Public API And Installed Consumer

### Task JFRAME-07: Assemble `fromOrient` And The Public Entry Point

Status: completed

Priority: P0

Suggested agent: TypeScript API-facade specialist

Dependencies: JFRAME-03, JFRAME-04, JFRAME-05, JFRAME-06

Primary ownership:

- `packages/json-frame/src/api.ts`
- `packages/json-frame/src/index.ts`
- `packages/json-frame/test/api.test.ts`

Finding:

Consumers need one discoverable factory that validates options, parses or
accepts JSON, dispatches by orient, derives column metadata, packs eligible
columns, and constructs a frame exactly once.

Implementation requirements:

1. Implement `fromOrient<TRow extends Record<string, JsonValue> =
Record<string, JsonValue>>(input, options?)` with useful inferred/default
   row typing without claiming runtime validation of arbitrary `TRow`.
2. Validate options before traversing a potentially large payload.
3. Re-export only intended public values and types from the package root.
   Parsers, storage helpers, and constructors remain internal.
4. Add high-value JSDoc to `fromOrient`, `DataFrame`, and orient options so it
   survives in generated declarations.
5. Avoid a redundant default export and undocumented deep imports.

Acceptance criteria:

- Explicit and auto-detected unambiguous forms produce equivalent observable
  frames.
- Nested-object and empty-input ambiguity errors tell callers exactly which
  explicit orient option is required.
- Invalid JSON preserves the syntax failure as `cause`.
- The generated declaration entrypoint exposes the complete intended API and
  no internal parser or constructor surface.

Verification:

- `pnpm --filter @web-ts-toolkit/json-frame test -- test/api.test.ts`
- `pnpm --filter @web-ts-toolkit/json-frame build`
- Inspect `dist/index.d.ts` and `dist/index.d.mts`

Completion evidence:

- Changed: `packages/json-frame/src/api.ts`, `packages/json-frame/src/index.ts`, `packages/json-frame/src/types.ts`, `packages/json-frame/src/frame/DataFrame.ts`, `packages/json-frame/test/api.test.ts`, `packages/json-frame/test/frame/DataFrame.test.ts`, `packages/json-frame/test/export/export.test.ts`
- Verified: `pnpm --filter @web-ts-toolkit/json-frame test -- test/api.test.ts`; `pnpm --filter @web-ts-toolkit/json-frame build`; `pnpm exec tsc --noEmit -p packages/json-frame/tsconfig.json`; inspected `packages/json-frame/dist/index.d.ts` and `packages/json-frame/dist/index.d.mts`
- Result: added the public `fromOrient()` API facade, kept option validation ahead of payload traversal, reworked the package root to expose only the intended runtime values plus public types/errors, preserved high-value JSDoc in the built declarations, and split the public `DataFrame` contract from the internal class so the built entrypoint exposes no parser, storage-helper, constructor, or frame-state internals; the package build succeeded and the package test run passed with 96 tests green
- Follow-up: `JFRAME-08`

### Task JFRAME-08: Verify Installed Consumers And Author The README

Status: completed

Priority: P1

Suggested agent: AI-friendly TypeScript package specialist

Dependencies: JFRAME-07

Primary ownership:

- `packages/json-frame/test-decl-consumer/**`
- `packages/json-frame/test/packed-consumer.test.ts`
- `packages/json-frame/package.json`
- `packages/json-frame/README.md`

Finding:

Repository source imports do not prove that an installed consumer can resolve
the package, understand its declarations, or use its packed runtime files.

Implementation requirements:

1. Add strict NodeNext and Bundler declaration-consumer projects targeting the
   built declarations, following current workspace examples.
2. Add CJS and ESM runtime smoke tests against packed or staged package
   contents, not `src/` aliases.
3. Add an isomorphic/browser-oriented Bundler typecheck with no Node ambient
   types and inspect built runtime imports for Node built-ins.
4. Integrate declaration and packed-consumer checks into package scripts
   without creating recursive build loops.
5. Apply the `ai-friendly-ts-package` skill to metadata, exports,
   declarations, and README.
6. Document installation, canonical named imports, string and parsed input,
   all six shapes, auto-detection limits, options, transform behavior, index
   provenance, logical types, packing, semantic round trips, errors, and
   unsupported pandas features.
7. Keep examples within the package boundary; do not import `src/` or `dist/`.

Acceptance criteria:

- Strict NodeNext and Bundler consumers compile with `skipLibCheck: false`.
- Packed CJS and ESM consumers can call `fromOrient`.
- The packed file list contains only consumer-required files.
- README examples compile against the shipped declarations.
- An installed consumer can determine that `index`/`columns` need an explicit
  orient under auto mode and that `values` needs columns.

Verification:

- Package declaration-consumer scripts
- Package packed-consumer script
- `npm pack --dry-run --json` from `packages/json-frame/`
- `pnpm --filter @web-ts-toolkit/json-frame test`

Completion evidence:

- Changed: `packages/json-frame/package.json`, `packages/json-frame/README.md`, `packages/json-frame/test-decl-consumer/decl-consumer.strict.mts`, `packages/json-frame/test-decl-consumer/decl-consumer.strict.cts`, `packages/json-frame/test-decl-consumer/decl-consumer.browser.ts`, `packages/json-frame/test-decl-consumer/tsconfig-nodenext.json`, `packages/json-frame/test-decl-consumer/tsconfig-bundler.json`, `packages/json-frame/test-decl-consumer/tsconfig-bundler-browser.json`, `packages/json-frame/test/packed-consumer.test.ts`
- Verified: `pnpm --filter @web-ts-toolkit/json-frame typecheck`; `pnpm --filter @web-ts-toolkit/json-frame test:packed-consumer`; `npm pack --dry-run --json` from `packages/json-frame/`; `pnpm --filter @web-ts-toolkit/json-frame test`
- Result: added strict self-reference declaration consumers for NodeNext, Bundler, and browser-oriented Bundler-without-Node-ambient types; added packed-artifact manifest/file-list/runtime/typecheck/README compile coverage against the real publish transform; documented installation, all six orients, auto-detection limits, options, transforms, packing, round-trip semantics, errors, and unsupported pandas features in the shipped README; package verification passed with 99 tests green and the packed consumer lane confirmed CJS, ESM, NodeNext, Bundler, and README examples against the installed tarball
- Follow-up: `JFRAME-09`

## Wave 5: Independent Integration Review

### Task JFRAME-09: Perform Independent Final Review

Status: completed

Priority: P0

Suggested agent: independent reviewer who did not implement JFRAME-03 through
JFRAME-07

Dependencies: JFRAME-00 through JFRAME-08

Primary ownership:

- Whole `packages/json-frame/` package
- `tsconfig.base.json` package aliases
- Completion evidence in this task file

Finding:

Final review must validate runtime behavior, pandas compatibility, public
types, and packed artifacts rather than infer completion from source changes.

Implementation requirements:

1. Re-run generated-fixture compatibility and inspect that tests use the
   committed pandas outputs rather than hand-normalized substitutes.
2. Verify all locked contracts, including alternate orient paths, ambiguity,
   index provenance, collision handling, prototype-sensitive labels, shallow
   immutability, nullable numeric metadata, and lossless packing.
3. Verify source, declarations, README, and runtime exports agree.
4. Verify no internal constructor, parser, mutable storage, or Node-only
   runtime dependency crosses the public package boundary.
5. Run package, repository, and packed-artifact checks in the order below.
6. Record failures as blockers or new tasks. Do not mark this task complete
   with unexplained skipped checks.

Acceptance criteria:

- All non-deferred task acceptance criteria have direct evidence.
- Package CJS, ESM, NodeNext declarations, Bundler declarations, and pandas
  fixture compatibility pass.
- No runtime or peer dependency was introduced.
- No test contains `.only`; no required compatibility test is skipped.
- Full repository build, tests, and lint pass without changing serial test
  orchestration.
- Packed contents and README are sufficient for an installed consumer.

Verification:

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @web-ts-toolkit/json-frame build`
3. `pnpm --filter @web-ts-toolkit/json-frame test`
4. `pnpm lint`
5. `pnpm build`
6. `pnpm test`
7. `npm pack --dry-run --json` from `packages/json-frame/`
8. CJS and ESM packed-runtime smoke tests from JFRAME-08
9. pandas fixture generation/read-back checks from JFRAME-00 and JFRAME-06

Completion evidence:

- Changed: `packages/json-frame/src/export/payload.ts`, `packages/json-frame/test/export/export.test.ts`, `packages/json-frame/README.md`, `packages/json-frame/test/fixtures/generated/**`, `docs/tasks/20260814-170611-json-frame-package.md`
- Verified: independent review of `packages/json-frame/` and public boundary files; `pnpm install --frozen-lockfile`; `pnpm --filter @web-ts-toolkit/json-frame build`; `pnpm --filter @web-ts-toolkit/json-frame test`; `pnpm lint`; `pnpm build`; `pnpm test`; `npm pack --dry-run --json` from `packages/json-frame/`; `pnpm --filter @web-ts-toolkit/json-frame test:packed-consumer`; `python3 generate.py` from `packages/json-frame/test/fixtures/`; pandas `read_json(..., orient='table')` read-back check against exported tables from `allSixStringIndex-index.json` and `allSixRangeIndex-records.json`; `rg "\\.only\\b|it\\.skip\\b|describe\\.skip\\b|test\\.skip\\b" packages/json-frame`
- Result: the independent review surfaced one blocking issue in `toTable()` metadata reconstruction for valid `table` schemas whose primary-key field was not first, plus one README contract mismatch around non-empty `values` auto-detection; fixed both, added a regression test, confirmed the package still has no runtime or peer dependencies and no `.only`/skipped package tests, refreshed the committed generated fixtures to the deterministic pandas-generator output, and re-ran the package, packed-consumer, pandas compatibility, and full-repository verification lanes successfully
- Follow-up: none

## Dependencies And Parallelization

Recommended execution order:

```text
JFRAME-00 ───────────────┐
                        ├─> JFRAME-03 -> JFRAME-04 -> JFRAME-05 -> JFRAME-06
JFRAME-01 -> JFRAME-02 ──┘                                      |
                                                               v
                                            JFRAME-07 -> JFRAME-08 -> JFRAME-09
```

- JFRAME-00 and JFRAME-01 may run in parallel because fixture ownership and
  scaffold ownership do not overlap materially.
- JFRAME-02 starts after the package scaffold exists.
- JFRAME-03 waits for both generated fixtures and public type/error contracts.
- JFRAME-04 through JFRAME-07 are intentionally sequential because they share
  state contracts and behavior decisions.
- JFRAME-08 begins only after the public API and declarations stabilize.
- JFRAME-09 is strictly last and must be assigned independently.
- Do not run verification commands concurrently if they rebuild the same
  package or shared dependency outputs.

Shared hotspots:

- `packages/json-frame/src/index.ts`: JFRAME-01 creates the stub; JFRAME-07
  owns final exports.
- `packages/json-frame/package.json`: JFRAME-01 creates it; JFRAME-08 owns the
  final consumer-verification scripts and metadata review.
- `packages/json-frame/README.md`: JFRAME-01 creates the placeholder;
  JFRAME-08 owns final content.
- `tsconfig.base.json`: only JFRAME-01 edits aliases.
- Generated fixtures: only JFRAME-00 changes producer outputs unless a later
  pandas compatibility update is explicitly recorded.

## Deferred Work

The following items are deliberately outside this initial release and do not
block execution:

- MultiIndex and duplicate column support
- non-string column labels
- JSON Lines and streaming input
- exact preservation of unknown Table Schema extensions
- deep immutability of nested JSON object values
- lazy row permutations or alternate columnar backends
- `Date` object promotion and timezone-aware JavaScript date abstractions
- adapters for Danfo.js, Arquero, or Arrow

If one becomes required to satisfy a current acceptance criterion, update this
file with a concrete task, dependencies, ownership, and tests before expanding
implementation scope.

## Definition Of Done

- JFRAME-00 through JFRAME-09 are `completed` with completion evidence.
- Committed fixtures are generated by a documented pandas environment and
  cover all six orients plus specified edge and unsupported cases.
- Correct pandas `columns` and `index` shapes are supported explicitly; auto
  mode never guesses between them.
- All six parsed-payload exporters and `toJSONString` satisfy semantic
  round-trip rules.
- Immutable transforms preserve row, index, type, and schema alignment.
- Packing is lossless and independent from logical type/nullability.
- Public declarations contain the intended named API, useful JSDoc, and no
  internal implementation surface.
- Strict NodeNext and Bundler declaration consumers pass.
- Packed CJS and ESM runtime consumers pass.
- `npm pack --dry-run --json` contains only intended artifacts.
- The package has no runtime dependencies or peer dependencies and no Node- or
  DOM-only source behavior.
- `pnpm lint`, `pnpm build`, and serialized `pnpm test` pass at repository
  root.
- An independent reviewer signs off JFRAME-09.

## Completion Evidence Template

Append this block to a task only after its required verification succeeds:

```markdown
Completion evidence:

- Changed: `paths`
- Verified: `exact commands`
- Result: `tests/artifacts observed`
- Follow-up: `task ID or none`
```
