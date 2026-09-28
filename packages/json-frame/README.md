# `@web-ts-toolkit/json-frame`

Normalize pandas `DataFrame.to_json()` payloads into one immutable, column-major `DataFrame` API for TypeScript.

`@web-ts-toolkit/json-frame` accepts a JSON string or parsed JSON value, ingests all six pandas DataFrame JSON orients, and exports back to every supported orient without adding runtime dependencies. `split` and `table` preserve source row order exactly; object-key orients use JavaScript property enumeration order, so integer-like keys can be reordered.

## Installation

```sh
pnpm add @web-ts-toolkit/json-frame
```

Canonical import:

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';
```

The package exports named values and types from the package root. There is no default export and no supported deep import path.

`JSON_FRAME_MAX_DEPTH` is `1000`. JSON arrays and objects are counted from the validated root at depth `0`; an array or object reached at depth `1000` is accepted, and one reached at depth `1001` fails with `JsonFrameValidationError` before package traversal can exhaust the JavaScript stack. For `toJSONString()` the root is the complete exported payload including orient-specific wrappers: `split` and `table` nest cell values one level deeper than `records`, `values`, `index`, and `columns`. A nested cell accepted at ingestion may therefore be rejected when serialized in a deeper output layout.

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

`fromOrient(input, options?)` accepts:

- a JSON string produced by pandas `DataFrame.to_json()`
- a parsed JSON value with the same shape

The returned `DataFrame` is immutable. `filter`, `sort`, `select`, `rename`, and `resetIndex` all return new frames.

The `TRow` generic is a compile-time row model only. It improves `row()`, `rows()`, `filter()`, and `sort()` types for JSON-compatible domain interfaces, but it does not validate an application schema at runtime; payload validation follows the selected orient contract.

### Inferred Row Types

Parsed `records` with omitted, `auto`, or explicit `records` orient infer known required fields precisely. Sparse, heterogeneous, and optional fields include `null`, matching missing-cell normalization. Those fields also remain optional: if no input row supplies a column, it is never created and reading it returns `undefined`. Use `!= null` to guard both. Heterogeneous row variants are flattened into one column shape; a discriminant does not prove another cell is present. Nested cell objects retain their own types and are not null-filled internally.

Requiredness follows declared keys in every record variant, including names such as `toString`, `constructor`, and `valueOf`; inherited Object members do not supply cells. Numeric literal keys and their equivalent string spellings are combined before inferring cell types and requiredness: `1` and `'1'` describe one column named `'1'`, accessible with either `[1]` or `['1']`. Non-equivalent strings such as `'01'` remain distinct. Dense literals retain precise value unions; sparse or optional aliases require the same null-safe guards as other columns.

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

const dense = fromOrient([{ n: 1 }, { n: 2 }]);
const formatted: string = dense.row(0).n.toFixed(); // number, no extra null guard

const sparse = fromOrient([{ n: 1 }, {}]);
const present = sparse.filter((row) => row.n != null && row.n.toFixed() === '1');
// sparse.row(1).n is null at runtime; an undefined-only guard is insufficient.

const members = fromOrient([{ toString: 'ok' }, {}] as const);
const text = members.row(1).toString?.toUpperCase(); // undefined: the cell is null
const numeric = fromOrient([{ 1: 1 }, { '1': 'x' }] as const);
const cell: 1 | 'x' = numeric.row(0)[1]; // same column as numeric.row(0)['1']

const values = fromOrient([[1]], { columns: ['n'] });
// Values rows are objects, including with readonly tuple inputs and auto orient.
const n = values.row(0).n;
const valueText = typeof n === 'number' ? n.toFixed() : '';

void [formatted, present, text, cell, valueText];
```

Values arrays, JSON strings, other layouts, broad dictionary records, and broadly typed orient options use conservative `JsonRow` inference rather than guessing column types. Supplying `fromOrient<MyRow>(...)` intentionally preserves your asserted domain model, including optional properties; ensure it describes actual normalized rows. It does not perform runtime application-schema validation.

Open index domains keep that fallback, including `string`, `number`, and template patterns such as `` `metric_${string}` ``, `` `${number}` ``, or `` `${string}_metric` ``. Unions or intersections with known properties also fall back to `JsonRow` when an open index domain is present. A dictionary describes allowed names, not an infinite set of present columns: missing cells in existing columns become `null`, while columns absent from every row are not created. Use a scalar guard such as `typeof cell === 'number'` before numeric operations; an undefined-only guard is insufficient. The fallback conservatively widens even known fields to JSON values. Finite template-key unions such as `` `metric_${'a' | 'b'}` `` retain precise fields and declared optionality.

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

