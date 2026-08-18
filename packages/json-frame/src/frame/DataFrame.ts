import { JsonFrameValidationError } from '../errors';
import { exportColumns, exportIndex, exportRecords, exportSplit, exportTable, exportValues } from '../export/payload';
import type {
  ColumnInfo,
  ColumnsPayload,
  IndexKind,
  IndexLabel,
  IndexPayload,
  JsonValue,
  RecordsPayload,
  ResolvedOrient,
  SplitPayload,
  TablePayload,
  TableSchema,
  TableSchemaField,
  ToJSONStringOptions,
  ToTableOptions,
  ValuesPayload,
} from '../types';
import { createFrameStateFromData, materializeFrameData, type FrameState } from './column';

const hasOwn = Object.prototype.hasOwnProperty;
const frameStateByInstance = new WeakMap<object, FrameState>();

const freezeArray = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);

const cloneField = (field: TableSchemaField, name = field.name): TableSchemaField =>
  Object.freeze({ ...field, name }) as TableSchemaField;

const cloneSchema = (
  schema: TableSchema,
  fields: readonly TableSchemaField[],
  primaryKey?: readonly string[],
): TableSchema => {
  const cloned: Record<string, JsonValue | undefined> = Object.create(null) as Record<string, JsonValue | undefined>;

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'fields' || key === 'primaryKey') {
      continue;
    }

    cloned[key] = value as JsonValue | undefined;
  }

  cloned.fields = freezeArray(fields) as unknown as JsonValue;
  if (primaryKey !== undefined) {
    cloned.primaryKey = freezeArray(primaryKey) as unknown as JsonValue;
  }

  return Object.freeze(cloned) as TableSchema;
};

type RowRecord = Record<string, JsonValue>;
type RowPredicate<TRow extends RowRecord> = (row: Readonly<TRow>, index: IndexLabel, position: number) => boolean;
type RowComparator<TRow extends RowRecord> = (
  left: Readonly<TRow>,
  right: Readonly<TRow>,
  leftIndex: IndexLabel,
  rightIndex: IndexLabel,
  leftPosition: number,
  rightPosition: number,
) => number;

type TransformSchema = {
  readonly tableSchema?: TableSchema;
  readonly tableIndexField?: string;
};

/**
 * Immutable column-major view over pandas-compatible tabular JSON.
 *
 * Construct frames with `fromOrient()`. The generic row type improves row and
 * callback ergonomics only; runtime validation still follows the JSON Frame
 * contracts for the selected orient.
 */
export class DataFrame<TRow extends RowRecord = RowRecord> {
  readonly #state: FrameState;
  readonly #packThreshold: number;

  protected constructor(state: FrameState, packThreshold: number) {
    this.#state = state;
    this.#packThreshold = packThreshold;
    frameStateByInstance.set(this, state);
  }

