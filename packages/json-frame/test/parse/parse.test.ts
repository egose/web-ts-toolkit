import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JsonFrameParseError, JsonFrameValidationError } from '@web-ts-toolkit/json-frame';
import { normalizeFromOrientOptions } from '../../src/options';
import { parseInput } from '../../src/parse';
import type { ParsedFrame } from '../../src/parse';
import type { IndexKind, IndexLabel, JsonValue, Orient, ResolvedOrient, TableSchema } from '../../src/types';

const fixtureDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/generated');

type ExpectedFrame = {
  readonly columns: readonly string[];
  readonly index: readonly IndexLabel[];
  readonly indexKind: IndexKind;
  readonly data: Readonly<Record<string, readonly JsonValue[]>>;
  readonly tableSchema?: TableSchema;
  readonly tableIndexField?: string;
};

const parseFixture = async (
  fixtureName: string,
  orient?: Orient,
  extraOptions: Parameters<typeof normalizeFromOrientOptions>[0] = {},
) => {
  const contents = await readFile(path.join(fixtureDirectory, fixtureName), 'utf8');
  return parseInput(
    contents,
    normalizeFromOrientOptions({
      ...extraOptions,
      ...(orient === undefined ? {} : { orient }),
    }),
  );
};

const toSnapshot = (frame: ParsedFrame) => ({
  orient: frame.orient,
  columns: [...frame.columns],
  index: [...frame.index],
  indexKind: frame.indexKind,
  data: Object.fromEntries(frame.columns.map((column) => [column, [...(frame.data.get(column) ?? [])]])),
  ...(frame.tableSchema === undefined ? {} : { tableSchema: frame.tableSchema }),
  ...(frame.tableIndexField === undefined ? {} : { tableIndexField: frame.tableIndexField }),
});

const expectThrown = (action: () => unknown, name: string) => {
  try {
    action();
    throw new Error(`expected ${name}`);
  } catch (error) {
    expect(error).toMatchObject({ name });
    return error;
  }
};

