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

`JSON_FRAME_MAX_DEPTH` is `1000`. JSON arrays and objects are counted from the parsed root at depth `0`; an array or object reached at depth `1000` is accepted, and one reached at depth `1001` fails with `JsonFrameValidationError` before package traversal can exhaust the JavaScript stack.

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
- Explicit `integer`, `float`, `string`, and `boolean` require matching JSON scalar cells. `float` accepts integer JSON numbers because Table Schema `number` accepts both integer and fractional JSON numbers.
- Explicit `datetime` accepts pandas-style timezone-naive ISO date/datetime strings such as `2024-01-02T03:04:05.000`, `2024-01-02 03:04:05`, or `2024-01-02`. Numeric epoch cells are rejected because generated Table Schema has no unit metadata and pandas reads numeric `datetime` cells as nanoseconds.
- Explicit `categorical` accepts non-null scalar JSON cells (`string`, `number`, or `boolean`) and generated table output emits `type: 'any'` with `extDtype: 'category'` unless source Table Schema field metadata is being preserved.
- Explicit `mixed` and `unknown` accept any JSON-compatible cell value.
- `null` marks a column as nullable without forcing an otherwise numeric column to become `mixed`.
- ISO-looking strings are preserved as strings unless table metadata or compatible explicit `columnTypes` says otherwise.
- Values are never coerced to satisfy logical type metadata.

Packing rules:

- typed-array packing is an internal optimization only
- packed and unpacked frames export the same JSON values
- packing never changes logical type metadata
- only non-null numeric columns at or above `packThreshold` are eligible

## Round Trips And Index Provenance

Round trips are semantic rather than byte-for-byte.

- column order and cell JSON values are preserved
- `split` and `table` preserve row order exactly
- `index` and `columns` row order follows JavaScript property enumeration for object keys; use `split` or `table` when exact order matters for integer-like labels
- label-bearing orients preserve supported source index labels, subject to object-key stringification for `index`/`columns`
- `records` and `values` use a synthetic numeric index because the wire format does not carry labels
- `toRecords()` and `toValues()` never invent an `_index` column
- `toIndex()` and `toColumns()` stringify index labels as JSON object keys and throw if distinct labels would collide after stringification
- `toTable()` emits valid Table Schema, omits a synthetic index from table output, and rejects duplicate source index labels because emitted table primary keys must be unique
- table primary-key equality uses JavaScript `Map`/SameValueZero semantics for supported string and finite-number labels, so numeric `1` and string `'1'` are distinct table labels even though object-key exporters reject them as stringification collisions
- Table Schema metadata is cloned under the same `JSON_FRAME_MAX_DEPTH` policy used while parsing. `toTable()` and `toJSONString('table')` report over-depth metadata as `JsonFrameValidationError`.

## Errors

Structured runtime errors are exported from the package root.

- `JsonFrameParseError`: invalid JSON string input; original `SyntaxError` is available as `cause`
- `JsonFrameOptionError`: invalid options such as bad `packThreshold` or missing `columns` for `values`
- `JsonFrameValidationError`: payload shape, transform argument, or JSON-value validation failure
- `AmbiguousOrientError`: `auto` mode cannot distinguish between multiple valid orients
- `UnsupportedFeatureError`: supported contract deliberately excludes the requested pandas feature
- `ExportKeyCollisionError`: object-key exporters would collapse distinct index labels to the same JSON key

`JsonFrameError` instances expose `orient`, `path`, `row`, `column`, and `value` when relevant. Scalar JSON diagnostic values (`string`, finite or non-finite `number`, `boolean`, `null`) are retained directly. Arrays, objects, functions, symbols, bigints, undefined values, and cyclic containers are replaced with small frozen summaries, so retaining an error does not retain caller-owned payloads and `JSON.stringify(error)` does not invoke user serialization hooks.

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
