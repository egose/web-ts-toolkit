# `@web-ts-toolkit/json-frame`

Normalize pandas `DataFrame.to_json()` payloads into one immutable, column-major `DataFrame` API for TypeScript.

`@web-ts-toolkit/json-frame` accepts a JSON string or parsed JSON value, ingests all six pandas DataFrame JSON orients, keeps row order and supported index labels intact, and exports back to every supported orient without adding runtime dependencies.

## Installation

```sh
pnpm add @web-ts-toolkit/json-frame
```

Canonical import:

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';
```

The package exports named values and types from the package root. There is no default export and no supported deep import path.

## Quick Start

```ts
import { fromOrient } from '@web-ts-toolkit/json-frame';

type WeatherRow = {
  city: string;
  temp: number;
};

const frame = fromOrient<WeatherRow>('[{"city":"Paris","temp":21},{"city":"Rome","temp":30}]');
const hottest = frame.sort((left, right) => right.temp - left.temp).row(0);
const split = frame.toSplit();

void [hottest, split];
```

`fromOrient(input, options?)` accepts:

- a JSON string produced by pandas `DataFrame.to_json()`
- a parsed JSON value with the same shape

The returned `DataFrame` is immutable. `filter`, `sort`, `select`, `rename`, and `resetIndex` all return new frames.

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
    pandas_version: '3.0.3',
  },
  data: [{ row_id: 'row_1', city: 'Paris', temp: 21 }],
} satisfies TablePayload;

const tableFrame = fromOrient(tablePayload, { orient: 'table' });

void [recordsFrame, indexFrame, columnsFrame, valuesFrame, splitFrame, tableFrame];
```

Orient notes:

- `records` and `values` do not carry source index labels. They receive a synthetic numeric index `0..n-1`.
- `index`, `columns`, `split`, and `table` preserve supported source index labels.
- `values` always requires `options.columns`, including empty input.
- `index` and `columns` are distinct supported payloads, but auto-detection cannot safely distinguish them from nested-object structure alone.

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

- `columns`: required for `orient: 'values'`
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

type WeatherRow = {
  city: string;
  temp: number | null;
  coastal: boolean;
};

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
- exporters always return fresh JSON-compatible containers

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

- Table Schema metadata is authoritative when `orient: 'table'` is used.
- Other orients infer the narrowest logical type by scanning the full column.
- `null` marks a column as nullable without forcing an otherwise numeric column to become `mixed`.
- ISO-looking strings are preserved as strings unless table metadata or explicit `columnTypes` says otherwise.

Packing rules:

- typed-array packing is an internal optimization only
- packed and unpacked frames export the same JSON values
- packing never changes logical type metadata
- only non-null numeric columns at or above `packThreshold` are eligible

## Round Trips And Index Provenance

Round trips are semantic rather than byte-for-byte.

- column order, row order, and cell JSON values are preserved
- label-bearing orients preserve supported source index labels
- `records` and `values` use a synthetic numeric index because the wire format does not carry labels
- `toRecords()` and `toValues()` never invent an `_index` column
- `toIndex()` and `toColumns()` stringify index labels as JSON object keys and throw if distinct labels would collide after stringification
- `toTable()` emits valid Table Schema and omits a synthetic index from table output

## Errors

Structured runtime errors are exported from the package root.

- `JsonFrameParseError`: invalid JSON string input; original `SyntaxError` is available as `cause`
- `JsonFrameOptionError`: invalid options such as bad `packThreshold` or missing `columns` for `values`
- `JsonFrameValidationError`: payload shape or JSON-value validation failure
- `AmbiguousOrientError`: `auto` mode cannot distinguish between multiple valid orients
- `UnsupportedFeatureError`: supported contract deliberately excludes the requested pandas feature
- `ExportKeyCollisionError`: object-key exporters would collapse distinct index labels to the same JSON key

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
