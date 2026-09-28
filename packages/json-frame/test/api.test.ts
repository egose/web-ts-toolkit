import { describe, expect, expectTypeOf, it } from 'vitest';
import { AmbiguousOrientError, JsonFrameParseError, fromOrient, type DataFrame, type JsonValue } from '../src/index';

describe('fromOrient', () => {
  it('produces equivalent frames for explicit and auto-detected unambiguous payloads', () => {
    const records = [
      { city: 'NYC', temp: 70 },
      { city: 'LA', temp: 80 },
    ];

    const auto = fromOrient(records);
    const explicit = fromOrient(records, { orient: 'records' });

    expect(auto.columns).toEqual(explicit.columns);
    expect(auto.index).toEqual(explicit.index);
    expect(auto.rows()).toEqual(explicit.rows());
    expect(auto.columnInfo).toEqual(explicit.columnInfo);
  });

  it('infers row types from parsed records input and defaults string input to generic JSON rows', () => {
    const inferred = fromOrient([
      { city: 'NYC', temp: 70 },
      { city: 'LA', temp: 80 },
    ]);
    const fromString = fromOrient('[{"city":"NYC","temp":70}]');

    expectTypeOf(inferred).toEqualTypeOf<DataFrame<{ city: string; temp: number }>>();
    expectTypeOf(fromString).toEqualTypeOf<DataFrame<Record<string, JsonValue>>>();
  });

  it('reports orient ambiguity for nested-object and empty payloads with actionable candidates', () => {
    for (const input of [{ row0: { city: 'NYC' } }, {}, []]) {
      try {
        fromOrient(input);
        throw new Error('expected fromOrient to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(AmbiguousOrientError);
        expect(error).toMatchObject(
          Array.isArray(input) ? { candidates: ['records', 'values'] } : { candidates: ['index', 'columns'] },
        );
        expect((error as AmbiguousOrientError).message).toContain('cannot distinguish');
      }
    }
  });

  it.each([undefined, 'auto', 'values'] as const)('normalizes %s values arrays to object rows', (orient) => {
    const input = [[1], [null]] as const;
    const frame = fromOrient(input, { orient, columns: ['n'] });

    expect(frame.rows()).toEqual([{ n: 1 }, { n: null }]);
    expect(Array.isArray(frame.row(0))).toBe(false);
    expect(frame.row(0).map).toBeUndefined();
    expect(frame.filter((row) => typeof row.n === 'number' && row.n.toFixed() === '1').toValues()).toEqual([[1]]);
    expect(input).toEqual([[1], [null]]);
  });

  it.each([undefined, 'auto', 'records'] as const)('null-fills sparse and heterogeneous %s records', (orient) => {
    const sparse = fromOrient([{ n: 1 }, {}], { orient });
    expect(sparse.rows()).toEqual([{ n: 1 }, { n: null }]);
    expect(sparse.filter((row) => row.n != null && row.n.toFixed() === '1').rows()).toEqual([{ n: 1 }]);

    const input = [
      { kind: 'number', n: 1 },
      { kind: 'label', label: 'x' },
    ] as const;
    const frame = fromOrient(input, { orient });
    expect(frame.rows()).toEqual([
      { kind: 'number', n: 1, label: null },
      { kind: 'label', n: null, label: 'x' },
    ]);
    expect(frame.filter((row) => row.label != null && row.label.toUpperCase() === 'X').row(0).n).toBeNull();
    expect(frame.sort((left, right) => (left.n ?? 0) - (right.n ?? 0)).row(0).kind).toBe('label');
    expect(input).toEqual([
      { kind: 'number', n: 1 },
      { kind: 'label', label: 'x' },
    ]);
  });

  it('null-fills optional columns only when present somewhere and leaves nested cells intact', () => {
    interface OptionalRow {
      id: string;
      n?: number;
    }
    const input: readonly OptionalRow[] = [{ id: 'a', n: 1 }, { id: 'b' }];
    const absentInput: readonly OptionalRow[] = [{ id: 'a' }, { id: 'b' }];
    const frame = fromOrient(input);
    const absent = fromOrient(absentInput);

    expect(frame.rows()).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: null },
    ]);
    expect(absent.columns).toEqual(['id']);
    expect(absent.row(0).n).toBeUndefined();
    expect(fromOrient([{ cell: { n: 1 } }, { cell: {} }]).rows()).toEqual([{ cell: { n: 1 } }, { cell: {} }]);
    // Explicit domain types remain assertions: they do not change normalization.
    expect(fromOrient<{ n: number }>('[{"n":1},{}]').row(1).n).toBeNull();
  });

  it('preserves JSON syntax failures as JsonFrameParseError causes', () => {
    try {
      fromOrient('{"city": }');
      throw new Error('expected fromOrient to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(JsonFrameParseError);
      expect(error).toMatchObject({
        message: 'Failed to parse JSON input.',
      });
      expect((error as JsonFrameParseError).cause).toBeInstanceOf(SyntaxError);
    }
  });

  describe.each([undefined, 'auto', 'records'] as const)('property-key records (%s)', (orient) => {
    for (const key of ['toString', 'constructor', 'valueOf'] as const) {
      it.each(['readonly', 'mutable'])('null-fills sparse ' + key + ' with %s input', (kind) => {
        const input = [{ [key]: 'ok' }, {}];
        if (kind === 'readonly') {
          input.forEach(Object.freeze);
          Object.freeze(input);
        }
        const before = JSON.stringify(input);
        const frame = fromOrient(input, { orient });
        expect(frame.columns).toEqual([key]);
        expect(frame.toValues()).toEqual([['ok'], [null]]);
        expect(Object.getPrototypeOf(frame.row(1))).toBeNull();
        expect(Object.hasOwn(frame.row(1), key)).toBe(true);
        expect(frame.row(1)[key]).toBeNull();
        expect(() => (frame.row(1)[key] as string).toUpperCase()).toThrow(TypeError);
        expect(frame.filter((row) => row[key] != null && row[key].toUpperCase() === 'OK').toValues()).toEqual([['ok']]);
        expect(frame.sort((a, b) => (a[key] ?? '').localeCompare(b[key] ?? '')).toValues()).toEqual([[null], ['ok']]);
        const dense = fromOrient([{ [key]: 'ok' }, { [key]: 'yes' }], { orient });
        expect(dense.toValues()).toEqual([['ok'], ['yes']]);
        expect(dense.row(0)[key].toUpperCase()).toBe('OK');
        expect(JSON.stringify(input)).toBe(before);
      });
    }

    it('creates optional Object-member columns only when supplied, including object cells', () => {
      // Null-prototype dictionaries model optional declared Object-member fields
      // without TypeScript treating a missing field as a native Object method.
      const absent = Object.assign(Object.create(null), { id: 'b' });
      const input = [{ id: 'a', toString: 'ok', constructor: 'ctor', valueOf: 'value' }, absent];
      const frame = fromOrient(input, { orient });
      expect(frame.columns).toEqual(['id', 'toString', 'constructor', 'valueOf']);
      expect(frame.toValues()).toEqual([
        ['a', 'ok', 'ctor', 'value'],
        ['b', null, null, null],
      ]);
      const emptyColumns = fromOrient([absent], { orient });
      expect(emptyColumns.columns).toEqual(['id']);
      for (const key of ['toString', 'constructor', 'valueOf']) {
        expect(emptyColumns.row(0)[key]).toBeUndefined();
        expect(Object.hasOwn(emptyColumns.row(0), key)).toBe(false);
      }
      const objects = fromOrient([{ toString: {}, constructor: {}, valueOf: {} }], { orient });
      expect(objects.toValues()).toEqual([[{}, {}, {}]]);
      expect(Object.keys(absent)).toEqual(['id']);
      expect(Object.getPrototypeOf(absent)).toBeNull();
    });

    it.each([
      { name: 'numeric-only', input: [{ 1: 1 }, { 1: 2 }], columns: ['1'], values: [[1], [2]] },
      { name: 'string-only', input: [{ '1': 1 }, { '1': 2 }], columns: ['1'], values: [[1], [2]] },
      { name: 'mixed spellings', input: [{ 1: 1 }, { '1': 'x' }], columns: ['1'], values: [[1], ['x']] },
      { name: 'reversed spellings', input: [{ '1': 'x' }, { 1: 1 }], columns: ['1'], values: [['x'], [1]] },
      { name: 'sparse numeric', input: [{ 1: 1 }, {}], columns: ['1'], values: [[1], [null]] },
      { name: 'sparse string', input: [{ '1': 1 }, {}], columns: ['1'], values: [[1], [null]] },
      { name: 'sparse mixed', input: [{ 1: 1 }, { '1': 'x' }, {}], columns: ['1'], values: [[1], ['x'], [null]] },
      {
        name: 'common other field',
        input: [
          { id: 'a', 1: 1 },
          { id: 'b', '1': 'x' },
        ],
        columns: ['1', 'id'],
        values: [
          [1, 'a'],
          ['x', 'b'],
        ],
      },
      { name: 'optional aliases', input: [{ 1: 1 }, { '1': 'x' }, {}], columns: ['1'], values: [[1], ['x'], [null]] },
      { name: 'absent optional', input: [{ id: 'a' }], columns: ['id'], values: [['a']] },
      {
        name: 'other numeric spellings',
        input: [
          { [-1]: 1, 1.5: 2, '01': 3 },
          { '-1': 'x', '1.5': 'y', '01': 4 },
        ],
        columns: ['-1', '1.5', '01'],
        values: [
          [1, 2, 3],
          ['x', 'y', 4],
        ],
      },
    ])('retains canonical columns and cells for $name', ({ input, columns, values }) => {
      const before = JSON.stringify(input);
      // Mutable and frozen/readonly inputs share the same runtime contract.
      for (const readonly of [false, true]) {
        if (readonly) {
          input.forEach(Object.freeze);
          Object.freeze(input);
        }
        const frame = fromOrient(input, { orient });
        expect(frame.columns).toEqual(columns);
        expect(frame.toValues()).toEqual(values);
        expect(JSON.parse(frame.toJSONString('records'))).toEqual(frame.rows());
        for (const row of frame.rows()) {
          expect(Object.getPrototypeOf(row)).toBeNull();
          expect(Object.keys(row)).toEqual(columns);
          expect(row[1]).toBe(row['1']);
        }
        expect(frame.filter((row) => typeof row[1] === 'number').toValues()).toEqual(
          values.filter((row) => columns[0] === '1' && typeof row[0] === 'number'),
        );
        expect(frame.sort((a, b) => String(a[1] ?? '').localeCompare(String(b['1'] ?? ''))).length).toBe(values.length);
        expect(JSON.stringify(input)).toBe(before);
      }
    });

    it('preserves flattened, shallow, dictionary and explicit-domain behavior', () => {
      const flattened = fromOrient(
        [
          { kind: 'member', toString: 'ok' },
          { kind: 'numeric', 1: 1 },
        ],
        { orient },
      );
      expect(flattened.row(0)[1]).toBeNull();
      expect(flattened.row(1).toString).toBeNull();
      const shallow = fromOrient([{ cell: { 1: 1 } }, { cell: {} }], { orient });
      expect(shallow.rows()).toEqual([{ cell: { '1': 1 } }, { cell: {} }]);
      expect(shallow.row(1).cell[1]).toBeUndefined();
      const dictionary: Record<number, number>[] = [{ 1: 1 }, {}];
      expect(fromOrient(dictionary, { orient }).toValues()).toEqual([[1], [null]]);
      expect(fromOrient<{ toString: string; 1: number }>([{ toString: 'ok', 1: 1 }], { orient }).toValues()).toEqual([
        [1, 'ok'],
      ]);
    });

    describe.each(['mutable', 'readonly'])('pattern-index companions (%s)', (kind) => {
      it.each([
        { name: 'prefix', key: 'metric_n', known: {} },
        { name: 'numeric-string / bigint', key: '1', known: {} },
        { name: 'suffix', key: 'n_metric', known: {} },
        { name: 'infix / intersected patterns', key: 'pre_n_post', known: {} },
        { name: 'intrinsic uppercase', key: 'N', known: {} },
        { name: 'known-field intersection', key: 'metric_n', known: { id: 'a', toString: 'ok' } },
        { name: 'numeric known-field intersection', key: '1', known: { id: 'a' } },
        { name: 'matching known-field intersection', key: 'metric_n', known: { metric_fixed: 2 } },
      ])('preserves null and absence for $name', ({ key, known }) => {
        const input = [{ ...known, [key]: 1 }, { ...known }];
        if (kind === 'readonly') {
          input.forEach(Object.freeze);
          Object.freeze(input);
        }
        const before = JSON.stringify(input);
        const frame = fromOrient(input, { orient });
        expect(frame.row(0)[key]).toBe(1);
        expect(frame.row(1)[key]).toBeNull();
        expect(frame.row(0).metric_absent).toBeUndefined();
        expect(Object.hasOwn(frame.row(0), 'metric_absent')).toBe(false);
        expect(Object.hasOwn(frame.row(1), key)).toBe(true);
        expect(Object.getPrototypeOf(frame.row(1))).toBeNull();
        // Reproduce the old inferred number | undefined contract deliberately.
        const unsafe = (cell: JsonValue | undefined): number =>
          cell !== undefined ? Number((cell as number).toFixed()) : 0;
        expect(() => unsafe(frame.row(1)[key])).toThrow(TypeError);
        expect(() => frame.filter((row) => unsafe(row[key]) === 1)).toThrow(TypeError);
        expect(() => frame.sort((a, b) => unsafe(a[key]) - unsafe(b[key]))).toThrow(TypeError);
        const scalar = (cell: JsonValue | undefined): number => (typeof cell === 'number' ? cell : 0);
        expect(frame.filter((row) => typeof row[key] === 'number' && row[key].toFixed() === '1').length).toBe(1);
        expect(frame.sort((a, b) => scalar(a[key]) - scalar(b[key])).row(0)[key]).toBeNull();
        const absent = fromOrient([{ ...known }], { orient });
        expect(absent.row(0)[key]).toBeUndefined();
        expect(absent.columns).not.toContain(key);
        expect(JSON.parse(frame.toJSONString('records'))).toEqual(frame.rows());
        expect(JSON.stringify(input)).toBe(before);
      });

      it('retains union normalization and finite-template values', () => {
        const union: readonly (Record<`metric_${string}`, number> | { id: string })[] = [{ metric_n: 1 }, { id: 'a' }];
        const patterns: readonly Record<`metric_${string}` | `${number}`, number>[] = [{ metric_n: 1 }, { 1: 2 }, {}];
        const finite: readonly Record<`metric_${'a' | 'b'}`, number>[] = [{ metric_a: 1, metric_b: 2 }];
        const optional: readonly Partial<Record<`metric_${'a' | 'b'}`, number>>[] = [{ metric_a: 1 }, {}];
        if (kind === 'readonly') {
          for (const input of [union, patterns, finite, optional]) {
            input.forEach(Object.freeze);
            Object.freeze(input);
          }
        }
        expect(fromOrient(union, { orient }).rows()).toEqual([
          { metric_n: 1, id: null },
          { metric_n: null, id: 'a' },
        ]);
        expect(fromOrient(patterns, { orient }).rows()).toEqual([
          { metric_n: 1, '1': null },
          { metric_n: null, '1': 2 },
          { metric_n: null, '1': null },
        ]);
        expect(fromOrient(finite, { orient }).rows()).toEqual([{ metric_a: 1, metric_b: 2 }]);
        const optionalFrame = fromOrient(optional, { orient });
        expect(optionalFrame.columns).toEqual(['metric_a']);
        expect(optionalFrame.rows()).toEqual([{ metric_a: 1 }, { metric_a: null }]);
      });
    });
  });

  it('exports only the intended runtime package-root values', async () => {
    const publicApi = await import('@web-ts-toolkit/json-frame');

    expect(Object.keys(publicApi).sort()).toEqual([
      'AmbiguousOrientError',
      'ExportKeyCollisionError',
      'JSON_FRAME_MAX_DEPTH',
      'JsonFrameError',
      'JsonFrameOptionError',
      'JsonFrameParseError',
      'JsonFrameValidationError',
      'UnsupportedFeatureError',
      'fromOrient',
    ]);
  });
});
