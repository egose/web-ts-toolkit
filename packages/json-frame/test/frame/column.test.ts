import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fromOrient } from '../../src';
import { JsonFrameOptionError, JsonFrameValidationError } from '../../src/errors';
import {
  createFrameState,
  createFrameStateFromData,
  materializeColumn,
  materializeFrameData,
} from '../../src/frame/column';
import { createDataFrame as createInternalDataFrame, getDataFrameState } from '../../src/frame/DataFrame';
import { DEFAULT_PACK_THRESHOLD, normalizeFromOrientOptions } from '../../src/options';
import { parseInput } from '../../src/parse';
import type { ParsedFrame } from '../../src/parse';
import type { ColumnType, FromOrientOptions, JsonValue, ResolvedOrient } from '../../src/types';

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

const fixtureDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/generated');

const parseFixture = async (
  fixtureName: string,
  orient: ResolvedOrient,
  extraOptions: Parameters<typeof normalizeFromOrientOptions>[0] = {},
): Promise<ParsedFrame> => {
  const contents = await readFile(path.join(fixtureDirectory, fixtureName), 'utf8');
  return parseInput(
    contents,
    normalizeFromOrientOptions({
      orient,
      ...extraOptions,
    }),
  );
};

const materializeSnapshot = (frame: ReturnType<typeof createFrameState>) =>
  Object.fromEntries(
    frame.columns.map((column) => [column, [...(materializeFrameData(frame.columns, frame.data).get(column) ?? [])]]),
  );

const parsedSingleColumn = (values: readonly unknown[]): ParsedFrame => ({
  orient: 'values',
  columns: ['value'],
  index: values.map((_, index) => index),
  indexKind: 'synthetic',
  data: new Map([['value', values as readonly JsonValue[]]]),
});

