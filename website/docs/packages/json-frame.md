---
sidebar_label: JSON Frame
sidebar_position: 20
---

# `@web-ts-toolkit/json-frame`

Normalize pandas `DataFrame.to_json()` payloads into one immutable, column-major `DataFrame` API for TypeScript.

The package accepts JSON strings or parsed JSON values for all six pandas DataFrame JSON orients and exports back to each supported orient without runtime dependencies.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/json-frame
```

## Import

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';
```

The package root is named-export only. There is no default export and no supported deep import path.

## Quick Start

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

interface WeatherRow {
  city: string;
  temp: number;
}

const frame = fromOrient<WeatherRow>('[{"city":"Paris","temp":21},{"city":"Rome","temp":30}]');
const hottest = frame.sort((left, right) => right.temp - left.temp).row(0);
const split = frame.toSplit();

void [hottest, split];
```

## Inferred Row Types

Parsed `records` with omitted, `auto`, or explicit `records` orient infer known required fields precisely. Sparse, heterogeneous, and optional fields include `null` for missing-cell normalization and remain optional: a column absent from every row is never created, so reading it returns `undefined`. Use `!= null` to guard both. Heterogeneous variants are flattened into one column shape; discriminants do not prove another cell is present. Nested cells retain their types and are not null-filled internally.

Requiredness follows declared keys in every variant, including `toString`, `constructor`, and `valueOf`; inherited Object members do not supply cells. Numeric literal keys and equivalent string spellings such as `1` and `'1'` infer one string-named column, merging cell types and requiredness before aggregation. Both `[1]` and `['1']` access it. Non-equivalent strings such as `'01'` remain distinct. Dense literals retain precise unions; sparse or optional aliases need null-safe guards.

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

const dense = fromOrient([{ n: 1 }, { n: 2 }]);
const formatted: string = dense.row(0).n.toFixed();
const sparse = fromOrient([{ n: 1 }, {}]);
const present = sparse.filter((row) => row.n != null && row.n.toFixed() === '1');
// sparse.row(1).n is null; an undefined-only guard is insufficient.
const members = fromOrient([{ toString: 'ok' }, {}] as const);
const text = members.row(1).toString?.toUpperCase(); // undefined: the cell is null
const numeric = fromOrient([{ 1: 1 }, { '1': 'x' }] as const);
const cell: 1 | 'x' = numeric.row(0)[1]; // also accessible as numeric.row(0)['1']
const values = fromOrient([[1]], { columns: ['n'] });
const n = values.row(0).n; // Read n from the object-shaped row.
const valueText = typeof n === 'number' ? n.toFixed() : '';

void [formatted, present, text, cell, valueText];
```

Values arrays (including readonly tuples), JSON strings, other layouts, broad dictionary records, and broadly typed orient options use conservative `JsonRow` inference. Explicit `fromOrient<MyRow>(...)` preserves your asserted domain model, including optional interfaces, without runtime application-schema validation. Ensure it describes the normalized rows. `select()` and `rename()` return conservatively typed `DataFrame<JsonRow>`; `filter()`, `sort()`, and `resetIndex()` retain the row model.

Open index domains keep that fallback, including `string`, `number`, and template patterns such as `` `metric_${string}` ``, `` `${number}` ``, or `` `${string}_metric` ``. Unions or intersections with known properties also fall back to `JsonRow` when an open index domain is present. A dictionary describes allowed names, not an infinite set of present columns: missing cells in existing columns become `null`, while columns absent from every row are not created. Use a scalar guard such as `typeof cell === 'number'` before numeric operations; an undefined-only guard is insufficient. The fallback conservatively widens even known fields to JSON values. Finite template-key unions such as `` `metric_${'a' | 'b'}` `` retain precise fields and declared optionality.

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

