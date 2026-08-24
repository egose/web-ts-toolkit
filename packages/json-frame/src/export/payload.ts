import { ExportKeyCollisionError, JsonFrameOptionError, JsonFrameValidationError } from '../errors';
import { validateColumnValuesForType, type FrameState } from '../frame/column';
import { cloneJsonCompatible } from '../json';
import type {
  ColumnInfo,
  ColumnsPayload,
  IndexLabel,
  IndexPayload,
  JsonObject,
  JsonValue,
  RecordsPayload,
  SplitPayload,
  TablePayload,
  TableSchema,
  TableSchemaField,
  TableSchemaFieldType,
  ToTableOptions,
  ValuesPayload,
} from '../types';

const createRecord = <T extends object>(): T => Object.create(null) as T;

const appendPath = (path: string, key: string): string => `${path}[${JSON.stringify(key)}]`;

const cloneSchemaField = (field: TableSchemaField, name = field.name, path = '$.schema.fields[]'): TableSchemaField => {
  const cloned = createRecord<Record<string, JsonValue | undefined>>();

  for (const [key, value] of Object.entries(field)) {
    cloned[key] =
      key === 'name'
        ? name
        : value === undefined
          ? undefined
          : cloneJsonCompatible(value, 'table', appendPath(path, key));
  }

  return cloned as TableSchemaField;
};

const cloneSchema = (
  schema: TableSchema | undefined,
  fields: readonly TableSchemaField[],
  primaryKey?: readonly string[],
): TableSchema => {
  const cloned = createRecord<Record<string, JsonValue | undefined>>();

  if (schema !== undefined) {
    for (const [key, value] of Object.entries(schema)) {
      if (key === 'fields' || key === 'primaryKey') {
        continue;
      }

      cloned[key] = value === undefined ? undefined : cloneJsonCompatible(value, 'table', appendPath('$.schema', key));
    }
  }

  cloned.fields = fields.map((field, index) =>
    cloneSchemaField(field, field.name, `$.schema.fields[${index}]`),
  ) as unknown as JsonValue;
  if (primaryKey !== undefined) {
    cloned.primaryKey = [...primaryKey] as unknown as JsonValue;
  }

  return cloned as TableSchema;
};

const mapColumnTypeToSchemaField = (name: string, info: ColumnInfo): TableSchemaField => {
  const type: TableSchemaFieldType = (() => {
    switch (info.type) {
      case 'integer':
        return 'integer';
      case 'float':
        return 'number';
      case 'string':
        return 'string';
      case 'categorical':
        return 'any';
      case 'boolean':
        return 'boolean';
      case 'datetime':
        return 'datetime';
      case 'mixed':
      case 'unknown':
        return 'any';
      default: {
        const exhaustive: never = info.type;
        throw new JsonFrameValidationError('Unsupported logical column type for table export.', {
          path: '$.columnInfo',
          column: name,
          value: exhaustive,
        });
      }
    }
  })();

  return info.type === 'categorical'
    ? ({ name, type, extDtype: 'category' } as TableSchemaField)
    : ({ name, type } as TableSchemaField);
};

const inferIndexFieldType = (index: readonly IndexLabel[]): TableSchemaFieldType => {
  let sawString = false;
  let sawInteger = false;
  let sawFloat = false;

  for (const label of index) {
    if (typeof label === 'string') {
      sawString = true;
      continue;
    }

    if (Number.isInteger(label)) {
      sawInteger = true;
      continue;
    }

    sawFloat = true;
  }

  if (sawString && (sawInteger || sawFloat)) {
    return 'any';
  }

  if (sawString) {
    return 'string';
  }

  if (sawFloat) {
    return 'number';
  }

  if (sawInteger) {
    return 'integer';
  }

  return 'string';
};

const getIndexFieldTemplate = (state: FrameState): TableSchemaField | undefined => {
  if (state.tableSchema === undefined || state.tableIndexField === undefined) {
    return undefined;
  }

  return state.tableSchema.fields.find((field) => field.name === state.tableIndexField);
};

const getDataFieldTemplates = (state: FrameState): readonly TableSchemaField[] => {
  if (state.tableSchema === undefined) {
    return [];
  }

  const fieldsByName = new Map(state.tableSchema.fields.map((field) => [field.name, field]));
  return state.columns.map((column) => fieldsByName.get(column)).filter((field) => field !== undefined);
};

const resolveIndexFieldName = (state: FrameState, options?: ToTableOptions): string | undefined => {
  if (options !== undefined && (Array.isArray(options) || typeof options !== 'object' || options === null)) {
    throw new JsonFrameOptionError('`toTable` options must be an object when provided.', 'options', options);
  }

  if (options?.indexField !== undefined && typeof options.indexField !== 'string') {
    throw new JsonFrameOptionError(
      '`toTable` options.indexField must be a string when provided.',
      'indexField',
      options.indexField,
    );
  }

  if (state.indexKind === 'synthetic') {
    return undefined;
  }

  const indexField = options?.indexField ?? state.tableIndexField ?? 'index';
  if (state.columns.includes(indexField)) {
    throw new JsonFrameValidationError('Table export index field name must not collide with a data column.', {
      path: '$.schema.fields',
      column: indexField,
      value: indexField,
    });
  }

  return indexField;
};