const rows: Record<`metric_${string}`, number>[] = [{ metric_n: 1 }, {}];
const frame = fromOrient(rows); // DataFrame<JsonRow>
frame.filter((row) => typeof row.metric_n === 'number' && row.metric_n.toFixed() === '1');
// frame.row(1).metric_n is null; frame.row(0).metric_absent is undefined.
```

## Supported Orients

All six pandas DataFrame JSON orients are supported.

```ts
import { fromOrient, type TablePayload } from '@web-ts-toolkit/json-frame';

const recordsFrame = fromOrient([{ city: 'Paris', temp: 21 }], { orient: 'records' });

const indexFrame = fromOrient(
  {
    row_1: { city: 'Paris', temp: 21 },
  },
  { orient: 'index' },
);

const columnsFrame = fromOrient(
  {
    city: { row_1: 'Paris' },
    temp: { row_1: 21 },
  },
  { orient: 'columns' },
);

const valuesFrame = fromOrient([['Paris', 21]], {
  orient: 'values',
  columns: ['city', 'temp'],
});

const splitFrame = fromOrient(
  {
    columns: ['city', 'temp'],
    index: ['row_1'],
    data: [['Paris', 21]],
  },
  { orient: 'split' },
);

const tablePayload = {
  schema: {
    fields: [
      { name: 'row_id', type: 'string' },
      { name: 'city', type: 'string' },
      { name: 'temp', type: 'integer' },
    ],
    primaryKey: ['row_id'],
    pandas_version: '1.4.0',
  },
  data: [{ row_id: 'row_1', city: 'Paris', temp: 21 }],
} satisfies TablePayload;

const tableFrame = fromOrient(tablePayload, { orient: 'table' });

const splitRoundTrip = fromOrient(splitFrame.toSplit(), { orient: 'split' });
const tableRoundTrip = fromOrient(tableFrame.toTable(), { orient: 'table' });

void [recordsFrame, indexFrame, columnsFrame, valuesFrame, splitFrame, tableFrame, splitRoundTrip, tableRoundTrip];
```

Orient notes:

- `records` and `values` do not carry source index labels. They receive a synthetic numeric index `0..n-1`.
- `index`, `columns`, `split`, and `table` preserve supported source index labels.
- `index` and `columns` derive row order from JavaScript object property enumeration. Integer-like keys such as `"10"` and `"2"` enumerate in numeric order after `JSON.parse()` or when supplied as parsed objects, even if the JSON text listed `"10"` first.
- Use `split` or `table` when exact row order matters for integer-like index labels.
- Non-empty `values` arrays are auto-detected, but `values` always requires `options.columns` because the payload carries no column labels.
- Empty `values` input requires both `orient: 'values'` and `columns`.
- `index` and `columns` are distinct supported payloads, but auto-detection cannot safely distinguish them from nested-object structure alone.
- In Table Schema payloads, `schema.pandas_version` is the Table Schema format version emitted by pandas, commonly `"1.4.0"`; it is not the installed pandas package version.

## Auto Detection And Options

`options.orient` defaults to `auto`.

Auto-detection recognizes only structurally unambiguous payloads:

- `table`
- `split`
- non-empty `records`
- non-empty `values`

Pass an explicit orient for:

- any `index` payload
- any `columns` payload
- empty arrays
- empty objects
- empty `values` payloads

Other `fromOrient` options:

- `columns`: required whenever the payload is `values`, including non-empty `values` arrays detected by `auto`
- `columnTypes`: explicit logical types for non-table inputs
- `packThreshold`: minimum length for internal numeric typed-array packing; `0` disables packing
- `maxNodes`: optional positive safe integer limiting ingestion traversal occurrences; omitted means no quota (see below)

```ts
import { AmbiguousOrientError, JsonFrameOptionError, fromOrient } from '@web-ts-toolkit/json-frame';

let candidates: readonly string[] = [];
let option = '';

try {
  fromOrient({ row_1: { city: 'Paris', temp: 21 } });
} catch (error) {
  if (error instanceof AmbiguousOrientError) {
    candidates = error.candidates;
  }
}

