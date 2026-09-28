import { describe, expect, it } from 'vitest';
import {
  fromOrient,
  JsonFrameOptionError,
  JsonFrameValidationError,
  type FromOrientOptions,
  type JsonValue,
  type ResolvedOrient,
  type ToJSONStringOptions,
} from '../src/index';
import { assertJsonCompatible, cloneJsonCompatible } from '../src/json';

const orients = ['records', 'index', 'columns', 'values', 'split', 'table'] as const;

function expectBudgetError(run: () => unknown, maxNodes: number, path: string, orient?: ResolvedOrient): void {
  try {
    run();
    throw new Error('expected budget rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(JsonFrameValidationError);
    expect(error).toMatchObject({ message: `JSON traversal exceeds maxNodes budget of ${maxNodes}.`, path });
    expect((error as JsonFrameValidationError).orient).toBe(orient);
  }
}

// Thirteen distinct plain containers; expansion has 2^13 - 1 = 8191
// container occurrences and 8190 edges. Getters measure reads, not elapsed time.
function binaryAliasGraph(): { graph: JsonValue; reads: () => number; reset: () => void } {
  let reads = 0;
  let graph: JsonValue = {};
  for (let level = 0; level < 12; level += 1) {
    const child = graph;
    graph = {
      get left() {
        reads += 1;
        return child;
      },
      get right() {
        reads += 1;
        return child;
      },
    };
  }
  return {
    graph,
    reads: () => reads,
    reset: () => {
      reads = 0;
    },
  };
}

describe('maxNodes option boundary', () => {
  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '3', null, true, {}, [], 1n])(
    'rejects invalid maxNodes %p at ingestion and every serialization orient',
    (maxNodes) => {
      expect(() => fromOrient([], { orient: 'records', maxNodes } as FromOrientOptions)).toThrowError(
        JsonFrameOptionError,
      );
      const frame = fromOrient([{ n: 1 }]);
      for (const orient of orients) {
        try {
          frame.toJSONString(orient, { maxNodes } as ToJSONStringOptions);
          throw new Error('expected invalid option');
        } catch (error) {
          expect(error).toBeInstanceOf(JsonFrameOptionError);
          expect(error).toMatchObject({ option: 'maxNodes' });
        }
      }
    },
  );

  it.each(orients)('validates the options object and indexField consistently for %s', (orient) => {
    const frame = fromOrient([{ n: 1 }]);
    for (const options of [null, [], 1, 'bad', false, () => 1]) {
      expect(() => frame.toJSONString(orient, options as ToJSONStringOptions)).toThrowError(JsonFrameOptionError);
    }
    for (const indexField of [null, 1, false, []]) {
      expect(() => frame.toJSONString(orient, { indexField, maxNodes: 100 } as ToJSONStringOptions)).toThrowError(
        JsonFrameOptionError,
      );
    }
    expect(frame.toJSONString(orient, { maxNodes: Number.MAX_SAFE_INTEGER, indexField: 'row_id' })).toBe(
      frame.toJSONString(orient),
    );
    expect(frame.toJSONString(orient, { maxNodes: undefined })).toBe(frame.toJSONString(orient));
  });
});

