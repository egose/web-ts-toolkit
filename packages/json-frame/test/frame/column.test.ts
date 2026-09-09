import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JsonFrameOptionError, JsonFrameValidationError } from '../../src/errors';
import { createFrameState, materializeColumn, materializeFrameData } from '../../src/frame/column';
import { createDataFrame as createInternalDataFrame, getDataFrameState } from '../../src/frame/DataFrame';
import { DEFAULT_PACK_THRESHOLD, normalizeFromOrientOptions } from '../../src/options';
import { parseInput } from '../../src/parse';
import type { ParsedFrame } from '../../src/parse';
import type { JsonValue, ResolvedOrient } from '../../src/types';

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