try {
  fromOrient([['Paris', 21]], { orient: 'values' });
} catch (error) {
  if (error instanceof JsonFrameOptionError) {
    option = error.option;
  }
}

void [candidates, option];
```

## Transforms And Exporters

The `DataFrame` API is intentionally small and predictable.

Read access:

- `columns`
- `index`
- `columnInfo`
- `length`
- `row(position)`
- `rows()`

Transforms:

- `filter(predicate)`
- `sort(compare)`
- `select(...columns)`
- `rename(mapping)`
- `resetIndex()`

Exporters:

- `toRecords()`
- `toIndex()`
- `toColumns()`
- `toValues()`
- `toSplit()`
- `toTable(options?)`
- `toJSONString(orient, options?)`

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

interface WeatherRow {
  city: string;
  temp: number | null;
  coastal: boolean;
}

const frame = fromOrient<WeatherRow>(
  [
    { city: 'Paris', temp: 21.5, coastal: false },
    { city: 'Tokyo', temp: 27.1, coastal: true },
    { city: 'Oslo', temp: null, coastal: true },
  ],
  {
    orient: 'records',
    columnTypes: {
      temp: 'float',
      coastal: 'boolean',
    },
    packThreshold: 0,
  },
);

const transformed = frame
  .filter((row) => row.temp !== null)
  .sort((left, right) => (right.temp ?? -1) - (left.temp ?? -1))
  .rename({ temp: 'celsius' })
  .select('city', 'celsius')
  .resetIndex();

const table = transformed.toTable();
const json = transformed.toJSONString('records');

void [table, json];
```

Transform behavior:

- row order is preserved unless you call `sort`
- `sort` is stable
- filtering and sorting preserve index labels
- `resetIndex()` is the only transform that replaces the current index with `0..n-1`
- `rename` ignores keys that are not current columns and rejects duplicate results
- exporters return fresh top-level JSON-compatible arrays/records for the exported orient

Structural immutability is shallow. Frame-owned arrays, row records, exporter containers, table schema records, and internal maps are protected from direct mutation or are freshly allocated. Nested JSON object or array cell values are not deep-frozen or deep-cloned on every read/export; if caller code mutates one of those nested values after obtaining it from `row()`, `rows()`, or an exporter, another read of the same cell may observe that mutation.

`toJSONString(orient, options?)` validates the complete selected output with the shared bounded traversal before native serialization. Cycles, over-depth containers, sparse arrays, and newly introduced non-JSON values (`undefined`, `bigint`, `symbol`, `function`, non-finite numbers, non-plain objects) fail with path-bearing `JsonFrameValidationError` carrying the selected orient instead of native `TypeError`/`RangeError` behavior. Valid nested JSON serializes unchanged and preserves shallow cell identity on subsequent reads.

Validation is one traversal pass without cloning the payload, followed by native `JSON.stringify()`. Only the ancestor chain is tracked, so repeated references to the same acyclic container are visited once per occurrence and expand as stringification expands them. Optional `maxNodes` bounds validation visits; omission leaves breadth unlimited. Validation reads own enumerable properties and array elements, which invokes caller-installed getters and `Proxy` traps; native serialization may additionally invoke `toJSON` hooks, including non-enumerable ones invisible to validation. Hooks can change values between passes and are caller responsibility; the package does not sandbox arbitrary JavaScript.

### Opt-In Traversal Budgets

`fromOrient(input, { maxNodes })` and `frame.toJSONString(orient, { maxNodes })` accept a **positive safe integer**. Zero, negatives, fractions, non-finite/unsafe integers, `null`, and other nonnumbers throw `JsonFrameOptionError`. Options are validated for all six serialization orients; `indexField` must be a string when supplied and affects only table output. It can be combined with `maxNodes`.

Each traversal counts its root as one node, then every property/array-element **value occurrence**, including scalars, `null`, and empty containers. Property names are not nodes. Repeated aliases count again on every path; ingestion still creates detached clones for each occurrence. Exact-budget traversal succeeds; attempting the next node throws path-bearing `JsonFrameValidationError` with the orient when known (auto ingestion detects orient after cloning). Serialization counts the **complete exported payload**, including orient wrappers, labels and table metadata, so different orients need different budgets. Counters reset per call. An ingestion budget is **not retained by the frame** or inherited by later exports or transforms; omitted options impose no default quota.

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

