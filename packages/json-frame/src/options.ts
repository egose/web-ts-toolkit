import { JsonFrameOptionError } from './errors';
import type { ColumnLabel, ColumnType, FromOrientOptions, Orient, ResolvedOrient } from './types';

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
}

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

    const seen = new Set<string>();
    columns = options.columns.map((column) => {
      if (typeof column !== 'string') {
        throw new JsonFrameOptionError('`options.columns` must contain only strings.', 'columns', column);
      }

      if (seen.has(column)) {
        throw new JsonFrameOptionError('`options.columns` must not contain duplicates.', 'columns', column);
      }

      seen.add(column);
      return column;
    });
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

    const entries = Object.entries(options.columnTypes);
    columnTypes = Object.freeze(
      Object.fromEntries(
        entries.map(([column, type]) => {
          if (!isColumnType(type)) {
            throw new JsonFrameOptionError(
              '`options.columnTypes` values must be valid JSON Frame logical column types.',
              `columnTypes.${column}`,
              type,
            );
          }

          return [column, type];
        }),
      ) as Partial<Record<ColumnLabel, ColumnType>>,
    );
  }

  return {
    orient,
    packThreshold,
    ...(columns === undefined ? {} : { columns: Object.freeze([...columns]) }),
    ...(columnTypes === undefined ? {} : { columnTypes }),
  };
};
