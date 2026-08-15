# JSON Frame Adapter — `@web-ts-toolkit/json-frame`

Created: 2026-08-14 17:06:11 PDT

Package: `packages/json-frame` (new)

## Objective

Author a new zero-dependency, isomorphic TypeScript package
`@web-ts-toolkit/json-frame` that consumes the JSON output of pandas
`DataFrame.to_json(orient=...)` in any of the six supported orients
(`records`, `index`, `columns`, `values`, `split`, `table`), normalizes it
into a single canonical column-major `DataFrame<T>` view, and exposes a small
set of immutable transformation helpers plus round-trip exporters back to each
orient. The package must slot into the existing `web-ts-toolkit` pnpm
workspace with no new infrastructure and no runtime dependencies.

## Scope And Working Rules

- Build from tracked TypeScript source only. Never edit generated `dist/` or
  ignored `src/**/*.js` files manually.
- Mirror the conventions of existing lightweight packages
  (`packages/utils`, `packages/access-router-react`,
  `packages/express-response-handler`) for `package.json`, `tsup.config.ts`,
  `tsconfig.json`, dual `exports` map, and `0.0.0-PLACEHOLDER` release
  metadata placeholders consumed by the existing `repo-toolkit` publish
  pipeline.
- Use `tsup` with `bundle: true` (not `bundle: false`) so bundler-style
  internal specifiers like `./orient/records` and `./frame/DataFrame` collapse
  into the published ESM output. Documented constraint in
  `AGENTS.md` ("Packaging notes"): plain Node ESM cannot resolve directory or
  extensionless relative imports from published output.
- Keep the package isomorphic. No DOM-only APIs in `src/`. No `Buffer`,
  no `process`, no Node-only globals in the core path. Tests run under
  `vitest` `environment: 'node'` (inherited from the root
  `vitest.config.ts`).
- Keep runtime dependencies at zero. No `peerDependencies`. Do not add
  `toDanfo()` or any other optional-pseudodep adapter (explicitly rejected;
  see Non-Goals).
- Run package tests serially. Per `AGENTS.md` ("Testing notes"),
  `pnpm test` runs packages serially because each test script rebuilds
  shared `dist/` outputs via `tsup`. Do not run `json-frame` and a
  dependency package build concurrently.
- Update `tsconfig.base.json` path aliases at the same time as the package
  scaffold so workspace imports resolve under both NodeNext and Bundler
  module resolution.
- Preserve unrelated worktree changes and never revert another agent's
  work.

## Environment Blocker (Read Before Starting Any Task)

