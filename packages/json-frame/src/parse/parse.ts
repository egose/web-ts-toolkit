import {
  AmbiguousOrientError,
  JsonFrameOptionError,
  JsonFrameParseError,
  JsonFrameValidationError,
  UnsupportedFeatureError,
} from '../errors';
import type { NormalizedFromOrientOptions } from '../options';
import type {
  IndexKind,
  IndexLabel,
  JsonObject,
  JsonValue,
  ResolvedOrient,
  TableSchema,
  TableSchemaConstraints,
  TableSchemaField,
} from '../types';
import type { ParsedFrame } from './types';

const hasOwn = Object.prototype.hasOwnProperty;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const freezeArray = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);

const appendPropertyPath = (path: string, key: string): string =>
  IDENTIFIER_PATTERN.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

const appendIndexPath = (path: string, index: number): string => `${path}[${index}]`;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const assertSupportedIndexLabel = (value: JsonValue, orient: ResolvedOrient, path: string): IndexLabel => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  throw new JsonFrameValidationError('Index labels must be strings or finite numbers.', {
    orient,
    path,
    value,
  });
};

const assertUniqueStringColumns = (
  values: readonly JsonValue[],
  orient: ResolvedOrient,
  path: string,
): readonly string[] => {
  const columns: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const entryPath = appendIndexPath(path, index);

    if (typeof value !== 'string') {
      throw new JsonFrameValidationError('Column labels must be strings.', {
        orient,
        path: entryPath,
        value,
      });
    }

    if (seen.has(value)) {
      throw new JsonFrameValidationError('Column labels must be unique.', {
        orient,
        path: entryPath,
        column: value,
        value,
      });
    }

    seen.add(value);
    columns.push(value);
  }

  return freezeArray(columns);
};

const initializeData = (columns: readonly string[]): Map<string, JsonValue[]> =>
  new Map(columns.map((column) => [column, []]));

const finalizeFrame = ({
  orient,
  columns,
  index,
  indexKind,
  data,
  tableSchema,
  tableIndexField,
}: {
  readonly orient: ResolvedOrient;
  readonly columns: readonly string[];
  readonly index: readonly IndexLabel[];
  readonly indexKind: IndexKind;
  readonly data: ReadonlyMap<string, readonly JsonValue[]> | Map<string, JsonValue[]>;
  readonly tableSchema?: TableSchema;
  readonly tableIndexField?: string;
}): ParsedFrame => {
  const finalizedData = new Map<string, readonly JsonValue[]>();

  for (const column of columns) {
    const values = data.get(column);
    if (values === undefined) {
      throw new JsonFrameValidationError('Parsed frame data is missing a declared column.', {
        orient,
        column,
      });
    }

    finalizedData.set(column, freezeArray(values));
  }

  return {
    orient,
    columns: freezeArray(columns),
    index: freezeArray(index),
    indexKind,
    data: finalizedData,
    ...(tableSchema === undefined ? {} : { tableSchema }),
    ...(tableIndexField === undefined ? {} : { tableIndexField }),
  };
};

const validateJsonCompatible = (value: unknown, path = '$', stack = new Set<object>()): JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new JsonFrameValidationError('Numbers must be finite JSON values.', { path, value });
    }

    return value;
  }

  if (
    typeof value === 'undefined' ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    throw new JsonFrameValidationError('Input must contain only JSON-compatible values.', { path, value });
  }

  if (Array.isArray(value)) {
    if (stack.has(value)) {
      throw new JsonFrameValidationError('Input contains a cyclic array.', { path, value });
    }

    stack.add(value);
    const normalized: JsonValue[] = [];

    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        stack.delete(value);
        throw new JsonFrameValidationError('Sparse arrays are not valid JSON input.', {
          path: appendIndexPath(path, index),
          value,
        });
      }

      normalized.push(validateJsonCompatible(value[index], appendIndexPath(path, index), stack));
    }

    stack.delete(value);
    return normalized;
  }

  if (!isPlainObject(value)) {
    throw new JsonFrameValidationError('Input objects must be plain JSON objects or arrays.', { path, value });
  }

  if (stack.has(value)) {
    throw new JsonFrameValidationError('Input contains a cyclic object.', { path, value });
  }

  stack.add(value);
  const normalized: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;

  for (const [key, entryValue] of Object.entries(value)) {
    normalized[key] = validateJsonCompatible(entryValue, appendPropertyPath(path, key), stack);
  }

  stack.delete(value);
  return normalized as JsonObject;
};