describe('root-inclusive ingestion accounting', () => {
  it.each([null, true, 'text', 1, [], {}])(
    'charges scalar/container root %p once in both shared traversals',
    (root) => {
      expect(cloneJsonCompatible(root, 'records', '$', 1)).toEqual(root);
      expect(() => assertJsonCompatible(root, 'records', '$', 1)).not.toThrow();
      expectBudgetError(() => cloneJsonCompatible([root], 'records', '$', 1), 1, '$[0]', 'records');
      expectBudgetError(() => assertJsonCompatible([root], 'records', '$', 1), 1, '$[0]', 'records');
    },
  );

  it.each([
    { input: [{}], nodes: 2, path: '$[0]' },
    { input: [{ value: 1 }], nodes: 3, path: '$[0].value' },
    { input: [{ value: [null, true, 'x', 2, {}] }], nodes: 8, path: '$[0].value[4]' },
    { input: [{ value: { empty: [], n: 1 } }], nodes: 5, path: '$[0].value.n' },
  ])('accepts exactly $nodes occurrences and rejects one over for parsed/raw records', ({ input, nodes, path }) => {
    for (const source of [input, JSON.stringify(input)]) {
      for (const orient of ['records', 'auto', undefined] as const) {
        expect(fromOrient(source, { orient, maxNodes: nodes }).rows()).toEqual(input);
        expectBudgetError(
          () => fromOrient(source, { orient, maxNodes: nodes - 1 }),
          nodes - 1,
          path,
          orient === 'records' ? orient : undefined,
        );
        expect(fromOrient(source, { orient }).rows()).toEqual(input);
      }
    }
    expect(fromOrient([], { orient: 'records', maxNodes: 1 }).length).toBe(0);
  });

  it('counts repeated aliases per occurrence, clones them separately, and resets every call', () => {
    const shared = { list: [1] };
    const input = [{ a: shared, b: shared }]; // root + row + 2 * (object + array + scalar) = 8
    for (let call = 0; call < 2; call += 1) {
      expectBudgetError(() => fromOrient(input, { orient: 'records', maxNodes: 7 }), 7, '$[0].b.list[0]', 'records');
      const frame = fromOrient(input, { orient: 'records', maxNodes: 8 });
      expect(frame.rows()).toEqual(input);
      expect(frame.row(0).a).not.toBe(shared);
      expect(frame.row(0).a).not.toBe(frame.row(0).b);
      expect(frame.row(0).a.list).not.toBe(frame.row(0).b.list);
      expect(frame.toRecords()[0]!.a).toBe(frame.row(0).a);
    }
  });

  it('stops a compact alias graph at the budget without a clone pre-pass', () => {
    const measured = binaryAliasGraph();
    const input = [{ cell: measured.graph }];
    expect(() => fromOrient(input, { orient: 'records', maxNodes: 64 })).toThrowError(/maxNodes budget of 64/);
    // 64 admitted nodes, then the 65th value is read and rejected before descent.
    expect(measured.reads()).toBe(62);
    measured.reset();
    const frame = fromOrient(input, { orient: 'records', maxNodes: 8193 });
    expect(measured.reads()).toBe(8190);
    expect(frame.toJSONString('records', { maxNodes: 8193 })).toBe(JSON.stringify(input));
    measured.reset();
    expect(fromOrient(input, { orient: 'records' }).length).toBe(1);
    expect(measured.reads()).toBe(8190);
  });
});

describe('complete payload serialization accounting', () => {
  const cases = [
    { orient: 'records', nodes: 3, path: '$[0].n' },
    { orient: 'index', nodes: 3, path: '$.r.n' },
    { orient: 'columns', nodes: 3, path: '$.n.r' },
    { orient: 'values', nodes: 3, path: '$[0][0]' },
    { orient: 'split', nodes: 8, path: '$.data[0][0]' },
    { orient: 'table', nodes: 15, path: '$.data[0].n' },
  ] as const;

  it.each(cases)('counts $orient wrappers, labels, metadata, and values ($nodes nodes)', ({ orient, nodes, path }) => {
    const frame = fromOrient({ r: { n: 1 } }, { orient: 'index', maxNodes: 3 });
    const expected = frame.toJSONString(orient);
    for (let call = 0; call < 2; call += 1) {
      expectBudgetError(() => frame.toJSONString(orient, { maxNodes: nodes - 1 }), nodes - 1, path, orient);
      expect(frame.toJSONString(orient, { maxNodes: nodes })).toBe(expected);
      // The same exported shape is charged identically during raw/parsed ingestion.
      for (const input of [expected, JSON.parse(expected) as unknown]) {
        const options = { orient, columns: ['n'], maxNodes: nodes };
        expect(fromOrient(input, options).rows()).toEqual([{ n: 1 }]);
        expectBudgetError(() => fromOrient(input, { ...options, maxNodes: nodes - 1 }), nodes - 1, path, orient);
      }
    }
    // Ingestion budget is not inherited by exports or transforms (split/table exceed 3).
    expect(frame.select('n').resetIndex().toJSONString(orient)).toBeDefined();
  });

  it('includes nested schema/field metadata and combines table indexField with maxNodes', () => {
    const input = {
      schema: {
        fields: [
          { name: 'id', type: 'string' },
          { name: 'n', type: 'integer', custom: { enabled: true } },
        ],
        primaryKey: ['id'],
        custom: { tags: ['x', null] },
      },
      data: [{ id: 'r', n: 1 }],
    }; // base table 15 + field custom 2 + schema custom 4 = 21
    const frame = fromOrient(input, { orient: 'table', maxNodes: 21 }).rename({ n: 'id' });
    const options = { indexField: 'row_id', maxNodes: 21 };
    const result = JSON.parse(frame.toJSONString('table', options));
    expect(result).toEqual({
      schema: {
        ...input.schema,
        fields: [
          { name: 'row_id', type: 'string' },
          { ...input.schema.fields[1], name: 'id' },
        ],
        primaryKey: ['row_id'],
      },
      data: [{ row_id: 'r', id: 1 }],
    });
    expectBudgetError(() => frame.toJSONString('table', { ...options, maxNodes: 20 }), 20, '$.data[0].id', 'table');
    expectBudgetError(
      () => frame.toJSONString('table', { ...options, maxNodes: 4 }),
      4,
      '$.schema.custom.tags[0]',
      'table',
    );
    expect(input.data[0]).toEqual({ id: 'r', n: 1 });
  });

  it.each(orients)('charges mutation-introduced aliases in %s without changing shallow cell identity', (orient) => {
    const frame = fromOrient([{ cell: { left: {}, right: {} } }], { maxNodes: 5 });
    const cell = frame.row(0).cell;
    const shared = { value: 1 };
    cell.left = shared;
    cell.right = shared;
    // records/index/columns/values: root + row/column + cell + 2*(object+scalar).
    // split adds five wrapper/label nodes; synthetic-index table adds six schema/wrapper nodes.
    const nodes = orient === 'split' ? 12 : orient === 'table' ? 13 : 7;
    const expected = frame.toJSONString(orient);
    for (let call = 0; call < 2; call += 1) {
      expect(() => frame.toJSONString(orient, { maxNodes: nodes - 1 })).toThrowError(/maxNodes budget/);
      expect(frame.toJSONString(orient, { maxNodes: nodes })).toBe(expected);
    }
    expect(frame.row(0).cell).toBe(cell);
    expect(frame.toRecords()[0]!.cell).toBe(cell);
    expect(cell.left).toBe(cell.right);
  });

  it('bounds an expanded mutation graph and performs only validation plus native serialization', () => {
    const frame = fromOrient([{ cell: {} }], { maxNodes: 3 });
    const cell = frame.row(0).cell as Record<string, JsonValue>;
    const measured = binaryAliasGraph();
    cell.graph = measured.graph; // 3 wrapper/cell nodes + 8191 graph occurrences
    expect(() => frame.toJSONString('records', { maxNodes: 64 })).toThrowError(/maxNodes budget of 64/);
    expect(measured.reads()).toBe(61);
    measured.reset();
    const json = frame.toJSONString('records', { maxNodes: 8194 });
    expect(measured.reads()).toBe(16380); // 8190 edges * exactly two passes
    expect(cell.graph).toBe(measured.graph);
    measured.reset();
    expect(frame.toJSONString('records')).toBe(json);
    expect(measured.reads()).toBe(16380);
  });
});

