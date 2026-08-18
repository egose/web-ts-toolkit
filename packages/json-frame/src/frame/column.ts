import { JsonFrameOptionError, JsonFrameValidationError } from '../errors';
import type { NormalizedFromOrientOptions } from '../options';
import type { ParsedFrame } from '../parse';
import type { ColumnInfo, ColumnType, IndexKind, IndexLabel, JsonValue, TableSchema, TableSchemaField } from '../types';

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

const freezeArray = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);

const freezeColumnInfo = (info: ColumnInfo): ColumnInfo => Object.freeze({ ...info });

export type StoredColumn = readonly JsonValue[] | Int32Array | Float64Array;

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

export const materializeColumn = (column: StoredColumn): readonly JsonValue[] =>
  Array.isArray(column) ? freezeArray(column) : freezeArray(Array.from(column));

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

  for (const column of frame.columns) {
    const values = frame.data.get(column);
    if (values === undefined) {
      throw new JsonFrameValidationError('Parsed frame data is missing a declared column.', {
        orient: frame.orient,
        column,
      });
    }

    const inferred = inferColumnType(values);
    const resolvedType = schemaTypes.get(column) ?? options.columnTypes?.[column] ?? inferred.type;
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

export const createFrameState = (frame: ParsedFrame, options: NormalizedFromOrientOptions): FrameState =>
  buildFrameState(frame, options);