describe('createFrameState', () => {
  it('keeps nullable numeric logical types while leaving nullable columns unpacked', async () => {
    const frame = await parseFixture('nullsColumns-records.json', 'records');
    const state = createFrameState(frame, normalizeFromOrientOptions({ packThreshold: 1 }));

    expect(state.columnInfo.get('i')).toEqual({ type: 'integer', nullable: true });
    expect(state.columnInfo.get('f')).toEqual({ type: 'float', nullable: true });
    expect(state.columnInfo.get('b')).toEqual({ type: 'boolean', nullable: true });
    expect(Array.isArray(state.data.get('i'))).toBe(true);
    expect(Array.isArray(state.data.get('f'))).toBe(true);
    expect(materializeSnapshot(state)).toEqual({
      i: [1, null, 3],
      f: [1.5, null, 3.5],
      b: [true, null, false],
    });
  });

  it('maps supported table schema metadata to logical types', async () => {
    const tableFrame = await parseFixture('nullsColumns-table.json', 'table');
    const categoricalFrame = await parseFixture('categoricalTable-table.json', 'table');

    const tableState = createFrameState(tableFrame, normalizeFromOrientOptions());
    const categoricalState = createFrameState(categoricalFrame, normalizeFromOrientOptions());

    expect(tableState.columnInfo.get('i')).toEqual({ type: 'float', nullable: true });
    expect(tableState.columnInfo.get('f')).toEqual({ type: 'float', nullable: true });
    expect(tableState.columnInfo.get('b')).toEqual({ type: 'string', nullable: true });
    expect(categoricalState.columnInfo.get('grade')).toEqual({ type: 'categorical', nullable: false });
  });

  it('applies explicit columnTypes to non-schema inputs and rejects unknown names', async () => {
    const frame = await parseFixture('datetimeIso-records.json', 'records');
    const state = createFrameState(frame, normalizeFromOrientOptions({ columnTypes: { ts: 'datetime' } }));

    expect(state.columnInfo.get('ts')).toEqual({ type: 'datetime', nullable: false });

    expect(() =>
      createFrameState(frame, normalizeFromOrientOptions({ columnTypes: { missing: 'string' } })),
    ).toThrowError(JsonFrameOptionError);
  });

  it.each([
    ['integer', [1, 2], [1, null], 1.5],
    ['float', [1, 1.5], [1.5, null], '1.5'],
    ['string', ['a', 'b'], ['a', null], 1],
    ['boolean', [true, false], [true, null], 'true'],
    ['datetime', ['2024-01-02T03:04:05.000', '2024-01-03'], ['2024-01-02 03:04:05', null], 1704164645000],
    ['categorical', ['a', 1, true], ['a', null], { nested: true }],
    ['mixed', ['a', 1, { nested: true }], ['a', null], undefined],
    ['unknown', ['a', 1, { nested: true }], [null], undefined],
  ] as const)('validates explicit %s logical types against cells', (type, compatible, nullable, incompatible) => {
    const compatibleState = createFrameState(
      parsedSingleColumn(compatible),
      normalizeFromOrientOptions({ orient: 'values', columns: ['value'], columnTypes: { value: type } }),
    );
    const nullableState = createFrameState(
      parsedSingleColumn(nullable),
      normalizeFromOrientOptions({ orient: 'values', columns: ['value'], columnTypes: { value: type } }),
    );

    expect(compatibleState.columnInfo.get('value')).toEqual({ type, nullable: false });
    expect(nullableState.columnInfo.get('value')).toEqual({ type, nullable: true });
    expect(materializeColumn(compatibleState.data.get('value')!)).toEqual(compatible);
    expect(materializeColumn(nullableState.data.get('value')!)).toEqual(nullable);

    try {
      createFrameState(
        parsedSingleColumn([incompatible]),
        normalizeFromOrientOptions({ orient: 'values', columns: ['value'], columnTypes: { value: type } }),
      );
      throw new Error(`expected ${type} incompatibility to throw`);
    } catch (error) {
      expect(error).toBeInstanceOf(JsonFrameValidationError);
      expect(error).toMatchObject({
        name: 'JsonFrameValidationError',
        orient: 'values',
        path: '$[0][0]',
        row: 0,
        column: 'value',
      });
    }
  });

  it('rejects incompatible explicit columnTypes before packing can coerce storage', () => {
    expect(() =>
      createFrameState(
        parsedSingleColumn([1.1, 2.2]),
        normalizeFromOrientOptions({
          orient: 'values',
          columns: ['value'],
          columnTypes: { value: 'integer' },
          packThreshold: 1,
        }),
      ),
    ).toThrowError(JsonFrameValidationError);
  });

  it('packs eligible integer and float columns without changing materialized values', () => {
    const parsed = parseInput(
      [
        [INT32_MIN, -1.5],
        [0, 0.25],
        [INT32_MAX, 2],
      ],
      normalizeFromOrientOptions({ orient: 'values', columns: ['ints', 'floats'] }),
    );

    const packed = createFrameState(
      parsed,
      normalizeFromOrientOptions({ packThreshold: 3, columns: ['ints', 'floats'] }),
    );
    const unpacked = createFrameState(
      parsed,
      normalizeFromOrientOptions({ packThreshold: 4, columns: ['ints', 'floats'] }),
    );

    expect(packed.data.get('ints')).toBeInstanceOf(Int32Array);
    expect(packed.data.get('floats')).toBeInstanceOf(Float64Array);
    expect(unpacked.data.get('ints')).not.toBeInstanceOf(Int32Array);
    expect(unpacked.data.get('floats')).not.toBeInstanceOf(Float64Array);
    expect(materializeSnapshot(packed)).toEqual(materializeSnapshot(unpacked));
  });

  it('disables packing at threshold 0 and leaves out-of-range integers unpacked', () => {
    const parsed = parseInput(
      [[INT32_MAX + 1], [INT32_MIN], [-1]],
      normalizeFromOrientOptions({ orient: 'values', columns: ['count'] }),
    );

    const disabled = createFrameState(parsed, normalizeFromOrientOptions({ packThreshold: 0, columns: ['count'] }));
    const outOfRange = createFrameState(parsed, normalizeFromOrientOptions({ packThreshold: 1, columns: ['count'] }));

    expect(disabled.columnInfo.get('count')).toEqual({ type: 'integer', nullable: false });
    expect(Array.isArray(disabled.data.get('count'))).toBe(true);
    expect(Array.isArray(outOfRange.data.get('count'))).toBe(true);
    expect(outOfRange.data.get('count')).not.toBeInstanceOf(Int32Array);
    expect(materializeColumn(outOfRange.data.get('count')!)).toEqual([INT32_MAX + 1, INT32_MIN, -1]);
  });

  it('never mutates parsed input arrays while cloning unpacked storage', async () => {
    const frame = await parseFixture('strings-records.json', 'records');
    const parsedColumn = frame.data.get('city');
    const state = createFrameState(frame, normalizeFromOrientOptions({ packThreshold: 99 }));
    const storedColumn = state.data.get('city');

    expect(parsedColumn).toEqual(['NYC', 'LA', 'SF']);
    expect(storedColumn).toEqual(['NYC', 'LA', 'SF']);
    expect(storedColumn).not.toBe(parsedColumn);
    expect(materializeColumn(storedColumn!)).toEqual(['NYC', 'LA', 'SF']);
  });
});