export const detectOrient = (value: JsonValue): ResolvedOrient => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new AmbiguousOrientError(
        'Auto detection cannot distinguish between empty records and empty values payloads.',
        ['records', 'values'],
      );
    }

    if (value.every((entry) => Array.isArray(entry))) {
      return 'values';
    }

    if (value.every((entry) => isPlainObject(entry))) {
      return 'records';
    }

    throw new JsonFrameValidationError('Auto detection requires a non-empty array of row objects or row arrays.', {
      path: '$',
      value,
    });
  }

  if (!isPlainObject(value)) {
    throw new JsonFrameValidationError('Auto detection requires a JSON array or object payload.', {
      path: '$',
      value,
    });
  }

  if (isPlainObject(value.schema) && Array.isArray(value.data)) {
    return 'table';
  }

  if (
    Array.isArray(value.columns) &&
    Array.isArray(value.data) &&
    (value.index === undefined || Array.isArray(value.index))
  ) {
    return 'split';
  }

  const keys = Object.keys(value);
  if (keys.length === 0 || keys.every((key) => isPlainObject(value[key]))) {
    throw new AmbiguousOrientError('Auto detection cannot distinguish between index and columns payloads.', [
      'index',
      'columns',
    ]);
  }

  throw new JsonFrameValidationError('Auto detection could not resolve the payload orient.', {
    path: '$',
    value,
  });
};

const parseRecords = (value: JsonValue, orient: 'records'): ParsedFrame => {
  if (!Array.isArray(value)) {
    throw new JsonFrameValidationError('`records` payloads must be arrays.', { orient, path: '$', value });
  }

  const columns: string[] = [];
  const knownColumns = new Set<string>();
  const data = new Map<string, JsonValue[]>();
  const index: number[] = [];

  for (let rowIndex = 0; rowIndex < value.length; rowIndex += 1) {
    const row = value[rowIndex];
    const rowPath = appendIndexPath('$', rowIndex);
    if (!isPlainObject(row)) {
      throw new JsonFrameValidationError('`records` rows must be JSON objects.', {
        orient,
        path: rowPath,
        row: rowIndex,
        value: row,
      });
    }

    for (const column of Object.keys(row)) {
      if (!knownColumns.has(column)) {
        knownColumns.add(column);
        columns.push(column);
        data.set(column, Array(rowIndex).fill(null));
      }
    }

    for (const column of columns) {
      data.get(column)!.push(hasOwn.call(row, column) ? (row[column] as JsonValue) : null);
    }

    index.push(rowIndex);
  }

  return finalizeFrame({
    orient,
    columns,
    index,
    indexKind: 'synthetic',
    data,
  });
};

const parseIndex = (value: JsonValue, orient: 'index'): ParsedFrame => {
  if (!isPlainObject(value)) {
    throw new JsonFrameValidationError('`index` payloads must be objects keyed by index label.', {
      orient,
      path: '$',
      value,
    });
  }

  const columns: string[] = [];
  const knownColumns = new Set<string>();
  const data = new Map<string, JsonValue[]>();
  const index = Object.keys(value);

  for (let rowIndex = 0; rowIndex < index.length; rowIndex += 1) {
    const indexLabel = index[rowIndex]!;
    const row = value[indexLabel];
    const rowPath = appendPropertyPath('$', indexLabel);

    if (!isPlainObject(row)) {
      throw new JsonFrameValidationError('`index` payload rows must be JSON objects.', {
        orient,
        path: rowPath,
        row: rowIndex,
        value: row,
      });
    }

    for (const column of Object.keys(row)) {
      if (!knownColumns.has(column)) {
        knownColumns.add(column);
        columns.push(column);
        data.set(column, Array(rowIndex).fill(null));
      }
    }

    for (const column of columns) {
      data.get(column)!.push(hasOwn.call(row, column) ? (row[column] as JsonValue) : null);
    }
  }

  return finalizeFrame({
    orient,
    columns,
    index,
    indexKind: 'source',
    data,
  });
};

