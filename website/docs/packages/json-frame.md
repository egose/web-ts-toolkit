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

## Supported Orients

- `records`
- `index`
- `columns`
- `values`
- `split`
- `table`

`split` and `table` preserve source row order exactly. `index` and `columns` derive row order from JavaScript object property enumeration; integer-like keys such as `"10"` and `"2"` enumerate in numeric order after `JSON.parse()` or when supplied as parsed objects. Use `split` or `table` when exact row order matters for integer-like labels.

Non-empty `values` arrays are auto-detected, but every `values` payload requires `options.columns` because the orient carries no column labels. Empty `values` input requires both `orient: 'values'` and `columns`.

## Table Schema

`toTable()` emits Table Schema JSON. Source index labels must be unique before table export because emitted primary keys must be unique; duplicate source index labels are rejected rather than silently omitting or weakening `primaryKey`.

In Table Schema payloads, `schema.pandas_version` is the Table Schema format version emitted by pandas, commonly `"1.4.0"`; it is not the installed pandas package version.

## Logical Types

`columnInfo` exposes logical type metadata. For non-table inputs, `options.columnTypes` validates explicit logical types against every non-null cell before packing or export. Values are never coerced. `datetime` accepts pandas-style timezone-naive ISO date/datetime strings for generated Table Schema output, not numeric epochs. `categorical` accepts non-null scalar JSON cells and exports as Table Schema `type: 'any'` with `extDtype: 'category'` when no source field metadata is being preserved.

## Immutability

The `DataFrame` contract is structural and shallow. Frame-owned arrays, row records, exporter containers, table schema records, and internal maps are protected from direct mutation or are freshly allocated. Nested JSON object or array cell values are not deep-frozen or deep-cloned on every read/export; if caller code mutates one of those nested values after obtaining it from `row()`, `rows()`, or an exporter, another read of the same cell may observe that mutation.

Clone nested object/array cells at your application boundary if you need deep immutability.

## Limits And Errors

`JSON_FRAME_MAX_DEPTH` is `1000`. JSON arrays and objects are counted from the parsed root at depth `0`; an array or object reached at depth `1000` is accepted, and one reached at depth `1001` fails with `JsonFrameValidationError` before package traversal can exhaust the JavaScript stack.

Structured errors include `JsonFrameParseError`, `JsonFrameOptionError`, `JsonFrameValidationError`, `AmbiguousOrientError`, `UnsupportedFeatureError`, and `ExportKeyCollisionError`. Scalar diagnostic values are retained directly. Arrays, objects, functions, symbols, bigints, undefined values, and cyclic containers are replaced with small frozen summaries so retaining an error does not retain caller-owned payloads.

## Types

The root export includes `DataFrame`, `FromOrientOptions`, `JsonValue`, payload types for every orient, Table Schema metadata types, column/index types, and error classes. Normal domain row interfaces with JSON-compatible known properties can be used as `DataFrame` row models without adding a catch-all index signature.
