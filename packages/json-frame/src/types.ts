/** Scalar JSON values accepted by `fromOrient` payloads and exporters. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON arrays accepted by `fromOrient` payloads and returned by exporters. */
export type JsonArray = readonly JsonValue[];

/** JSON objects accepted by `fromOrient` payloads and returned by exporters. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Any JSON-compatible value accepted by `fromOrient` payloads and exporters. */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

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

/** Parsed payload for `orient='index'`. */
export type IndexPayload = Readonly<Record<string, JsonObject>>;

/** Parsed payload for `orient='columns'`. */
export type ColumnsPayload = Readonly<Record<string, JsonObject>>;

/** Parsed payload for `orient='values'`. */
export type ValuesPayload = readonly JsonArray[];

/** Parsed payload for `orient='split'`. */
export interface SplitPayload {
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

/** Table Schema constraint metadata preserved when present. */
export interface TableSchemaConstraints {
  /** Enumerated allowed scalar values, commonly used for pandas categoricals. */
  readonly enum?: readonly JsonPrimitive[];
  readonly [key: string]: JsonValue | undefined;
}

type JsonMetadata = Readonly<Record<string, JsonValue | undefined>>;

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
  readonly pandas_version?: string;
};

/** Parsed payload for `orient='table'`. */
export interface TablePayload {
  readonly schema: TableSchema;
  readonly data: readonly JsonObject[];
}

/** Logical column types inferred or preserved by the frame. */
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
 * `columns` is required only for explicit `values` input because that orient
 * carries no column labels. `columnTypes` supplies explicit logical metadata
 * for label-preserving orients that do not carry Table Schema field types.
 */
export interface FromOrientOptions {
  /** Explicit orient, or `auto` to detect only structurally unambiguous shapes. */
  readonly orient?: Orient;
  /** Explicit column names used when parsing `orient='values'`. */
  readonly columns?: readonly ColumnLabel[];
  /** Explicit logical column types applied after parsing when no Table Schema is present. */
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
 * Frame contracts for the selected orient.
 */
export interface DataFrame<TRow extends Record<string, JsonValue> = Record<string, JsonValue>> {
  readonly columns: readonly string[];
  readonly index: readonly IndexLabel[];
  readonly columnInfo: ReadonlyMap<string, ColumnInfo>;
  readonly length: number;
  toRecords(): RecordsPayload;
  toIndex(): IndexPayload;
  toColumns(): ColumnsPayload;
  toValues(): ValuesPayload;
  toSplit(): SplitPayload;
  toTable(options?: ToTableOptions): TablePayload;
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
  select(...columns: readonly string[]): DataFrame<Record<string, JsonValue>>;
  rename(mapping: Readonly<Record<string, string>>): DataFrame<Record<string, JsonValue>>;
  resetIndex(): DataFrame<TRow>;
}
