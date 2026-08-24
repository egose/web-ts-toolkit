/** Scalar JSON values accepted by `fromOrient` payloads and exporters. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON arrays accepted by `fromOrient` payloads and returned by exporters. */
export type JsonArray = readonly JsonValue[];

/** JSON objects accepted by `fromOrient` payloads and returned by exporters. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/**
 * Any JSON-compatible value accepted by `fromOrient` payloads and exporters.
 * Arrays/objects may nest up to `JSON_FRAME_MAX_DEPTH` levels from the parsed
 * root value; deeper containers fail with `JsonFrameValidationError`.
 */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * Recursive compile-time JSON compatibility check for domain row interfaces.
 *
 * This lets ordinary interfaces with known JSON-compatible properties be used
 * as `DataFrame` row models without requiring a string index signature. It is
 * only a TypeScript constraint; runtime validation still follows the selected
 * orient and does not validate application schemas from `TRow`.
 */
export type JsonCompatible<T> = T extends JsonPrimitive
  ? T
  : T extends (...args: never[]) => unknown
    ? never
    : T extends readonly (infer TItem)[]
      ? readonly JsonCompatible<TItem>[]
      : T extends object
        ? { readonly [K in keyof T]: JsonCompatible<T[K]> }
        : never;

/** Object-shaped row model whose known properties are JSON-compatible. */
export type JsonCompatibleRow<TRow extends object> = { readonly [K in keyof TRow]: JsonCompatible<TRow[K]> };

/** Default row shape used when callers do not provide a domain row model. */
export type JsonRow = Record<string, JsonValue>;

/** pandas orient names supported by `fromOrient`. */
export type ResolvedOrient = 'records' | 'index' | 'columns' | 'values' | 'split' | 'table';

/** Orient selection for `fromOrient`. `auto` performs structural detection when possible. */
export type Orient = 'auto' | ResolvedOrient;

/** Public column labels are unique strings in the initial release. */
export type ColumnLabel = string;

/** Supported index labels preserved by parsed frames and label-bearing exporters. */
export type IndexLabel = string | number;

/** Internal index provenance exposed by later frame APIs. */
export type IndexKind = 'source' | 'synthetic';

/** Parsed payload for `orient='records'`. */
export type RecordsPayload = readonly JsonObject[];

/**
 * Parsed payload for `orient='index'`.
 *
 * Row order follows JavaScript property enumeration for object keys, including
 * numeric ordering of integer-like keys. Use `SplitPayload` or `TablePayload`
 * when exact row order matters for integer-like index labels.
 */
export type IndexPayload = Readonly<Record<string, JsonObject>>;

/**
 * Parsed payload for `orient='columns'`.
 *
 * Row order follows JavaScript property enumeration for each column object's
 * index keys, including numeric ordering of integer-like keys. Use
 * `SplitPayload` or `TablePayload` when exact row order matters for
 * integer-like index labels.
 */
export type ColumnsPayload = Readonly<Record<string, JsonObject>>;

/** Parsed payload for `orient='values'`. */
export type ValuesPayload = readonly JsonArray[];

/** Parsed payload for `orient='split'`. */
export interface SplitPayload extends JsonObject {
  readonly columns: readonly ColumnLabel[];
  readonly index: readonly IndexLabel[];
  readonly data: readonly JsonArray[];
}

/** Known Frictionless/Table Schema field types emitted by pandas. */
export type TableSchemaFieldType =
  | 'any'
  | 'array'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'duration'
  | 'geojson'
  | 'integer'
  | 'number'
  | 'object'
  | 'string'
  | 'year'
  | 'yearmonth'
  | (string & {});

type JsonMetadata = Readonly<Record<string, JsonValue>>;

/** Table Schema constraint metadata preserved when present. */
export type TableSchemaConstraints = JsonMetadata & {
  /** Enumerated allowed scalar values, commonly used for pandas categoricals. */
  readonly enum?: readonly JsonPrimitive[];
};

/** Table Schema field metadata preserved during table ingestion and export. */
export type TableSchemaField = JsonMetadata & {
  readonly name: string;
  readonly type: TableSchemaFieldType;
  readonly format?: string;
  readonly constraints?: TableSchemaConstraints;
  readonly ordered?: boolean;
  readonly extDtype?: string;
  readonly tz?: string;
  readonly freq?: string;
};

/** Table Schema metadata preserved for `orient='table'`. */
export type TableSchema = JsonMetadata & {
  readonly fields: readonly TableSchemaField[];
  readonly primaryKey?: readonly string[];
  /** Table Schema format version emitted by pandas, not the installed pandas package version. */
  readonly pandas_version?: string;
};

