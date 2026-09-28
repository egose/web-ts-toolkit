import { describe, expect, it, vi } from 'vitest';
import { CorrelatedIncludeError, createAdapter, parentField } from '../src';
import { STARTED_KEY } from '../src/lazy-promise';
import { replaceSubQuery } from '../src/helpers';

function setup() {
  const dispatch = vi.fn(async (config) => {
    const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    return {
      data: Array.isArray(body)
        ? body.map(() => ({ result: { success: true, kind: 'single', data: 0 }, message: '', statusCode: 200 }))
        : 0,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  });
  const adapter = createAdapter({ baseURL: 'http://localhost', adapter: dispatch });
  const service = adapter.createModelService({ modelName: 'Item', basePath: 'items' });
  return { service, adapter, dispatch };
}

function shaped(value: unknown = { value: 1 }): Record<string, unknown> {
  return { __op: 'literal', __query: {}, value };
}

const invalid = [
  [
    'cycle',
    () => {
      const value = shaped();
      value.self = value;
      return value;
    },
    /cycle/i,
  ],
  [
    '65 edges',
    () => {
      let value: unknown = 1;
      for (let i = 0; i < 65; i++) value = { child: value };
      return shaped(value);
    },
    /depth.*64/i,
  ],
  ['10001 visits', () => shaped(Array(10_000).fill(1)), /node.*10000/i],
] as const;

function controlled(run: () => unknown, message: RegExp) {
  expect(run).toThrow(CorrelatedIncludeError);
  expect(run).toThrow(message);
}

describe('CLC-07-F01 literal and exposed-wire opacity', () => {
  for (const nested of [false, true]) {
    for (const route of ['advanced', 'list supplemental', 'count supplemental', 'helper'] as const) {
      it.each(invalid)(`${route}, nested=${nested}: bounds escaped request-shaped %s`, (_name, make, message) => {
        const { service, dispatch } = setup();
        const literal = make();
        const filter = { literal: { $escape: nested ? { values: [literal] } : literal } };
        controlled(() => {
          if (route === 'helper') return replaceSubQuery(filter as never);
          if (route === 'list supplemental') return service.list().$include('items', { filter: filter as never });
          if (route === 'count supplemental') return service.count().$include('total', { filter: filter as never });
          return service.listAdvanced(filter as never).$include('items');
        }, message);
        expect(dispatch).not.toHaveBeenCalled();
        expect(Object.isFrozen(literal)).toBe(false);
      });
    }
    it.each(invalid)(`bounds exposed request-shaped metadata, nested=${nested}: %s`, (_name, make, message) => {
      const { service, dispatch } = setup();
      const sub = service.countAdvanced({ active: true });
      const outer = service.listAdvanced({ id: parentField('_id'), count: sub } as never);
      const metadata = sub.__query as unknown as Record<string, unknown>;
      const value = make();
      if (nested) metadata.filter = { values: [value] };
      else {
        Object.assign(metadata, value);
        if (value.self === value) metadata.self = metadata;
      }
      controlled(() => outer.$include('items'), message);
      controlled(() => service.list().$include('items', { filter: { count: sub } as never }), message);
      controlled(() => service.count().$include('total', { filter: { count: sub } as never }), message);
      controlled(() => replaceSubQuery({ count: sub } as never), message);
      expect(dispatch).not.toHaveBeenCalled();
      expect(Object.isFrozen(sub)).toBe(false);
      expect(Object.isFrozen(metadata)).toBe(false);
      expect((sub as unknown as Record<symbol, unknown>)[STARTED_KEY]).toBe(false);
    });
  }

  it('detaches escaped request-shaped literals at capture and every conversion, including shared contexts', () => {
    const { service, dispatch } = setup();
    const shared = shaped({ $parent: '', values: [1] });
    type LiteralFilter = { literal: { $escape: { value: { $parent: string; values: number[] } } }; sub: unknown };
    // The same record has different meanings on these two paths.
    const request = service.listAdvanced({ sub: shared, literal: { $escape: shared } } as never);
    const first = request.$include('items').filter as LiteralFilter;
    expect(first.literal.$escape).toEqual(shared);
    expect(first.literal.$escape).not.toBe(shared);
    expect(first.sub).toEqual({ $$sq: {} });
    (shared.value as { values: number[] }).values.push(2);
    first.literal.$escape.value.values.push(3);
    const second = request.$include('items').filter as LiteralFilter;
    expect(second.literal.$escape.value).toEqual({ $parent: '', values: [1] });
    expect(Object.isFrozen(shared)).toBe(false);
    expect(Object.isFrozen(shared.value)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('detaches exposed request-shaped metadata and nested records on every conversion', () => {
    const { service, dispatch } = setup();
    const sub = service.countAdvanced({ active: true });
    const request = service.listAdvanced({ count: sub } as never);
    const metadata = sub.__query as unknown as Record<string, unknown>;
    type MetadataValue = { nested: { value: { values: number[] } } };
    type WireFilter = { count: { $$sq: { value: MetadataValue } } };
    Object.assign(metadata, shaped({ nested: shaped({ values: [1] }) }));
    const first = request.$include('items').filter as WireFilter;
    expect(first.count.$$sq).not.toBe(metadata);
    expect(first.count.$$sq.value).not.toBe(metadata.value);
    first.count.$$sq.value.nested.value.values.push(2);
    expect((request.$include('items').filter as WireFilter).count.$$sq.value.nested.value.values).toEqual([1]);
    (metadata.value as MetadataValue).nested.value.values.push(3);
    expect(first.count.$$sq.value.nested.value.values).toEqual([1, 2]);
    expect((request.$include('items').filter as WireFilter).count.$$sq.value.nested.value.values).toEqual([1, 3]);
    expect(Object.isFrozen(metadata.value)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('counts request-shaped exposed data together with effective args', () => {
    const { service, dispatch } = setup();
    const sub = service.countAdvanced({ active: true });
    const outer = service.listAdvanced({ count: sub } as never, { select: Array(5_000).fill('name') } as never);
    Object.assign(sub.__query, shaped(Array(5_000).fill(1)));
    controlled(() => outer.$include('items'), /node.*10000/i);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['direct', 'grouped'] as const)(
    'rejected conversion leaves actual nested requests and supplemental owners usable: %s',
    async (mode) => {
      const { service, adapter, dispatch } = setup();
      const inner = service.countAdvanced({ active: true });
      Object.assign(inner, { self: inner });
      const sub = service.listAdvanced({ count: inner } as never);
      const outer = service.count();
      const metadata = sub.__query as unknown as Record<string, unknown>;
      metadata.extra = shaped();
      (metadata.extra as Record<string, unknown>).self = metadata.extra;
      controlled(() => outer.$include('total', { filter: { count: sub } as never }), /cycle/i);
      delete metadata.extra;
      const wire = outer.$include('total', { filter: { count: sub } as never });
      expect(wire.filter).toMatchObject({ count: { $$sq: { filter: { count: { $$sq: { op: 'count' } } } } } });
      expect(dispatch).not.toHaveBeenCalled();
      for (const request of [inner, sub, outer]) {
        expect(Object.isFrozen(request)).toBe(false);
        expect((request as unknown as Record<symbol, unknown>)[STARTED_KEY]).toBe(false);
      }
      if (mode === 'direct') await expect(inner).resolves.toMatchObject({ success: true, data: 0 });
      else await expect(adapter.group(inner)).resolves.toMatchObject([{ success: true, data: 0 }]);
      await expect(outer).resolves.toMatchObject({ success: true, data: 0 });
      expect(dispatch).toHaveBeenCalledTimes(2);
    },
  );

  it('keeps actual requests and inert descriptors opaque inside escapes without interpreting their graphs', () => {
    const { service, dispatch } = setup();
    const sub = service.countAdvanced({ active: true });
    Object.assign(sub, { self: sub });
    const descriptor = service.read(parentField('itemId'));
    const filter = { request: { $escape: sub }, descriptor: { $escape: descriptor } };
    const result = service.listAdvanced(filter as never).$include('items').filter as typeof filter;
    expect(result.request.$escape).toBe(sub);
    expect(result.descriptor.$escape).toBe(descriptor);
    expect(Object.isFrozen(sub)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['escape', 'wire'] as const)(
    'accepts exactly 64 edges and 10000 visits in request-shaped %s data',
    (mode) => {
      const { service, dispatch } = setup();
      for (const limit of ['depth', 'nodes'] as const) {
        let value: unknown = 1;
        // filter -> literal -> $escape -> value: three edges. The metadata
        // path is filter -> count -> $$sq -> value, also three edges.
        if (limit === 'depth') for (let i = 0; i < 61; i++) value = { child: value };
        // Escaped graph: three containers + __op + __query + value array.
        // Wire graph additionally contains five original metadata values and
        // the active:true leaf beneath its filter container.
        else value = Array(mode === 'escape' ? 9_994 : 9_988).fill(1);
        const literal = shaped(value);
        if (mode === 'escape') {
          const input = { literal: { $escape: literal } };
          const first = service.listAdvanced(input as never).$include('items');
          expect(first.filter).toEqual(input);
          if (limit === 'nodes') (value as number[]).push(1);
          else literal.value = { child: value };
          controlled(() => service.listAdvanced(input as never), limit === 'nodes' ? /node.*10000/i : /depth.*64/i);
        } else {
          const sub = service.countAdvanced({ active: true });
          Object.assign(sub.__query, literal);
          const request = service.listAdvanced({ count: sub } as never);
          expect(request.$include('items').filter).toMatchObject({ count: { $$sq: literal } });
          if (limit === 'nodes') (value as number[]).push(1);
          else (sub.__query as unknown as Record<string, unknown>).value = { child: value };
          controlled(() => request.$include('items'), limit === 'nodes' ? /node.*10000/i : /depth.*64/i);
        }
      }
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it.each(['escape', 'wire'] as const)('expands shared DAG visits in request-shaped %s data', (mode) => {
    const { service, dispatch } = setup();
    for (const levels of [12, 14]) {
      let value: unknown = 1;
      for (let i = 0; i < levels; i++) value = { left: value, right: value };
      const literal = shaped(value);
      const sub = service.countAdvanced({ active: true });
      Object.assign(sub.__query, literal);
      const filter = mode === 'escape' ? { literal: { $escape: literal } } : { count: sub };
      const run = () => service.listAdvanced(filter as never).$include('items');
      if (levels === 12) expect(run).not.toThrow();
      else controlled(run, /node.*10000/i);
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not grant literal or wire opacity to copies of callable request properties', () => {
    const { service, dispatch } = setup();
    const sub = service.countAdvanced({ active: true });
    const fake = { ...sub, ...shaped() };
    Object.assign(fake, { self: fake });
    controlled(() => service.listAdvanced({ literal: { $escape: fake } } as never), /cycle/i);
    Object.assign(sub.__query, { extra: fake });
    controlled(() => service.listAdvanced({ count: sub } as never).$include('items'), /cycle/i);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
