import { describe, expect, it, vi } from 'vitest';
import { CorrelatedIncludeError, createAdapter, parentField } from '../src';
import { isCorrelatedIncludeDescriptor } from '../src/correlated-brand';
import { replaceSubQuery } from '../src/helpers';

// Contract values, deliberately independent of implementation constants.
const MAX_DEPTH = 64;
const MAX_NODES = 10_000;

function chain(depth: number): unknown {
  let value: unknown = 1;
  for (let i = 0; i < depth; i++) value = { nested: value };
  return value;
}

function dag(levels: number): unknown {
  let value: unknown = 1;
  for (let i = 0; i < levels; i++) value = { left: value, right: value };
  return value;
}

function wide(leaves: number): Record<string, unknown> {
  return Object.fromEntries(Array.from({ length: leaves }, (_, i) => [`field${i}`, i]));
}

const invalidInputs = [
  [
    'object cycle',
    () => {
      const value: Record<string, unknown> = {};
      value.self = value;
      return value;
    },
    /cycle/i,
  ],
  [
    'array cycle',
    () => {
      const value: unknown[] = [];
      value.push(value);
      return value;
    },
    /cycle/i,
  ],
  [
    'mixed cycle',
    () => {
      const value: Record<string, unknown> = {};
      value.items = [value];
      return value;
    },
    /cycle/i,
  ],
  ['deep stack overflow', () => chain(20_000), /depth.*64/i],
  ['depth boundary', () => chain(MAX_DEPTH + 1), /depth.*64/i],
  ['wide object', () => wide(MAX_NODES), /node.*10000/i],
  ['wide array', () => Array.from({ length: MAX_NODES }, () => 1), /node.*10000/i],
  // Only 14 distinct containers, but 32,767 visits when expanded.
  ['expanded DAG', () => dag(14), /node.*10000/i],
] as const;

function stub() {
  const dispatch = vi.fn(async (config) => {
    const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    return {
      data: Array.isArray(body)
        ? body.map(() => ({ result: { success: true, kind: 'single', data: 0 }, message: '', statusCode: 200 }))
        : config.url?.includes('/count')
          ? 0
          : [],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  });
  const adapter = createAdapter({ baseURL: 'http://localhost', adapter: dispatch });
  const service = adapter.createModelService({ modelName: 'Item', basePath: 'items' });
  return { adapter, service, dispatch };
}

function controlled(run: () => unknown, message: RegExp): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CorrelatedIncludeError);
  expect((caught as Error).message).toMatch(message);
}

describe('CLC-04 bounded filters and supplemental conversion', () => {
  for (const entry of [
    'listAdvanced',
    'countAdvanced',
    'readAdvancedFilter',
    'list supplemental',
    'count supplemental',
    'helper',
  ] as const) {
    it.each(invalidInputs)(`${entry}: rejects %s synchronously with zero HTTP`, (_name, input, message) => {
      const { service, dispatch } = stub();
      const value = input();
      controlled(() => {
        if (entry === 'helper') return replaceSubQuery(value as never);
        if (entry === 'list supplemental') return service.list().$include('items', { filter: value as never });
        if (entry === 'count supplemental') return service.count().$include('total', { filter: value as never });
        return service[entry](value as never);
      }, message);
      expect(dispatch).not.toHaveBeenCalled();
      expect(Object.isFrozen(value)).toBe(false);
    });
  }

  it.each([chain(MAX_DEPTH), wide(MAX_NODES - 1), dag(12)])(
    'accepts limit-adjacent filters and shared DAGs',
    (filter) => {
      const { service, dispatch } = stub();
      const request = service.listAdvanced(filter as never);
      const first = request.$include('items');
      const second = request.$include('items');
      expect(first.filter).toEqual(filter);
      expect(second.filter).toEqual(filter);
      expect(first.filter).not.toBe(second.filter);
      expect(replaceSubQuery(filter as never)).toEqual(filter);
      expect(dispatch).not.toHaveBeenCalled();
      expect(Object.isFrozen(filter)).toBe(false);
    },
  );

  it('counts array slots including holes and accepts an exact node budget', () => {
    const { service } = stub();
    // filter + $in container + array + 9,997 values = 10,000 visits.
    const filter = { id: { $in: Array.from({ length: MAX_NODES - 3 }, (_, i) => i) } };
    expect(service.listAdvanced(filter as never).$include('items').filter).toEqual(filter);
    controlled(() => service.listAdvanced({ id: { $in: new Array(MAX_NODES) } } as never), /node.*10000/i);
  });
});

