import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExportKeyCollisionError, JsonFrameValidationError } from '../../src/errors';
import { createFrameState, createFrameStateFromData, type FrameState } from '../../src/frame/column';
import { createDataFrame as createInternalDataFrame, DataFrame, getDataFrameState } from '../../src/frame/DataFrame';
import { JSON_FRAME_MAX_DEPTH } from '../../src/json';
import { normalizeFromOrientOptions } from '../../src/options';
import { parseInput } from '../../src/parse';
import type { JsonValue, ResolvedOrient, TableSchema, ToTableOptions } from '../../src/types';

const fixtureDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/generated');

const buildDataFrame = (input: string | unknown, options: Parameters<typeof normalizeFromOrientOptions>[0]) => {
  const normalized = normalizeFromOrientOptions(options);
  const parsed = parseInput(input, normalized);
  return createInternalDataFrame(createFrameState(parsed, normalized), normalized.packThreshold);
};

const loadFixture = async (fixtureName: string) => readFile(path.join(fixtureDirectory, fixtureName), 'utf8');

const exportFrame = (frame: DataFrame, orient: ResolvedOrient, options?: ToTableOptions) => {
  switch (orient) {
    case 'records':
      return frame.toRecords();
    case 'index':
      return frame.toIndex();
    case 'columns':
      return frame.toColumns();
    case 'values':
      return frame.toValues();
    case 'split':
      return frame.toSplit();
    case 'table':
      return frame.toTable(options);
    default: {
      const exhaustive: never = orient;
      throw new Error(`unsupported orient: ${String(exhaustive)}`);
    }
  }
};

const reimportExport = (frame: DataFrame, orient: ResolvedOrient, options?: ToTableOptions) =>
  buildDataFrame(exportFrame(frame, orient, options), {
    orient,
    ...(orient === 'values' ? { columns: frame.columns } : {}),
  });

const syntheticIndex = (length: number) => Array.from({ length }, (_, index) => index);
const stringifiedIndex = (index: readonly (string | number)[]) => index.map((label) => String(label));
const nestedArrays = (depth: number, leaf: JsonValue = 'leaf'): JsonValue => {
  let value = leaf;
  for (let index = 0; index < depth; index += 1) {
    value = [value];
  }

  return value;
};

