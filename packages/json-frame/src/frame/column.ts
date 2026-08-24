import { JsonFrameOptionError, JsonFrameValidationError } from '../errors';
import type { NormalizedFromOrientOptions } from '../options';
import type { ParsedFrame } from '../parse';
import type { ColumnInfo, ColumnType, IndexKind, IndexLabel, JsonValue, TableSchema, TableSchemaField } from '../types';

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

const freezeArray = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);

const freezeColumnInfo = (info: ColumnInfo): ColumnInfo => Object.freeze({ ...info });

const DATETIME_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?:[T ](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,9}))?)?$/;

export type StoredColumn = readonly JsonValue[] | Int32Array | Float64Array;

export interface ColumnOperationCounters {
  readonly materializeColumnCalls: number;
  readonly materializedCells: number;
  readonly scalarReads: number;
  readonly rebuiltCells: number;
  readonly nullableChecks: number;
}

const columnOperationCounters = {
  materializeColumnCalls: 0,
  materializedCells: 0,
  scalarReads: 0,
  rebuiltCells: 0,
  nullableChecks: 0,
};

export interface FrameState {
  readonly columns: readonly string[];
  readonly index: readonly IndexLabel[];
  readonly indexKind: IndexKind;
  readonly data: ReadonlyMap<string, StoredColumn>;
  readonly columnInfo: ReadonlyMap<string, ColumnInfo>;
  readonly tableSchema?: TableSchema;
  readonly tableIndexField?: string;
}

interface FrameStateInput {
  readonly columns: readonly string[];
  readonly index: readonly IndexLabel[];
  readonly indexKind: IndexKind;
  readonly data: ReadonlyMap<string, readonly JsonValue[]>;
  readonly tableSchema?: TableSchema;
  readonly tableIndexField?: string;
}

interface RebuiltFrameStateInput {
  readonly columns: readonly string[];
  readonly index: readonly IndexLabel[];
  readonly indexKind: IndexKind;
  readonly data: ReadonlyMap<string, readonly JsonValue[]>;
  readonly columnInfo: ReadonlyMap<string, ColumnInfo>;
  readonly tableSchema?: TableSchema;
  readonly tableIndexField?: string;
}

const hasCategoricalMetadata = (field: TableSchemaField): boolean =>
  field.constraints?.enum !== undefined || field.ordered === true || field.extDtype === 'category';

const mapTableSchemaFieldType = (field: TableSchemaField): ColumnType => {
  if (hasCategoricalMetadata(field)) {
    return 'categorical';
  }

  switch (field.type) {
    case 'boolean':
      return 'boolean';
    case 'integer':
    case 'year':
      return 'integer';
    case 'number':
      return 'float';
    case 'date':
    case 'datetime':
      return 'datetime';
    case 'string':
      return 'string';
    case 'any':
      return 'unknown';
    default:
      return 'unknown';
  }
};

const inferColumnType = (values: readonly JsonValue[]): ColumnInfo => {
  let nullable = false;
  let sawBoolean = false;
  let sawString = false;
  let sawInteger = false;
  let sawFloat = false;
  let sawStructured = false;

  for (const value of values) {
    if (value === null) {
      nullable = true;
      continue;
    }

    if (typeof value === 'boolean') {
      sawBoolean = true;
      continue;
    }

    if (typeof value === 'string') {
      sawString = true;
      continue;
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        sawInteger = true;
      } else {
        sawFloat = true;
      }

      continue;
    }

    sawStructured = true;
  }

  const nonNullKinds = [sawBoolean, sawString, sawInteger || sawFloat, sawStructured].filter(Boolean).length;
  if (nonNullKinds === 0) {
    return freezeColumnInfo({ type: 'unknown', nullable });
  }

  if (sawStructured || nonNullKinds > 1 || (sawBoolean && (sawString || sawInteger || sawFloat))) {
    return freezeColumnInfo({ type: 'mixed', nullable });
  }

  if (sawString) {
    return freezeColumnInfo({ type: 'string', nullable });
  }

  if (sawBoolean) {
    return freezeColumnInfo({ type: 'boolean', nullable });
  }

  if (sawFloat) {
    return freezeColumnInfo({ type: 'float', nullable });
  }

  return freezeColumnInfo({ type: 'integer', nullable });
};

const isPandasNaiveIsoDatetime = (value: string): boolean => {
  const match = DATETIME_PATTERN.exec(value);
  if (match?.groups === undefined) {
    return false;
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = match.groups.hour === undefined ? 0 : Number(match.groups.hour);
  const minute = match.groups.minute === undefined ? 0 : Number(match.groups.minute);
  const second = match.groups.second === undefined ? 0 : Number(match.groups.second);

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  const normalized = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day &&
    normalized.getUTCHours() === hour &&
    normalized.getUTCMinutes() === minute &&
    normalized.getUTCSeconds() === second
  );
};