const parseColumns = (value: JsonValue, orient: 'columns'): ParsedFrame => {
  if (!isPlainObject(value)) {
    throw new JsonFrameValidationError('`columns` payloads must be objects keyed by column label.', {
      orient,
      path: '$',
      value,
    });
  }

  const columns = Object.keys(value);
  const data = new Map<string, JsonValue[]>();

  if (columns.length === 0) {
    return finalizeFrame({
      orient,
      columns,
      index: [],
      indexKind: 'source',
      data,
    });
  }

  let index: readonly string[] | undefined;

  for (const column of columns) {
    const columnValue = value[column];
    const columnPath = appendPropertyPath('$', column);

    if (!isPlainObject(columnValue)) {
      throw new JsonFrameValidationError('`columns` payload values must be objects keyed by index label.', {
        orient,
        path: columnPath,
        column,
        value: columnValue,
      });
    }

    const keys = Object.keys(columnValue);
    if (index === undefined) {
      index = freezeArray(keys);
    } else if (keys.length !== index.length || keys.some((key, indexPosition) => key !== index![indexPosition])) {
      throw new JsonFrameValidationError('Every `columns` payload column must expose the same ordered index keys.', {
        orient,
        path: columnPath,
        column,
        value: columnValue,
      });
    }

    data.set(
      column,
      keys.map((indexKey) => columnValue[indexKey] as JsonValue),
    );
  }

  return finalizeFrame({
    orient,
    columns,
    index: index ?? [],
    indexKind: 'source',
    data,
  });
};

const parseValues = (value: JsonValue, options: NormalizedFromOrientOptions, orient: 'values'): ParsedFrame => {
  if (options.columns === undefined) {
    throw new JsonFrameOptionError(
      '`options.columns` is required for `orient="values"` input.',
      'columns',
      options.columns,
    );
  }

  if (!Array.isArray(value)) {
    throw new JsonFrameValidationError('`values` payloads must be arrays of arrays.', { orient, path: '$', value });
  }

  const columns = [...options.columns];
  const data = initializeData(columns);
  const index: number[] = [];

  for (let rowIndex = 0; rowIndex < value.length; rowIndex += 1) {
    const row = value[rowIndex];
    const rowPath = appendIndexPath('$', rowIndex);
    if (!Array.isArray(row)) {
      throw new JsonFrameValidationError('`values` rows must be arrays.', {
        orient,
        path: rowPath,
        row: rowIndex,
        value: row,
      });
    }

    if (row.length !== columns.length) {
      throw new JsonFrameValidationError('`values` row widths must match `options.columns`.', {
        orient,
        path: rowPath,
        row: rowIndex,
        value: row,
      });
    }

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      data.get(columns[columnIndex]!)!.push(row[columnIndex] as JsonValue);
    }

    index.push(rowIndex);
  }

  return finalizeFrame({
    orient,
    columns,
    index,
    indexKind: 'synthetic',
    data,
  });
};