describe('CLC-04 captured args and options', () => {
  for (const kind of ['args', 'options'] as const) {
    it.each(invalidInputs)(`rejects ${kind}: %s before clone/freeze`, (_name, input, message) => {
      const { service, dispatch } = stub();
      const value = { extra: input() };
      for (const reference of [false, true]) {
        const id = reference ? parentField('itemId') : 'item1';
        const filter = reference ? { id: parentField('_id') } : {};
        const args = kind === 'args' ? value : undefined;
        const options = kind === 'options' ? value : undefined;
        controlled(() => service.readAdvanced(id as never, args as never, options as never), message);
        controlled(() => service.listAdvanced(filter, args as never, options as never), message);
        controlled(() => service.readAdvancedFilter(filter, args as never, options as never), message);
        controlled(() => service.list(args as never, options as never), message);
        if (kind === 'options') controlled(() => service.read(id as never, options as never), message);
      }
      expect(dispatch).not.toHaveBeenCalled();
      expect(Object.isFrozen(value)).toBe(false);
      expect(Object.isFrozen(value.extra)).toBe(false);
    });
  }

  it('shares the capture work budget across filter, args and options', () => {
    const { service, dispatch } = stub();
    const filter = wide(5_000);
    const args = { extra: wide(5_000) };
    controlled(() => service.listAdvanced(filter as never, args as never), /node.*10000/i);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('detaches and freezes only owned snapshots at the capture boundary', () => {
    const { service, dispatch } = stub();
    const shared = { name: 1 };
    const args = { select: shared, sort: shared };
    const options = { extra: chain(MAX_DEPTH - 1) };
    const request = service.readAdvanced(parentField('itemId'), args as never, options as never);
    expect(isCorrelatedIncludeDescriptor(request)).toBe(true);
    expect(Object.isFrozen(request)).toBe(true);
    expect((request as unknown as { then?: unknown }).then).toBeUndefined();
    const first = request.$include('item');
    shared.name = 0;
    expect(first.args).toEqual({ select: { name: 1 }, sort: { name: 1 } });
    expect(request.$include('item').args).toEqual(first.args);
    expect(Object.isFrozen(args)).toBe(false);
    expect(Object.isFrozen(shared)).toBe(false);
    expect(Object.isFrozen(options.extra)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('bounds inherited args in aggregate with the converted filter', () => {
    const { adapter, dispatch } = stub();
    // CLC-04-F01 now rejects individually oversized defaults at construction.
    // Individually valid defaults still share the correlated conversion budget.
    const service = adapter.createModelService({ modelName: 'Item', basePath: 'items' }, {
      listAdvancedArgs: { select: wide(5_000) },
    } as never);
    const request = service.listAdvanced({ ...wide(5_000), id: parentField('_id') } as never);
    controlled(() => request.$include('items'), /node.*10000/i);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('CLC-04 escape and live subquery boundaries', () => {
  it.each(invalidInputs)('bounds escaped literal structure: %s', (_name, input, message) => {
    const { service, dispatch } = stub();
    controlled(() => service.listAdvanced({ literal: { $escape: input() } } as never), message);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('never interprets escaped markers, descriptors or request-shaped literal data', () => {
    const { service, dispatch } = stub();
    const literal = { $parent: '', extra: { __op: 'read', __query: { id: 'literal' } } };
    const descriptor = service.read(parentField('itemId'));
    const filter = { literal: { $escape: literal }, descriptor: { $escape: descriptor } };
    expect(replaceSubQuery(filter as never)).toEqual(filter);
    expect(service.listAdvanced(filter as never).$include('items').filter).toEqual(filter);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps live service/config graphs opaque and conversion transport-inert', async () => {
    const { service, adapter, dispatch } = stub();
    const sub = service.countAdvanced({ active: true });
    Object.assign(sub, { self: sub, huge: dag(30) });
    const request = service.listAdvanced({ id: parentField('_id'), count: sub } as never);
    const first = request.$include('items');
    expect(first.filter).toMatchObject({ count: { $$sq: { op: 'count', filter: { active: true } } } });
    expect(Object.isFrozen(sub)).toBe(false);
    expect(Object.isFrozen(sub.__query)).toBe(false);
    expect(replaceSubQuery(sub as never)).toMatchObject({ $$sq: { op: 'count' } });
    expect(replaceSubQuery({ values: [sub] } as never)).toMatchObject({ values: [{ $$sq: { op: 'count' } }] });
    expect(dispatch).not.toHaveBeenCalled();
    // Conversion claims neither the subquery nor the ordinary outer request.
    const outer = service.countAdvanced({ id: 'ordinary' });
    outer.$include('total');
    await expect(adapter.group(outer)).resolves.toMatchObject([{ success: true, data: 0 }]);
    await expect(sub).resolves.toMatchObject({ success: true, data: 0 });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each(invalidInputs)('checks exposed subquery metadata before cloning: %s', (_name, input, message) => {
    const { service, dispatch } = stub();
    const sub = service.countAdvanced({ active: true });
    const request = service.listAdvanced({ id: parentField('_id'), count: sub } as never);
    (sub.__query as unknown as Record<string, unknown>).filter = input();
    controlled(() => request.$include('items'), message);
    controlled(() => service.count().$include('total', { filter: { count: sub } as never }), message);
    expect(dispatch).not.toHaveBeenCalled();
    expect(Object.isFrozen(sub)).toBe(false);
  });

  it('aggregates expanded subquery metadata work rather than just counting request objects', () => {
    const { service, dispatch } = stub();
    const sub = service.countAdvanced(wide(2_000) as never);
    const request = service.listAdvanced({ id: parentField('_id'), a: sub, b: sub, c: sub, d: sub, e: sub } as never);
    controlled(() => request.$include('items'), /node.*10000/i);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['direct', 'grouped'] as const)(
    'a rejected supplemental conversion leaves the original request executable: %s',
    async (mode) => {
      const { service, adapter, dispatch } = stub();
      const request = service.count();
      controlled(() => request.$include('total', { filter: chain(65) as never }), /depth.*64/i);
      expect(dispatch).not.toHaveBeenCalled();
      if (mode === 'direct') await expect(request).resolves.toMatchObject({ success: true, data: 0 });
      else await expect(adapter.group(request)).resolves.toMatchObject([{ success: true, data: 0 }]);
      expect(dispatch).toHaveBeenCalledTimes(1);
    },
  );
});