describe('own-key logical overrides (JFP-01)', () => {
  const labels = ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf'];
  const cases = labels.flatMap((column) =>
    [false, true].flatMap((nullPrototype) =>
      ['omitted', 'empty', 'unrelated', 'explicit'].map((override) => ({ column, nullPrototype, override })),
    ),
  );

  it.each(cases)(
    'preserves $column with $override overrides (null prototype: $nullPrototype)',
    ({ column, nullPrototype, override }) => {
      const input = [
        { [column]: 3, n: 2 },
        { [column]: 1, n: 1 },
      ];
      const original = JSON.stringify(input);
      const prototypeSnapshot = Object.getOwnPropertyDescriptors(Object.prototype);
      const columnTypes: Partial<Record<string, ColumnType>> = nullPrototype ? Object.create(null) : {};
      if (override === 'unrelated') columnTypes.n = 'integer';
      if (override === 'explicit') Object.defineProperty(columnTypes, column, { value: 'float', enumerable: true });
      const descriptors = Object.getOwnPropertyDescriptors(columnTypes);
      const expectedType = override === 'explicit' ? 'float' : 'integer';
      const schemaType = override === 'explicit' ? 'number' : 'integer';

      for (const packThreshold of [0, 1]) {
        const options: FromOrientOptions = Object.assign(nullPrototype ? Object.create(null) : {}, {
          packThreshold,
          ...(override === 'omitted' ? {} : { columnTypes }),
        });
        const frame = fromOrient(input, options);
        expect(frame.columnInfo.get(column)).toEqual({ type: expectedType, nullable: false });
        expect(frame.rows()).toEqual(input);
        const stored = getDataFrameState(frame).data.get(column);
        if (packThreshold === 0) expect(Array.isArray(stored)).toBe(true);
        else expect(stored).toBeInstanceOf(override === 'explicit' ? Float64Array : Int32Array);
        const transformed = frame
          .sort((a, b) => Number(a.n) - Number(b.n))
          .filter(() => true)
          .select(column, 'n')
          .rename({ [column]: 'renamed' })
          .rename({ renamed: column })
          .resetIndex();
        expect(transformed.rows()).toEqual([...input].reverse());
        for (const result of [frame, transformed, transformed.filter(() => false)]) {
          expect(result.columnInfo.get(column)).toEqual({ type: expectedType, nullable: false });
          const table = result.toTable();
          expect(table.schema.fields).toContainEqual({ name: column, type: schemaType });
          expect(JSON.parse(result.toJSONString('table'))).toEqual(table);
          expect(JSON.parse(result.toJSONString('records'))).toEqual(result.rows());
          const restored = fromOrient(table, { orient: 'table', packThreshold });
          expect(restored.rows()).toEqual(result.rows());
          expect(restored.columnInfo.get(column)).toEqual(result.columnInfo.get(column));
        }
        expect(frame.rows()).toEqual(input);
        expect(Object.getPrototypeOf(options)).toBe(nullPrototype ? null : Object.prototype);
      }
      expect(JSON.stringify(input)).toBe(original);
      expect(Object.getOwnPropertyDescriptors(columnTypes)).toEqual(descriptors);
      expect(Object.getPrototypeOf(columnTypes)).toBe(nullPrototype ? null : Object.prototype);
      expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(prototypeSnapshot);
    },
  );

  it.each(labels)('validates own %s overrides and retains table precedence', (column) => {
    for (const packThreshold of [0, 1]) {
      const columnTypes = { [column]: 'string' } as const;
      try {
        fromOrient([{ [column]: null }, { [column]: 1 }], { orient: 'records', columnTypes, packThreshold });
        throw new Error('expected own override rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonFrameValidationError);
        expect(error).toMatchObject({
          orient: 'records',
          path: `$[1][${JSON.stringify(column)}]`,
          row: 1,
          column,
          value: 1,
        });
      }
      const input = {
        schema: { fields: [{ name: column, type: 'number', description: 'source metadata' }] },
        data: [{ [column]: 1 }],
      };
      const original = JSON.stringify(input);
      const frame = fromOrient(input, { orient: 'table', columnTypes, packThreshold });
      expect(frame.columnInfo.get(column)).toEqual({ type: 'float', nullable: false });
      expect(frame.rows()).toEqual(input.data);
      for (const result of [
        frame,
        frame
          .select(column)
          .sort(() => 0)
          .resetIndex()
          .filter(() => false),
      ]) {
        expect(result.columnInfo.get(column)).toEqual({ type: 'float', nullable: false });
        expect(result.toTable().schema.fields).toContainEqual(input.schema.fields[0]);
        expect(JSON.parse(result.toJSONString('table'))).toEqual(result.toTable());
      }
      expect(JSON.stringify(input)).toBe(original);
    }
  });

  it.each([
    ['parsed', createFrameState],
    ['data', createFrameStateFromData],
  ] as const)('ignores inherited overrides at the internal %s entry boundary', (_name, createState) => {
    const columns = [...labels, 'n'];
    const parsed: ParsedFrame = {
      orient: 'records',
      columns,
      index: [0],
      indexKind: 'synthetic',
      data: new Map(columns.map((column) => [column, [1]])),
    };
    const inherited = Object.fromEntries(columns.map((column) => [column, 'string']));
    Object.defineProperty(inherited, 'valueOf', {
      get() {
        throw new Error('inherited override read');
      },
    });
    for (const columnTypes of [{}, Object.create(inherited)] as Partial<Record<string, ColumnType>>[]) {
      for (const packThreshold of [0, 1]) {
        const state = createState(parsed, { orient: 'records', columnTypes, packThreshold });
        for (const column of columns) {
          expect(state.columnInfo.get(column)).toEqual({ type: 'integer', nullable: false });
          expect(materializeColumn(state.data.get(column)!)).toEqual([1]);
          expect(state.data.get(column) instanceof Int32Array).toBe(packThreshold === 1);
        }
      }
    }
    const own = Object.create(inherited) as Partial<Record<string, ColumnType>>;
    own.constructor = 'float';
    const state = createState(parsed, { orient: 'records', columnTypes: own, packThreshold: 1 });
    expect(state.columnInfo.get('constructor')).toEqual({ type: 'float', nullable: false });
    expect(state.data.get('constructor')).toBeInstanceOf(Float64Array);
    own.constructor = 'string';
    expect(() => createState(parsed, { orient: 'records', columnTypes: own, packThreshold: 1 })).toThrowError(
      JsonFrameValidationError,
    );
  });
});

describe('four-digit datetime calendar contract (JFC-04)', () => {
  it.each([
    '0000-01-01',
    '0000-02-29',
    '0001-01-01',
    '0004-02-29',
    '0099-12-31',
    '0100-02-28',
    '0400-02-29',
    '1582-10-10', // Proleptic Gregorian: no historical calendar cutover gap.
    '1900-02-28',
    '2000-02-29',
    '2024-04-30',
    '9996-02-29',
    '9999-12-31',
    '0000-02-29T00:00:00',
    '0001-01-01 23:59:59',
    '0099-12-31T23:59:59.1',
    '2000-02-29 12:34:56.123456',
    '9999-12-31T23:59:59.999999999',
  ])('accepts calendar-valid %s without coercion', (ts) => {
    const frame = fromOrient([{ ts }], { columnTypes: { ts: 'datetime' } });
    expect(frame.row(0).ts).toBe(ts);
    expect(frame.columnInfo.get('ts')).toEqual({ type: 'datetime', nullable: false });
    expect(frame.toTable().data[0]!.ts).toBe(ts);
    expect(fromOrient([{ ts }]).columnInfo.get('ts')).toEqual({ type: 'string', nullable: false });
  });

  it.each([
    '0000-02-30',
    '0001-02-29',
    '0099-02-29',
    '0100-02-29',
    '1900-02-29',
    '2000-02-30',
    '2100-02-29',
    '2024-00-01',
    '2024-13-01',
    '2024-01-00',
    '2024-01-32',
    '2024-04-31',
    '2024-06-31',
    '2024-09-31',
    '2024-11-31',
    '2024-01-01T24:00:00',
    '2024-01-01T23:60:00',
    '2024-01-01T23:59:60',
    '2024-01-01T00:00:00Z',
    '2024-01-01T00:00:00+00:00',
    '2024-01-01T00:00:00-05:00',
    '2024-01-01T00:00:00.',
    '2024-01-01T00:00:00.1234567890',
    '2024-01-01.1',
    '2024-01-01T00:00',
    '2024-01-01t00:00:00',
    '2024-1-01',
    '2024-01-1',
    '2024-01-01T0:00:00',
    '999-01-01',
    '10000-01-01',
    '-0001-01-01',
    '+0001-01-01',
    ' 2024-01-01',
    '2024-01-01 ',
    '',
    0,
    1704164645000,
  ])('rejects invalid datetime %s with cell diagnostics', (ts) => {
    try {
      fromOrient([{ ts: null }, { ts }], { orient: 'records', columnTypes: { ts: 'datetime' } });
      throw new Error('expected datetime rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(JsonFrameValidationError);
      expect(error).toMatchObject({ orient: 'records', path: '$[1]["ts"]', row: 1, column: 'ts', value: ts });
    }
  });

  it.each([
    ['records', [{ ts: '0000-02-29' }, { ts: '0100-02-29' }], '$[1]["ts"]'],
    ['values', [['0000-02-29'], ['0100-02-29']], '$[1][0]'],
    ['split', { columns: ['ts'], index: ['a', 'b'], data: [['0000-02-29'], ['0100-02-29']] }, '$.data[1][0]'],
    ['index', { a: { ts: '0000-02-29' }, b: { ts: '0100-02-29' } }, '$["b"]["ts"]'],
    ['columns', { ts: { a: '0000-02-29', b: '0100-02-29' } }, '$["ts"]["b"]'],
  ] as const)('validates parsed and raw %s dates with orient-specific paths', (orient, input, cellPath) => {
    for (const payload of [input, JSON.stringify(input)]) {
      try {
        fromOrient(payload, { orient, columns: ['ts'], columnTypes: { ts: 'datetime' } });
        throw new Error('expected datetime rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonFrameValidationError);
        expect(error).toMatchObject({ orient, path: cellPath, row: 1, column: 'ts', value: '0100-02-29' });
      }
    }
  });

  it.each([0, 1])('preserves dates and metadata through transforms/exports at packThreshold %i', (packThreshold) => {
    const input = [
      { ts: '9999-12-31T23:59:59.999999999', n: 3 },
      { ts: '0000-02-29 00:00:00.000000001', n: 1 },
      { ts: null, n: 0 },
      { ts: '0099-01-01', n: 2 },
    ];
    const original = JSON.stringify(input);
    const frame = fromOrient(input, { orient: 'records', packThreshold, columnTypes: { ts: 'datetime' } });
    expect(getDataFrameState(frame).data.get('n') instanceof Int32Array).toBe(packThreshold === 1);
    expect(Array.isArray(getDataFrameState(frame).data.get('ts'))).toBe(true);
    expect(frame.columnInfo.get('ts')).toEqual({ type: 'datetime', nullable: true });
    const transformed = frame
      .filter((row) => row.ts !== null)
      .sort((a, b) => a.n - b.n)
      .select('ts', 'n')
      .rename({ ts: 'when' })
      .resetIndex();
    const expected = [
      { when: input[1]!.ts, n: 1 },
      { when: input[3]!.ts, n: 2 },
      { when: input[0]!.ts, n: 3 },
    ];
    expect(transformed.rows()).toEqual(expected);
    expect(transformed.columnInfo.get('when')).toEqual({ type: 'datetime', nullable: false });
    expect(transformed.toTable().schema.fields).toContainEqual({ name: 'when', type: 'datetime' });
    const exports = {
      records: transformed.toRecords(),
      values: transformed.toValues(),
      split: transformed.toSplit(),
      index: transformed.toIndex(),
      columns: transformed.toColumns(),
      table: transformed.toTable(),
    };
    for (const orient of Object.keys(exports) as ResolvedOrient[]) {
      const text = transformed.toJSONString(orient);
      expect(JSON.parse(text)).toEqual(exports[orient]);
      for (const payload of [exports[orient], text]) {
        const restored = fromOrient(payload, {
          orient,
          columns: ['when', 'n'],
          columnTypes: { when: 'datetime' },
          packThreshold,
        });
        expect(restored.rows()).toEqual(expected);
        expect(restored.columnInfo.get('when')).toEqual({ type: 'datetime', nullable: false });
      }
    }
    expect(frame.rows()).toEqual(input);
    expect(JSON.stringify(input)).toBe(original);
  });
});

describe('negative zero packing (JFB-03)', () => {
  const buildFrame = (input: unknown, options: Parameters<typeof normalizeFromOrientOptions>[0]) => {
    const normalized = normalizeFromOrientOptions(options);
    const parsed = parseInput(input, normalized);
    return createInternalDataFrame(createFrameState(parsed, normalized), normalized.packThreshold);
  };

  const expectSignedZero = (value: unknown) => {
    expect(Object.is(value, -0)).toBe(true);
    expect(1 / (value as number)).toBe(-Infinity);
  };

  const expectPositiveZero = (value: unknown) => {
    expect(Object.is(value, 0)).toBe(true);
    expect(Object.is(value, -0)).toBe(false);
    expect(1 / (value as number)).toBe(Infinity);
  };

  it('distinguishes -0 from 0 at thresholds 0, 1, and default', () => {
    for (const packThreshold of [0, 1, DEFAULT_PACK_THRESHOLD]) {
      const frame = buildFrame([[-0], [0]], { orient: 'values', columns: ['n'], packThreshold });

      expect(frame.columnInfo.get('n')).toEqual({ type: 'integer', nullable: false });
      // Integer storage with -0 present must stay unpacked so Int32Array never collapses the sign.
      expect(Array.isArray(getDataFrameState(frame).data.get('n'))).toBe(true);

      expectSignedZero(frame.row(0).n);
      expectPositiveZero(frame.row(0 + 1).n);
      expectSignedZero(frame.rows()[0]!.n);
      expectSignedZero(frame.toValues()[0]![0]);
      expectPositiveZero(frame.toValues()[1]![0]);
      expectSignedZero(frame.toRecords()[0]!.n);
      expectSignedZero(frame.toSplit().data[0]![0]);
    }
  });

  it('preserves signed zero for inferred and explicit integer/float columns', () => {
    const inferredInteger = buildFrame([[-0], [1], [0]], {
      orient: 'values',
      columns: ['n'],
      packThreshold: 1,
    });
    expect(inferredInteger.columnInfo.get('n')).toEqual({ type: 'integer', nullable: false });
    expect(Array.isArray(getDataFrameState(inferredInteger).data.get('n'))).toBe(true);
    expectSignedZero(inferredInteger.row(0).n);

    const explicitInteger = buildFrame([[-0], [1]], {
      orient: 'values',
      columns: ['n'],
      columnTypes: { n: 'integer' },
      packThreshold: 1,
    });
    expect(explicitInteger.columnInfo.get('n')).toEqual({ type: 'integer', nullable: false });
    expect(Array.isArray(getDataFrameState(explicitInteger).data.get('n'))).toBe(true);
    expectSignedZero(explicitInteger.row(0).n);

    const inferredFloat = buildFrame([[-0], [1.5]], { orient: 'values', columns: ['f'], packThreshold: 1 });
    expect(inferredFloat.columnInfo.get('f')).toEqual({ type: 'float', nullable: false });
    expectSignedZero(inferredFloat.row(0).f);

    const explicitFloat = buildFrame([[-0], [2.5]], {
      orient: 'values',
      columns: ['f'],
      columnTypes: { f: 'float' },
      packThreshold: 1,
    });
    expect(explicitFloat.columnInfo.get('f')).toEqual({ type: 'float', nullable: false });
    // Float64Array preserves -0 natively, so packed float storage still carries the sign.
    expectSignedZero(explicitFloat.row(0).f);
    expectSignedZero(explicitFloat.toValues()[0]![0]);
  });

  it('keeps int32 boundary values while leaving -0 and overflow columns unpacked', () => {
    const frame = buildFrame([[INT32_MIN], [-0], [INT32_MAX], [0]], {
      orient: 'values',
      columns: ['n'],
      packThreshold: 1,
    });

    expect(frame.columnInfo.get('n')).toEqual({ type: 'integer', nullable: false });
    expect(Array.isArray(getDataFrameState(frame).data.get('n'))).toBe(true);
    expect(frame.row(0).n).toBe(INT32_MIN);
    expectSignedZero(frame.row(1).n);
    expect(frame.row(2).n).toBe(INT32_MAX);
    expectPositiveZero(frame.row(3).n);

    const overflow = buildFrame([[INT32_MAX + 1], [-0]], {
      orient: 'values',
      columns: ['n'],
      packThreshold: 1,
    });
    expect(Array.isArray(getDataFrameState(overflow).data.get('n'))).toBe(true);
    expect(overflow.row(0).n).toBe(INT32_MAX + 1);
    expectSignedZero(overflow.row(1).n);
  });

  it('preserves signed zero across null filtering and value-preserving transforms', () => {
    const frame = buildFrame([[-0], [null], [0], [2]], {
      orient: 'values',
      columns: ['n'],
      packThreshold: 1,
    });
    expect(frame.columnInfo.get('n')).toEqual({ type: 'integer', nullable: true });

    const seenInPredicate: unknown[] = [];
    const filtered = frame.filter((row) => {
      seenInPredicate.push(row.n);
      return row.n !== null;
    });
    expect(seenInPredicate.some((value) => Object.is(value, -0))).toBe(true);

    expect(filtered.columnInfo.get('n')).toEqual({ type: 'integer', nullable: false });
    // Repacking after nulls are removed must apply the same -0 eligibility rule.
    expect(Array.isArray(getDataFrameState(filtered).data.get('n'))).toBe(true);
    expect(filtered.toValues().map((row) => row[0])).toHaveLength(3);
    expectSignedZero(filtered.row(0).n);
    expectPositiveZero(filtered.row(1).n);
    expect(filtered.row(2).n).toBe(2);

    const seenInSort: unknown[] = [];
    const sorted = filtered.sort((left, right) => {
      seenInSort.push(left.n, right.n);
      return (left.n as number) - (right.n as number);
    });
    expect(seenInSort.some((value) => Object.is(value, -0))).toBe(true);
    expect(
      sorted
        .toValues()
        .flat()
        .filter((value) => Object.is(value, -0)),
    ).toHaveLength(1);
    expect(
      sorted
        .toValues()
        .flat()
        .filter((value) => Object.is(value, 0) && !Object.is(value, -0)),
    ).toHaveLength(1);

    const selected = sorted.select('n');
    expect(selected.columnInfo.get('n')).toEqual({ type: 'integer', nullable: false });
    expect(
      selected
        .toValues()
        .flat()
        .filter((value) => Object.is(value, -0)),
    ).toHaveLength(1);

    const reset = selected.resetIndex();
    expect(
      reset
        .toValues()
        .flat()
        .filter((value) => Object.is(value, -0)),
    ).toHaveLength(1);
    expectSignedZero(reset.toRecords().find((row) => Object.is(row.n, -0))!.n);
  });

  it('agrees between packed and unpacked frames across row/callback/exporters', () => {
    const unpacked = buildFrame([[-0], [0], [3]], {
      orient: 'values',
      columns: ['n'],
      packThreshold: 0,
    });
    const repacked = buildFrame([[-0], [0], [3]], {
      orient: 'values',
      columns: ['n'],
      packThreshold: 1,
    });

    for (const frame of [unpacked, repacked]) {
      expect(frame.columnInfo.get('n')).toEqual({ type: 'integer', nullable: false });
      expect(Array.isArray(getDataFrameState(frame).data.get('n'))).toBe(true);
    }

    const signatures = [unpacked, repacked].map((frame) => ({
      rows: frame.rows().map((row) => Object.is(row.n, -0)),
      values: frame.toValues().map((row) => Object.is(row[0], -0)),
      records: frame.toRecords().map((row) => Object.is(row.n, -0)),
      split: frame.toSplit().data.map((row) => Object.is(row[0], -0)),
      columns: [0, 1, 2].map((position) => Object.is(frame.toColumns().n[String(position)], -0)),
      index: [0, 1, 2].map((position) => Object.is(frame.toIndex()[String(position)]!.n, -0)),
      table: frame.toTable().data.map((row) => Object.is((row as Record<string, unknown>).n, -0)),
    }));
    expect(signatures[1]).toEqual(signatures[0]);
    expect(signatures[0]).toEqual({
      rows: [true, false, false],
      values: [true, false, false],
      records: [true, false, false],
      split: [true, false, false],
      columns: [true, false, false],
      index: [true, false, false],
      table: [true, false, false],
    });
  });

  it('keeps text JSON semantics distinct from JS payload identity', () => {
    // Normal JSON text encoding does not preserve the sign; only the live JS payload does.
    expect(JSON.stringify(-0)).toBe('0');

    const frame = buildFrame([[-0]], { orient: 'values', columns: ['n'], packThreshold: 1 });
    expectSignedZero(frame.toValues()[0]![0]);

    const parsed = JSON.parse(frame.toJSONString('values')) as unknown[][];
    expect(Object.is(parsed[0]![0], -0)).toBe(false);
    expect(Object.is(parsed[0]![0], 0)).toBe(true);
  });
});