// Three nodes: root array, row object, number. JSON strings count after JSON.parse.
const frame = fromOrient('[{"n":1}]', { orient: 'records', maxNodes: 3 });
const records = frame.toJSONString('records', { maxNodes: 3 });
// Split adds wrappers and labels: eight nodes for this one-cell frame.
const split = frame.toJSONString('split', { maxNodes: 8 });
const indexed = fromOrient({ r0: { n: 1 } }, { orient: 'index', maxNodes: 3 });
const table = indexed.toJSONString('table', { indexField: 'row_id', maxNodes: 15 });

void [records, split, table];
```

This is a traversal-expansion limit, **not a total resource limit**. It does not bound input/string bytes or the preceding native `JSON.parse()`, object-key enumeration/allocation (including diagnostic key counting), rectangular frame densification, export payload/schema construction before validation, native stringification/output bytes, caller hooks, or total process memory. Scalars may be arbitrarily large. Validation allocates traversal bookkeeping but no redundant full clone. The fixed depth/cycle/JSON-compatibility checks still apply independently. Object-returning exporters such as `toTable()` have no `maxNodes` option. Applications still need their own size and trust boundaries.

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

const frame = fromOrient([{ city: 'Paris', details: { tags: ['capital'] } }], { orient: 'records' });
const exported = frame.toRecords();
const details = exported[0]!.details as { tags: string[] };

details.tags.push('visited');

const reread = frame.row(0).details as { tags: readonly string[] };

void reread.tags;
```

Treat nested object/array cells as caller-owned mutable JSON values. Clone them at your application boundary if you need deep immutability.

## Logical Types And Packing

`columnInfo` exposes logical type metadata for each column.

Supported logical types:

- `integer`
- `float`
- `string`
- `boolean`
- `datetime`
- `categorical`
- `mixed`
- `unknown`

Type rules:

- Table Schema metadata is preserved when `orient: 'table'` is used; pandas-authored field metadata remains caller/pandas responsibility.
- Other orients infer the narrowest logical type by scanning the full column.
- `options.columnTypes` supplies explicit logical types for non-table inputs. Declared types are validated against every non-null cell before packing; incompatible cells fail with `JsonFrameValidationError` carrying `path`, `row`, `column`, and `value` diagnostics.
- Only own enumerable string keys in `columnTypes` are overrides; inherited properties are ignored. Ordinary and null-prototype dictionaries are supported and copied without mutating the caller. Names such as `constructor`, `toString`, `hasOwnProperty`, and `__proto__` remain valid columns with omitted, empty, partial, or explicit overrides. Use a computed key for an explicit `__proto__` override, for example `{ ['__proto__']: 'float' }`. Source Table Schema field types take precedence over overrides.
- Explicit `integer`, `float`, `string`, and `boolean` require matching JSON scalar cells. `float` accepts integer JSON numbers because Table Schema `number` accepts both integer and fractional JSON numbers.
- Explicit `datetime` accepts calendar-valid, timezone-naive ISO strings for four-digit years **0000–9999**, using proleptic Gregorian rules: leap years are divisible by 4 except centuries not divisible by 400. Thus `0000-02-29` and `2000-02-29` are valid, while `0100-02-29` and `1900-02-29` are not. The grammar is `YYYY-MM-DD`, optionally followed by `T` or one space and `HH:mm:ss`, optionally followed by a decimal point and 1–9 fractional-second digits. Hours must be 00–23 and minutes/seconds 00–59; timezone suffixes, leap seconds, signed/expanded years, and numeric epochs are rejected. Strings and their fractional precision are preserved exactly. Numeric epochs have no unit metadata in generated Table Schema and pandas reads numeric `datetime` cells as nanoseconds.
- Explicit `categorical` accepts non-null scalar JSON cells (`string`, `number`, or `boolean`) and generated table output emits `type: 'any'` with `extDtype: 'category'` unless source Table Schema field metadata is being preserved.
- Explicit `mixed` and `unknown` accept any JSON-compatible cell value.
- `null` marks a column as nullable without forcing an otherwise numeric column to become `mixed`.
- ISO-looking strings are preserved as strings unless table metadata or compatible explicit `columnTypes` says otherwise.
- Values are never coerced to satisfy logical type metadata.