  get columns(): readonly string[] {
    return freezeArray(this.#state.columns);
  }

  get index(): readonly IndexLabel[] {
    return freezeArray(this.#state.index);
  }

  get columnInfo(): ReadonlyMap<string, ColumnInfo> {
    return new Map(this.#state.columnInfo);
  }

  get length(): number {
    return this.#state.index.length;
  }

  toRecords(): RecordsPayload {
    return exportRecords(this.#state, this.#materializedData());
  }

  toIndex(): IndexPayload {
    return exportIndex(this.#state, this.#materializedData());
  }

  toColumns(): ColumnsPayload {
    return exportColumns(this.#state, this.#materializedData());
  }

  toValues(): ValuesPayload {
    return exportValues(this.#state, this.#materializedData());
  }

  toSplit(): SplitPayload {
    return exportSplit(this.#state, this.#materializedData());
  }

  toTable(options?: ToTableOptions): TablePayload {
    return exportTable(this.#state, this.#materializedData(), this.#state.columnInfo, options);
  }

  toJSONString(orient: ResolvedOrient, options?: ToJSONStringOptions): string {
    switch (orient) {
      case 'records':
        return JSON.stringify(this.toRecords());
      case 'index':
        return JSON.stringify(this.toIndex());
      case 'columns':
        return JSON.stringify(this.toColumns());
      case 'values':
        return JSON.stringify(this.toValues());
      case 'split':
        return JSON.stringify(this.toSplit());
      case 'table':
        return JSON.stringify(this.toTable(options));
      default: {
        const exhaustive: never = orient;
        throw new JsonFrameValidationError('Unsupported export orient.', { value: exhaustive });
      }
    }
  }

  row(position: number): Readonly<TRow> {
    this.#assertRowPosition(position);
    return this.#createRow(this.#materializedData(), position);
  }

  rows(): readonly Readonly<TRow>[] {
    const materialized = this.#materializedData();
    const rows = this.#state.index.map((_, position) => this.#createRow(materialized, position));
    return freezeArray(rows);
  }

  filter(predicate: RowPredicate<TRow>): DataFrame<TRow> {
    const materialized = this.#materializedData();
    const keptPositions: number[] = [];

    for (let position = 0; position < this.length; position += 1) {
      if (predicate(this.#createRow(materialized, position), this.#state.index[position]!, position)) {
        keptPositions.push(position);
      }
    }

    return this.#rebuild({
      columns: this.#state.columns,
      sourceColumns: this.#state.columns,
      positions: keptPositions,
      index: keptPositions.map((position) => this.#state.index[position]!),
      indexKind: this.#state.indexKind,
      schema: {
        tableSchema: this.#state.tableSchema,
        tableIndexField: this.#state.tableIndexField,
      },
    });
  }

  sort(compare: RowComparator<TRow>): DataFrame<TRow> {
    const materialized = this.#materializedData();
    const ordering = this.#state.index.map((indexLabel, position) => ({
      indexLabel,
      position,
      row: this.#createRow(materialized, position),
    }));

    ordering.sort((left, right) => {
      const result = compare(left.row, right.row, left.indexLabel, right.indexLabel, left.position, right.position);
      return (Number.isNaN(result) ? 0 : result) || left.position - right.position;
    });

    return this.#rebuild({
      columns: this.#state.columns,
      sourceColumns: this.#state.columns,
      positions: ordering.map(({ position }) => position),
      index: ordering.map(({ indexLabel }) => indexLabel),
      indexKind: this.#state.indexKind,
      schema: {
        tableSchema: this.#state.tableSchema,
        tableIndexField: this.#state.tableIndexField,
      },
    });
  }

  select(...columns: readonly string[]): DataFrame<RowRecord> {
    const seen = new Set<string>();

    for (const column of columns) {
      if (!this.#state.data.has(column)) {
        throw new JsonFrameValidationError('Selected columns must exist in the frame.', {
          path: '$.columns',
          column,
          value: column,
        });
      }

      if (seen.has(column)) {
        throw new JsonFrameValidationError('Selected columns must be unique.', {
          path: '$.columns',
          column,
          value: column,
        });
      }

      seen.add(column);
    }

    const selectedSchema = this.#selectSchema(columns);
    return this.#rebuild<RowRecord>({
      columns,
      sourceColumns: columns,
      positions: this.#state.index.map((_, position) => position),
      index: this.#state.index,
      indexKind: this.#state.indexKind,
      schema: selectedSchema,
    });
  }

  rename(mapping: Readonly<Record<string, string>>): DataFrame<RowRecord> {
    const nextColumns = this.#state.columns.map((column) => (hasOwn.call(mapping, column) ? mapping[column]! : column));
    const seen = new Set<string>();

    for (let position = 0; position < nextColumns.length; position += 1) {
      const column = nextColumns[position]!;
      if (seen.has(column)) {
        throw new JsonFrameValidationError('Renamed columns must remain unique.', {
          path: '$.columns',
          column,
          value: column,
        });
      }

      seen.add(column);
    }

    const renamedSchema = this.#renameSchema(mapping);
    return this.#rebuild<RowRecord>({
      columns: nextColumns,
      sourceColumns: this.#state.columns,
      positions: this.#state.index.map((_, position) => position),
      index: this.#state.index,
      indexKind: this.#state.indexKind,
      schema: renamedSchema,
    });
  }