const parseSplit = (value: JsonValue, orient: 'split'): ParsedFrame => {
  if (!isPlainObject(value)) {
    throw new JsonFrameValidationError('`split` payloads must be objects.', { orient, path: '$', value });
  }

  if (!Array.isArray(value.columns)) {
    throw new JsonFrameValidationError('`split.columns` must be an array of unique strings.', {
      orient,
      path: '$.columns',
      value: value.columns,
    });
  }

  if (!Array.isArray(value.data)) {
    throw new JsonFrameValidationError('`split.data` must be an array of row arrays.', {
      orient,
      path: '$.data',
      value: value.data,
    });
  }

  const columns = assertUniqueStringColumns(value.columns as readonly JsonValue[], orient, '$.columns');
  const data = initializeData(columns);

  const index: IndexLabel[] = [];
  const indexKind: IndexKind = Array.isArray(value.index) ? 'source' : 'synthetic';
  if (Array.isArray(value.index)) {
    for (let indexPosition = 0; indexPosition < value.index.length; indexPosition += 1) {
      index.push(
        assertSupportedIndexLabel(
          value.index[indexPosition] as JsonValue,
          orient,
          appendIndexPath('$.index', indexPosition),
        ),
      );
    }
  }

  const rows = value.data as readonly JsonValue[];
  if (indexKind === 'source' && index.length !== rows.length) {
    throw new JsonFrameValidationError('`split.index` length must match `split.data` length.', {
      orient,
      path: '$.index',
      value: value.index,
    });
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowPath = appendIndexPath('$.data', rowIndex);
    if (!Array.isArray(row)) {
      throw new JsonFrameValidationError('`split.data` rows must be arrays.', {
        orient,
        path: rowPath,
        row: rowIndex,
        value: row,
      });
    }

    if (row.length !== columns.length) {
      throw new JsonFrameValidationError('`split.data` row widths must match `split.columns`.', {
        orient,
        path: rowPath,
        row: rowIndex,
        value: row,
      });
    }

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      data.get(columns[columnIndex]!)!.push(row[columnIndex] as JsonValue);
    }

    if (indexKind === 'synthetic') {
      index.push(rowIndex);
    }
  }

  return finalizeFrame({
    orient,
    columns,
    index,
    indexKind,
    data,
  });
};

const cloneConstraints = (value: JsonValue, orient: 'table', path: string): TableSchemaConstraints => {
  if (!isPlainObject(value)) {
    throw new JsonFrameValidationError('Table Schema field constraints must be an object when present.', {
      orient,
      path,
      value,
    });
  }

  const cloned: Record<string, JsonValue | undefined> = Object.create(null) as Record<string, JsonValue | undefined>;
  for (const [key, entryValue] of Object.entries(value)) {
    if (key === 'enum') {
      if (!Array.isArray(entryValue)) {
        throw new JsonFrameValidationError('Table Schema `constraints.enum` must be an array of scalar JSON values.', {
          orient,
          path: appendPropertyPath(path, key),
          value: entryValue,
        });
      }

      cloned[key] = freezeArray(
        entryValue.map((enumValue, index) => {
          const enumPath = appendIndexPath(appendPropertyPath(path, key), index);
          if (enumValue === null || typeof enumValue === 'string' || typeof enumValue === 'boolean') {
            return enumValue;
          }

          if (typeof enumValue === 'number' && Number.isFinite(enumValue)) {
            return enumValue;
          }

          throw new JsonFrameValidationError('Table Schema `constraints.enum` must contain only scalar JSON values.', {
            orient,
            path: enumPath,
            value: enumValue,
          });
        }),
      );
      continue;
    }

    cloned[key] = entryValue;
  }

  return Object.freeze(cloned) as TableSchemaConstraints;
};