const assertUniqueTableIndexLabels = (index: readonly IndexLabel[], indexField: string): void => {
  const seen = new Map<IndexLabel, number>();

  for (let rowIndex = 0; rowIndex < index.length; rowIndex += 1) {
    const label = index[rowIndex]!;
    if (seen.has(label)) {
      throw new JsonFrameValidationError('Cannot export duplicate index labels as a table primary key.', {
        orient: 'table',
        path: `$.data[${rowIndex}][${JSON.stringify(indexField)}]`,
        row: rowIndex,
        column: indexField,
        value: label,
      });
    }

    seen.set(label, rowIndex);
  }
};

const resolveIndexKeys = (state: FrameState, orient: 'index' | 'columns'): readonly string[] => {
  const seenKeys = new Map<string, IndexLabel>();
  const keys: string[] = [];

  for (const label of state.index) {
    const key = String(label);
    const priorLabel = seenKeys.get(key);
    if (priorLabel !== undefined) {
      throw new ExportKeyCollisionError(
        `Cannot export distinct rows to orient="${orient}" because index labels collide after stringification.`,
        orient,
        key,
        [priorLabel, label],
      );
    }

    seenKeys.set(key, label);
    keys.push(key);
  }

  return keys;
};

export const exportRecords = (
  state: FrameState,
  materialized: ReadonlyMap<string, readonly JsonValue[]>,
): RecordsPayload => {
  const rows: JsonObject[] = [];

  for (let rowIndex = 0; rowIndex < state.index.length; rowIndex += 1) {
    const row = createRecord<Record<string, JsonValue>>();
    for (const column of state.columns) {
      row[column] = materialized.get(column)![rowIndex] as JsonValue;
    }

    rows.push(row as JsonObject);
  }

  return rows;
};

export const exportIndex = (
  state: FrameState,
  materialized: ReadonlyMap<string, readonly JsonValue[]>,
): IndexPayload => {
  const keys = resolveIndexKeys(state, 'index');
  const rows = createRecord<Record<string, JsonObject>>();

  for (let rowIndex = 0; rowIndex < state.index.length; rowIndex += 1) {
    const row = createRecord<Record<string, JsonValue>>();
    for (const column of state.columns) {
      row[column] = materialized.get(column)![rowIndex] as JsonValue;
    }

    rows[keys[rowIndex]!] = row as JsonObject;
  }

  return rows;
};

export const exportColumns = (
  state: FrameState,
  materialized: ReadonlyMap<string, readonly JsonValue[]>,
): ColumnsPayload => {
  const keys = resolveIndexKeys(state, 'columns');
  const columns = createRecord<Record<string, JsonObject>>();

  for (const column of state.columns) {
    const values = createRecord<Record<string, JsonValue>>();
    const entries = materialized.get(column)!;
    for (let rowIndex = 0; rowIndex < state.index.length; rowIndex += 1) {
      values[keys[rowIndex]!] = entries[rowIndex] as JsonValue;
    }

    columns[column] = values as JsonObject;
  }

  return columns;
};

export const exportValues = (
  state: FrameState,
  materialized: ReadonlyMap<string, readonly JsonValue[]>,
): ValuesPayload => {
  const rows: JsonValue[][] = [];

  for (let rowIndex = 0; rowIndex < state.index.length; rowIndex += 1) {
    rows.push(state.columns.map((column) => materialized.get(column)![rowIndex] as JsonValue));
  }

  return rows;
};

export const exportSplit = (
  state: FrameState,
  materialized: ReadonlyMap<string, readonly JsonValue[]>,
): SplitPayload => ({
  columns: [...state.columns],
  index: [...state.index],
  data: exportValues(state, materialized),
});

export const exportTable = (
  state: FrameState,
  materialized: ReadonlyMap<string, readonly JsonValue[]>,
  columnInfo: ReadonlyMap<string, ColumnInfo>,
  options?: ToTableOptions,
): TablePayload => {
  const indexField = resolveIndexFieldName(state, options);
  if (indexField !== undefined) {
    assertUniqueTableIndexLabels(state.index, indexField);
  }

  const indexTemplate = getIndexFieldTemplate(state);
  const dataTemplates = getDataFieldTemplates(state);
  const fields: TableSchemaField[] = [];

  if (indexField !== undefined) {
    fields.push(
      indexTemplate === undefined
        ? ({ name: indexField, type: inferIndexFieldType(state.index) } as TableSchemaField)
        : cloneSchemaField(indexTemplate, indexField, '$.schema.fields[0]'),
    );
  }

  for (let columnIndex = 0; columnIndex < state.columns.length; columnIndex += 1) {
    const column = state.columns[columnIndex]!;
    const template = dataTemplates[columnIndex];
    if (template === undefined) {
      validateColumnValuesForType({
        column,
        columnIndex,
        values: materialized.get(column) ?? [],
        type: columnInfo.get(column)!.type,
        orient: 'table',
        index: state.index,
      });
    }

    fields.push(
      template === undefined
        ? mapColumnTypeToSchemaField(column, columnInfo.get(column)!)
        : cloneSchemaField(template, column, `$.schema.fields[${fields.length}]`),
    );
  }

  const data: JsonObject[] = [];
  for (let rowIndex = 0; rowIndex < state.index.length; rowIndex += 1) {
    const row = createRecord<Record<string, JsonValue>>();
    if (indexField !== undefined) {
      row[indexField] = state.index[rowIndex] as JsonValue;
    }

    for (const column of state.columns) {
      row[column] = materialized.get(column)![rowIndex] as JsonValue;
    }

    data.push(row as JsonObject);
  }

  return {
    schema: cloneSchema(state.tableSchema, fields, indexField === undefined ? undefined : [indexField]),
    data,
  };
};
