import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { createAdapter, DataService, ModelService } from '../src';
import type { DataDefaults, Defaults } from '../src/interface';
import {
  cloneServiceDefaultValue,
  normalizeServiceDefaults,
  UnsupportedServiceDefaultValueError,
} from '../src/services/shared';

const chain = (depth: number): unknown => {
  let value: unknown = 0;
  for (let i = 0; i < depth; i++) value = { child: value };
  return value;
};

const dag = (levels: number): unknown => {
  let value: unknown = 0;
  for (let i = 0; i < levels; i++) value = [value, value];
  return value;
};

const fixtures = [
  ['stack-overflow chain', () => chain(20_000), /depth limit 64/],
  ['65-edge defaults', () => chain(63), /depth limit 64/],
  ['10,001-visit array', () => Array(9_998).fill(0), /node limit 10000/],
  [
    '10,001-visit object',
    () => Object.fromEntries(Array.from({ length: 9_998 }, (_, i) => [i, 0])),
    /node limit 10000/,
  ],
  ['10,001-visit sparse array', () => Array(9_998), /node limit 10000/],
  ['32,769-visit expanded DAG', () => dag(14), /node limit 10000/],
] as const;

describe('CLC-04-F01 bounded service-default normalization', () => {
  for (const route of [
    'direct model',
    'direct data',
    'adapter model',
    'adapter data',
    'factory model',
    'factory data',
  ]) {
    describe(route, () => {
      const construct = (defaults: Defaults & DataDefaults, dispatch: ReturnType<typeof vi.fn>) => {
        const options = {
          axios: axios.create({ adapter: dispatch }),
          modelName: 'Bounded',
          dataName: 'bounded',
          basePath: 'bounded',
          queryPath: '__query',
          mutationPath: '__mutation',
          onSuccess: () => {},
          onFailure: () => {},
          throwOnError: false,
        };
        if (route === 'direct model') return new ModelService(options, defaults);
        if (route === 'direct data') return new DataService(options, defaults);
        const inherited = route.startsWith('adapter');
        const adapter = createAdapter(
          { adapter: dispatch },
          inherited
            ? {
                modelDefaults: defaults,
                dataDefaults: defaults,
              }
            : undefined,
        );
        return route.endsWith('model')
          ? adapter.createModelService(options, inherited ? undefined : defaults)
          : adapter.createDataService(options, inherited ? undefined : defaults);
      };

      it.each(fixtures)('rejects %s before recursive clone/freeze and HTTP', (_name, make, message) => {
        const dispatch = vi.fn();
        const payload = make();
        const defaults = { listOptions: { payload } } as Defaults & DataDefaults;
        const run = () => construct(defaults, dispatch);
        expect(run).toThrow(UnsupportedServiceDefaultValueError);
        expect(run).toThrow(message);
        expect(Object.isFrozen(defaults)).toBe(false);
        expect(Object.isFrozen(payload)).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
      });

      it('accepts exact depth and work boundaries and a shared acyclic DAG', () => {
        const dispatch = vi.fn();
        for (const payload of [chain(62), Array(9_997).fill(0), dag(12)]) {
          expect(() => construct({ listOptions: { payload } } as Defaults & DataDefaults, dispatch)).not.toThrow();
          expect(Object.isFrozen(payload)).toBe(false);
        }
        expect(dispatch).not.toHaveBeenCalled();
      });
    });
  }

  it('counts the whole defaults bag, including separate operation defaults', () => {
    const defaults = { listOptions: { payload: Array(4_998).fill(0) }, readOptions: { payload: Array(4_997).fill(0) } };
    // root + two bags + two arrays + 9,995 slots = exactly 10,000 visits.
    expect(() => normalizeServiceDefaults(defaults, [])).not.toThrow();
    defaults.readOptions.payload.push(0);
    expect(() => normalizeServiceDefaults(defaults, [])).toThrow(/node limit 10000/);
  });

  it('bounds effective merged adapter/service defaults while preserving overriding fields', () => {
    const adapter = createAdapter(
      {},
      {
        modelDefaults: { listAdvancedArgs: { select: Array(5_000).fill('adapter') } },
      },
    );
    const options = { modelName: 'Bounded', basePath: 'bounded' };
    expect(() =>
      adapter.createModelService(options, {
        readAdvancedArgs: { select: Array(5_000).fill('service') },
      }),
    ).toThrow(/node limit 10000/);
    expect(() =>
      adapter.createModelService(options, {
        listAdvancedArgs: { select: ['service'] },
      }),
    ).not.toThrow();
  });

  it.each(fixtures)('also bounds the per-request default clone: %s', (_name, make, message) => {
    expect(() => cloneServiceDefaultValue({ listOptions: { payload: make() } })).toThrow(message);
  });

  it('stops reading wide input at the budget before cloning or freezing', () => {
    const beyondBudget = vi.fn(() => {
      throw new Error('must not read distant sibling');
    });
    const input = Array(20_000).fill(0);
    Object.defineProperty(input, 15_000, { get: beyondBudget });
    expect(() => normalizeServiceDefaults({ input }, [])).toThrow(/node limit 10000/);
    expect(beyondBudget).not.toHaveBeenCalled();
    expect(Object.isFrozen(input)).toBe(false);
  });

  it('does not treat request-shaped defaults or frozen input as opaque', () => {
    const input = Object.freeze({ __op: 'read', __query: dag(14) });
    expect(() => normalizeServiceDefaults({ input }, [])).toThrow(/node limit 10000/);
  });

  it('detaches and freezes a valid DAG, including Dates, without freezing caller values', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    const shared = { date, values: [null, undefined, true, 'x', 1] };
    const input = { left: shared, right: shared, nullPrototype: Object.assign(Object.create(null), { ok: true }) };
    const stored = normalizeServiceDefaults(input, []);
    expect(stored.left).not.toBe(input.left);
    expect(stored.left).not.toBe(stored.right);
    expect(stored.left.date).not.toBe(date);
    expect(stored.left.date).not.toBe(stored.right.date);
    expect(Object.isFrozen(stored.left.values)).toBe(true);
    expect(Object.isFrozen(shared)).toBe(false);
    date.setTime(0);
    const request = cloneServiceDefaultValue(stored);
    expect(request.left.date.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    request.left.date.setTime(1);
    expect(cloneServiceDefaultValue(stored).left.date.toISOString()).toBe('2026-01-02T03:04:05.000Z');
  });

  it.each([
    [() => {}, 'function value'],
    [Symbol('x'), 'symbol value'],
    [1n, 'bigint value'],
    [NaN, 'non-finite numeric value'],
    [Infinity, 'non-finite numeric value'],
    [new Date(NaN), 'invalid Date'],
    [new Map(), 'non-plain object instance'],
    [new Set(), 'non-plain object instance'],
    [new URLSearchParams(), 'non-plain object instance'],
  ])('preserves unsupported-value grammar for %s', (value, reason) => {
    const run = () => normalizeServiceDefaults({ nested: [value] }, []);
    expect(run).toThrow(UnsupportedServiceDefaultValueError);
    expect(run).toThrow(`Service defaults do not support ${reason} at defaults.nested[0]`);
  });

  it.each(['object', 'array', 'mixed'])('rejects %s cycles with the default error and path', (kind) => {
    const object: Record<string, unknown> = {};
    const array: unknown[] = [];
    const value = kind === 'array' ? array : object;
    if (kind === 'object') object.self = object;
    else if (kind === 'array') array.push(array);
    else {
      object.self = array;
      array.push(object);
    }
    const path = kind === 'object' ? '.self' : kind === 'array' ? '[0]' : '.self[0]';
    expect(() => normalizeServiceDefaults({ value }, [])).toThrow(
      `Service defaults do not support circular value at defaults.value${path}`,
    );
    expect(() => cloneServiceDefaultValue(value)).toThrow(UnsupportedServiceDefaultValueError);
  });
});