const isScalarCategory = (value: unknown): boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const isJsonContainer = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return true;
  }

  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isColumnValueCompatible = (type: ColumnType, value: unknown): boolean => {
  if (value === null) {
    return true;
  }

  switch (type) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'float':
      return typeof value === 'number';
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'datetime':
      return typeof value === 'string' && isPandasNaiveIsoDatetime(value);
    case 'categorical':
      return isScalarCategory(value);
    case 'mixed':
    case 'unknown':
      return (
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || isJsonContainer(value)
      );
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
};

const getColumnCellPath = (
  orient: ParsedFrame['orient'] | undefined,
  column: string,
  columnIndex: number,
  rowIndex: number,
  rowLabel: IndexLabel | undefined,
): string => {
  switch (orient) {
    case 'records':
      return `$[${rowIndex}][${JSON.stringify(column)}]`;
    case 'values':
      return `$[${rowIndex}][${columnIndex}]`;
    case 'split':
      return `$.data[${rowIndex}][${columnIndex}]`;
    case 'table':
      return `$.data[${rowIndex}][${JSON.stringify(column)}]`;
    case 'index':
      return `$[${JSON.stringify(String(rowLabel))}][${JSON.stringify(column)}]`;
    case 'columns':
      return `$[${JSON.stringify(column)}][${JSON.stringify(String(rowLabel))}]`;
    default:
      return `$.data[${rowIndex}][${JSON.stringify(column)}]`;
  }
};

export const validateColumnValuesForType = ({
  column,
  columnIndex,
  values,
  type,
  orient,
  index,
}: {
  readonly column: string;
  readonly columnIndex: number;
  readonly values: readonly unknown[];
  readonly type: ColumnType;
  readonly orient?: ParsedFrame['orient'];
  readonly index?: readonly IndexLabel[];
}): void => {
  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const value = values[rowIndex];
    if (isColumnValueCompatible(type, value)) {
      continue;
    }

    throw new JsonFrameValidationError('Column cells are incompatible with the declared logical type.', {
      ...(orient === undefined ? {} : { orient }),
      path: getColumnCellPath(orient, column, columnIndex, rowIndex, index?.[rowIndex]),
      row: rowIndex,
      column,
      value,
    });
  }
};

const packColumn = (values: readonly JsonValue[], info: ColumnInfo, packThreshold: number): StoredColumn => {
  if (packThreshold === 0 || values.length < packThreshold || info.nullable) {
    return freezeArray(values);
  }

  if (info.type === 'integer') {
    const packed = new Int32Array(values.length);

    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < INT32_MIN || value > INT32_MAX) {
        return freezeArray(values);
      }

      packed[index] = value;
    }

    return packed;
  }

  if (info.type === 'float') {
    const packed = new Float64Array(values.length);

    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (typeof value !== 'number') {
        return freezeArray(values);
      }

      packed[index] = value;
    }

    return packed;
  }

  return freezeArray(values);
};

const hasNullValue = (values: readonly JsonValue[]): boolean => {
  columnOperationCounters.nullableChecks += values.length;

  for (const value of values) {
    if (value === null) {
      return true;
    }
  }

  return false;
};

const validateExplicitColumnTypes = (
  columns: readonly string[],
  columnTypes: NormalizedFromOrientOptions['columnTypes'],
): void => {
  if (columnTypes === undefined) {
    return;
  }

  const knownColumns = new Set(columns);
  for (const column of Object.keys(columnTypes)) {
    if (!knownColumns.has(column)) {
      throw new JsonFrameOptionError(
        '`options.columnTypes` keys must match parsed column names.',
        `columnTypes.${column}`,
        columnTypes[column],
      );
    }
  }
};

const resolveSchemaTypeByColumn = (
  frame: Pick<FrameStateInput, 'columns' | 'tableSchema'>,
): ReadonlyMap<string, ColumnType> => {
  if (frame.tableSchema === undefined) {
    return new Map();
  }

  const schemaTypes = new Map<string, ColumnType>();
  for (const field of frame.tableSchema.fields) {
    if (frame.columns.includes(field.name)) {
      schemaTypes.set(field.name, mapTableSchemaFieldType(field));
    }
  }

  return schemaTypes;
};

export const getColumnOperationCounters = (): ColumnOperationCounters => Object.freeze({ ...columnOperationCounters });

export const resetColumnOperationCounters = (): void => {
  columnOperationCounters.materializeColumnCalls = 0;
  columnOperationCounters.materializedCells = 0;
  columnOperationCounters.scalarReads = 0;
  columnOperationCounters.rebuiltCells = 0;
  columnOperationCounters.nullableChecks = 0;
};

export const materializeColumn = (column: StoredColumn): readonly JsonValue[] => {
  columnOperationCounters.materializeColumnCalls += 1;
  columnOperationCounters.materializedCells += column.length;

  return Array.isArray(column) ? freezeArray(column) : freezeArray(Array.from(column));
};