Calendar validity does **not** guarantee pandas read-back across the full year range. Pandas dtype and time resolution impose separate limits. The prior JFB-07 investigation (pandas **3.0.3**, CPython **3.14.6**) recorded ISO emission of years `0000`, `0001`, and `0099` at microsecond resolution, but `read_json(..., orient='table')` failed outside nanosecond bounds. This is previously recorded evidence, not a new pandas experiment for the calendar fix; see [JFB-07 evidence](https://github.com/egose/web-ts-toolkit/blob/HEAD/docs/tasks/20260908-180959-json-frame-boundary-health-follow-up.md#task-jfb-07-resolve-datetime-year-range-semantics). Check the target pandas dtype/resolution when exchanging dates outside its read-back range.

Packing rules:

- typed-array packing is an internal optimization only
- packed and unpacked frames export the same JSON values
- packing never changes logical type metadata
- only non-null numeric columns at or above `packThreshold` are eligible

## Round Trips And Index Provenance

Round trips are semantic rather than byte-for-byte, with the empty-dimension exceptions below.

- column labels/order are retained where the layout carries them, subject to JavaScript enumeration of object keys; cell JSON values are preserved apart from native JSON text formatting (for example, `JSON.stringify(-0)` produces `0`)
- `split` and `table` preserve row order exactly
- `index` and `columns` row order follows JavaScript property enumeration for object keys; use `split` or `table` when exact order matters for integer-like labels
- label-bearing orients preserve supported source index labels, subject to object-key stringification for `index`/`columns`
- `records` and `values` use a synthetic numeric index because the wire format does not carry labels
- `toRecords()` and `toValues()` never invent an `_index` column
- `toIndex()` and `toColumns()` stringify index labels as JSON object keys and throw if distinct labels would collide after stringification
- `toTable()` emits valid Table Schema, omits a synthetic index from table output, and rejects duplicate source index labels because emitted table primary keys must be unique
- table primary-key equality uses JavaScript `Map`/SameValueZero semantics for supported string and finite-number labels, so numeric `1` and string `'1'` are distinct table labels even though object-key exporters reject them as stringification collisions
- Table Schema metadata is cloned under the same `JSON_FRAME_MAX_DEPTH` policy used while parsing. `toTable()` and `toJSONString('table')` report over-depth metadata as `JsonFrameValidationError`.
- `toJSONString()` depth is measured from the exported payload root including orient wrappers, not from the stored cell alone. A cell accepted at ingestion at the depth limit can be rejected in a deeper `split`/`table` layout while still serializing in a shallower `records`/`values`/`index`/`columns` layout.

Source table index and data-field metadata retain their separate roles through `select`, `rename`, `resetIndex`, filtering and sorting, even when the source primary-key field is not first. Renaming a data column to the retained index-field name is supported, but table export then needs a unique `indexField` override (or a subsequent rename/resetIndex) to avoid duplicate emitted field names.

### Empty-Dimension Fidelity

Choose **`split` or `table`** when an empty report must carry its dimensions in the payload. The matrix gives the shape **after export and re-ingestion with the matching explicit orient**, for both object-returning exporters and `toJSONString()`. `R` is a positive row count and `C` a positive data-column count; the index field is not a data column. `values` results assume the caller separately supplies the original `columns`.

| Orient    | Zero rows, declared columns (`0 × C`)                  | Rows, zero columns (`R × 0`)                                     | Fully empty (`0 × 0`)                    |
| --------- | ------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------- |
| `records` | `[]` → `0 × 0`; column labels lost                     | `R` empty objects → `R × 0`                                      | `[]` → `0 × 0`                           |
| `index`   | `{}` → `0 × 0`; column labels lost                     | `R` index keys with empty objects → `R × 0`                      | `{}` → `0 × 0`                           |
| `columns` | `C` column keys with empty objects → `0 × C`           | `{}` → `0 × 0`; rows and index labels lost                       | `{}` → `0 × 0`                           |
| `values`  | `[]` + supplied columns → `0 × C`                      | `R` empty arrays + `columns: []` → `R × 0`                       | `[]` + `columns: []` → `0 × 0`           |
| `split`   | `columns` retained, empty `index`/`data` → `0 × C`     | Empty `columns`, `R` index labels and empty row arrays → `R × 0` | Empty `columns`/`index`/`data` → `0 × 0` |
| `table`   | Data fields retained in schema, empty `data` → `0 × C` | No data fields, `R` row objects → `R × 0`                        | No data fields, empty `data` → `0 × 0`   |

- `values` never carries column labels; omitting `options.columns` throws even for `[]` or `[[], []]`. For empty arrays, also pass the explicit orient. `options.columns` is used only for `values`; it cannot restore lost columns in empty `records`/`index` payloads.
- `records`/`values` regenerate a synthetic numeric index. `index`/`columns` re-ingest object keys as source string labels with JavaScript enumeration order. `columns` has nowhere to put row labels when there are no columns.
- `split` always emits the current index array and re-ingests it as a **source** index, even if those labels were synthetic before export. It preserves gapped numeric labels after filtering.
- `table` emits a source index as a schema field plus `primaryKey`, including on a fully empty frame. With zero data columns, its rows contain only that index field. A synthetic index is omitted: zero-column rows are `{}` and re-ingestion regenerates `0..R-1`, so gaps in a filtered synthetic index are lost. The normal uniqueness and index-field collision checks still apply.
- Dimension fidelity is separate from metadata fidelity: only `table` carries logical types and retained field/schema metadata. For example, a zero-row numeric column round-tripped through `split`, `columns`, or `values` has no cells from which to infer its original type; supply appropriate non-table `columnTypes` if needed.

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

const report = fromOrient([{ a: 1 }, { a: 2 }], { orient: 'records' });
const noRows = report.filter(() => false); // 0 rows, column a retained
const noColumns = report.select(); // 2 rows, 0 columns

const shaped = fromOrient(noRows.toSplit(), { orient: 'split' }); // 0 × 1
const rowCount = fromOrient(noColumns.toTable(), { orient: 'table' }); // 2 × 0
const lostRows = fromOrient(noColumns.toColumns(), { orient: 'columns' }); // 0 × 0
const restoredColumns = fromOrient(noRows.toValues(), { orient: 'values', columns: noRows.columns });

void [shaped, rowCount, lostRows, restoredColumns];
```

## Errors

Structured runtime errors are exported from the package root.

- `JsonFrameParseError`: invalid JSON string input; original `SyntaxError` is available as `cause`
- `JsonFrameOptionError`: invalid options such as bad `maxNodes`/`packThreshold` or missing `columns` for `values`
- `JsonFrameValidationError`: payload shape, transform argument, or JSON-value validation failure
- `AmbiguousOrientError`: `auto` mode cannot distinguish between multiple valid orients
- `UnsupportedFeatureError`: supported contract deliberately excludes the requested pandas feature
- `ExportKeyCollisionError`: object-key exporters would collapse distinct index labels to the same JSON key

`JsonFrameError` instances expose `orient`, `path`, `row`, `column`, and `value` when relevant. Scalar JSON diagnostic values (`string`, finite or non-finite `number`, `boolean`, `null`) are retained directly and are intentionally not bounded by the container-preview budget below. Arrays, objects, functions, symbols, bigints, undefined values, and cyclic containers are replaced with small frozen summaries, so retaining an error does not retain caller-owned payloads and `JSON.stringify(error)` does not invoke user serialization hooks.

Object summaries retain at most 5 keys and at most 200 characters of key-preview text in total. `truncated` is `true` when either the key count or the key-preview text was shortened; `keyCount` always reports the full own enumerable key count. `truncated: false` therefore means the `keys` preview is complete, not merely that the count fit. This bounds the retained/serialized summary preview, not the complete error size: scalar diagnostic strings, `path`, `column`, `option`, `key`, and `labels` fields can still be input-sized. Error construction never calls caller `toJSON` hooks, and counting keys uses `Object.keys()`, which collects all own enumerable string keys — construction is not constant-space even though the retained preview is bounded.

Diagnostic summary shapes are:

```ts
type JsonFrameDiagnosticValue =
  | string
  | number
  | boolean
  | null
  | { readonly kind: 'array'; readonly length: number }
  | {
      readonly kind: 'object';
      readonly keyCount: number;
      readonly keys: readonly string[];
      readonly truncated: boolean;
    }
  | { readonly kind: 'undefined' | 'symbol' | 'bigint' | 'function' };
```

## Unsupported Pandas Features In The Initial Release

- MultiIndex input or output
- duplicate column labels
- non-string column labels
- pandas Series JSON shapes
- JSON Lines, compression, file I/O, or streaming input
- arbitrary pandas extension dtype reconstruction beyond supported Table Schema metadata
- deep freezing of nested JSON object values

## Runtime Requirements

- package source and published runtime are isomorphic
- no runtime dependencies
- no peer dependencies
- published entrypoints: CJS, ESM, `.d.ts`, and `.d.mts`
