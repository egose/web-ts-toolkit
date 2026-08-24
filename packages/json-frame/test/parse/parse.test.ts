import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JSON_FRAME_MAX_DEPTH, JsonFrameParseError, JsonFrameValidationError } from '@web-ts-toolkit/json-frame';
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
  const contents = await readFixture(fixtureName);
  return parseInput(
    contents,
    normalizeFromOrientOptions({
      ...extraOptions,
      ...(orient === undefined ? {} : { orient }),
    }),
  );
};

const readFixture = (fixtureName: string) => readFile(path.join(fixtureDirectory, fixtureName), 'utf8');

const nestedArrays = (depth: number, leaf: JsonValue = 'leaf'): JsonValue => {
  let value = leaf;
  for (let index = 0; index < depth; index += 1) {
    value = [value];
  }

  return value;
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
  'nonAscendingIntegerIndex-index.json': {
    columns: ['v', 'n'],
    index: ['2', '10'],
    indexKind: 'source',
    data: { v: ['second', 'first'], n: [200, 100] },
  },
  'nonAscendingIntegerIndex-columns.json': {
    columns: ['v', 'n'],
    index: ['2', '10'],
    indexKind: 'source',
    data: { v: ['second', 'first'], n: [200, 100] },
  },
  'nonAscendingIntegerIndex-split.json': {
    columns: ['v', 'n'],
    index: [10, 2],
    indexKind: 'source',
    data: { v: ['first', 'second'], n: [100, 200] },
  },
  'nonAscendingIntegerIndex-table.json': {
    columns: ['v', 'n'],
    index: [10, 2],
    indexKind: 'source',
    data: { v: ['first', 'second'], n: [100, 200] },
    tableSchema: {
      fields: [
        { name: 'i', type: 'integer' },
        { name: 'v', type: 'string', extDtype: 'str' },
        { name: 'n', type: 'integer' },
      ],
      primaryKey: ['i'],
      pandas_version: '1.4.0',
    },
    tableIndexField: 'i',
  },
  'serializationSensitive-records.json': {
    columns: ['text', 'small', 'large', 'precision'],
    index: [0, 1],
    indexKind: 'synthetic',
    data: {
      text: ['café', 'quote " slash \\ newline\n tab\t nul\u0000'],
      small: [1.23e-12, 0],
      large: [1.23e20, 9007199254740991],
      precision: [1.123456789012345, 1.123456789012346],
    },
  },
  'serializationSensitive-index.json': {
    columns: ['value'],
    index: ['-0.0', '1.0'],
    indexKind: 'source',
    data: { value: ['negative zero index', 'positive index'] },
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

describe('parseInput integer-like object-key ordering', () => {
  it('uses JavaScript property enumeration for index orient raw strings and parsed objects', async () => {
    const contents = await readFixture('nonAscendingIntegerIndex-index.json');
    expect(contents.trim()).toBe('{"10":{"v":"first","n":100},"2":{"v":"second","n":200}}');

    const options = normalizeFromOrientOptions({ orient: 'index' });
    const expected = expectedByFixture['nonAscendingIntegerIndex-index.json'];

    expect(toSnapshot(parseInput(contents, options))).toEqual({
      orient: 'index',
      columns: [...expected.columns],
      index: [...expected.index],
      indexKind: expected.indexKind,
      data: expected.data,
    });
    expect(toSnapshot(parseInput(JSON.parse(contents) as JsonValue, options))).toEqual({
      orient: 'index',
      columns: [...expected.columns],
      index: [...expected.index],
      indexKind: expected.indexKind,
      data: expected.data,
    });
  });

  it('uses JavaScript property enumeration for columns orient raw strings and parsed objects', async () => {
    const contents = await readFixture('nonAscendingIntegerIndex-columns.json');
    expect(contents.trim()).toBe('{"v":{"10":"first","2":"second"},"n":{"10":100,"2":200}}');

    const options = normalizeFromOrientOptions({ orient: 'columns' });
    const expected = expectedByFixture['nonAscendingIntegerIndex-columns.json'];

    expect(toSnapshot(parseInput(contents, options))).toEqual({
      orient: 'columns',
      columns: [...expected.columns],
      index: [...expected.index],
      indexKind: expected.indexKind,
      data: expected.data,
    });
    expect(toSnapshot(parseInput(JSON.parse(contents) as JsonValue, options))).toEqual({
      orient: 'columns',
      columns: [...expected.columns],
      index: [...expected.index],
      indexKind: expected.indexKind,
      data: expected.data,
    });
  });

  it('preserves non-ascending integer index order for split and table controls', async () => {
    for (const [fixtureName, orient] of [
      ['nonAscendingIntegerIndex-split.json', 'split'],
      ['nonAscendingIntegerIndex-table.json', 'table'],
    ] as const) {
      const contents = await readFixture(fixtureName);
      const options = normalizeFromOrientOptions({ orient });
      const expected = expectedByFixture[fixtureName];

      for (const input of [contents, JSON.parse(contents) as JsonValue]) {
        expect(toSnapshot(parseInput(input, options))).toEqual({
          orient,
          columns: [...expected.columns],
          index: [...expected.index],
          indexKind: expected.indexKind,
          data: expected.data,
          ...(expected.tableSchema === undefined ? {} : { tableSchema: expected.tableSchema }),
          ...(expected.tableIndexField === undefined ? {} : { tableIndexField: expected.tableIndexField }),
        });
      }
    }
  });
});

describe('parseInput validation failures', () => {
  it('parses deep programmatic and JSON-string cells at the documented depth boundary', () => {
    const acceptedCell = nestedArrays(JSON_FRAME_MAX_DEPTH - 1);

    const programmatic = parseInput([{ deep: acceptedCell }], normalizeFromOrientOptions({ orient: 'records' }));
    const fromString = parseInput(
      JSON.stringify([{ deep: acceptedCell }]),
      normalizeFromOrientOptions({ orient: 'records' }),
    );

    expect(programmatic.columns).toEqual(['deep']);
    expect(fromString.columns).toEqual(['deep']);
  });

  it('rejects over-depth programmatic and JSON-string cells with path-bearing validation errors', () => {
    const rejectedCell = nestedArrays(JSON_FRAME_MAX_DEPTH);

    for (const input of [[{ deep: rejectedCell }], JSON.stringify([{ deep: rejectedCell }])] as const) {
      try {
        parseInput(input, normalizeFromOrientOptions({ orient: 'records' }));
        throw new Error('expected parseInput to throw');
      } catch (error) {
        expect(error).toMatchObject({ name: 'JsonFrameValidationError' });
        expect(error).not.toBeInstanceOf(RangeError);
        expect((error as JsonFrameValidationError).path?.startsWith('$[0].deep')).toBe(true);
        expect((error as JsonFrameValidationError).message).toContain(String(JSON_FRAME_MAX_DEPTH));
      }
    }
  });

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

  it('rejects duplicate table primary-key values with a bounded later-row diagnostic', () => {
    const input = {
      schema: {
        fields: [
          { name: 'row_id', type: 'string' },
          { name: 'city', type: 'string' },
        ],
        primaryKey: ['row_id'],
      },
      data: [
        { row_id: 'same', city: 'NYC' },
        { row_id: 'same', city: 'LA' },
      ],
    };

    try {
      parseInput(input, normalizeFromOrientOptions({ orient: 'table' }));
      throw new Error('expected duplicate primary key to throw');
    } catch (error) {
      const validationError = error as JsonFrameValidationError;
      expect(validationError).toMatchObject({
        name: 'JsonFrameValidationError',
        orient: 'table',
        path: '$.data[1].row_id',
        row: 1,
        column: 'row_id',
        value: 'same',
      });
      expect(validationError.value).not.toBe(input);
      expect(validationError.value).not.toBe(input.data);
    }
  });

  it('treats numeric and string table primary-key labels as distinct values', () => {
    const frame = parseInput(
      {
        schema: {
          fields: [
            { name: 'row_id', type: 'any' },
            { name: 'city', type: 'string' },
          ],
          primaryKey: ['row_id'],
        },
        data: [
          { row_id: 1, city: 'NYC' },
          { row_id: '1', city: 'LA' },
        ],
      },
      normalizeFromOrientOptions({ orient: 'table' }),
    );

    expect(toSnapshot(frame)).toMatchObject({
      columns: ['city'],
      index: [1, '1'],
      indexKind: 'source',
      data: { city: ['NYC', 'LA'] },
      tableIndexField: 'row_id',
    });
  });

  it('rejects non-JSON values with actionable paths instead of generic TypeError failures', () => {
    const cyclicObject: Record<string, unknown> = { ok: true };
    cyclicObject.self = cyclicObject;

    const sparse = [1, 2];
    delete sparse[1];

    const invalidInputs: Array<{ readonly input: unknown; readonly path: string; readonly valueKind?: string }> = [
      { input: [{ city: undefined }], path: '$[0].city' },
      { input: [{ city: Number.NaN }], path: '$[0].city' },
      { input: [{ city: Number.POSITIVE_INFINITY }], path: '$[0].city' },
      { input: [{ city: Symbol('x') }], path: '$[0].city', valueKind: 'symbol' },
      { input: [{ city: 1n }], path: '$[0].city', valueKind: 'bigint' },
      { input: [{ city: () => 'x' }], path: '$[0].city', valueKind: 'function' },
      { input: [{ city: new Date('2024-01-02T03:04:05Z') }], path: '$[0].city', valueKind: 'object' },
      { input: [sparse], path: '$[0][1]', valueKind: 'array' },
      { input: cyclicObject, path: '$.self', valueKind: 'object' },
    ];

    for (const { input, path: errorPath, valueKind } of invalidInputs) {
      try {
        parseInput(input, normalizeFromOrientOptions({ orient: 'records' }));
        throw new Error('expected parseInput to throw');
      } catch (error) {
        expect(error).toMatchObject({ name: 'JsonFrameValidationError' });
        expect(error).not.toBeInstanceOf(TypeError);
        expect((error as JsonFrameValidationError).path).toBe(errorPath);
        if (valueKind !== undefined) {
          expect((error as JsonFrameValidationError).value).toMatchObject({ kind: valueKind });
          expect(Object.isFrozen((error as JsonFrameValidationError).value)).toBe(true);
        }
      }
    }
  });

  it('summarizes malformed-row and auto-detection diagnostic containers without retaining inputs', () => {
    const malformedRow = { bad: true };
    const invalidAutoPayload = [1];

    for (const [input, options, expectedPath, expectedKind] of [
      [[[0], malformedRow], normalizeFromOrientOptions({ orient: 'values', columns: ['a'] }), '$[1]', 'object'],
      [invalidAutoPayload, normalizeFromOrientOptions(), '$', 'array'],
    ] as const) {
      try {
        parseInput(input, options);
        throw new Error('expected parseInput to throw');
      } catch (error) {
        const validationError = error as JsonFrameValidationError;
        expect(validationError).toMatchObject({ name: 'JsonFrameValidationError' });
        expect(validationError.path).toBe(expectedPath);
        expect(validationError.value).toMatchObject({ kind: expectedKind });
        expect(validationError.value).not.toBe(input);
        expect(validationError.value).not.toBe(malformedRow);
        expect(Object.isFrozen(validationError.value)).toBe(true);
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
