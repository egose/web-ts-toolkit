import { JsonFrameOptionError } from './errors';
import type {
  ColumnLabel,
  ColumnType,
  FromOrientOptions,
  Orient,
  ResolvedOrient,
  ToJSONStringOptions,
  ToTableOptions,
} from './types';

const RESOLVED_ORIENTS = [
  'records',
  'index',
  'columns',
  'values',
  'split',
  'table',
] as const satisfies readonly ResolvedOrient[];
const ORIENTS = ['auto', ...RESOLVED_ORIENTS] as const satisfies readonly Orient[];
const COLUMN_TYPES = [
  'integer',
  'float',
  'string',
  'boolean',
  'datetime',
  'categorical',
  'mixed',
  'unknown',
] as const satisfies readonly ColumnType[];

export const DEFAULT_PACK_THRESHOLD = 256;

export interface NormalizedFromOrientOptions {
  readonly orient: Orient;
  readonly packThreshold: number;
  readonly columns?: readonly ColumnLabel[];
  readonly columnTypes?: Readonly<Partial<Record<ColumnLabel, ColumnType>>>;
  readonly maxNodes?: number;
}

const validateMaxNodes = (maxNodes: unknown): number | undefined => {
  if (maxNodes === undefined) return undefined;
  if (typeof maxNodes !== 'number' || !Number.isSafeInteger(maxNodes) || maxNodes <= 0) {
    throw new JsonFrameOptionError('`options.maxNodes` must be a positive safe integer.', 'maxNodes', maxNodes);
  }
  return maxNodes;
};

export const normalizeToTableOptions = (options?: ToTableOptions, method = 'toTable'): ToTableOptions => {
  if (options === undefined) return {};
  if (Array.isArray(options) || typeof options !== 'object' || options === null) {
    throw new JsonFrameOptionError(`\`${method}\` options must be an object when provided.`, 'options', options);
  }
  const indexField = options.indexField;
  if (indexField !== undefined && typeof indexField !== 'string') {
    throw new JsonFrameOptionError(
      `\`${method}\` options.indexField must be a string when provided.`,
      'indexField',
      indexField,
    );
  }
  return indexField === undefined ? {} : { indexField };
};

export const normalizeToJSONStringOptions = (options?: ToJSONStringOptions): ToJSONStringOptions => {
  const tableOptions = normalizeToTableOptions(options, 'toJSONString');
  const maxNodes = validateMaxNodes(options?.maxNodes);
  return { ...tableOptions, ...(maxNodes === undefined ? {} : { maxNodes }) };
};

export const isResolvedOrient = (value: unknown): value is ResolvedOrient =>
  typeof value === 'string' && RESOLVED_ORIENTS.includes(value as ResolvedOrient);

export const isOrient = (value: unknown): value is Orient =>
  typeof value === 'string' && ORIENTS.includes(value as Orient);

export const isColumnType = (value: unknown): value is ColumnType =>
  typeof value === 'string' && COLUMN_TYPES.includes(value as ColumnType);

export const normalizeFromOrientOptions = (options?: FromOrientOptions | null): NormalizedFromOrientOptions => {
  if (options == null) {
    return {
      orient: 'auto',
      packThreshold: DEFAULT_PACK_THRESHOLD,
    };
  }

  if (Array.isArray(options) || typeof options !== 'object') {
    throw new JsonFrameOptionError('`fromOrient` options must be an object when provided.', 'options', options);
  }

  const orient = options.orient ?? 'auto';
  if (!isOrient(orient)) {
    throw new JsonFrameOptionError(
      '`options.orient` must be one of auto, records, index, columns, values, split, or table.',
      'orient',
      orient,
    );
  }

  const maxNodes = validateMaxNodes(options.maxNodes);
  const packThreshold = options.packThreshold ?? DEFAULT_PACK_THRESHOLD;
  if (!Number.isFinite(packThreshold) || !Number.isInteger(packThreshold) || packThreshold < 0) {
    throw new JsonFrameOptionError(
      '`options.packThreshold` must be a finite non-negative integer.',
      'packThreshold',
      packThreshold,
    );
  }

  let columns: readonly ColumnLabel[] | undefined;
  if (options.columns !== undefined) {
    if (!Array.isArray(options.columns)) {
      throw new JsonFrameOptionError('`options.columns` must be an array of strings.', 'columns', options.columns);
    }

    // Tightened contract: every numeric position must hold a unique string label.
    // Sparse holes are rejected as option errors before payload traversal; dense
    // non-string and duplicate labels still fail. Labels such as `__proto__`
    // remain valid because lookup uses a `Set`, never a plain-object map.
    const seen = new Set<string>();
    const validated: ColumnLabel[] = [];
    const source = options.columns;
    for (let position = 0; position < source.length; position += 1) {
      if (!Object.prototype.hasOwnProperty.call(source, position)) {
        throw new JsonFrameOptionError(
          '`options.columns` must not contain holes; every position must be a string label.',
          'columns',
          source,
        );
      }

      const column: unknown = source[position];
      if (typeof column !== 'string') {
        throw new JsonFrameOptionError('`options.columns` must contain only strings.', 'columns', column);
      }

      if (seen.has(column)) {
        throw new JsonFrameOptionError('`options.columns` must not contain duplicates.', 'columns', column);
      }

      seen.add(column);
      validated.push(column);
    }
    columns = validated;
  }

  let columnTypes: Readonly<Partial<Record<ColumnLabel, ColumnType>>> | undefined;
  if (options.columnTypes !== undefined) {
    if (Array.isArray(options.columnTypes) || typeof options.columnTypes !== 'object' || options.columnTypes === null) {
      throw new JsonFrameOptionError(
        '`options.columnTypes` must be an object keyed by column name.',
        'columnTypes',
        options.columnTypes,
      );
    }

    // Column labels are arbitrary strings, including Object prototype names.
    const normalized: Partial<Record<ColumnLabel, ColumnType>> = Object.create(null);
    for (const [column, type] of Object.entries(options.columnTypes)) {
      if (!isColumnType(type)) {
        throw new JsonFrameOptionError(
          '`options.columnTypes` values must be valid JSON Frame logical column types.',
          `columnTypes.${column}`,
          type,
        );
      }

      normalized[column] = type;
    }
    columnTypes = Object.freeze(normalized);
  }

  return {
    orient,
    packThreshold,
    ...(maxNodes === undefined ? {} : { maxNodes }),
    ...(columns === undefined ? {} : { columns: Object.freeze([...columns]) }),
    ...(columnTypes === undefined ? {} : { columnTypes }),
  };
};