describe('budget preserves existing JSON validation and ownership', () => {
  it('retains prototype-sensitive keys and detached null-prototype objects', () => {
    const input = JSON.parse('[{"__proto__":{"constructor":1},"prototype":null}]') as unknown;
    const frame = fromOrient(input, { orient: 'records', maxNodes: 5 });
    expect(frame.rows()).toEqual(input);
    expect(frame.toJSONString('records', { maxNodes: 5 })).toBe(JSON.stringify(input));
    expect(Object.getPrototypeOf(frame.row(0)['__proto__'])).toBe(null);
    expectBudgetError(() => fromOrient(input, { orient: 'records', maxNodes: 4 }), 4, '$[0].prototype', 'records');
  });

  it('still detects cycles, holes and non-JSON cells with a sufficient budget', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const hole = new Array(1) as unknown[];
    for (const bad of [cycle, hole, undefined, Infinity, new Date(0)]) {
      expect(() => fromOrient([{ cell: bad }], { orient: 'records', maxNodes: 100 })).toThrowError(
        JsonFrameValidationError,
      );
      const frame = fromOrient([{ cell: {} }]);
      (frame.row(0).cell as Record<string, unknown>).bad = bad;
      for (const orient of orients) {
        expect(() => frame.toJSONString(orient, { maxNodes: 100 })).toThrowError(JsonFrameValidationError);
      }
    }
  });

  it('revalidates a shared container reached later through an over-depth path', () => {
    const nest = (levels: number, leaf: JsonValue): JsonValue => {
      let value = leaf;
      for (let i = 0; i < levels; i += 1) value = [value];
      return value;
    };
    const shared = nest(500, null);
    const cell = { left: shared, right: nest(501, shared) };
    expect(() => fromOrient([{ cell }], { orient: 'records', maxNodes: 5000 })).toThrowError(/nesting depth/);
    const frame = fromOrient([{ cell: {} }]);
    Object.assign(frame.row(0).cell, cell);
    for (const orient of orients) {
      try {
        frame.toJSONString(orient, { maxNodes: 5000 });
        throw new Error('expected deep second path rejection');
      } catch (error) {
        expect(error).toMatchObject({ name: 'JsonFrameValidationError', orient });
        expect((error as JsonFrameValidationError).path).toContain('.right');
        expect((error as Error).message).toContain('nesting depth');
      }
    }
  });
});
