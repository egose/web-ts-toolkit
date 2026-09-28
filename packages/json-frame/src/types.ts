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
 * Arrays/objects may nest up to `JSON_FRAME_MAX_DEPTH` levels from the
 * validated root value; deeper containers fail with `JsonFrameValidationError`.
 * For serialization the root is the exported payload including orient
 * wrappers, so a deeper output layout may reject a cell accepted at ingestion.
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
 * coercion. `datetime` accepts calendar-valid, timezone-naive ISO strings for
 * four-digit years 0000–9999 under proleptic Gregorian rules (0000 is a leap
 * year). Grammar: `YYYY-MM-DD`, optionally followed by `T` or a space and
 * `HH:mm:ss`, optionally with 1–9 fractional-second digits. Hours are 00–23;
 * minutes/seconds are 00–59. Numeric epochs and timezone suffixes are rejected.
 * Strings are preserved exactly. Calendar validity does not guarantee pandas
 * read-back: dtype/resolution limits, including nanosecond bounds for table
 * read-back, can exclude accepted years. Inferred ISO-looking strings stay
 * `string` unless Table Schema or an explicit type says otherwise.
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
   * coerced to satisfy the declared logical type. Only own enumerable string
   * keys are overrides; inherited properties are ignored. Names such as
   * `constructor` and `__proto__` are valid column labels.
   */
  readonly columnTypes?: Readonly<Partial<Record<ColumnLabel, ColumnType>>>;
  /** Packing threshold for typed-array storage. `0` disables packing. */
  readonly packThreshold?: number;
  /**
   * Optional positive safe integer limiting ingestion traversal occurrences.
   * Counts the parsed root and every scalar/container value, including repeated
   * aliases. Exact-budget inputs succeed; excess fails with a path-bearing
   * JsonFrameValidationError. Omitted means no quota. Not retained by the frame
   * for exports. Does not bound JSON.parse/input bytes, key allocation, frame
   * densification, caller hooks, or total memory.
   * @example fromOrient([{ n: 1 }], { orient: 'records', maxNodes: 3 })
   */
  readonly maxNodes?: number;
}

/** Options for `toTable()` and `toJSONString('table', ...)`. */
export interface ToTableOptions {
  /** Override the emitted table index field name when the default would collide. */
  readonly indexField?: string;
}

/** Options validated for every `toJSONString()` orient; indexField affects table only. */
export interface ToJSONStringOptions extends ToTableOptions {
  /**
   * Optional positive safe integer limiting the complete exported payload's
   * validation traversal. Counts root, orient wrappers, table metadata and every
   * scalar/container occurrence, revisiting aliases. Exact-budget succeeds;
   * excess throws path-bearing JsonFrameValidationError with the selected orient.
   * No default quota; resets per call, independently of ingestion maxNodes.
   * Does not bound payload construction, key allocation, string bytes, native
   * serialization hooks, or total memory. Validation does not clone cells.
   * @example frame.toJSONString('records', { maxNodes: 3 })
   * @example frame.toJSONString('table', { indexField: 'row_id', maxNodes: 100 })
   */
  readonly maxNodes?: number;
}

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
  /**
   * Serializes an exported orient within `JSON_FRAME_MAX_DEPTH`.
   *
   * Depth is measured from the exported payload root including orient
   * wrappers; `split`/`table` nest cells one level deeper than
   * `records`/`values`/`index`/`columns`, so an input accepted at its own
   * depth limit may be rejected in a deeper output layout. The complete
   * selected output is validated before native serialization: cycles,
   * over-depth containers, sparse arrays, and non-JSON values introduced
   * through caller-mutable nested cells fail with path-bearing
   * `JsonFrameValidationError` carrying the selected orient. Validation is one
   * traversal pass without cloning followed by native stringification; both
   * passes expand repeated references per occurrence. Optional maxNodes limits
   * validation visits, including root/wrappers/metadata, independently per call
   * with no default quota or inherited ingestion budget. It does not bound
   * payload construction, key allocation, bytes, or total memory.
   * Property getters/`Proxy` traps run during traversal and `toJSON`
   * hooks may run during stringification; hooks are caller responsibility and
   * are not sandboxed.
   */
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