describe('DataFrame exporters', () => {
  const sixOrientFixtures = [
    ['allSixStringIndex-records.json', { orient: 'records' }],
    ['allSixStringIndex-index.json', { orient: 'index' }],
    ['allSixStringIndex-columns.json', { orient: 'columns' }],
    ['allSixStringIndex-values.json', { orient: 'values', columns: ['city', 'temp'] }],
    ['allSixStringIndex-split.json', { orient: 'split' }],
    ['allSixStringIndex-table.json', { orient: 'table' }],
    ['allSixRangeIndex-records.json', { orient: 'records' }],
    ['allSixRangeIndex-index.json', { orient: 'index' }],
    ['allSixRangeIndex-columns.json', { orient: 'columns' }],
    ['allSixRangeIndex-values.json', { orient: 'values', columns: ['a', 'b'] }],
    ['allSixRangeIndex-split.json', { orient: 'split' }],
    ['allSixRangeIndex-table.json', { orient: 'table' }],
  ] as const;

  it.each(sixOrientFixtures)(
    'round-trips exported payloads semantically for %s',
    async (fixtureName, sourceOptions) => {
      const frame = buildDataFrame(await loadFixture(fixtureName), sourceOptions);
      const frameState = getDataFrameState(frame);

      for (const orient of ['records', 'index', 'columns', 'values', 'split', 'table'] as const) {
        const exported = exportFrame(frame, orient);
        const reparsed = reimportExport(frame, orient);

        expect(JSON.parse(frame.toJSONString(orient))).toEqual(exported);
        expect(reparsed.columns).toEqual(frame.columns);
        expect(reparsed.rows()).toEqual(frame.rows());

        switch (orient) {
          case 'records':
          case 'values':
            expect(reparsed.index).toEqual(syntheticIndex(frame.length));
            expect(getDataFrameState(reparsed).indexKind).toBe('synthetic');
            break;
          case 'index':
          case 'columns':
            expect(reparsed.index).toEqual(stringifiedIndex(frame.index));
            expect(getDataFrameState(reparsed).indexKind).toBe('source');
            break;
          case 'split':
            expect(reparsed.index).toEqual(frame.index);
            expect(getDataFrameState(reparsed).indexKind).toBe('source');
            break;
          case 'table':
            if (frameState.indexKind === 'source') {
              expect(reparsed.index).toEqual(frame.index);
              expect(getDataFrameState(reparsed).indexKind).toBe('source');
            } else {
              expect(reparsed.index).toEqual(syntheticIndex(frame.length));
              expect(getDataFrameState(reparsed).indexKind).toBe('synthetic');
            }
            break;
        }
      }
    },
  );

  it('never invents an index column in records or values exports and returns detached containers', () => {
    const frame = buildDataFrame(
      {
        columns: ['city', 'temp'],
        index: ['r0', 'r1'],
        data: [
          ['NYC', 70],
          ['LA', 80],
        ],
      },
      { orient: 'split' },
    );

    const records = frame.toRecords() as Array<Record<string, unknown>>;
    const values = frame.toValues() as Array<Array<unknown>>;

    records[0]!.city = 'changed';
    values[0]![0] = 'changed';

    expect(records).toEqual([
      { city: 'changed', temp: 70 },
      { city: 'LA', temp: 80 },
    ]);
    expect(values).toEqual([
      ['changed', 70],
      ['LA', 80],
    ]);
    expect(frame.rows()).toEqual([
      { city: 'NYC', temp: 70 },
      { city: 'LA', temp: 80 },
    ]);
    expect(records.every((row) => !Object.hasOwn(row, 'index') && !Object.hasOwn(row, 'r0'))).toBe(true);
    expect(values.every((row) => row.length === 2)).toBe(true);
  });

  it('throws controlled collisions for object-key exporters while preserving distinct split index labels', () => {
    const frame = buildDataFrame(
      {
        columns: ['value'],
        index: [1, '1'],
        data: [[10], [20]],
      },
      { orient: 'split' },
    );

    expect(() => frame.toIndex()).toThrowError(ExportKeyCollisionError);
    expect(() => frame.toColumns()).toThrowError(ExportKeyCollisionError);
    expect(frame.toSplit()).toEqual({
      columns: ['value'],
      index: [1, '1'],
      data: [[10], [20]],
    });
    expect(frame.toTable()).toEqual({
      schema: {
        fields: [
          { name: 'index', type: 'any' },
          { name: 'value', type: 'integer' },
        ],
        primaryKey: ['index'],
      },
      data: [
        { index: 1, value: 10 },
        { index: '1', value: 20 },
      ],
    });
  });

  it('preserves duplicate indexes for non-table orients and rejects them at table export', () => {
    const frame = buildDataFrame(
      {
        columns: ['city'],
        index: ['same', 'same'],
        data: [['NYC'], ['LA']],
      },
      { orient: 'split' },
    );

    expect(frame.rows()).toEqual([{ city: 'NYC' }, { city: 'LA' }]);
    expect(frame.toSplit()).toEqual({
      columns: ['city'],
      index: ['same', 'same'],
      data: [['NYC'], ['LA']],
    });

    try {
      frame.toTable();
      throw new Error('expected duplicate index labels to throw');
    } catch (error) {
      const validationError = error as JsonFrameValidationError;
      expect(validationError).toMatchObject({
        name: 'JsonFrameValidationError',
        orient: 'table',
        path: '$.data[1]["index"]',
        row: 1,
        column: 'index',
        value: 'same',
      });
    }
  });

  it('reconstructs table schema, preserves metadata, and supports indexField overrides on collision', () => {
    const tableFrame = buildDataFrame(
      {
        schema: {
          fields: [
            { name: 'row_name', type: 'string', extDtype: 'str' },
            { name: 'city', type: 'string', extDtype: 'str' },
            { name: 'temp', type: 'number' },
          ],
          primaryKey: ['row_name'],
          pandas_version: '1.4.0',
        },
        data: [
          { row_name: 'r0', city: 'NYC', temp: 70 },
          { row_name: 'r1', city: 'LA', temp: 80 },
        ],
      },
      { orient: 'table' },
    ).rename({ temp: 'degrees' });

    expect(tableFrame.toTable()).toEqual({
      schema: {
        fields: [
          { name: 'row_name', type: 'string', extDtype: 'str' },
          { name: 'city', type: 'string', extDtype: 'str' },
          { name: 'degrees', type: 'number' },
        ],
        primaryKey: ['row_name'],
        pandas_version: '1.4.0',
      },
      data: [
        { row_name: 'r0', city: 'NYC', degrees: 70 },
        { row_name: 'r1', city: 'LA', degrees: 80 },
      ],
    });

    const collidingIndexFrame = buildDataFrame(
      {
        columns: ['index', 'city'],
        index: ['r0', 'r1'],
        data: [
          ['A', 'NYC'],
          ['B', 'LA'],
        ],
      },
      { orient: 'split' },
    );

    expect(() => collidingIndexFrame.toTable()).toThrowError(JsonFrameValidationError);
    expect(collidingIndexFrame.toTable({ indexField: 'row_id' })).toEqual({
      schema: {
        fields: [
          { name: 'row_id', type: 'string' },
          { name: 'index', type: 'string' },
          { name: 'city', type: 'string' },
        ],
        primaryKey: ['row_id'],
      },
      data: [
        { row_id: 'r0', index: 'A', city: 'NYC' },
        { row_id: 'r1', index: 'B', city: 'LA' },
      ],
    });
  });

  it('emits explicit datetime and categorical types without coercing cell values', () => {
    const frame = buildDataFrame(
      [
        { ts: '2024-01-02T03:04:05.000', grade: 1, active: true },
        { ts: null, grade: 'b', active: false },
      ],
      {
        orient: 'records',
        columnTypes: { ts: 'datetime', grade: 'categorical', active: 'boolean' },
      },
    );

    expect(frame.toRecords()).toEqual([
      { ts: '2024-01-02T03:04:05.000', grade: 1, active: true },
      { ts: null, grade: 'b', active: false },
    ]);
    expect(frame.toTable()).toEqual({
      schema: {
        fields: [
          { name: 'ts', type: 'datetime' },
          { name: 'grade', type: 'any', extDtype: 'category' },
          { name: 'active', type: 'boolean' },
        ],
      },
      data: [
        { ts: '2024-01-02T03:04:05.000', grade: 1, active: true },
        { ts: null, grade: 'b', active: false },
      ],
    });
  });

  it('validates generated table schema compatibility before exporting corrupted frame state', () => {
    const corruptedState: FrameState = {
      columns: ['value'],
      index: [0],
      indexKind: 'synthetic',
      data: new Map([['value', [1]]]),
      columnInfo: new Map([['value', { type: 'string', nullable: false }]]),
    };
    const frame = createInternalDataFrame(corruptedState, 0);

    try {
      frame.toTable();
      throw new Error('expected generated table schema validation to throw');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'JsonFrameValidationError',
        orient: 'table',
        path: '$.data[0]["value"]',
        row: 0,
        column: 'value',
        value: 1,
      });
    }
  });

  it('preserves table field metadata by field name when the primary-key field is not first', () => {
    const frame = buildDataFrame(
      {
        schema: {
          fields: [
            { name: 'city', type: 'string', extDtype: 'str' },
            { name: 'row_name', type: 'string', extDtype: 'string[python]' },
            { name: 'temp', type: 'number', tz: 'UTC' },
          ],
          primaryKey: ['row_name'],
          pandas_version: '3.0.3',
        },
        data: [
          { row_name: 'r0', city: 'NYC', temp: 70 },
          { row_name: 'r1', city: 'LA', temp: 80 },
        ],
      },
      { orient: 'table' },
    );

    expect(frame.toTable()).toEqual({
      schema: {
        fields: [
          { name: 'row_name', type: 'string', extDtype: 'string[python]' },
          { name: 'city', type: 'string', extDtype: 'str' },
          { name: 'temp', type: 'number', tz: 'UTC' },
        ],
        primaryKey: ['row_name'],
        pandas_version: '3.0.3',
      },
      data: [
        { row_name: 'r0', city: 'NYC', temp: 70 },
        { row_name: 'r1', city: 'LA', temp: 80 },
      ],
    });
  });

  it('applies the JSON depth policy to table metadata, toTable(), and toJSONString("table")', () => {
    const accepted = buildDataFrame(
      {
        schema: {
          fields: [{ name: 'value', type: 'any' }],
          custom: nestedArrays(JSON_FRAME_MAX_DEPTH - 1),
        },
        data: [{ value: 1 }],
      },
      { orient: 'table' },
    );

    expect(() => accepted.toTable()).not.toThrow();
    expect(() => accepted.toJSONString('table')).not.toThrow();

    const rejectedSchema = {
      fields: [{ name: 'value', type: 'any' }],
      custom: nestedArrays(JSON_FRAME_MAX_DEPTH + 2),
    } as TableSchema;
    const rejected = createInternalDataFrame(
      createFrameStateFromData(
        {
          columns: ['value'],
          index: ['r0'],
          indexKind: 'source',
          data: new Map([['value', [1]]]),
          tableSchema: rejectedSchema,
        },
        normalizeFromOrientOptions({ orient: 'table' }),
      ),
      0,
    );

    for (const action of [() => rejected.toTable(), () => rejected.toJSONString('table')]) {
      try {
        action();
        throw new Error('expected table export to throw');
      } catch (error) {
        expect(error).toMatchObject({ name: 'JsonFrameValidationError' });
        expect(error).not.toBeInstanceOf(RangeError);
        expect((error as JsonFrameValidationError).path?.startsWith('$.schema["custom"]')).toBe(true);
        expect((error as JsonFrameValidationError).value).toMatchObject({ kind: 'array' });
      }
    }
  });

  it('exports identical payloads from packed and unpacked storage', () => {
    const packed = buildDataFrame(
      [
        [1, 1.5],
        [2, 2.5],
        [3, 3.5],
      ],
      { orient: 'values', columns: ['count', 'ratio'], packThreshold: 3 },
    );
    const unpacked = buildDataFrame(
      [
        [1, 1.5],
        [2, 2.5],
        [3, 3.5],
      ],
      { orient: 'values', columns: ['count', 'ratio'], packThreshold: 4 },
    );

    expect(packed.toRecords()).toEqual(unpacked.toRecords());
    expect(packed.toIndex()).toEqual(unpacked.toIndex());
    expect(packed.toColumns()).toEqual(unpacked.toColumns());
    expect(packed.toValues()).toEqual(unpacked.toValues());
    expect(packed.toSplit()).toEqual(unpacked.toSplit());
    expect(packed.toTable()).toEqual(unpacked.toTable());
  });
});