`pnpm install` is currently broken in this worktree due to a pre-existing
repo bug introduced in commit `e785b25` ("fix: remove redundant engines
patch", 2026-08-14) — the same commit that deleted
`patches/@repo-toolkit__publish-package@0.7.2.patch` left the matching
`patchedDependencies` entry in `pnpm-workspace.yaml:4-5` behind. Any new
package added to the workspace forces pnpm to re-resolve patches and crash
on the dangling reference:

```
[ENOENT] no such file or directory, open '.../patches/@repo-toolkit__publish-package@0.7.2.patch'
```

The install was passing silently before because pnpm skipped re-resolution
once the lockfile was already verified. Adding `packages/json-frame/`
triggered re-resolution and exposed the bug.

This is **not** part of the `json-frame` scope. Before starting PDOR-01,
the maintainer must do one of:

1. **(Recommended)** Remove the `patchedDependencies` block from
   `pnpm-workspace.yaml:4-5` (the correct follow-up to `e785b25`).
2. Restore the deleted `patches/@repo-toolkit__publish-package@0.7.2.patch`
   by `git revert e785b25` (or partial revert of just the file).
3. Manually re-create the patch file from its content in commit
   `e785b25~1`.

Do NOT begin PDOR-01 until `pnpm install` from the repo root completes
successfully when `packages/json-frame/package.json` is present.

## Non-Goals

- Do not add React, Vue, or Svelte bindings. Scope is "pure orient adapter".
- Do not add a transport/query layer (fetch, TanStack Query, SWR). This
  package owns data shape, not data loading.
- Do not add a grid/renderer (TanStack Table, AG Grid, Tabulator).
- Do not add an opt-in Danfo.js / Arquero interop helper. (Explicit
  maintainer decision: deferred indefinitely. If pandas-class compute
  becomes a requirement, it becomes a separate package
  `@web-ts-toolkit/json-frame-danfo` with its own dependency budget,
  not an optional `peerDependencies` slot on this package.)
- Do not add an example app under `apps/` or a docs page under `website/`.
  Documentation beyond the package `README.md` is out of scope for this task.
- Do not optimize beyond the opportunistic typed-array packing the design
  specifies. No Arrow-table backing, no Web Worker scheduling, no streaming
  parse.
- Do not add `llms.txt` before metadata, declarations, and `npm pack`
  contents are correct.

## Design Decisions (Locked)

These four decisions were confirmed by the maintainer before this task file
was created; agents must not relitigate them.

1. **Index preservation under `filter`/`sort` is sparse.** `_index` keeps the
   original labels of surviving rows; gaps are natural. After `sort()`,
   `_index` is reordered via the same permutation applied to `_data`. Provide
   a separate `.resetIndex()` method for consumers who want `0..n-1` back.
   Exporters reflect the current `_index`: `.toSplit()` emits the reordered
   labels; `.toRecords()` carries labels as a synthetic `_index` field only
   when the source orient was `index` and labels were non-numeric (i.e.
   meaningful).

2. **No `toDanfo()` opt-in helper.** Not included from day one. Zero
   `peerDependencies`. If compute is ever needed, it becomes a separate
   package (see Non-Goals).

3. **Auto-detection scope includes `table`.** `orient: 'auto'` (also the
   default) accepts all six orients. The detector inspects, in order:
   1. `payload.schema?.fields` is an array AND `payload.data` is an array → `table`
   2. `payload.columns` AND `payload.index` AND `payload.data` are all arrays (or
      `payload.data` is an array-of-arrays) → `split`
   3. `Array.isArray(payload)` AND `payload.length > 0` AND
      `Array.isArray(payload[0])` → `values`
   4. `Array.isArray(payload)` AND `payload.length > 0` AND
      `isObject(payload[0])` → `records`
   5. `payload` is a non-array object AND every `Object.values` entry is an
      array → `columns`
   6. `payload` is a non-array object AND every `Object.values` entry is a
      non-null object (not an array) → `index`
      Else: throw `OrientDetectError` with a structured diagnostic listing
      checked candidates. `orient="values"` requires `options.columns` (no
      reliable auto-labeling); throw if absent.

4. **Opportunistic typed-array packing.** At ingest, after coercion:
   - `_types[col] === 'integer'` AND every value fits signed `INT32` range
     AND `length >= packThreshold` → store as `Int32Array.from(...)`
   - `_types[col] === 'float'` AND `length >= packThreshold` → store as
     `Float64Array.from(...)`
   - Otherwise `unknown[]` (including nulls, mixed types, strings,
     booleans, categoricals, datetimes, and any column shorter than
     `packThreshold`).
   - `options.packThreshold` default `256`; set to `0` to disable
     typed-array packing entirely.
   - `null` surviving in a numeric column disqualifies packing (typed
     arrays cannot hold `null`); the column stays `unknown[]` and
     `_types[col]` records `'mixed'`.

### Normalized storage

```ts
DataFrame<T> {
  _columns: string[]
  _index: (string|number)[]            // sparse across filter/sort
  _data: Record<string, unknown[] | Int32Array | Float64Array>
  _types: Record<string, ColumnType>
  _perm: number[] | null                // sort overlay; null = identity
}
```

### Coercion strategy (strict typing with sentinels)

Applied once at `fromOrient()` ingest. Default `coerce: true`.

- `NaN` / `Infinity` / `-Infinity` / `NaT` → `null`
- Datetime ISO-8601 strings (pandas default serialization for
  `datetime64` / `Timestamp`) → kept as ISO string by default;
  `options.datesAsDate: true` → store as JS `Date`
- Categorical (pandas `to_json(orient='table')` emits
  `{ value, category }` for categorical dtypes when `index=False`) →
  preserved verbatim; `_types[col] = 'categorical'`
- `coerce: false` → passthrough raw JSON values (caller accepts
  NaN-as-`null` cannot occur because standard `JSON.parse` already
  yields `null` for `NaN`/`Infinity`; the only effect of `coerce: false`
  is to skip the datetime-`Date` promotion and the type inference for
  packing).

## Priorities

- P0: package does not build, emits non-resolvable ESM, or round-trip
  equivalence across orients fails.
- P1: typed-array packing produces silent truncation, sparse index loses
  labels under transform, or auto-detection mis-classifies a valid
  shape.
- P2: missing test coverage for ingest path, edge coercion values, or
  accessor behavior; `README.md` / path aliases incomplete.
- P3: API ergonomics, JSDoc completeness, optional compression of small
  frames.

## Wave 1: Scaffold And Shared Types

### Task PDOR-01: Scaffold `packages/json-frame/` Package

Status: pending (blocked — see "Environment Blocker" above; do not start
until `pnpm install` is unblocked)

Priority: P0

Suggested agent: TypeScript package authoring specialist

Dependencies: none

Primary ownership:

- `packages/json-frame/package.json`
- `packages/json-frame/tsconfig.json`
- `packages/json-frame/tsup.config.ts`

Finding:

The `web-ts-toolkit` monorepo has a stable template for lightweight
packages. `packages/utils` is the closest zero-dependency analogue;
`packages/access-router-react` is the closest frontend/isomorphic analogue
and demonstrates the dual-mode `test-decl-consumer` typecheck pattern. A new
package must replicate this template precisely so the existing
`repo-toolkit` publish pipeline can transform `0.0.0-PLACEHOLDER` fields
(`version`, `license`, `repository`) into release metadata without manual
intervention.

References:

- `packages/utils/package.json`
- `packages/access-router-react/package.json`
- `packages/access-router-react/tsup.config.ts`
- `packages/access-router-react/tsconfig.json`
- `packages/express-response-handler/package.json`
- `AGENTS.md:22-23` ("Packaging notes" — `bundle: false` is a trap for
  bundler-style specifiers)

Implementation requirements:

1. Create `packages/json-frame/package.json` with:
   - `name`: `@web-ts-toolkit/json-frame`
   - `version`, `license`, `repository`: literal `0.0.0-PLACEHOLDER` /
     `PLACEHOLDER` strings (matched by the publish tool)
   - `description`, `homepage` (mirror the `web-ts-toolkit.pages.dev`
     convention used by sibling packages), `keywords`, `sideEffects: false`
   - `engines.node`: `">=22"`
   - `main`: `dist/index.js`, `module`: `dist/index.mjs`,
     `types`: `dist/index.d.ts`
   - `exports."."`: dual `types { import: ./dist/index.d.mts,
require: ./dist/index.d.ts, default: ./dist/index.d.ts }` /
     `import: ./dist/index.mjs` / `require: ./dist/index.js` /
     `default: ./dist/index.js` — identical structure to
     `packages/utils/package.json`
   - `scripts.build`: `tsup --config tsup.config.ts`
   - `scripts.test`:
     `pnpm --filter @web-ts-toolkit/json-frame... build && vitest run --config ../../vitest.config.ts`
   - `files`: `["README.md", "dist"]`
   - No `dependencies`, no `peerDependencies`, no `devDependencies`
     beyond bringing the package up to parity for build/test
     (`tsup`, `typescript`, `vitest` are resolved from the workspace
     root; mirror `packages/utils` which declares none locally)
2. Create `packages/json-frame/tsup.config.ts`:

   ```ts
   import { defineConfig } from 'tsup';

   export default defineConfig({
     entry: ['src/index.ts'],
     format: ['cjs', 'esm'],
     dts: true,
     target: 'es2020',
     outDir: 'dist',
     clean: true,
     bundle: true,
     splitting: false,
     external: [],
   });
   ```

   `bundle: true` is non-negotiable: it collapses internal `./orient/...`
   and `./frame/...` specifiers into a single resolvable ESM output.

3. Create `packages/json-frame/tsconfig.json` mirroring
   `packages/access-router-react/tsconfig.json`: `target: ES2020`,
   `module: ESNext`, `moduleResolution: Bundler`, `strict: true`,
   `declaration: true`, `declarationMap: false`, `sourceMap: false`,
   `skipLibCheck: true`, `esModuleInterop: true`, `outDir: dist`,
   `types: ["node"]`, `include: ["src/**/*.ts"]`. No `jsx` (this is not
   a React package). No `DOM` lib.
4. Create an empty `packages/json-frame/README.md` placeholder with
   only a top-level `# @web-ts-toolkit/json-frame` heading and a
   `PLACEHOLDER` body. PDOR-12 owns real README content.

Acceptance criteria:

- `pnpm install` (run from repo root) succeeds and picks up the new
  workspace package (`pnpm ls --filter @web-ts-toolkit/json-frame -r`
  resolves).
- `pnpm --filter @web-ts-toolkit/json-frame build` exits 0 once
  `src/index.ts` exists (PDOR-04). For this task, a minimal
  `src/index.ts` exporting `{}` is acceptable to prove the scaffold
  end-to-end; PDOR-04 will overwrite it with real content.
- `npm pack --dry-run --json` (run in `packages/json-frame/`) lists
  only `package.json`, `README.md`, and the four `dist/index.*`
  artifacts.

Partial implementation (2026-08-14, paused at user request):

The following uncommitted files already exist on disk and match the
specifications in this task. The next agent should NOT regenerate them
blindly — verify they match and continue from `pnpm install` once the
Environment Blocker is resolved:

- `packages/json-frame/package.json` — matches blueprint exactly
  (`@web-ts-toolkit/json-frame`, dual `exports`, `0.0.0-PLACEHOLDER`
  metadata, zero `dependencies`/`peerDependencies`, scoped `scripts`).
- `packages/json-frame/tsconfig.json` — mirrors
  `packages/access-router-react/tsconfig.json` minus the `jsx` field,
  with `lib: ["ES2020"]`, `types: ["node"]`, `strict: true`,
  `moduleResolution: "Bundler"`.
- `packages/json-frame/tsup.config.ts` — `bundle: true`,
  `external: []`, `target: 'es2020'`, dual cjs+esm, dts, clean.
- `packages/json-frame/README.md` — placeholder content
  (`# @web-ts-toolkit/json-frame` / `PLACEHOLDER`); PDOR-11 owns the
  real content pass.
- `packages/json-frame/src/index.ts` — temporary `export {};` stub;
  PDOR-04 overwrites.

This Partial implementation note is informational only. PDOR-01 status
remains `pending` until its acceptance criteria
(`pnpm install` + `build` + `npm pack`) all pass.

### Task PDOR-02: Author `types.ts` (Core Types)

Status: pending

Priority: P0

Suggested agent: TypeScript type-design specialist

Dependencies: PDOR-01

Primary ownership:

- `packages/json-frame/src/types.ts`

Finding:

The package's public surface hinges on a small, well-defined type
vocabulary. Getting the types right upstream prevents cascading
`unknown` leakage into `api.ts` and the per-orient parsers.

References:

- (Design summary above, "Normalized storage" and "Coercion strategy")

Implementation requirements:

1. Define and export:
   - `Orient = 'records' | 'index' | 'columns' | 'values' | 'split' | 'table' | 'auto'`
   - `ColumnType = 'integer' | 'float' | 'string' | 'boolean' | 'datetime' | 'categorical' | 'mixed' | 'unknown'`
   - `FromOrientOptions<T = Record<string, unknown>>`:
     - `orient?: Orient` (default `'auto'`)
     - `columns?: string[]` (required when `orient === 'values'`)
     - `coerce?: boolean` (default `true`)
     - `datesAsDate?: boolean` (default `false`)
     - `packThreshold?: number` (default `256`; `0` disables typed-array packing)
   - `TableSchemaField` (Table Schema spec subset): `{ name: string; type: string }`
   - `TableOrientPayload<T>`: `{ schema: { fields: TableSchemaField[]; primaryKey?: string[]; pandas_version?: string }; data: T[] }`
   - `SplitOrientPayload<T>`: `{ columns: string[]; index: (string|number)[]; data: T[][] }`
   - `IndexOrientPayload<T>`: `Record<string|number, T>`
   - `ColumnsOrientPayload`: `Record<string, unknown[]>`
   - `ValuesOrientPayload`: `unknown[][]`
   - `RecordsOrientPayload<T>`: `T[]`

- 2. Do **not** declare the `DataFrame<T>` class in `types.ts`. It is
     declared in `frame/DataFrame.ts` and re-exported via `index.ts`.
     Only the constructable option types and payload shapes belong here.

3. Export a discriminated `OrientDetectError` class via `types.ts`
   carrying `candidates: { orient: Orient; reason: string }[]` and the
   original `payload` reference (typed `unknown`) for consumers to
   inspect.

Acceptance criteria:

- `types.ts` exports compile under `strict: true` with no `any`.
- A unit test (pdor-02-add) importing every exported symbol from
  `../src/types.js` (built output) passes.
- No DOM lib symbols referenced.

### Task PDOR-03: Wire `tsconfig.base.json` Path Aliases

Status: pending

Priority: P0

Suggested agent: repo-infrastructure specialist

Dependencies: PDOR-01

Primary ownership:

- `tsconfig.base.json`

Finding:

`tsconfig.base.json` carries two-line path aliases (root + `/*`) for
every published workspace package. Missing aliases cause workspace
imports to fall back to the built `dist/` output during typecheck, which
masks source-only errors and breaks the dual-mode consumer typecheck
pattern used by `access-router-react`.

References:

- `tsconfig.base.json:4-36`

Implementation requirements:

1. Append after the `@web-ts-toolkit/mongoose-rxdb` alias block:
   ```json
   "@web-ts-toolkit/json-frame": ["packages/json-frame/src/index.ts"],
   "@web-ts-toolkit/json-frame/*": ["packages/json-frame/src/*"],
   ```
2. Do not reorder or reformat existing aliases.
3. Verify with `pnpm tsc --noEmit -p packages/json-frame/tsconfig.json`
   once PDOR-02 produces real source.

Acceptance criteria:

- `pnpm tsc --noEmit -p packages/json-frame/tsconfig.json` resolves
  `@web-ts-toolkit/json-frame` from source, not from `dist/`.
- `git diff tsconfig.base.json` shows only the appended two lines.

## Wave 2: Ingest Parsers And Detector

### Task PDOR-04: Author The Six Orient Parsers

Status: pending

Priority: P0

Suggested agent: TypeScript data-shape specialist

Dependencies: PDOR-02

Primary ownership:

- `packages/json-frame/src/orient/records.ts`
- `packages/json-frame/src/orient/index-orient.ts`
- `packages/json-frame/src/orient/columns.ts`
- `packages/json-frame/src/orient/values.ts`
- `packages/json-frame/src/orient/split.ts`
- `packages/json-frame/src/orient/table.ts`
- `packages/json-frame/src/index.ts`

Finding:

Each orient requires a distinct ingest pass into the canonical
column-major store. `records` and `index` are row-major in the wire
format, requiring a pivot. `columns` is already column-major. `values`
carries no labels. `split` carries separately-keyed labels + data.
`table` carries Table Schema metadata.

References:

- Design summary, "Mapping from each `orient` into the store"

Implementation requirements:

1. Each parser exports a function
   `parse<Records|Index|Columns|Values|Split|Table>Orient<T>(
  payload: <Orient>OrientPayload<T>,
  options: Required<FromOrientOptions<T>>,
): { columns: string[]; index: (string|number)[]; data: Record<string, unknown[]>; types: Record<string, ColumnType> }`
   — note: returns plain `unknown[]` for `data`; packing is applied in
   PDOR-08. Do not produce a `DataFrame` instance here (single
   responsibility: ingestion only).
2. `parseRecordsOrient`: walk `payload`, pull keys of first element as
   `_columns` (fall back to `options.columns` when provided; error
   otherwise), `payload.map((row, i) => i).reduce(columns projection)`.
   `_index` from `0..(n-1)` unless caller overrides via
   `options.index` (do not support that option now; document as
   non-goal).
3. `parseIndexOrient`: iterate `Object.entries(payload)`,
   `_index` from keys, `_data[col]` from `entry.value[col]`.
4. `parseColumnsOrient`: `Object.keys(payload)` → `_columns`,
   `_data` becomes a shallow reference to `payload` (mutability risk
   noted — see PDOR-11), `_index` from `0..(min-column-length - 1)`.
   Validate all columns have equal length; throw otherwise.
5. `parseValuesOrient`: require `options.columns` (throw
   `OrientParseError` if absent or length-mismatched with `payload[0]`).
   `_data[colIdx]` projects each row's `colIdx` slot across rows.
6. `parseSplitOrient`: trust `payload.columns` (validate array of
   strings), `payload.index` (validate length matches `payload.data`),
   `payload.data` (validate each row length matches columns). Project
   to `_data[col]` by column index.
7. `parseTableOrient`: read `payload.schema.fields` for `_columns` and
   initial `_types` (map pandas/Table Schema dtype strings to
   `ColumnType`: `'integer'` for `int*`/`Int*`, `'float'` for
   `float*`/`Float*`/`decimal`, `'string'` for `string`/`object`/
   `category`-but-not-categorical, `'boolean'` for `bool`, `'datetime'`
   for `datetime*`/`timestamp`, `'categorical'` for `category`/`Categorical`).
   `_index` from row's `index` field if present, else synthetic.
8. `index.ts` (the package entry) re-exports the public symbols of
   `types.ts`, `api.ts` (PDOR-09), and `frame/DataFrame.ts` (PDOR-06).
   Do not re-export individual orient parsers — they are internal.

Acceptance criteria:

- For each orient, a focused test (pdor-04-records, pdor-04-index, ...)
  in `test/orient/<orient>.test.ts` ingests the matching fixture and
  asserts the returned `columns`, `index`, `data`, and `types` exactly.
- `parseValuesOrient()` throws when `options.columns` is omitted or
  the wrong length.
- `parseColumnsOrient()` throws when columns have unequal lengths.

### Task PDOR-05: Author Auto-Detector

Status: pending

Priority: P0

Suggested agent: TypeScript defensive-parser specialist

Dependencies: PDOR-04

Primary ownership:

- `packages/json-frame/src/orient/detect.ts`

Finding:

`fromOrient(payload, { orient: 'auto' })` is the default API and the
primary consumer experience. Mis-classification silently routes
through the wrong parser, producing wrong labels or throwing late.
The detector must accept the ambiguously-shaped cases explicitly
documented and reject everything else with diagnostic information.

References:

- Design summary, decision 3 ("Auto-detection scope includes `table`")

Implementation requirements:

1. Export `detectOrient(payload: unknown): Exclude<Orient, 'auto'>`.
2. Apply the six ordered checks listed in design decision 3 above.
   `isObject(x)` = `typeof x === 'object' && x !== null && !Array.isArray(x)`.
   Empty inputs: empty array → `'records'`; `{}` → `'columns'`; this
   is acceptable because the downstream parser is a no-op producing an
   empty `DataFrame`.
3. On no match: throw `OrientDetectError` with `candidates` listing
   each checked orient and why it was rejected
   (`{ orient: 'values', reason: 'payload[0] is not an array' }`,
   etc.).
4. Keep the detector pure (no side effects, no `Date` access, no
   `globalThis` access). Consumed identically in browser and Node.

Acceptance criteria:

- Unit test covers each of the six happy paths plus at least four
  rejection cases: non-object primitive input, `null`, nested
  non-array (`{ foo: { bar: 1 } }`), and ambiguous `{ foo: [1,2], bar:
'x' }` (mixed shapes).
- `detectOrient(null)` throws `OrientDetectError` (not a generic
  `TypeError`).
- All detector logic is deterministic: no reliance on `Object.keys`
  order beyond the structural checks.

## Wave 3: Coercion And Typed-Array Packing

### Task PDOR-06: Author `DataFrame<T>` Class

Status: pending

Priority: P0

Suggested agent: TypeScript generics / data-structure specialist

Dependencies: PDOR-04

Primary ownership:

- `packages/json-frame/src/frame/DataFrame.ts`

Finding:

`DataFrame<T>` owns the canonical store, the sort-permutation overlay,
sparse-index handling, and all transformation methods. Getting the
permutation model right is the difference between correct sorted output
and silent row-label shuffling.

References:

- Design summary, "Normalized storage"

Implementation requirements:

1. The constructor takes
   `{ columns: string[]; index: (string|number)[]; data: Record<string, unknown[] | Int32Array | Float64Array>; types: Record<string, ColumnType>; perm?: number[] | null }`.
2. Getters: `columns`, `length`, `index` (returns reordered `_index`
   when `_perm` is non-null — materialized lazily and cached).
3. `row(i)`: returns row `i` in display order (apply `_perm`).
4. `rows()`: array of `T` in display order. Single O(n\*m) pass; no
   intermediate allocations beyond a single result array.
5. `filter(predicate: (row: T, i: number) => boolean): DataFrame<T>`:
   produces a new `DataFrame` with `_index` sparse (original surviving
   labels retained, no reindex), `_data` rebuilt column-by-column
   retaining typed-array typing when possible (see PDOR-08 for
   repacking logic — this task builds the harness, PDOR-08 wires the
   threshold check).
6. `sort(compare: (a, b) => number)`: produces a new `DataFrame` with
   `_perm` set to a stable sort of `0..(length-1)` keyed by
   `row(i)`. Does not mutate `_data`; overlay only.
7. `select<K extends keyof T>(...cols: K[])`: new `DataFrame<Pick<T,K>>`
   with only the chosen columns carried through (including their
   typed-array typing).
8. `rename(map)`: new `DataFrame` with renamed `_columns`,
   re-keyed `_data` and `_types`. Generic output type renames keys.
9. `resetIndex()`: new `DataFrame` with `_index = 0..(length-1)`. This
   is the only method that synthesizes labels.
10. Exporters `toRecords`, `toColumns`, `toSplit`, `toValues`,
    `toJSON` per the design summary. `toRecords` does NOT carry
    `_index` as a field by default; only when a non-numeric labeled
    source orient is detected and the caller opted via
    `toRecords({ includeIndex: true })`.
11. All methods return **new** instances; no in-place mutation.
    Document the immutability contract in JSDoc.

Acceptance criteria:

- A test snapshot of `fromOrient(recordsFixture).toColumns()` is
  deep-equal to the `'columns'` orient fixture (roundtrip equivalence).
- `filter` followed by `sort` produces `_index` whose values are the
  original labels, not `0..(n-1)`.
- `resetIndex()` after `filter` produces `0..(length-1)`.
- All methods are referentially transparent: calling `sort` twice with
  the same comparator yields structurally equal `DataFrame` instances.

### Task PDOR-07: Author Coercion Module

Status: pending

Priority: P0

Suggested agent: TypeScript value-semantics specialist

Dependencies: PDOR-04

Primary ownership:

- `packages/json-frame/src/frame/coerce.ts`

Finding:

`NaN`, `Infinity`, `-Infinity`, `NaT` cannot appear in JSON; pandas
emits them as `null` by default, so the only real lossy values are
ISO-8601 datetimes and the categorical `{value, category}` shape used
by `orient='table'`. The coercion layer must be deterministic, applied
once at ingest, and never re-applied during transform (since
transform is value-preserving).

References:

- Design summary, "Coercion strategy (strict typing with sentinels)"

Implementation requirements:

1. Export `coerceValue(rawValue: unknown, declaredType: ColumnType, datesAsDate: boolean): unknown`.
2. Mapping:
   - `'integer'`: pass through number; reject (throw) non-numeric.
   - `'float'`: number → if `Number.isNaN` or `Number.isFinite` is false
     AND the raw was already `null` per JSON, leave `null`. (This branch
     is effectively a no-op for JSON-parsed input but documents
     intent.)
   - `'string'`: pass through.
   - `'boolean'`: pass through.
   - `'datetime'`: raw is a string (ISO) or `null`. If
     `datesAsDate`, convert via `new Date(raw)`; on `Invalid Date`,
     throw `OrientCoerceError`. Otherwise pass through.
   - `'categorical'`: raw is `{ value, category }` or `null`; pass
     through unchanged.
   - `'mixed'`: pass through.
3. Export `inferColumnType(values: unknown[]): ColumnType`. Scan all
   values (or up to a reasonable cap like 8192 cells) and pick the
   narrowest type that covers every non-null value. Empty column →
   `'unknown'`.
4. `coerce: false` at the `fromOrient` level skips the per-column pass
   entirely; `_types` becomes `'unknown'` everywhere and no datetime
   `Date` promotion occurs.

Acceptance criteria:

- Round-trip test: a `table` fixture with a `datetime64` column and a
  `category` column yields `ColumnType === 'datetime'` (or `'categorical'`)
  and the values survive a `.toRecords()` export unchanged.
- A NaN-bearing fixture (encoded as `null` on the wire) produces
  `_types[col] === 'integer'` or `'float'` per the remaining values,
  not `'mixed'`, AND `_data[col]` stays `unknown[]` (cannot pack with
  `null`).
- `datesAsDate: true` on an ISO datetime fixture produces `Date`
  instances; default keeps them as ISO strings.

### Task PDOR-08: Author Typed-Array Packing

Status: pending

Priority: P1

Suggested agent: TypeScript numeric / V8 layout specialist

Dependencies: PDOR-07

Primary ownership:

- `packages/json-frame/src/frame/pack.ts`

Finding:

Pandas emit numeric columns as JSON numbers. Above a threshold, packing
into `Int32Array` / `Float64Array` cuts memory and access cost. The
trade-off: typed arrays cannot hold `null` or mixed. Mis-packing
silently truncates values (`Int32Array.from([2147483648])` produces
negative numbers).

References:

- Design summary, decision 4 ("Opportunistic typed-array packing")

Implementation requirements:

1. Export `packColumn(name: string, values: unknown[], type: ColumnType, threshold: number): unknown[] | Int32Array | Float64Array`.
2. Rules:
   - `threshold === 0` → return `values` unchanged.
   - `values.length < threshold` → return `values` unchanged.
   - `type === 'integer'`: verify every non-null value is a safe integer
     in signed `INT32` range (`-2147483648` to `2147483647` inclusive)
     AND no `null`/`undefined` present. If all pass, return
     `Int32Array.from(values as number[])`; else return `values`
     unchanged and flip `_types` record to `'mixed'` (the caller
     `coerce.ts` replays this; the design simplification is: if any
     `null` is observed in a numeric column, `inferColumnType` already
     downgrades `_type` to `'mixed'`).
   - `type === 'float'`: verify every non-null value is a JS number
     (`typeof === 'number'`) AND no `null`/`undefined` present. If
     all pass, return `Float64Array.from(values as number[])`; else
     return `values` unchanged.
   - Any other type → return `values` unchanged.
3. `null` in a numeric column already disqualifies packing because
   `inferColumnType` returns `'mixed'` in that case — document this in
   JSDoc to avoid confusion.
4. Never throw. On any verification failure, fall back to `values`.

Acceptance criteria:

- A fixture with 300 integer rows in INT32 range yields
  `Int32Array` for that column; `type` stays `'integer'`.
- A fixture with 300 integer rows including one `2147483648` (out of
  range) yields `unknown[]` and `type === 'mixed'`.
- A fixture with 300 float rows yields `Float64Array` for that column.
- A fixture with 50 rows (below threshold) yields `unknown[]`
  regardless of type.
- A fixture with `threshold: 0` in options yields `unknown[]`
  regardless of length or type.
- Round-trip: `fromOrient(packedInt32Fixture).toRecords()` equals the
  same `fromOrient(...).toRecords()` run with `packThreshold: 0`
  (packing is loss-less).

## Wave 4: Public API Surface

### Task PDOR-09: Author `fromOrient()` Factory

Status: pending

Priority: P0

Suggested agent: TypeScript facade / API specialist

Dependencies: PDOR-04, PDOR-05, PDOR-06, PDOR-07, PDOR-08

Primary ownership:

- `packages/json-frame/src/api.ts`

Finding:

`fromOrient` is the only entry consumers use; the parsers, detector,
coercion, packing, and `DataFrame` constructor are internal. The
factory must apply options defaults, dispatch to the correct parser,
run coercion column-by-column, run packing column-by-column, and
instantiate `DataFrame` exactly once.

References:

- Design summary, "API surface (final)"

Implementation requirements:

1. Signature:
   `export function fromOrient<T = Record<string, unknown>>(payload: unknown, options?: FromOrientOptions<T>): DataFrame<T>`.
2. Default-fill options: `orient = 'auto'`, `coerce = true`,
   `datesAsDate = false`, `packThreshold = 256`, `columns = undefined`.
3. Dispatch:
   - If `orient === 'auto'`: `const resolved = detectOrient(payload)`.
   - Else: `resolved = orient`.
4. Branch by resolved orient to the matching parser. Pass filled
   options.
5. After parse: if `coerce`, run `coerceValue` against every value in
   every column (or `inferColumnType` first if parser returned
   `'unknown'` everywhere). Update `_types` in place.
6. After coerce: `packColumn(name, values, type, packThreshold)` for
   every column; rebuild `_data` with packed columns.
7. Return `new DataFrame({ columns, index, data, types, perm: null })`.

Acceptance criteria:

- `fromOrient(recordsFixture, { orient: 'records' })` deep-equals
  `fromOrient(recordsFixture)` (auto-detect) in every observable
  field.
- `fromOrient(valuesFixture, { orient: 'values' })` throws with a
  helpful message when `columns` is absent.
- `fromOrient(columnsFixture).toColumns()` returns the original
  fixture (modulo packing; with `packThreshold: 0` they deep-equal).
- All six orient fixtures produce equivalent `toRecords()` output
  (the central round-trip equivalence guarantee).

## Wave 5: Tests, README, Path Aliases

### Task PDOR-10: Author Comprehensive Test Suite

Status: pending

Priority: P0

Suggested agent: TypeScript test specialist

Dependencies: PDOR-09

Primary ownership:

- `packages/json-frame/test/**`

Finding:

The package's strongest guarantees — roundtrip equivalence across
orients, sparse-index survival through filter+sort, and loss-less
typed-array packing — are behavioral and must be covered by explicit
tests. The repo's testing pattern (vitest under root config, run
serially because each package rebuilds shared `dist/`) is non-negotiable.