export const getStoredColumnValue = (column: StoredColumn, position: number): JsonValue => {
  columnOperationCounters.scalarReads += 1;
  return column[position] as JsonValue;
};

export const rebuildStoredColumn = (column: StoredColumn, positions: readonly number[]): readonly JsonValue[] => {
  const rebuilt: JsonValue[] = new Array<JsonValue>(positions.length);

  for (let index = 0; index < positions.length; index += 1) {
    rebuilt[index] = getStoredColumnValue(column, positions[index]!);
  }

  columnOperationCounters.rebuiltCells += positions.length;
  return rebuilt;
};

export const materializeFrameData = (
  columns: readonly string[],
  data: ReadonlyMap<string, StoredColumn>,
): ReadonlyMap<string, readonly JsonValue[]> => {
  const materialized = new Map<string, readonly JsonValue[]>();

  for (const column of columns) {
    const stored = data.get(column);
    if (stored === undefined) {
      throw new JsonFrameValidationError('Stored frame data is missing a declared column.', {
        path: '$',
        column,
      });
    }

    materialized.set(column, materializeColumn(stored));
  }

  return materialized;
};

const buildFrameState = (
  frame: FrameStateInput & { readonly orient?: ParsedFrame['orient'] },
  options: Pick<NormalizedFromOrientOptions, 'packThreshold' | 'columnTypes'>,
): FrameState => {
  validateExplicitColumnTypes(frame.columns, options.columnTypes);

  const schemaTypes = resolveSchemaTypeByColumn(frame);
  const data = new Map<string, StoredColumn>();
  const columnInfo = new Map<string, ColumnInfo>();

  for (let columnIndex = 0; columnIndex < frame.columns.length; columnIndex += 1) {
    const column = frame.columns[columnIndex]!;
    const values = frame.data.get(column);
    if (values === undefined) {
      throw new JsonFrameValidationError('Parsed frame data is missing a declared column.', {
        orient: frame.orient,
        column,
      });
    }

    const inferred = inferColumnType(values);
    const resolvedType = schemaTypes.get(column) ?? options.columnTypes?.[column] ?? inferred.type;
    if (schemaTypes.has(column) === false && options.columnTypes?.[column] !== undefined) {
      validateColumnValuesForType({
        column,
        columnIndex,
        values,
        type: resolvedType,
        orient: frame.orient,
        index: frame.index,
      });
    }

    const info = freezeColumnInfo({ type: resolvedType, nullable: inferred.nullable });

    columnInfo.set(column, info);
    data.set(column, packColumn(values, info, options.packThreshold));
  }

  return {
    columns: freezeArray(frame.columns),
    index: freezeArray(frame.index),
    indexKind: frame.indexKind,
    data,
    columnInfo,
    ...(frame.tableSchema === undefined ? {} : { tableSchema: frame.tableSchema }),
    ...(frame.tableIndexField === undefined ? {} : { tableIndexField: frame.tableIndexField }),
  };
};

export const createFrameStateFromData = (
  frame: FrameStateInput,
  options: Pick<NormalizedFromOrientOptions, 'packThreshold' | 'columnTypes'>,
): FrameState => buildFrameState(frame, options);

export const createFrameStateFromRebuiltData = (
  frame: RebuiltFrameStateInput,
  options: Pick<NormalizedFromOrientOptions, 'packThreshold'>,
): FrameState => {
  const data = new Map<string, StoredColumn>();
  const columnInfo = new Map<string, ColumnInfo>();

  for (const column of frame.columns) {
    const values = frame.data.get(column);
    if (values === undefined) {
      throw new JsonFrameValidationError('Rebuilt frame data is missing a declared column.', {
        path: '$',
        column,
      });
    }

    const sourceInfo = frame.columnInfo.get(column);
    if (sourceInfo === undefined) {
      throw new JsonFrameValidationError('Rebuilt frame metadata is missing a declared column.', {
        path: '$',
        column,
      });
    }

    const info = freezeColumnInfo({
      type: sourceInfo.type,
      nullable: sourceInfo.nullable && hasNullValue(values),
    });

    columnInfo.set(column, info);
    data.set(column, packColumn(values, info, options.packThreshold));
  }

  return {
    columns: freezeArray(frame.columns),
    index: freezeArray(frame.index),
    indexKind: frame.indexKind,
    data,
    columnInfo,
    ...(frame.tableSchema === undefined ? {} : { tableSchema: frame.tableSchema }),
    ...(frame.tableIndexField === undefined ? {} : { tableIndexField: frame.tableIndexField }),
  };
};

export const createFrameState = (frame: ParsedFrame, options: NormalizedFromOrientOptions): FrameState =>
  buildFrameState(frame, options);