const rows: Record<`metric_${string}`, number>[] = [{ metric_n: 1 }, {}];
const frame = fromOrient(rows); // DataFrame<JsonRow>
frame.filter((row) => typeof row.metric_n === 'number' && row.metric_n.toFixed() === '1');
// frame.row(1).metric_n is null; frame.row(0).metric_absent is undefined.
```

## Supported Orients

- `records`
- `index`
- `columns`
- `values`
- `split`
- `table`

`split` and `table` preserve source row order exactly. `index` and `columns` derive row order from JavaScript object property enumeration; integer-like keys such as `"10"` and `"2"` enumerate in numeric order after `JSON.parse()` or when supplied as parsed objects. Use `split` or `table` when exact row order matters for integer-like labels.

Non-empty `values` arrays are auto-detected, but every `values` payload requires `options.columns` because the orient carries no column labels. Empty `values` input requires both `orient: 'values'` and `columns`.

Auto-detection recognizes `table`, `split`, non-empty `records`, and non-empty `values`. Always supply an explicit orient for `index`, `columns`, empty arrays, and empty objects; nested-object structure cannot reliably distinguish the two object-key layouts. `records` and `values` receive synthetic numeric indexes. An omitted split index also synthesizes one; a present malformed index is rejected. Column labels must be unique strings and `options.columns` must be dense.

Other ingestion options are `columnTypes` (explicit non-table logical types), `packThreshold` (numeric packing threshold, default `256`; `0` disables packing), and opt-in `maxNodes` (see below).

## Table Schema

`toTable()` emits Table Schema JSON, retaining supported field/schema metadata. It omits synthetic indexes and emits source indexes as a field plus `primaryKey`. Source labels must be unique at table ingestion/export; equality uses JavaScript `Map`/SameValueZero semantics, so numeric `1` and string `'1'` are distinct. Object-key exporters stringify labels and reject collisions such as these with `ExportKeyCollisionError`.

Source index and data-field metadata retain their separate roles through transforms even if the primary-key field was not first. A data-column rename may collide with the retained index name; table export then requires a unique `indexField` override (or a subsequent rename/resetIndex). The default emitted source index name is its retained table name, otherwise `index`.

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

const frame = fromOrient(
  {
    schema: {
      fields: [
        { name: 'value', type: 'integer' },
        { name: 'pk', type: 'string' },
      ],
      primaryKey: ['pk'],
    },
    data: [{ pk: 'r0', value: 42 }],
  },
  { orient: 'table' },
);
const table = frame.rename({ value: 'pk' }).toTable({ indexField: 'row_id' });
// row_id retains string index metadata; pk retains integer data metadata.
void table;
```

In Table Schema payloads, `schema.pandas_version` is the Table Schema format version emitted by pandas, commonly `"1.4.0"`; it is not the installed pandas package version.

## Logical Types

`columnInfo` exposes logical type metadata: `integer`, `float`, `string`, `boolean`, `datetime`, `categorical`, `mixed`, or `unknown`. Non-table inputs infer the narrowest logical type by scanning the full column; `null` sets nullability without turning an otherwise numeric column into `mixed`. `options.columnTypes` validates explicit types against every non-null cell before packing. Incompatibility produces `JsonFrameValidationError` with orient/path/row/column/value diagnostics. Values are never coerced. Source Table Schema metadata is preserved; pandas-authored field semantics remain caller/pandas responsibility rather than general schema enforcement.

Only own enumerable string keys in `columnTypes` are overrides; inherited properties are ignored. Ordinary and null-prototype dictionaries are copied without mutating the caller. Prototype-member names such as `constructor`, `toString`, `hasOwnProperty`, and `__proto__` are valid columns even with empty or partial overrides. For an explicit `__proto__` override, use a computed key such as `{ ['__proto__']: 'float' }`. Source Table Schema field types take precedence over overrides.

- Explicit `integer`, `float`, `string`, and `boolean` require matching JSON scalars; `float` also accepts integer JSON numbers.
- Explicit `datetime` accepts calendar-valid, timezone-naive ISO strings for four-digit years **0000–9999** under proleptic Gregorian rules. Leap years are divisible by 4 except centuries not divisible by 400: `0000-02-29` and `2000-02-29` are valid, `0100-02-29` and `1900-02-29` are not. Grammar: `YYYY-MM-DD`, optionally followed by `T` or one space and `HH:mm:ss`, optionally with a decimal point and 1–9 fractional-second digits. Hours are 00–23 and minutes/seconds 00–59. Timezone suffixes, leap seconds, signed/expanded years, and numeric epochs are rejected. Exact strings/fractional precision survive unchanged; ordinary inferred ISO-looking strings stay `string` unless schema or explicit types say otherwise.
- `categorical` accepts non-null scalar JSON cells and exports as Table Schema `type: 'any'` with `extDtype: 'category'` when no source field metadata is being preserved. `mixed` and `unknown` accept any JSON-compatible cell.

