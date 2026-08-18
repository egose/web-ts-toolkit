import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JsonFrameOptionError } from '../../src/errors';
import { createFrameState, materializeColumn, materializeFrameData } from '../../src/frame/column';
import { normalizeFromOrientOptions } from '../../src/options';
import { parseInput } from '../../src/parse';
import type { ParsedFrame } from '../../src/parse';
import type { ResolvedOrient } from '../../src/types';

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