const cloneTableField = (value: JsonValue, index: number): TableSchemaField => {
  const orient = 'table';
  const path = appendIndexPath('$.schema.fields', index);
  if (!isPlainObject(value)) {
    throw new JsonFrameValidationError('Table Schema fields must be objects.', {
      orient,
      path,
      value,
    });
  }

  if (typeof value.name !== 'string') {
    throw new JsonFrameValidationError('Table Schema field names must be strings.', {
      orient,
      path: appendPropertyPath(path, 'name'),
      value: value.name,
    });
  }

  if (typeof value.type !== 'string') {
    throw new JsonFrameValidationError('Table Schema field types must be strings.', {
      orient,
      path: appendPropertyPath(path, 'type'),
      value: value.type,
    });
  }

  if (value.ordered !== undefined && typeof value.ordered !== 'boolean') {
    throw new JsonFrameValidationError('Table Schema `ordered` must be boolean when present.', {
      orient,
      path: appendPropertyPath(path, 'ordered'),
      value: value.ordered,
    });
  }

  const stringKeys = ['format', 'extDtype', 'tz', 'freq'] as const;
  for (const key of stringKeys) {
    const entryValue = value[key];
    if (entryValue !== undefined && typeof entryValue !== 'string') {
      throw new JsonFrameValidationError(`Table Schema \`${key}\` must be a string when present.`, {
        orient,
        path: appendPropertyPath(path, key),
        value: entryValue,
      });
    }
  }

  const cloned: Record<string, JsonValue | undefined> = Object.create(null) as Record<string, JsonValue | undefined>;
  for (const [key, entryValue] of Object.entries(value)) {
    cloned[key] =
      key === 'constraints' && entryValue !== undefined
        ? (cloneConstraints(entryValue, orient, appendPropertyPath(path, key)) as unknown as JsonValue)
        : entryValue;
  }

  return Object.freeze(cloned) as TableSchemaField;
};

const cloneTableSchema = (value: JsonValue): TableSchema => {
  const orient = 'table';
  if (!isPlainObject(value)) {
    throw new JsonFrameValidationError('`table.schema` must be an object.', {
      orient,
      path: '$.schema',
      value,
    });
  }

  if (!Array.isArray(value.fields)) {
    throw new JsonFrameValidationError('`table.schema.fields` must be an array.', {
      orient,
      path: '$.schema.fields',
      value: value.fields,
    });
  }

  const fields = freezeArray(value.fields.map((field, index) => cloneTableField(field as JsonValue, index)));
  const seenFieldNames = new Set<string>();
  for (const field of fields) {
    if (seenFieldNames.has(field.name)) {
      throw new JsonFrameValidationError('Table Schema field names must be unique.', {
        orient,
        path: '$.schema.fields',
        column: field.name,
        value: field.name,
      });
    }

    seenFieldNames.add(field.name);
  }

  let primaryKey: readonly string[] | undefined;
  if (value.primaryKey !== undefined) {
    if (!Array.isArray(value.primaryKey)) {
      throw new JsonFrameValidationError('`table.schema.primaryKey` must be an array of strings when present.', {
        orient,
        path: '$.schema.primaryKey',
        value: value.primaryKey,
      });
    }

    primaryKey = freezeArray(
      value.primaryKey.map((entryValue, index) => {
        if (typeof entryValue !== 'string') {
          throw new JsonFrameValidationError('`table.schema.primaryKey` entries must be strings.', {
            orient,
            path: appendIndexPath('$.schema.primaryKey', index),
            value: entryValue,
          });
        }

        return entryValue;
      }),
    );
  }

  if (primaryKey !== undefined && primaryKey.length > 1) {
    throw new UnsupportedFeatureError('MultiIndex table payloads are not supported.', 'multi-index', {
      orient,
      path: '$.schema.primaryKey',
      value: primaryKey,
    });
  }

  if (value.pandas_version !== undefined && typeof value.pandas_version !== 'string') {
    throw new JsonFrameValidationError('`table.schema.pandas_version` must be a string when present.', {
      orient,
      path: '$.schema.pandas_version',
      value: value.pandas_version,
    });
  }

  const cloned: Record<string, JsonValue | undefined> = Object.create(null) as Record<string, JsonValue | undefined>;
  for (const [key, entryValue] of Object.entries(value)) {
    if (key === 'fields') {
      cloned[key] = fields as unknown as JsonValue;
    } else if (key === 'primaryKey') {
      cloned[key] = primaryKey as unknown as JsonValue;
    } else {
      cloned[key] = entryValue;
    }
  }

  return Object.freeze(cloned) as TableSchema;
};

