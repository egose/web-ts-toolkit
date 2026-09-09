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

describe('JFB-08 export and wide-schema measurements', () => {
  it('records time and allocation counters for tall exports, wide ingestion/rename, and rejected exports', () => {
    const measurements: Array<Record<string, number | string>> = [];

    // Packed/unpacked tall exports: exporters read stored columns directly,
    // so no full-column materialization is expected.
    for (const benchmarkCase of benchmarkCases) {
      const frame = createFrame(benchmarkCase);
      const rowCount = frame.length;
      const columnCount = frame.columns.length;
      const exportOperations = [
        { name: 'toRecords', run: () => frame.toRecords(), expectedScalarReads: rowCount * columnCount },
        { name: 'toValues', run: () => frame.toValues(), expectedScalarReads: rowCount * columnCount },
        { name: 'toSplit', run: () => frame.toSplit(), expectedScalarReads: rowCount * columnCount },
      ] as const;

      for (const operation of exportOperations) {
        resetColumnOperationCounters();
        const started = performance.now();
        const result = operation.run();
        const durationMs = performance.now() - started;
        const counters = getColumnOperationCounters();

        expect(counters.materializeColumnCalls).toBe(0);
        expect(counters.materializedCells).toBe(0);
        expect(counters.scalarReads).toBe(operation.expectedScalarReads);

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
          resultLength: Array.isArray(result) ? result.length : 1,
        });
      }
    }

    // Wide short table ingestion/rename: single per-operation membership Set
    // keeps schema lookup linear in field/column counts.
    for (const width of [256, 512, 1024]) {
      const columnNames = Array.from({ length: width }, (_, column) => `c${column}`);
      const tableInput = {
        schema: {
          fields: columnNames.map((name) => ({ name, type: 'integer' as const })),
          primaryKey: [] as string[],
        },
        data: [Object.fromEntries(columnNames.map((name, index) => [name, index]))],
      };

      resetColumnOperationCounters();
      const ingestStarted = performance.now();
      const wideFrame = fromOrient(tableInput, { orient: 'table' });
      const ingestMs = performance.now() - ingestStarted;
      const ingestCounters = getColumnOperationCounters();
      expect(wideFrame.columns).toHaveLength(width);
      measurements.push({
        case: `wide-table-ingest-${width}`,
        operation: 'ingest',
        rows: 1,
        columns: width,
        durationMs: Number(ingestMs.toFixed(3)),
        materializeColumnCalls: ingestCounters.materializeColumnCalls,
        materializedCells: ingestCounters.materializedCells,
        scalarReads: ingestCounters.scalarReads,
        rebuiltCells: ingestCounters.rebuiltCells,
        resultLength: wideFrame.length,
      });

      resetColumnOperationCounters();
      const renameStarted = performance.now();
      const renamed = wideFrame.rename({ c0: 'c0_renamed' });
      const renameMs = performance.now() - renameStarted;
      const renameCounters = getColumnOperationCounters();
      expect(renamed.columns[0]).toBe('c0_renamed');
      measurements.push({
        case: `wide-table-rename-${width}`,
        operation: 'rename',
        rows: 1,
        columns: width,
        durationMs: Number(renameMs.toFixed(3)),
        materializeColumnCalls: renameCounters.materializeColumnCalls,
        materializedCells: renameCounters.materializedCells,
        scalarReads: renameCounters.scalarReads,
        rebuiltCells: renameCounters.rebuiltCells,
        resultLength: renamed.length,
      });
    }

    // Rejected exports: predictable preflight runs before cell copies, so no
    // full-column materialization and no scalar cell reads are expected.
    const collidingIndex = fromOrient({ columns: ['v'], index: [1, '1'], data: [[10], [20]] }, { orient: 'split' });
    for (const operation of ['toIndex', 'toColumns'] as const) {
      resetColumnOperationCounters();
      const started = performance.now();
      expect(() => collidingIndex[operation]() as unknown).toThrow();
      const durationMs = performance.now() - started;
      const counters = getColumnOperationCounters();

      expect(counters.materializeColumnCalls).toBe(0);
      expect(counters.materializedCells).toBe(0);
      expect(counters.scalarReads).toBe(0);

      measurements.push({
        case: 'rejected-index-collision',
        operation,
        rows: 2,
        columns: 1,
        durationMs: Number(durationMs.toFixed(3)),
        materializeColumnCalls: counters.materializeColumnCalls,
        materializedCells: counters.materializedCells,
        scalarReads: counters.scalarReads,
        rebuiltCells: counters.rebuiltCells,
        resultLength: 0,
      });
    }

    const duplicateIndex = fromOrient(
      { columns: ['c'], index: ['same', 'same'], data: [['a'], ['b']] },
      { orient: 'split' },
    );
    resetColumnOperationCounters();
    const duplicateStarted = performance.now();
    expect(() => duplicateIndex.toTable() as unknown).toThrow();
    const duplicateMs = performance.now() - duplicateStarted;
    const duplicateCounters = getColumnOperationCounters();
    expect(duplicateCounters.materializeColumnCalls).toBe(0);
    expect(duplicateCounters.materializedCells).toBe(0);
    expect(duplicateCounters.scalarReads).toBe(0);
    measurements.push({
      case: 'rejected-table-duplicate-index',
      operation: 'toTable',
      rows: 2,
      columns: 1,
      durationMs: Number(duplicateMs.toFixed(3)),
      materializeColumnCalls: duplicateCounters.materializeColumnCalls,
      materializedCells: duplicateCounters.materializedCells,
      scalarReads: duplicateCounters.scalarReads,
      rebuiltCells: duplicateCounters.rebuiltCells,
      resultLength: 0,
    });

    const collidingTableField = fromOrient(
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
    resetColumnOperationCounters();
    const collisionStarted = performance.now();
    expect(() => collidingTableField.toTable() as unknown).toThrow();
    const collisionMs = performance.now() - collisionStarted;
    const collisionCounters = getColumnOperationCounters();
    expect(collisionCounters.materializeColumnCalls).toBe(0);
    expect(collisionCounters.materializedCells).toBe(0);
    expect(collisionCounters.scalarReads).toBe(0);
    measurements.push({
      case: 'rejected-table-index-field-collision',
      operation: 'toTable',
      rows: 2,
      columns: 2,
      durationMs: Number(collisionMs.toFixed(3)),
      materializeColumnCalls: collisionCounters.materializeColumnCalls,
      materializedCells: collisionCounters.materializedCells,
      scalarReads: collisionCounters.scalarReads,
      rebuiltCells: collisionCounters.rebuiltCells,
      resultLength: 0,
    });

    // Filter/sort shape controls: all-retained and already-sorted inputs stay
    // as controls; partial/empty filters and reverse/tie-heavy sorts extend
    // coverage without elapsed-time thresholds.
    const tallFrame = createFrame(benchmarkCases[0]!);
    const rowTotal = tallFrame.length;
    const columnTotal = tallFrame.columns.length;
    type FilterPredicate = Parameters<typeof tallFrame.filter>[0];
    const filterShapes: readonly {
      readonly name: string;
      readonly predicate: FilterPredicate;
      readonly expectedRows: number;
    }[] = [
      { name: 'filter-all-retained', predicate: () => true, expectedRows: rowTotal },
      {
        name: 'filter-partial',
        predicate: (_row, _index, position) => position % 10 === 0,
        expectedRows: Math.ceil(rowTotal / 10),
      },
      { name: 'filter-empty', predicate: () => false, expectedRows: 0 },
    ];
    for (const shape of filterShapes) {
      resetColumnOperationCounters();
      const started = performance.now();
      const result = tallFrame.filter(shape.predicate);
      const durationMs = performance.now() - started;
      const counters = getColumnOperationCounters();

      expect(result.length).toBe(shape.expectedRows);
      expect(counters.materializeColumnCalls).toBe(0);
      expect(counters.materializedCells).toBe(0);
      expect(counters.rebuiltCells).toBe(shape.expectedRows * columnTotal);

      measurements.push({
        case: benchmarkCases[0]!.name,
        operation: shape.name,
        rows: benchmarkCases[0]!.rows,
        columns: benchmarkCases[0]!.columns,
        durationMs: Number(durationMs.toFixed(3)),
        materializeColumnCalls: counters.materializeColumnCalls,
        materializedCells: counters.materializedCells,
        scalarReads: counters.scalarReads,
        rebuiltCells: counters.rebuiltCells,
        resultLength: result.length,
      });
    }

    type SortCompare = Parameters<typeof tallFrame.sort>[0];
    const sortShapes: readonly { readonly name: string; readonly compare: SortCompare }[] = [
      {
        name: 'sort-already-sorted',
        compare: (left, right) => Number(left.c0) - Number(right.c0),
      },
      {
        name: 'sort-reverse',
        compare: (left, right) => Number(right.c0) - Number(left.c0),
      },
      {
        name: 'sort-tie-heavy',
        compare: (left, right) => (Number(left.c0) % 4) - (Number(right.c0) % 4),
      },
    ];
    for (const shape of sortShapes) {
      resetColumnOperationCounters();
      const started = performance.now();
      const result = tallFrame.sort(shape.compare);
      const durationMs = performance.now() - started;
      const counters = getColumnOperationCounters();

      expect(result.length).toBe(rowTotal);
      expect(counters.materializeColumnCalls).toBe(0);
      expect(counters.materializedCells).toBe(0);
      expect(counters.rebuiltCells).toBe(rowTotal * columnTotal);

      measurements.push({
        case: benchmarkCases[0]!.name,
        operation: shape.name,
        rows: benchmarkCases[0]!.rows,
        columns: benchmarkCases[0]!.columns,
        durationMs: Number(durationMs.toFixed(3)),
        materializeColumnCalls: counters.materializeColumnCalls,
        materializedCells: counters.materializedCells,
        scalarReads: counters.scalarReads,
        rebuiltCells: counters.rebuiltCells,
        resultLength: result.length,
      });
    }

    process.stdout.write(`JFB-08 export and wide-schema measurements ${JSON.stringify(measurements)}\n`);
  });
});
