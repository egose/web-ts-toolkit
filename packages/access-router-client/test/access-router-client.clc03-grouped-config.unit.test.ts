import { describe, expect, it } from 'vitest';

import { createAdapter } from '../src/adapter';

function createGroupAdapter() {
  const dispatched: Array<{ method: string | undefined; query: string }> = [];
  const adapter = createAdapter({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      // Exercise Axios's actual query serializer, including duplicate-key order.
      const query = new URL(adapter.axios.getUri(config)).search.slice(1);
      dispatched.push({ method: config.method, query });
      const result = { success: true, kind: 'single', data: { _id: '1', query } };
      const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      return {
        data: Array.isArray(body) ? body.map(() => ({ result, statusCode: 200 })) : result.data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    },
  });
  const service = adapter.createModelService<{ _id: string; query: string }>({ modelName: 'User', basePath: 'users' });
  return { adapter, service, dispatched };
}

const iso = '2024-01-01T00:00:00.000Z';
const collisionCases: Array<{ name: string; params: [unknown, unknown] }> = [
  {
    name: 'reversed duplicate query values',
    params: [new URLSearchParams('mode=first&mode=second'), new URLSearchParams('mode=second&mode=first')],
  },
  {
    name: 'Date and plain Date tag',
    params: [{ at: new Date(iso) }, { at: { __type: 'Date', iso } }],
  },
  {
    name: 'Date and plain Date tag inside an array',
    params: [{ values: [new Date(iso)] }, { values: [{ __type: 'Date', iso }] }],
  },
  {
    name: 'URLSearchParams and plain URLSearchParams tag',
    params: [new URLSearchParams('mode=first'), { __type: 'URLSearchParams', entries: [['mode', 'first']] }],
  },
  {
    name: 'nested URLSearchParams and plain URLSearchParams tag',
    params: [
      { values: [new URLSearchParams('mode=first')] },
      { values: [{ __type: 'URLSearchParams', entries: [['mode', 'first']] }] },
    ],
  },
];

describe('CLC-03 grouped config transport equality', () => {
  for (const { name, params } of collisionCases) {
    it.each([false, true])(`rejects ${name} before claims/dispatch (reversed=%s)`, async (reversed) => {
      const { adapter, service, dispatched } = createGroupAdapter();
      const ordered = reversed ? [...params].reverse() : params;
      const expectedQueries = ordered.map((value) =>
        new URL(adapter.axios.getUri({ url: '/users', params: value })).search.slice(1),
      );
      expect(expectedQueries[0]).not.toBe(expectedQueries[1]);
      const first = service.readAdvanced('1', undefined, undefined, { params: ordered[0] });
      const second = service.readAdvanced('2', undefined, undefined, { params: ordered[1] });

      await expect(adapter.group(first, second)).rejects.toThrow(
        'Grouped requests must share the same axios request config',
      );
      expect(dispatched).toHaveLength(0);

      // Both original requests must still execute with their own transport query.
      const firstResult = await first;
      const secondResult = await second;
      expect(firstResult).toMatchObject({ success: true, data: { query: expectedQueries[0] } });
      expect(secondResult).toMatchObject({ success: true, data: { query: expectedQueries[1] } });
      expect(dispatched).toEqual(expectedQueries.map((query) => ({ method: 'post', query })));
    });
  }

  it.each([false, true])(
    'groups equal duplicate sequences across distinct-key reorder without mutation (%s)',
    async (reversed) => {
      const { adapter, service, dispatched } = createGroupAdapter();
      const params = [
        new URLSearchParams('z=last&mode=second&mode=first&a=start&mode=second'),
        new URLSearchParams('a=start&mode=second&z=last&mode=first&mode=second'),
      ];
      if (reversed) params.reverse();
      const before = params.map((value) => value.toString());
      const configs = params.map((value) => Object.freeze({ params: value }));

      const grouped = await adapter.group(
        service.read('1', undefined, configs[0]),
        service.read('2', undefined, configs[1]),
      );

      expect(grouped).toHaveLength(2);
      for (const result of grouped) {
        expect(result).toMatchObject({ success: true, data: { query: before[0] } });
      }
      expect(dispatched).toEqual([{ method: 'post', query: before[0] }]);
      expect(params.map((value) => value.toString())).toEqual(before);
      expect(params[0].getAll('mode')).toEqual(['second', 'first', 'second']);
    },
  );

  it('accepts equal ordinary tag-shaped data and shared acyclic references without mutation', async () => {
    const { adapter, service, dispatched } = createGroupAdapter();
    const dateTag = Object.freeze({ __type: 'Date', iso });
    const params = Object.freeze({
      tags: Object.freeze([dateTag, dateTag, { __type: 'URLSearchParams', entries: [['a', '1']] }]),
      envelope: Object.freeze({ __type: 'Object', entries: [['at', dateTag]] }),
    });
    const copy = JSON.parse(JSON.stringify(params)) as unknown;

    const grouped = await adapter.group(
      service.read('1', undefined, { params }),
      service.read('2', undefined, { params: copy }),
    );

    expect(grouped.every((result) => result.success)).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(params).toEqual(copy);
    expect(params.tags[0]).toBe(params.tags[1]);
  });

  it('releases earlier claims when a later request is already claimed', async () => {
    const { adapter, service, dispatched } = createGroupAdapter();
    const config = { params: new URLSearchParams('mode=second&mode=first') };
    const claimed = service.readAdvanced('1', undefined, undefined, config);
    await adapter.group(claimed);
    const fresh = service.readAdvanced('2', undefined, undefined, config);

    await expect(adapter.group(fresh, claimed)).rejects.toThrow(/already claimed/);
    expect(dispatched).toHaveLength(1);
    await expect(fresh).resolves.toMatchObject({ success: true, data: { query: config.params.toString() } });
    expect(dispatched.map(({ method }) => method)).toEqual(['post', 'post']);
  });

  it('releases a claim when the same request occurs twice in one batch', async () => {
    const { adapter, service, dispatched } = createGroupAdapter();
    const fresh = service.read('1', undefined, { params: { at: new Date(iso) } });

    await expect(adapter.group(fresh, fresh)).rejects.toThrow(/already claimed/);
    expect(dispatched).toHaveLength(0);
    await expect(fresh).resolves.toMatchObject({ success: true });
    expect(dispatched.map(({ method }) => method)).toEqual(['get']);
  });
});