References:

- `vitest.config.ts` (root)
- `AGENTS.md:14-19` ("Testing notes")
- sibling test suites at `packages/utils/test/`,
  `packages/http-errors/test/`

Implementation requirements:

1. Fixtures under `test/fixtures/`:
   - `records.json`, `index.json`, `columns.json`, `values.json`,
     `split.json`, `table.json` — all encoding the same two-row
     `alice 30, bob 25` table so cross-orient round-trip equivalence
     is testable directly.
   - `edge-values.json` — a `records`-orient payload exercising
     `null` (from NaN/Infinity), ISO datetime string, out-of-range
     integer, categorical `{value, category}`.
   - `large-int32.json` — 500-row integer fixture that trips the
     pack threshold.
   - `large-float64.json` — 500-row float fixture.
   - `mixed-with-null.json` — integer column with one `null`,
     expected to stay `unknown[]` and `'mixed'`.
2. Test files:
   - `orient/records.test.ts`, `orient/index.test.ts`,
     `orient/columns.test.ts`, `orient/values.test.ts`,
     `orient/split.test.ts`, `orient/table.test.ts`
   - `orient/detect.test.ts`
   - `frame.test.ts` — opponent-driven filter/sort/select/rename/
     resetIndex + the typo of toRecords/toColumns/toSplit/toValues
     round-trips.
   - `coerce.test.ts` — every value class in `edge-values.json`.
   - `pack.test.ts` — threshold boundary, OUT-OF-RANGE integer,
     float packing, `null` disqualification, `threshold: 0`.
   - `sparse-index.test.ts` — `_index` survives
     `filter().sort()` and survives `sort().filter()`. Labels match
     the source rows exactly.
   - `roundtrip.test.ts` — for each ordered pair (A, B) of orients,
     `fromOrient(fixtures.A, { orient: A }).toB()` deep-equals
     `fromOrient(fixtures.B, { orient: B }).toB()` for all four
     exporters.
   - `auto-detect.test.ts` is folded into `orient/detect.test.ts`.