/** Parsed payload for `orient='table'`. */
export interface TablePayload extends JsonObject {
  readonly schema: TableSchema;
  readonly data: readonly JsonObject[];
}

/**
 * Logical column types inferred, preserved from Table Schema, or supplied with
 * `options.columnTypes`.
 *
 * Explicit non-table `columnTypes` are validated against non-null cells without
 * coercion. `datetime` accepts pandas-style timezone-naive ISO date/datetime
 * strings for generated Table Schema output, not numeric epoch values.
 * `categorical` accepts non-null scalar JSON values and exports as Table Schema
 * `type: 'any'` with `extDtype: 'category'` when no source field metadata is
 * available. `mixed` and `unknown` accept any JSON-compatible cell value.
 */
export type ColumnType = 'integer' | 'float' | 'string' | 'boolean' | 'datetime' | 'categorical' | 'mixed' | 'unknown';

/** Public logical type metadata for a stored column. */
export interface ColumnInfo {
  /** Narrowest logical type inferred or preserved for the column. */
  readonly type: ColumnType;
  /** Whether any row in the column contains `null`. */
  readonly nullable: boolean;
}

/**
 * Options for `fromOrient`.
 *
 * `columns` is required whenever the payload is `values`, including non-empty
 * `values` arrays detected by `auto`, because that orient carries no column
 * labels. `columnTypes` supplies explicit logical metadata for label-preserving
 * orients that do not carry Table Schema field types.
 */
export interface FromOrientOptions {
  /** Explicit orient, or `auto` to detect only structurally unambiguous shapes. */
  readonly orient?: Orient;
  /** Explicit column names used whenever parsing a `values` payload. */
  readonly columns?: readonly ColumnLabel[];
  /**
   * Explicit logical column types applied after parsing when no Table Schema is
   * present. Non-null cells must already be compatible; values are never
   * coerced to satisfy the declared logical type.
   */
  readonly columnTypes?: Readonly<Partial<Record<ColumnLabel, ColumnType>>>;
  /** Packing threshold for typed-array storage. `0` disables packing. */
  readonly packThreshold?: number;
}

/** Options for `toTable()` and `toJSONString('table', ...)`. */
export interface ToTableOptions {
  /** Override the emitted table index field name when the default would collide. */
  readonly indexField?: string;
}

/** Additional options accepted by `toJSONString()`. */
export type ToJSONStringOptions = ToTableOptions;

/**
 * Immutable column-major view over pandas-compatible tabular JSON.
 *
 * Instances are created by `fromOrient()`. The generic row type improves row
 * and callback ergonomics only; runtime validation still follows the JSON
 * Frame contracts for the selected orient. Immutability is structural and
 * shallow: frame-owned arrays, records, and maps are protected, but nested JSON
 * cell objects/arrays returned from rows or exporters may retain identity and
 * remain caller-mutable.
 */
export interface DataFrame<TRow extends JsonCompatibleRow<TRow> = JsonRow> {
  readonly columns: readonly string[];
  readonly index: readonly IndexLabel[];
  readonly columnInfo: ReadonlyMap<string, ColumnInfo>;
  readonly length: number;
  toRecords(): RecordsPayload;
  toIndex(): IndexPayload;
  toColumns(): ColumnsPayload;
  toValues(): ValuesPayload;
  toSplit(): SplitPayload;
  /** Exports Table Schema JSON; source index labels must be unique primary-key values. */
  toTable(options?: ToTableOptions): TablePayload;
  /** Serializes an exported orient, including table metadata, within `JSON_FRAME_MAX_DEPTH`. */
  toJSONString(orient: ResolvedOrient, options?: ToJSONStringOptions): string;
  row(position: number): Readonly<TRow>;
  rows(): readonly Readonly<TRow>[];
  filter(predicate: (row: Readonly<TRow>, index: IndexLabel, position: number) => boolean): DataFrame<TRow>;
  sort(
    compare: (
      left: Readonly<TRow>,
      right: Readonly<TRow>,
      leftIndex: IndexLabel,
      rightIndex: IndexLabel,
      leftPosition: number,
      rightPosition: number,
    ) => number,
  ): DataFrame<TRow>;
  select(...columns: readonly string[]): DataFrame<JsonRow>;
  rename(mapping: Readonly<Record<string, string>>): DataFrame<JsonRow>;
  resetIndex(): DataFrame<TRow>;
}
