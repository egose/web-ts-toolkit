import { describe, expect, it } from 'vitest';
import { JsonFrameValidationError } from '../../src/errors';
import { createFrameState } from '../../src/frame/column';
import { createDataFrame as createInternalDataFrame, getDataFrameState } from '../../src/frame/DataFrame';
import { normalizeFromOrientOptions } from '../../src/options';
import { parseInput } from '../../src/parse';

const buildDataFrame = (input: string | unknown, options: Parameters<typeof normalizeFromOrientOptions>[0]) => {
  const normalized = normalizeFromOrientOptions(options);
  const parsed = parseInput(input, normalized);
  return createInternalDataFrame(createFrameState(parsed, normalized), normalized.packThreshold);
};

describe('DataFrame', () => {
  it('exposes defensive accessors and rows without mutating the frame', () => {
    const input = [
      ['NYC', 70],
      ['LA', 80],
      ['SF', 65],
    ];
    const frame = buildDataFrame(input, { orient: 'values', columns: ['city', 'temp'], packThreshold: 2 });

    input[0]![0] = 'changed';

    const columns = frame.columns as string[];
    const index = frame.index as number[];
    const row = frame.row(0) as Record<string, unknown>;
    const rows = frame.rows() as Array<Record<string, unknown>>;
    const columnInfo = frame.columnInfo as Map<string, unknown>;

    expect(() => {
      columns.push('extra');
    }).toThrow();
    expect(() => {
      index[0] = 99;
    }).toThrow();
    expect(() => {
      row.city = 'mutated';
    }).toThrow();
    expect(() => {
      rows[0] = { city: 'mutated' };
    }).toThrow();

    columnInfo.set('extra', { type: 'string', nullable: false });

    expect(frame.columns).toEqual(['city', 'temp']);
    expect(frame.index).toEqual([0, 1, 2]);
    expect(frame.row(0)).toEqual({ city: 'NYC', temp: 70 });
    expect(frame.rows()).toEqual([
      { city: 'NYC', temp: 70 },
      { city: 'LA', temp: 80 },
      { city: 'SF', temp: 65 },
    ]);
    expect(frame.columnInfo.get('city')).toEqual({ type: 'string', nullable: false });
    expect(frame.columnInfo.has('extra')).toBe(false);
    expect(Object.getPrototypeOf(frame.row(0))).toBeNull();
  });

  it('preserves row and index alignment through filter, stable sort, repeated sorts, and resetIndex', () => {
    const frame = buildDataFrame(
      {
        columns: ['group', 'value'],
        index: ['i0', 'i1', 'i2', 'i3', 'i4'],
        data: [
          ['b', 2],
          ['a', 1],
          ['c', 2],
          ['a', 1],
          ['b', 2],
        ],
      },
      { orient: 'split', packThreshold: 3 },
    );

    const byValue = (left: Record<string, unknown>, right: Record<string, unknown>) =>
      Number(left.value) - Number(right.value);
    const filteredThenSorted = frame.filter((row) => row.group !== 'c').sort((left, right) => byValue(left, right));
    const sortedThenFiltered = frame.sort((left, right) => byValue(left, right)).filter((row) => row.group !== 'c');
    const repeatedSorts = frame
      .sort((left, right) => String(left.group).localeCompare(String(right.group)))
      .sort((left, right) => byValue(left, right));
    const reset = filteredThenSorted.resetIndex();

    expect(filteredThenSorted.index).toEqual(['i1', 'i3', 'i0', 'i4']);
    expect(filteredThenSorted.rows()).toEqual([
      { group: 'a', value: 1 },
      { group: 'a', value: 1 },
      { group: 'b', value: 2 },
      { group: 'b', value: 2 },
    ]);
    expect(sortedThenFiltered.index).toEqual(['i1', 'i3', 'i0', 'i4']);
    expect(repeatedSorts.index).toEqual(['i1', 'i3', 'i0', 'i4', 'i2']);
    expect(reset.index).toEqual([0, 1, 2, 3]);
    expect(reset.rows()).toEqual(filteredThenSorted.rows());
  });

  it('re-packs transformed numeric columns only when the filtered values still satisfy the threshold', () => {
    const frame = buildDataFrame([[1], [2], [3]], { orient: 'values', columns: ['count'], packThreshold: 3 });

    const baseState = getDataFrameState(frame);
    const filtered = frame.filter((row) => Number(row.count) >= 2);
    const filteredState = getDataFrameState(filtered);

    expect(baseState.data.get('count')).toBeInstanceOf(Int32Array);
    expect(Array.isArray(filteredState.data.get('count'))).toBe(true);
    expect(filtered.rows()).toEqual([{ count: 2 }, { count: 3 }]);
  });

  it('rejects invalid row positions, unknown selections, duplicate selections, and rename collisions', () => {
    const frame = buildDataFrame(
      [
        [1, 'x'],
        [2, 'y'],
      ],
      { orient: 'values', columns: ['count', 'label'] },
    );

    expect(() => frame.row(-1)).toThrowError(RangeError);
    expect(() => frame.row(1.5)).toThrowError(RangeError);
    expect(() => frame.row(2)).toThrowError(RangeError);
    expect(() => frame.select('missing')).toThrowError(JsonFrameValidationError);
    expect(() => frame.select('count', 'count')).toThrowError(JsonFrameValidationError);
    expect(() => frame.rename({ label: 'count' })).toThrowError(JsonFrameValidationError);
  });

  it('treats prototype-sensitive labels as ordinary columns through access and transforms', () => {
    const frame = buildDataFrame(
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      {
        orient: 'values',
        columns: ['__proto__', 'constructor', 'prototype'],
      },
    );

    const row = frame.row(0) as Record<string, unknown>;
    const transformed = frame.select('constructor', '__proto__').rename({ constructor: 'kind' });
    const transformedRows = transformed.rows() as Array<Record<string, unknown>>;

    expect(row.__proto__).toBe(1);
    expect(row.constructor).toBe(2);
    expect(row.prototype).toBe(3);
    expect(transformed.columns).toEqual(['kind', '__proto__']);
    expect(transformedRows.map((entry) => Object.keys(entry))).toEqual([
      ['kind', '__proto__'],
      ['kind', '__proto__'],
    ]);
    expect(transformedRows.map((entry) => [entry.kind, entry.__proto__])).toEqual([
      [2, 1],
      [5, 4],
    ]);
    expect(Object.getPrototypeOf(transformed.row(0))).toBeNull();
  });

  it('keeps applicable table schema metadata aligned during select, rename, and resetIndex', () => {
    const frame = buildDataFrame(
      {
        schema: {
          fields: [
            { name: 'ri', type: 'string', extDtype: 'str' },
            { name: 'city', type: 'string', extDtype: 'str' },
            { name: 'temp', type: 'number' },
          ],
          primaryKey: ['ri'],
          pandas_version: '1.4.0',
        },
        data: [
          { ri: 'r0', city: 'NYC', temp: 70 },
          { ri: 'r1', city: 'LA', temp: 80 },
        ],
      },
      { orient: 'table' },
    );

    const selectedState = getDataFrameState(frame.select('temp'));
    const renamedState = getDataFrameState(frame.rename({ temp: 'degrees' }));
    const resetState = getDataFrameState(frame.resetIndex());

    expect(selectedState.tableSchema).toEqual({
      fields: [
        { name: 'ri', type: 'string', extDtype: 'str' },
        { name: 'temp', type: 'number' },
      ],
      primaryKey: ['ri'],
      pandas_version: '1.4.0',
    });
    expect(selectedState.tableIndexField).toBe('ri');

    expect(renamedState.tableSchema).toEqual({
      fields: [
        { name: 'ri', type: 'string', extDtype: 'str' },
        { name: 'city', type: 'string', extDtype: 'str' },
        { name: 'degrees', type: 'number' },
      ],
      primaryKey: ['ri'],
      pandas_version: '1.4.0',
    });
    expect(renamedState.tableIndexField).toBe('ri');

    expect(resetState.tableSchema).toEqual({
      fields: [
        { name: 'city', type: 'string', extDtype: 'str' },
        { name: 'temp', type: 'number' },
      ],
      pandas_version: '1.4.0',
    });
    expect(resetState.tableIndexField).toBeUndefined();
    expect(resetState.indexKind).toBe('synthetic');
  });
});