3. Do NOT add a `apps/` example or `website/` docs test. Tests stay in
   the package.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/json-frame test` passes with all
  tests green.
- `pnpm --filter @web-ts-toolkit/json-frame build && pnpm
--filter @web-ts-toolkit/json-frame test` is the documented
  red-green loop per `AGENTS.md`.
- `pnpm lint` from the repo root is clean for the new files.
- Coverage of `src/` ≥ 95% lines (enforce via `vitest --coverage` if
  the package adds `@vitest/coverage-v8` to devDependencies; otherwise
  manual accounting in this file is acceptable).

### Task PDOR-11: Author `README.md` And Package Metadata

Status: pending

Priority: P1

Suggested agent: TS packaging / ai-friendly-ts-package specialist

Dependencies: PDOR-09

Primary ownership:

- `packages/json-frame/README.md`
- `package.json` (final pass — verify the placeholder metadata is
  consumable by `repo-toolkit/publish-packages`)

Finding:

The `ai-friendly-ts-package` skill (at
`.opencode/skills/ai-friendly-ts-package/SKILL.md` — see system prompt
available_skills list) governs the conventions for README, JSDoc
surfacing of `.d.ts` types after `npm pack`, and exports hygiene. The
README must be complete enough that a downstream AI coding assistant
can use the package after install without reading the source.

References:

- `.opencode/skills/ai-friendly-ts-package/SKILL.md`
- sibling `README.md` files (e.g. `packages/utils/README.md`,
  `packages/http-errors/README.md`)

Implementation requirements:

1. Author `README.md` with: install, quick start
   (`fromOrient`), the full `FromOrientOptions` table, the six orient
   shapes with ASCII diagrams, the `DataFrame<T>` API surface, the
   sparse-index contract, the typed-array packing contract, and a
   verification section showing `npm pack` output.
2. Run `pnpm pack` (or `npm pack --dry-run`) and verify the listed
   files are exactly: `package.json`, `README.md`,
   `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`,
   `dist/index.d.mts`. No stray files.
3. Apply the `ai-friendly-ts-package` skill checklist to the
   `exports` map (`types`/`import`/`require`/`default`), JSDoc
   surfacing types, and the `README` completeness.

Acceptance criteria:

- `npm pack --dry-run --json` lists exactly the six intended files.
- `README.md` renders cleanly (Markdown lint, if the repo runs it, is
  green — check sibling `README.md` files for the repo's convention).
- A fresh consumer TypeScript project importing only the package
  gets `<T>`-carrying completion through `dist/index.d.mts`.

### Task PDOR-12: Append `tsconfig.base.json` Aliases Already (Wait — Folded Into PDOR-03)

Status: cancelled

Note: PDOR-03 owns the `tsconfig.base.json` path-alias wiring. This
placeholder task is cancelled to avoid duplicate edits to
`tsconfig.base.json` from concurrent agents. If PDOR-03 is blocked,
agents should NOT fall through to editing `tsconfig.base.json` under
this task; the blocker belongs on PDOR-03.

## Wave 6: Final Integration Review

### Task PDOR-13: Independent Integration Review

Status: pending

Priority: P0

Suggested agent: independent reviewer (NOT the implementer of PDOR-04/05/06/07/08/09)

Dependencies: PDOR-09, PDOR-10, PDOR-11

Primary ownership:

- Whole `packages/json-frame/`
- Repo-root edits: `tsconfig.base.json`

Finding:

Final integration verifies that the package stands alone (zero runtime
deps, isomorphic), survives the full monorepo build, and does not
regress any sibling package. An independent reviewer — not the author
of the implementation tasks — must verify each acceptance criterion
against runtime behavior rather than reading the diff and trusting
intent.

References:

- `AGENTS.md:5-11` (commands)
- `AGENTS.md:14-19` (serial test reason)
- `AGENTS.md:22-23` (packaging note)

Implementation requirements (review checklist):

1. `pnpm install` from repo root resolves the new package.
2. `pnpm --filter @web-ts-toolkit/json-frame build` emits
   `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`,
   `dist/index.d.mts`; no other dist files.
3. `pnpm --filter @web-ts-toolkit/json-frame test` is green.
4. `pnpm lint` from the repo root is clean for the new files (no new
   per-package eslint override was silently introduced).
5. `pnpm build` (root; `pnpm -r --if-present build`) is green.
6. `pnpm test` (root) is green — confirms serial workspace test
   orchestration tolerates the new package.
7. Inspect the published ESM (`dist/index.mjs`) — no unresolved
   `./orient/...` or `./frame/...` extensionless specifiers survive
   (the `bundle: true` decision in PDOR-01 did its job).
8. Inspect the published `dist/index.d.mts` — `DataFrame<T>` is
   exported with the generic parameter; `FromOrientOptions<T>` is
   exported; `Orient`, `ColumnType` union members are intact.
9. Spot-check `roundtrip.test.ts` is exercised in `pnpm test` and is
   green (not skipped, no `.only`).
10. Spot-check `sparse-index.test.ts` is exercised and is green.
11. Verify `npm pack --dry-run --json` file list matches the
    acceptance criteria of PDOR-11.
12. Verify `git diff tsconfig.base.json` is only the two appended
    lines per PDOR-03 — no whitespace reformatting that would
    pollute the diff.

Acceptance criteria (definition of done):

- All twelve checks above pass.
- The package's published artifacts are isomorphic: a smoke test of
  `node -e "const m=require('./dist/index.js'); console.log(typeof m.fromOrient)"`
  from inside `packages/json-frame/` prints `function`, and an
  ESM smoke test via `node --input-type=module -e "import('./dist/index.mjs').then(m=>console.log(typeof m.fromOrient))"`
  also prints `function`.
- No new runtime dependencies introduced (`packages/json-frame/package.json`
  has empty `dependencies` and empty `peerDependencies`).
- Final completion recorded as `Completion evidence:` per the
  task-as-you-go skill convention.

## Parallelization And Sequencing

Tasks MUST run serially where they touch shared outputs (per
`AGENTS.md:14-19`). The following DAG is acceptable:

- Wave 1: PDOR-01 → (PDOR-02, PDOR-03 in parallel after PDOR-01)
- Wave 2: PDOR-02 → PDOR-04 → (PDOR-05, PDOR-06 in parallel)
- Wave 3: PDOR-07 → PDOR-08 (PDOR-07 may begin in parallel with
  PDOR-05/06 because they own disjoint files: `frame/coerce.ts`
  vs. `frame/DataFrame.ts` etc.)
- Wave 3 completion enables Wave 4: PDOR-09 must wait for
  PDOR-04/05/06/07/08 all.
- Wave 5: PDOR-10 after PDOR-09; PDOR-11 may run in parallel with
  PDOR-10 (disjoint files: `test/**` vs `README.md`).
- Wave 6: PDOR-13 strictly after all of Waves 1–5 are complete. Do
  not start until PDOR-10 and PDOR-11 are `completed`.

Shared hotspots to sequence:

- `src/index.ts` is touched by both PDOR-04 (entry re-exports) and
  PDOR-09 (no edit needed there, but PDOR-09's symbols must be
  re-exported by PDOR-04's `index.ts` work). Single edit per file.
  PDOR-04 owns it first.
- `tsconfig.base.json` is touched only by PDOR-03. No other task
  may edit it.

## Deferred Decisions (Require Maintainer Input Before PDOR-10 Closes)

None. All four design decisions were locked before this task file was
created:

1. Sparse index preservation (yes)
2. No `toDanfo()` opt-in helper (no)
3. Auto-detect scope includes `table` (yes)
4. Opportunistic `Int32Array`/`Float64Array` packing (yes, threshold 256)

If the implementer discovers a new decision surface during PDOR-04
through PDOR-09 (e.g. `select` should accept an array overload
alongside varargs), record it as a NEW follow-up task file under
`docs/tasks/` rather than silently changing the contract. Per
task-as-you-go skill guidance: "Do not hide scope growth in a
completion note."

## Definition Of Done

- All thirteen PDOR tasks are `completed` (PDOR-12 is `cancelled`
  by design — folded into PDOR-03).
- `pnpm --filter @web-ts-toolkit/json-frame build` is green.
- `pnpm --filter @web-ts-toolkit/json-frame test` is green,
  including `sparse-index.test.ts` and `roundtrip.test.ts`.
- `pnpm lint` is clean.
- `pnpm build` (root) and `pnpm test` (root) are both green.
- `npm pack --dry-run --json` from `packages/json-frame/` lists
  exactly: `package.json`, `README.md`, `dist/index.js`,
  `dist/index.mjs`, `dist/index.d.ts`, `dist/index.d.mts`.
- `packages/json-frame/package.json` has empty `dependencies` and
  empty `peerDependencies`.
- `git diff tsconfig.base.json` is exactly the two alias lines from
  PDOR-03.
- PDOR-13 review is signed off by an agent other than the
  implementer of PDOR-04/05/06/07/08/09.
- All completions recorded as `Completion evidence:` blocks at the
  end of each completed task in this file.

## Initial Baseline Verification

To be recorded by PDOR-13 at the close of the work:

- Repo root state before this task was created:
  - 13 existing task documents under `docs/tasks/` (one was named
    above as a style reference).
  - `packages/json-frame/` did not exist.
  - `tsconfig.base.json` carried no `@web-ts-toolkit/json-frame`
    alias.
- Verification commands (to be re-run at PDOR-13 close): see the
  PDOR-13 implementation requirements.