const parseTable = (value: JsonValue, orient: 'table'): ParsedFrame => {
  if (!isPlainObject(value)) {
    throw new JsonFrameValidationError('`table` payloads must be objects.', { orient, path: '$', value });
  }

  const schema = cloneTableSchema(value.schema as JsonValue);
  if (!Array.isArray(value.data)) {
    throw new JsonFrameValidationError('`table.data` must be an array of row objects.', {
      orient,
      path: '$.data',
      value: value.data,
    });
  }

  const primaryKey = schema.primaryKey?.[0];
  if (primaryKey !== undefined && !schema.fields.some((field) => field.name === primaryKey)) {
    throw new JsonFrameValidationError('`table.schema.primaryKey` must reference a declared field.', {
      orient,
      path: '$.schema.primaryKey',
      column: primaryKey,
      value: schema.primaryKey,
    });
  }

  const columns = schema.fields.filter((field) => field.name !== primaryKey).map((field) => field.name);
  const data = initializeData(columns);
  const fieldNames = new Set(schema.fields.map((field) => field.name));
  const index: IndexLabel[] = [];
  const indexKind: IndexKind = primaryKey === undefined ? 'synthetic' : 'source';

  for (let rowIndex = 0; rowIndex < value.data.length; rowIndex += 1) {
    const row = value.data[rowIndex];
    const rowPath = appendIndexPath('$.data', rowIndex);
    if (!isPlainObject(row)) {
      throw new JsonFrameValidationError('`table.data` rows must be objects.', {
        orient,
        path: rowPath,
        row: rowIndex,
        value: row,
      });
    }

    for (const key of Object.keys(row)) {
      if (!fieldNames.has(key)) {
        throw new JsonFrameValidationError('`table.data` rows must not include fields missing from `schema.fields`.', {
          orient,
          path: appendPropertyPath(rowPath, key),
          row: rowIndex,
          column: key,
          value: row[key],
        });
      }
    }

    if (primaryKey === undefined) {
      index.push(rowIndex);
    } else if (!hasOwn.call(row, primaryKey)) {
      throw new JsonFrameValidationError('`table.data` rows must include the primary-key field.', {
        orient,
        path: rowPath,
        row: rowIndex,
        column: primaryKey,
        value: row,
      });
    } else {
      index.push(
        assertSupportedIndexLabel(row[primaryKey] as JsonValue, orient, appendPropertyPath(rowPath, primaryKey)),
      );
    }

    for (const column of columns) {
      data.get(column)!.push(hasOwn.call(row, column) ? (row[column] as JsonValue) : null);
    }
  }

  return finalizeFrame({
    orient,
    columns,
    index,
    indexKind,
    data,
    tableSchema: schema,
    ...(primaryKey === undefined ? {} : { tableIndexField: primaryKey }),
  });
};

export const parseInput = (input: string | unknown, options: NormalizedFromOrientOptions): ParsedFrame => {
  const parsedValue = (() => {
    if (typeof input !== 'string') {
      return input;
    }

    try {
      return JSON.parse(input) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new JsonFrameParseError('Failed to parse JSON input.', error);
      }

      throw error;
    }
  })();

  const jsonValue = validateJsonCompatible(parsedValue);
  const orient = options.orient === 'auto' ? detectOrient(jsonValue) : options.orient;

  switch (orient) {
    case 'records':
      return parseRecords(jsonValue, orient);
    case 'index':
      return parseIndex(jsonValue, orient);
    case 'columns':
      return parseColumns(jsonValue, orient);
    case 'values':
      return parseValues(jsonValue, options, orient);
    case 'split':
      return parseSplit(jsonValue, orient);
    case 'table':
      return parseTable(jsonValue, orient);
    default: {
      const exhaustive: never = orient;
      throw new JsonFrameValidationError('Unsupported orient.', { value: exhaustive });
    }
  }
};