  resetIndex(): DataFrame<TRow> {
    const resetSchema = this.#resetIndexSchema();
    return this.#rebuild({
      columns: this.#state.columns,
      sourceColumns: this.#state.columns,
      positions: this.#state.index.map((_, position) => position),
      index: this.#state.index.map((_, position) => position),
      indexKind: 'synthetic',
      schema: resetSchema,
    });
  }

  #assertRowPosition(position: number): void {
    if (!Number.isInteger(position) || position < 0 || position >= this.length) {
      throw new RangeError(`Row position must be an integer in [0, ${this.length}).`);
    }
  }

  #materializedData(): ReadonlyMap<string, readonly JsonValue[]> {
    return materializeFrameData(this.#state.columns, this.#state.data);
  }

  #createRow(materialized: ReadonlyMap<string, readonly JsonValue[]>, position: number): Readonly<TRow> {
    const row = Object.create(null) as RowRecord;

    for (const column of this.#state.columns) {
      row[column] = materialized.get(column)![position] as JsonValue;
    }

    return Object.freeze(row) as Readonly<TRow>;
  }

  #columnTypeOverrides(
    columns: readonly string[],
    sourceColumns: readonly string[],
  ): Readonly<Partial<Record<string, ColumnInfo['type']>>> {
    return Object.freeze(
      Object.fromEntries(
        columns.map((column, position) => [column, this.#state.columnInfo.get(sourceColumns[position]!)!.type]),
      ) as Partial<Record<string, ColumnInfo['type']>>,
    );
  }

  #rebuild<TReturn extends RowRecord = TRow>({
    columns,
    sourceColumns,
    positions,
    index,
    indexKind,
    schema,
  }: {
    readonly columns: readonly string[];
    readonly sourceColumns: readonly string[];
    readonly positions: readonly number[];
    readonly index: readonly IndexLabel[];
    readonly indexKind: IndexKind;
    readonly schema: TransformSchema;
  }): DataFrame<TReturn> {
    const materialized = this.#materializedData();
    const nextData = new Map<string, readonly JsonValue[]>();

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex]!;
      const sourceColumn = materialized.get(sourceColumns[columnIndex]!);
      if (sourceColumn === undefined) {
        throw new JsonFrameValidationError('Stored frame data is missing a declared column.', {
          path: '$',
          column,
        });
      }

      nextData.set(column, freezeArray(positions.map((position) => sourceColumn[position] as JsonValue)));
    }

    const state = createFrameStateFromData(
      {
        columns,
        index,
        indexKind,
        data: nextData,
        ...(schema.tableSchema === undefined ? {} : { tableSchema: schema.tableSchema }),
        ...(schema.tableIndexField === undefined ? {} : { tableIndexField: schema.tableIndexField }),
      },
      {
        packThreshold: this.#packThreshold,
        columnTypes: this.#columnTypeOverrides(columns, sourceColumns),
      },
    );

    return createDataFrame<TReturn>(state, this.#packThreshold);
  }

  #selectSchema(columns: readonly string[]): TransformSchema {
    if (this.#state.tableSchema === undefined) {
      return {};
    }

    const fieldByName = new Map(this.#state.tableSchema.fields.map((field) => [field.name, field]));
    const fields: TableSchemaField[] = [];

    if (this.#state.tableIndexField !== undefined) {
      const indexField = fieldByName.get(this.#state.tableIndexField);
      if (indexField !== undefined) {
        fields.push(cloneField(indexField));
      }
    }

    for (const column of columns) {
      const field = fieldByName.get(column);
      if (field !== undefined) {
        fields.push(cloneField(field));
      }
    }

    return {
      tableSchema: cloneSchema(this.#state.tableSchema, fields, this.#state.tableSchema.primaryKey),
      ...(this.#state.tableIndexField === undefined ? {} : { tableIndexField: this.#state.tableIndexField }),
    };
  }

  #renameSchema(mapping: Readonly<Record<string, string>>): TransformSchema {
    if (this.#state.tableSchema === undefined) {
      return {};
    }

    const fields = this.#state.tableSchema.fields.map((field) => {
      if (!this.#state.columns.includes(field.name)) {
        return cloneField(field);
      }

      return cloneField(field, hasOwn.call(mapping, field.name) ? mapping[field.name]! : field.name);
    });

    return {
      tableSchema: cloneSchema(this.#state.tableSchema, fields, this.#state.tableSchema.primaryKey),
      ...(this.#state.tableIndexField === undefined ? {} : { tableIndexField: this.#state.tableIndexField }),
    };
  }

  #resetIndexSchema(): TransformSchema {
    if (this.#state.tableSchema === undefined) {
      return {};
    }

    if (this.#state.tableIndexField === undefined) {
      return {
        tableSchema: cloneSchema(
          this.#state.tableSchema,
          this.#state.tableSchema.fields.map((field) => cloneField(field)),
        ),
      };
    }

    const fields = this.#state.tableSchema.fields
      .filter((field) => field.name !== this.#state.tableIndexField)
      .map((field) => cloneField(field));

    return {
      tableSchema: cloneSchema(this.#state.tableSchema, fields),
    };
  }
}

class InternalDataFrame<TRow extends RowRecord = RowRecord> extends DataFrame<TRow> {
  constructor(state: FrameState, packThreshold: number) {
    super(state, packThreshold);
  }
}

export const createDataFrame = <TRow extends RowRecord = RowRecord>(
  state: FrameState,
  packThreshold: number,
): DataFrame<TRow> => new InternalDataFrame<TRow>(state, packThreshold);

export const getDataFrameState = <TRow extends RowRecord>(frame: DataFrame<TRow>): FrameState => {
  const state = frameStateByInstance.get(frame);
  if (state === undefined) {
    throw new JsonFrameValidationError('Frame state is unavailable for the provided DataFrame instance.', {
      path: '$',
      value: frame,
    });
  }

  return state;
};