const expectedByFixture: Record<string, ExpectedFrame> = {
  'allSixStringIndex-records.json': {
    columns: ['city', 'temp'],
    index: [0, 1],
    indexKind: 'synthetic',
    data: { city: ['NYC', 'LA'], temp: [70, 80] },
  },
  'allSixStringIndex-index.json': {
    columns: ['city', 'temp'],
    index: ['r0', 'r1'],
    indexKind: 'source',
    data: { city: ['NYC', 'LA'], temp: [70, 80] },
  },
  'allSixStringIndex-columns.json': {
    columns: ['city', 'temp'],
    index: ['r0', 'r1'],
    indexKind: 'source',
    data: { city: ['NYC', 'LA'], temp: [70, 80] },
  },
  'allSixStringIndex-values.json': {
    columns: ['city', 'temp'],
    index: [0, 1],
    indexKind: 'synthetic',
    data: { city: ['NYC', 'LA'], temp: [70, 80] },
  },
  'allSixStringIndex-split.json': {
    columns: ['city', 'temp'],
    index: ['r0', 'r1'],
    indexKind: 'source',
    data: { city: ['NYC', 'LA'], temp: [70, 80] },
  },
  'allSixStringIndex-table.json': {
    columns: ['city', 'temp'],
    index: ['r0', 'r1'],
    indexKind: 'source',
    data: { city: ['NYC', 'LA'], temp: [70, 80] },
    tableSchema: {
      fields: [
        { name: 'row_name', type: 'string', extDtype: 'str' },
        { name: 'city', type: 'string', extDtype: 'str' },
        { name: 'temp', type: 'number' },
      ],
      primaryKey: ['row_name'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'row_name',
  },
  'allSixRangeIndex-records.json': {
    columns: ['a', 'b'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { a: [1, 2, 3], b: [10, 20, 30] },
  },
  'allSixRangeIndex-index.json': {
    columns: ['a', 'b'],
    index: ['0', '1', '2'],
    indexKind: 'source',
    data: { a: [1, 2, 3], b: [10, 20, 30] },
  },
  'allSixRangeIndex-columns.json': {
    columns: ['a', 'b'],
    index: ['0', '1', '2'],
    indexKind: 'source',
    data: { a: [1, 2, 3], b: [10, 20, 30] },
  },
  'allSixRangeIndex-values.json': {
    columns: ['a', 'b'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { a: [1, 2, 3], b: [10, 20, 30] },
  },
  'allSixRangeIndex-split.json': {
    columns: ['a', 'b'],
    index: [0, 1, 2],
    indexKind: 'source',
    data: { a: [1, 2, 3], b: [10, 20, 30] },
  },
  'allSixRangeIndex-table.json': {
    columns: ['a', 'b'],
    index: [0, 1, 2],
    indexKind: 'source',
    data: { a: [1, 2, 3], b: [10, 20, 30] },
    tableSchema: {
      fields: [
        { name: 'index', type: 'integer' },
        { name: 'a', type: 'integer' },
        { name: 'b', type: 'number' },
      ],
      primaryKey: ['index'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'index',
  },
  'indexFalse-records.json': {
    columns: ['a', 'b'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { a: [1, 2, 3], b: [10, 20, 30] },
  },
  'indexFalse-values.json': {
    columns: ['a', 'b'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { a: [1, 2, 3], b: [10, 20, 30] },
  },
  'indexFalse-split.json': {
    columns: ['a', 'b'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { a: [1, 2, 3], b: [10, 20, 30] },
  },
  'indexFalse-table.json': {
    columns: ['a', 'b'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { a: [1, 2, 3], b: [10, 20, 30] },
    tableSchema: {
      fields: [
        { name: 'a', type: 'integer' },
        { name: 'b', type: 'number' },
      ],
      pandas_version: '1.4.0',
    },
  },
  'nullsColumns-records.json': {
    columns: ['i', 'f', 'b'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { i: [1, null, 3], f: [1.5, null, 3.5], b: [true, null, false] },
  },
  'nullsColumns-table.json': {
    columns: ['i', 'f', 'b'],
    index: ['r0', 'r1', 'r2'],
    indexKind: 'source',
    data: { i: [1, null, 3], f: [1.5, null, 3.5], b: [true, null, false] },
    tableSchema: {
      fields: [
        { name: 'ri', type: 'string', extDtype: 'str' },
        { name: 'i', type: 'number' },
        { name: 'f', type: 'number' },
        { name: 'b', type: 'string' },
      ],
      primaryKey: ['ri'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'ri',
  },
  'boolIndex-records.json': {
    columns: ['flag'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { flag: [true, false, true] },
  },
  'boolIndex-table.json': {
    columns: ['flag'],
    index: ['r0', 'r1', 'r2'],
    indexKind: 'source',
    data: { flag: [true, false, true] },
    tableSchema: {
      fields: [
        { name: 'ri', type: 'string', extDtype: 'str' },
        { name: 'flag', type: 'boolean' },
      ],
      primaryKey: ['ri'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'ri',
  },
  'strings-records.json': {
    columns: ['city'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { city: ['NYC', 'LA', 'SF'] },
  },
  'strings-table.json': {
    columns: ['city'],
    index: ['r0', 'r1', 'r2'],
    indexKind: 'source',
    data: { city: ['NYC', 'LA', 'SF'] },
    tableSchema: {
      fields: [
        { name: 'ri', type: 'string', extDtype: 'str' },
        { name: 'city', type: 'string', extDtype: 'str' },
      ],
      primaryKey: ['ri'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'ri',
  },
  'ints-records.json': {
    columns: ['count'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { count: [1, 2, 3] },
  },
  'ints-table.json': {
    columns: ['count'],
    index: ['r0', 'r1', 'r2'],
    indexKind: 'source',
    data: { count: [1, 2, 3] },
    tableSchema: {
      fields: [
        { name: 'ri', type: 'string', extDtype: 'str' },
        { name: 'count', type: 'integer' },
      ],
      primaryKey: ['ri'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'ri',
  },
  'floats-records.json': {
    columns: ['temperature'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { temperature: [1.5, 2.5, 3.5] },
  },
  'floats-table.json': {
    columns: ['temperature'],
    index: ['r0', 'r1', 'r2'],
    indexKind: 'source',
    data: { temperature: [1.5, 2.5, 3.5] },
    tableSchema: {
      fields: [
        { name: 'ri', type: 'string', extDtype: 'str' },
        { name: 'temperature', type: 'number' },
      ],
      primaryKey: ['ri'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'ri',
  },
  'datetimeEpoch-records.json': {
    columns: ['ts'],
    index: [0, 1],
    indexKind: 'synthetic',
    data: { ts: [1704164645000, 1704164646000] },
  },
  'datetimeIso-records.json': {
    columns: ['ts'],
    index: [0, 1],
    indexKind: 'synthetic',
    data: { ts: ['2024-01-02T03:04:05.000', '2024-01-02T03:04:06.000'] },
  },
  'datetimeTable-table.json': {
    columns: ['ts'],
    index: ['r0', 'r1'],
    indexKind: 'source',
    data: { ts: ['2024-01-02T03:04:05.000', '2024-01-02T03:04:06.000'] },
    tableSchema: {
      fields: [
        { name: 'ri', type: 'string', extDtype: 'str' },
        { name: 'ts', type: 'datetime' },
      ],
      primaryKey: ['ri'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'ri',
  },
  'datetimeIsoTable-table.json': {
    columns: ['ts'],
    index: ['r0', 'r1'],
    indexKind: 'source',
    data: { ts: ['2024-01-02T03:04:05.000', '2024-01-02T03:04:06.000'] },
    tableSchema: {
      fields: [
        { name: 'ri', type: 'string', extDtype: 'str' },
        { name: 'ts', type: 'datetime' },
      ],
      primaryKey: ['ri'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'ri',
  },
  'categoricalTable-table.json': {
    columns: ['grade'],
    index: ['x0', 'x1', 'x2'],
    indexKind: 'source',
    data: { grade: ['a', 'b', 'a'] },
    tableSchema: {
      fields: [
        { name: 'i', type: 'string', extDtype: 'str' },
        { name: 'grade', type: 'any', constraints: { enum: ['a', 'b', 'c'] }, ordered: true },
      ],
      primaryKey: ['i'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'i',
  },
  'empty-records.json': {
    columns: [],
    index: [],
    indexKind: 'synthetic',
    data: {},
  },
  'empty-index.json': {
    columns: [],
    index: [],
    indexKind: 'source',
    data: {},
  },
  'empty-columns.json': {
    columns: ['a', 'b'],
    index: [],
    indexKind: 'source',
    data: { a: [], b: [] },
  },
  'empty-values.json': {
    columns: ['a', 'b'],
    index: [],
    indexKind: 'synthetic',
    data: { a: [], b: [] },
  },
  'empty-split.json': {
    columns: ['a', 'b'],
    index: [],
    indexKind: 'source',
    data: { a: [], b: [] },
  },
  'empty-table.json': {
    columns: ['a', 'b'],
    index: [],
    indexKind: 'source',
    data: { a: [], b: [] },
    tableSchema: {
      fields: [
        { name: 'index', type: 'integer' },
        { name: 'a', type: 'string' },
        { name: 'b', type: 'string' },
      ],
      primaryKey: ['index'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'index',
  },
  'prototypeLabels-records.json': {
    columns: ['x'],
    index: [0, 1, 2],
    indexKind: 'synthetic',
    data: { x: [1, 2, 3] },
  },
  'prototypeLabels-index.json': {
    columns: ['x'],
    index: ['__proto__', 'constructor', 'prototype'],
    indexKind: 'source',
    data: { x: [1, 2, 3] },
  },
  'prototypeLabels-columns.json': {
    columns: ['x'],
    index: ['__proto__', 'constructor', 'prototype'],
    indexKind: 'source',
    data: { x: [1, 2, 3] },
  },
  'prototypeLabels-split.json': {
    columns: ['x'],
    index: ['__proto__', 'constructor', 'prototype'],
    indexKind: 'source',
    data: { x: [1, 2, 3] },
  },
};

const explicitOrientForFixture = (fixtureName: string): ResolvedOrient => {
  if (fixtureName.endsWith('-records.json')) {
    return 'records';
  }

  if (fixtureName.endsWith('-index.json')) {
    return 'index';
  }

  if (fixtureName.endsWith('-columns.json')) {
    return 'columns';
  }

  if (fixtureName.endsWith('-values.json')) {
    return 'values';
  }

  if (fixtureName.endsWith('-split.json')) {
    return 'split';
  }

  return 'table';
};

const optionsForFixture = (fixtureName: string) => {
  if (fixtureName === 'allSixStringIndex-values.json') {
    return { columns: ['city', 'temp'] };
  }

  if (
    fixtureName === 'allSixRangeIndex-values.json' ||
    fixtureName === 'indexFalse-values.json' ||
    fixtureName === 'empty-values.json'
  ) {
    return { columns: ['a', 'b'] };
  }

  return {};
};

describe('parseInput happy-path fixtures', () => {
  for (const [fixtureName, expected] of Object.entries(expectedByFixture)) {
    it(`parses ${fixtureName}`, async () => {
      const frame = await parseFixture(
        fixtureName,
        explicitOrientForFixture(fixtureName),
        optionsForFixture(fixtureName),
      );

      expect(toSnapshot(frame)).toEqual({
        orient: explicitOrientForFixture(fixtureName),
        columns: [...expected.columns],
        index: [...expected.index],
        indexKind: expected.indexKind,
        data: expected.data,
        ...(expected.tableSchema === undefined ? {} : { tableSchema: expected.tableSchema }),
        ...(expected.tableIndexField === undefined ? {} : { tableIndexField: expected.tableIndexField }),
      });
    });
  }
});

describe('parseInput auto detection', () => {
  it('auto-detects table, split, non-empty values, and non-empty records', async () => {
    const [tableFrame, splitFrame, valuesFrame, recordsFrame] = await Promise.all([
      parseFixture('allSixStringIndex-table.json'),
      parseFixture('allSixStringIndex-split.json'),
      parseFixture('allSixStringIndex-values.json', undefined, { columns: ['city', 'temp'] }),
      parseFixture('allSixStringIndex-records.json'),
    ]);

    expect(tableFrame.orient).toBe('table');
    expect(splitFrame.orient).toBe('split');
    expect(valuesFrame.orient).toBe('values');
    expect(recordsFrame.orient).toBe('records');
  });

  it('requires an explicit orient for nested-object and empty-object payloads', async () => {
    await expect(parseFixture('allSixStringIndex-index.json')).rejects.toMatchObject({
      name: 'AmbiguousOrientError',
      candidates: ['index', 'columns'],
    });

    await expect(parseFixture('empty-index.json')).rejects.toMatchObject({
      name: 'AmbiguousOrientError',
      candidates: ['index', 'columns'],
    });
  });

  it('requires an explicit orient for empty arrays', async () => {
    await expect(parseFixture('empty-records.json')).rejects.toMatchObject({
      name: 'AmbiguousOrientError',
      candidates: ['records', 'values'],
    });
  });
});

describe('parseInput validation failures', () => {
  it('rejects values input without explicit columns, including empty arrays', async () => {
    await expect(parseFixture('allSixStringIndex-values.json', 'values')).rejects.toMatchObject({
      name: 'JsonFrameOptionError',
    });
    await expect(parseFixture('empty-values.json', 'values')).rejects.toMatchObject({ name: 'JsonFrameOptionError' });
  });

  it('rejects malformed row widths', () => {
    expectThrown(
      () => parseInput([[1], [2, 3]], normalizeFromOrientOptions({ orient: 'values', columns: ['a', 'b'] })),
      'JsonFrameValidationError',
    );

    expectThrown(
      () =>
        parseInput({ columns: ['a', 'b'], index: [0], data: [[1]] }, normalizeFromOrientOptions({ orient: 'split' })),
      'JsonFrameValidationError',
    );
  });

  it('rejects unequal columns payload index-key sets', () => {
    expectThrown(
      () => parseInput({ a: { r0: 1, r1: 2 }, b: { r0: 3 } }, normalizeFromOrientOptions({ orient: 'columns' })),
      'JsonFrameValidationError',
    );

    expectThrown(
      () => parseInput({ a: { r0: 1, r1: 2 }, b: { r1: 3, r0: 4 } }, normalizeFromOrientOptions({ orient: 'columns' })),
      'JsonFrameValidationError',
    );
  });

  it('rejects unsupported MultiIndex and non-string or duplicate columns', async () => {
    await expect(parseFixture('unsupported/multiIndexTable-table.json', 'table')).rejects.toMatchObject({
      name: 'UnsupportedFeatureError',
    });

    await expect(parseFixture('unsupported/nonStringColumnsSplit-split.json', 'split')).rejects.toMatchObject({
      name: 'JsonFrameValidationError',
    });

    expectThrown(
      () =>
        parseInput(
          { columns: ['a', 'a'], index: [0], data: [[1, 2]] },
          normalizeFromOrientOptions({ orient: 'split' }),
        ),
      'JsonFrameValidationError',
    );
  });

  it('rejects non-JSON values with actionable paths instead of generic TypeError failures', () => {
    const cyclicObject: Record<string, unknown> = { ok: true };
    cyclicObject.self = cyclicObject;

    const sparse = [1, 2];
    delete sparse[1];

    const invalidInputs: Array<{ readonly input: unknown; readonly path: string }> = [
      { input: [{ city: undefined }], path: '$[0].city' },
      { input: [{ city: Number.NaN }], path: '$[0].city' },
      { input: [{ city: Number.POSITIVE_INFINITY }], path: '$[0].city' },
      { input: [{ city: Symbol('x') }], path: '$[0].city' },
      { input: [{ city: 1n }], path: '$[0].city' },
      { input: [{ city: () => 'x' }], path: '$[0].city' },
      { input: [{ city: new Date('2024-01-02T03:04:05Z') }], path: '$[0].city' },
      { input: [sparse], path: '$[0][1]' },
      { input: cyclicObject, path: '$.self' },
    ];

    for (const { input, path: errorPath } of invalidInputs) {
      try {
        parseInput(input, normalizeFromOrientOptions({ orient: 'records' }));
        throw new Error('expected parseInput to throw');
      } catch (error) {
        expect(error).toMatchObject({ name: 'JsonFrameValidationError' });
        expect(error).not.toBeInstanceOf(TypeError);
        expect((error as JsonFrameValidationError).path).toBe(errorPath);
      }
    }
  });

  it('rejects non-object records rows and unsupported split index labels', () => {
    expectThrown(() => parseInput([1], normalizeFromOrientOptions({ orient: 'records' })), 'JsonFrameValidationError');

    expectThrown(
      () => parseInput({ columns: ['a'], index: [true], data: [[1]] }, normalizeFromOrientOptions({ orient: 'split' })),
      'JsonFrameValidationError',
    );
  });

  it('preserves SyntaxError causes when parsing invalid JSON strings', () => {
    try {
      parseInput('{"a":}', normalizeFromOrientOptions({ orient: 'records' }));
      throw new Error('expected parseInput to throw');
    } catch (error) {
      expect(error).toMatchObject({ name: 'JsonFrameParseError' });
      expect((error as JsonFrameParseError).cause).toBeInstanceOf(SyntaxError);
    }
  });

  it('fills missing keys in records and index payloads with null', () => {
    const recordsFrame = parseInput([{ city: 'NYC' }, { temp: 80 }], normalizeFromOrientOptions({ orient: 'records' }));
    const indexFrame = parseInput(
      { r0: { city: 'NYC' }, r1: { temp: 80 } },
      normalizeFromOrientOptions({ orient: 'index' }),
    );

    expect(toSnapshot(recordsFrame).data).toEqual({ city: ['NYC', null], temp: [null, 80] });
    expect(toSnapshot(indexFrame).data).toEqual({ city: ['NYC', null], temp: [null, 80] });
  });
});