Calendar validity does **not** guarantee pandas read-back across the full range: dtype and resolution impose separate limits. The historical [JFB-07 investigation](https://github.com/egose/web-ts-toolkit/blob/HEAD/docs/tasks/20260908-180959-json-frame-boundary-health-follow-up.md#task-jfb-07-resolve-datetime-year-range-semantics), using pandas **3.0.3** / CPython **3.14.6**, recorded early-year ISO emission at microsecond resolution but table read-back failures outside nanosecond bounds. This is prior evidence, not a fresh pandas experiment. Numeric epochs have no unit metadata in generated Table Schema and pandas interprets numeric datetime cells as nanoseconds; check your target dtype/resolution.

Typed-array packing is internal and only eligible non-null numeric columns at or above `packThreshold` are packed. Packed/unpacked access and payload exports preserve the same values, including negative zero, and logical metadata. Native `JSON.stringify(-0)` produces `0`.

## Empty-Dimension Round Trips

Use **`split` or `table`** when an empty report must carry its dimensions in the payload. Round trips are semantic, not byte-for-byte. This matrix shows **export then re-ingestion with the matching explicit orient**, for parsed and string exports. `R` and `C` are positive row/data-column counts; index fields are not data columns. `values` assumes separately supplied original columns.

| Orient    | Zero rows, declared columns (`0 × C`)                  | Rows, zero columns (`R × 0`)                                     | Fully empty (`0 × 0`)                    |
| --------- | ------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------- |
| `records` | `[]` → `0 × 0`; column labels lost                     | `R` empty objects → `R × 0`                                      | `[]` → `0 × 0`                           |
| `index`   | `{}` → `0 × 0`; column labels lost                     | `R` index keys with empty objects → `R × 0`                      | `{}` → `0 × 0`                           |
| `columns` | `C` column keys with empty objects → `0 × C`           | `{}` → `0 × 0`; rows and index labels lost                       | `{}` → `0 × 0`                           |
| `values`  | `[]` + supplied columns → `0 × C`                      | `R` empty arrays + `columns: []` → `R × 0`                       | `[]` + `columns: []` → `0 × 0`           |
| `split`   | `columns` retained, empty `index`/`data` → `0 × C`     | Empty `columns`, `R` index labels and empty row arrays → `R × 0` | Empty `columns`/`index`/`data` → `0 × 0` |
| `table`   | Data fields retained in schema, empty `data` → `0 × C` | No data fields, `R` row objects → `R × 0`                        | No data fields, empty `data` → `0 × 0`   |

`values` requires `options.columns` even for `[]` or `[[], []]`; empty arrays also require explicit orient. That option applies only to `values` and cannot restore columns lost through empty `records`/`index`. Column labels/order are retained where the layout carries them, subject to JavaScript enumeration of object keys.

`records`/`values` regenerate synthetic numeric indexes. `index`/`columns` re-ingest string keys as source labels in enumeration order; `columns` cannot carry rows without columns. `split` emits the current index array, including any gaps after filtering, and re-ingests it as **source** even when originally synthetic. `table` preserves a source index field and `primaryKey` even on fully empty frames; zero-column rows contain only that field. For synthetic indexes it emits no index field, uses `{}` for zero-column rows, and regenerates `0..R-1` on re-ingestion, losing filtered gaps. Normal uniqueness and index-field collision checks still apply.

Only `table` carries logical types and retained field/schema metadata. A zero-row numeric column in `split`, `columns`, or `values` has no cells from which to infer its original type; supply non-table `columnTypes` if needed.

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

const report = fromOrient([{ a: 1 }, { a: 2 }], { orient: 'records' });
const noRows = report.filter(() => false);
const noColumns = report.select();
const shaped = fromOrient(noRows.toSplit(), { orient: 'split' }); // 0 × 1
const rowCount = fromOrient(noColumns.toTable(), { orient: 'table' }); // 2 × 0
const lostRows = fromOrient(noColumns.toColumns(), { orient: 'columns' }); // 0 × 0
const restoredColumns = fromOrient(noRows.toValues(), { orient: 'values', columns: noRows.columns });

void [shaped, rowCount, lostRows, restoredColumns];
```

## Immutability

The `DataFrame` contract is structural and shallow. Frame-owned arrays, row records, exporter containers, table schema records, and internal maps are protected from direct mutation or are freshly allocated. Nested JSON object or array cell values are not deep-frozen or deep-cloned on every read/export; if caller code mutates one of those nested values after obtaining it from `row()`, `rows()`, or an exporter, another read of the same cell may observe that mutation.

Clone nested object/array cells at your application boundary if you need deep immutability.

`filter`, stable `sort`, `select`, `rename`, and `resetIndex` return new frames. Filtering and sorting keep labels; `resetIndex()` replaces them with a synthetic `0..n-1`. Row access uses `row(position)` and `rows()`. Exporters are `toRecords()`, `toIndex()`, `toColumns()`, `toValues()`, `toSplit()`, `toTable(options?)`, and `toJSONString(orient, options?)`.

## Limits And Errors

`JSON_FRAME_MAX_DEPTH` is `1000`. Arrays/objects count from the validated root at depth `0`; containers at depth `1000` are accepted and at `1001` fail with path-bearing `JsonFrameValidationError`. For `toJSONString()` the root is the **complete exported payload**, including orient wrappers. `split`/`table` nest cells one level deeper than `records`/`values`/`index`/`columns`, so a cell accepted at ingestion may fail in a deeper output layout. Table metadata cloning uses the same depth policy; `toTable()` and table string export can reject over-depth metadata.

### Serialization After Mutation

`toJSONString()` validates the complete output before native serialization. Cycles, over-depth containers, sparse arrays, and newly introduced non-JSON values (`undefined`, `bigint`, `symbol`, `function`, non-finite numbers, non-plain objects) fail with path-bearing `JsonFrameValidationError` carrying the selected orient. Valid nested JSON preserves its shallow cell identity on later reads.

Validation is one traversal without cloning, followed by native `JSON.stringify()`. Repeated acyclic references are revisited per occurrence and expand during stringification. Own enumerable property/array reads invoke caller getters and `Proxy` traps; native serialization can additionally invoke `toJSON`, including non-enumerable hooks invisible to validation. Hooks may change values between passes and remain caller responsibility; arbitrary JavaScript is not sandboxed.

### Opt-In Traversal Budgets

`fromOrient(input, { maxNodes })` and `frame.toJSONString(orient, { maxNodes })` accept a **positive safe integer**. Zero, negative, fractional, non-finite/unsafe integers, `null`, and other nonnumbers throw `JsonFrameOptionError`. Omitted/undefined means no quota. All six string orients validate options; `indexField` must be a string when supplied, affects only table, and combines with `maxNodes`.

The root counts as one, followed by every property/array-element **value occurrence**, including scalars, `null`, and empty containers; property names are not nodes. Repeated aliases count on every path and ingestion still clones each occurrence separately. Exact-budget traversal succeeds; attempting the next node fails with path-bearing `JsonFrameValidationError` and the orient when known. Auto ingestion detects orient only after cloning. String export counts wrappers, labels, and table metadata, so orient budgets differ. Counters reset per call; ingestion budgets are **not retained by frames** or inherited by exports/transforms.

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

const frame = fromOrient('[{"n":1}]', { orient: 'records', maxNodes: 3 });
const records = frame.toJSONString('records', { maxNodes: 3 });
const split = frame.toJSONString('split', { maxNodes: 8 });
const indexed = fromOrient({ r0: { n: 1 } }, { orient: 'index', maxNodes: 3 });
const table = indexed.toJSONString('table', { indexField: 'row_id', maxNodes: 15 });

void [records, split, table];
```

This limits traversal expansion, **not total resources**. It does not bound input bytes or preceding native `JSON.parse()`, key enumeration/allocation (including diagnostic key counting), rectangular frame densification, export payload/schema construction before validation, native stringification/output bytes, hooks, or total memory. Scalars can be arbitrarily large. Validation allocates traversal bookkeeping, not a redundant full clone. Depth/cycle/JSON checks apply independently. Object exporters such as `toTable()` have no `maxNodes` option. Applications need their own size and trust boundaries.

### Structured Diagnostics

Root-exported errors are `JsonFrameParseError` (invalid JSON; original `SyntaxError` in `cause`), `JsonFrameOptionError` (invalid options), `JsonFrameValidationError` (shape, transform, or JSON-value validation), `AmbiguousOrientError` (unresolved auto detection), `UnsupportedFeatureError`, and `ExportKeyCollisionError`.

`JsonFrameError` exposes `orient`, `path`, `row`, `column`, and `value` when relevant. Scalar strings/numbers (including non-finite numbers)/booleans/null are retained directly. Other values become frozen summaries: arrays use `{ kind: 'array', length }`; objects use `{ kind: 'object', keyCount, keys, truncated }`; undefined/symbol/bigint/function use their `kind`. Cyclic containers are summarized rather than retained. Constructing or serializing these diagnostics does not invoke caller `toJSON` hooks.

Object previews retain at most **5 keys / 200 characters of key text total**. `truncated` is true when either key count or text is shortened; false means the key preview is complete. `keyCount` reports the full own enumerable key count. This bounds retained/serialized previews, **not the whole error**: scalar strings, paths, column/option/key names, and collision labels can be input-sized. `Object.keys()` visits/allocates all keys for counting, so error construction is not constant-space.

## Types

The root exports `fromOrient`, `JSON_FRAME_MAX_DEPTH`, and error classes as values. Named types include `DataFrame` (an interface, not a public constructor), `FromOrientOptions`, `ToTableOptions`, `ToJSONStringOptions`, `JsonRow`, `JsonValue`, `JsonFrameDiagnosticValue`, all six payload types, Table Schema metadata, and column/index types. Normal JSON-compatible domain interfaces need no catch-all index signature.

The isomorphic package has no runtime or peer dependencies and publishes CJS, ESM, `.d.ts`, and `.d.mts` entrypoints (Node package engine: `>=22`). MultiIndex, duplicate/non-string columns, pandas Series shapes, JSON Lines, compression, file I/O/streaming, general extension-dtype reconstruction, and deep freezing are outside the supported contract.
