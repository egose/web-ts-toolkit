import { describe, expect, it } from 'vitest';
import { fromOrient } from '../../src';
import { getColumnOperationCounters, resetColumnOperationCounters } from '../../src/frame/column';

interface BenchmarkCase {
  readonly name: string;
  readonly rows: number;
  readonly columns: number;
  readonly packThreshold: number;
}

const benchmarkCases: readonly BenchmarkCase[] = [
  { name: 'tall-packed', rows: 4096, columns: 8, packThreshold: 1 },
  { name: 'wide-packed', rows: 128, columns: 128, packThreshold: 1 },
  { name: 'tall-unpacked', rows: 4096, columns: 8, packThreshold: 0 },
  { name: 'wide-unpacked', rows: 128, columns: 128, packThreshold: 0 },
];

const createFrame = ({ rows, columns, packThreshold }: BenchmarkCase) => {
  const columnNames = Array.from({ length: columns }, (_, column) => `c${column}`);
  const data = Array.from({ length: rows }, (_, row) => columnNames.map((_, column) => row * columns + column));

  return fromOrient(data, { orient: 'values', columns: columnNames, packThreshold });
};

describe('JFH-07 operation baseline', () => {
  it('records materialization and rebuild counters for representative frame shapes', () => {
    const measurements: Array<Record<string, number | string>> = [];

    for (const benchmarkCase of benchmarkCases) {
      const frame = createFrame(benchmarkCase);
      const columns = frame.columns;
      const selectedColumns = ['c0', `c${Math.floor(columns.length / 2)}`, `c${columns.length - 1}`];
      const operations = [
        { name: 'row', run: () => frame.row(0), expectedRebuiltCells: 0 },
        { name: 'rows', run: () => frame.rows(), expectedRebuiltCells: 0 },
        {
          name: 'filter',
          run: () => frame.filter((row) => Number(row.c0) % 2 === 0),
          expectedRebuiltCells: frame.length * columns.length,
        },
        {
          name: 'sort',
          run: () => frame.sort((left, right) => Number(left.c0) - Number(right.c0)),
          expectedRebuiltCells: frame.length * columns.length,
        },
        {
          name: 'select',
          run: () => frame.select(...selectedColumns),
          expectedRebuiltCells: frame.length * selectedColumns.length,
        },
      ] as const;

      for (const operation of operations) {
        resetColumnOperationCounters();
        const started = performance.now();
        const result = operation.run();
        const durationMs = performance.now() - started;
        const counters = getColumnOperationCounters();

        expect(counters.materializeColumnCalls).toBe(0);
        expect(counters.materializedCells).toBe(0);
        expect(counters.rebuiltCells).toBe(operation.expectedRebuiltCells);

        measurements.push({
          case: benchmarkCase.name,
          operation: operation.name,
          rows: benchmarkCase.rows,
          columns: benchmarkCase.columns,
          packThreshold: benchmarkCase.packThreshold,
          durationMs: Number(durationMs.toFixed(3)),
          materializeColumnCalls: counters.materializeColumnCalls,
          materializedCells: counters.materializedCells,
          scalarReads: counters.scalarReads,
          rebuiltCells: counters.rebuiltCells,
          resultLength: 'length' in result && typeof result.length === 'number' ? result.length : 1,
        });
      }
    }

    process.stdout.write(`JFH-07 operation baseline ${JSON.stringify(measurements)}\n`);
  });
});
