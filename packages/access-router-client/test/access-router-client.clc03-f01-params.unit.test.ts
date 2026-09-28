import { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapter';

function fixture(list = false) {
  const dispatched: Array<{ config: InternalAxiosRequestConfig; query: URLSearchParams; body: unknown }> = [];
  const adapter = createAdapter({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      const query = new URL(adapter.axios.getUri(config)).searchParams;
      const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      dispatched.push({ config, query, body });
      const doc = { _id: '1', query: query.toString() };
      const grouped = config.url === 'root';
      return {
        data:
          grouped && Array.isArray(body)
            ? body.map(() => ({ result: { success: true, kind: 'single', data: doc }, statusCode: 200 }))
            : list
              ? [doc]
              : doc,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    },
  });
  const model = adapter.createModelService<{ _id: string; query: string; children: { _id: string; value: string }[] }>({
    modelName: 'User',
    basePath: 'users',
  });
  const data = adapter.createDataService<{ _id: string; query: string }>({ dataName: 'Data', basePath: 'data' });
  const sub = model.id('1').subs('children');
  return { adapter, model, data, sub, dispatched };
}

type Context = ReturnType<typeof fixture>;
const cases: Array<{
  name: string;
  list?: boolean;
  run: (ctx: Context, config: AxiosRequestConfig) => PromiseLike<{ success: boolean }>;
  generated: Record<string, string | undefined>;
}> = [
  {
    name: 'model read',
    run: ({ model }, c) => model.read('1', undefined, c),
    generated: { include_permissions: 'true', try_list: 'true' },
  },
  {
    name: 'model list',
    list: true,
    run: ({ model }, c) => model.list({ limit: 0 }, { skim: false }, c),
    generated: {
      skip: undefined,
      limit: '0',
      page: undefined,
      page_size: undefined,
      skim: 'false',
      include_permissions: 'false',
      include_count: 'false',
      include_extra_headers: 'false',
    },
  },
  {
    name: 'model create',
    run: ({ model }, c) => model.create({ query: 'created' }, { includePermissions: false }, c),
    generated: { include_permissions: 'false' },
  },
  {
    name: 'model upsert',
    run: ({ model }, c) => model.upsert({ query: 'upserted' }, { returningAll: false }, c),
    generated: { returning_all: 'false', include_permissions: 'true' },
  },
  {
    name: 'model update',
    run: ({ model }, c) => model.update('1', { query: 'updated' }, { includePermissions: false }, c),
    generated: { returning_all: 'true', include_permissions: 'false' },
  },
  {
    name: 'data list',
    list: true,
    run: ({ data }, c) => data.list({ page: 0 }, { includeCount: true }, c),
    generated: {
      skip: undefined,
      limit: undefined,
      page: '0',
      page_size: undefined,
      include_count: 'true',
      include_extra_headers: 'false',
    },
  },
  { name: 'subdocument list', list: true, run: ({ sub }, c) => sub.list(c), generated: {} },
  { name: 'subdocument read', run: ({ sub }, c) => sub.read('child', c), generated: {} },
  { name: 'subdocument update', run: ({ sub }, c) => sub.update('child', { value: 'new' }, c), generated: {} },
  {
    name: 'subdocument bulk update',
    list: true,
    run: ({ sub }, c) => sub.bulkUpdate([{ _id: 'child', value: 'new' }], c),
    generated: {},
  },
  { name: 'subdocument create', list: true, run: ({ sub }, c) => sub.create({ value: 'new' }, c), generated: {} },
];

describe('CLC-03-F01 generated service params', () => {
  it('preserves the exact basic-read reproduction at Axios dispatch', async () => {
    const { model, dispatched } = fixture();
    const params = new URLSearchParams('mode=second&mode=first');
    const result = await model.read('1', undefined, { params });
    expect(result).toMatchObject({
      success: true,
      data: { query: 'mode=second&mode=first&include_permissions=true&try_list=true' },
    });
    expect(dispatched).toHaveLength(1);
    expect(params.toString()).toBe('mode=second&mode=first');
  });

  for (const { name, list, run, generated } of cases) {
    it.each(['search', 'object'] as const)(
      `${name} preserves caller params and generated precedence (%s)`,
      async (kind) => {
        const ctx = fixture(list);
        const caller = new URLSearchParams('mode=second&other=a+b&mode=first&empty=&mode=second');
        for (const key of Object.keys(generated)) {
          caller.append(key, 'caller-first');
          caller.append(key, 'caller-last');
        }
        const params =
          kind === 'search'
            ? caller
            : Object.freeze({
                mode: Object.freeze(['second', 'first', 'second']),
                other: 'a b',
                empty: '',
                ...Object.fromEntries(Object.keys(generated).map((key) => [key, 'caller'])),
              });
        const before = caller.toString();
        const headers = Object.freeze({ 'X-Caller': 'unchanged' });
        const config = Object.freeze({ params, headers, timeout: 1234 });
        const request = run(ctx, config);
        expect(ctx.dispatched).toHaveLength(0);
        expect((await request).success).toBe(true);
        expect(ctx.dispatched).toHaveLength(1);
        const sent = ctx.dispatched[0];
        expect(sent.query.getAll(kind === 'search' ? 'mode' : 'mode[]')).toEqual(['second', 'first', 'second']);
        expect(sent.query.get('other')).toBe('a b');
        expect(sent.query.get('empty')).toBe('');
        for (const [key, value] of Object.entries(generated)) {
          expect(sent.query.getAll(key), key).toEqual(value === undefined ? [] : [value]);
        }
        if (kind === 'search') {
          expect(Array.from(sent.query).filter(([key]) => !Object.hasOwn(generated, key))).toEqual(
            Array.from(caller).filter(([key]) => !Object.hasOwn(generated, key)),
          );
          expect(sent.config.params).toBeInstanceOf(URLSearchParams);
          expect(sent.config.params).not.toBe(params);
        }
        expect(sent.config.timeout).toBe(1234);
        expect(sent.config.headers.get('X-Caller')).toBe('unchanged');
        expect(config.params).toBe(params);
        expect(config.headers).toBe(headers);
        expect(headers).toEqual({ 'X-Caller': 'unchanged' });
        expect(caller.toString()).toBe(before);
      },
    );
  }

  it('passes detached ordered params to a caller serializer and honors explicit false options', async () => {
    const { model, dispatched } = fixture();
    const params = new URLSearchParams('mode=second&include_permissions=true&mode=first&try_list=true&try_list=true');
    const before = params.toString();
    const seen: unknown[] = [];
    const serialize = (value: URLSearchParams) => {
      seen.push(value);
      return value.toString();
    };
    await model.read('1', { includePermissions: false, tryList: false }, { params, paramsSerializer: { serialize } });
    expect(dispatched[0].query.getAll('mode')).toEqual(['second', 'first']);
    expect(dispatched[0].query.getAll('include_permissions')).toEqual(['false']);
    expect(dispatched[0].query.getAll('try_list')).toEqual(['false']);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(URLSearchParams);
    expect(seen[0]).not.toBe(params);
    expect(params.toString()).toBe(before);
  });

  it('groups caller params once and retains independent per-entry generated options in the body', async () => {
    const { adapter, model, dispatched } = fixture();
    const params = new URLSearchParams('mode=second&include_permissions=caller&mode=first');
    const before = params.toString();
    const results = await adapter.group(
      model.read('1', { includePermissions: false, tryList: false }, { params }),
      model.read('2', undefined, { params: new URLSearchParams(before) }),
    );
    expect(results.every((result) => result.success)).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].query.toString()).toBe(before);
    expect(dispatched[0].body).toMatchObject([
      { id: '1', options: { includePermissions: false, tryList: false } },
      { id: '2', options: { includePermissions: true, tryList: true } },
    ]);
    expect(params.toString()).toBe(before);
  });

  it('rejects reversed duplicates before claiming and preserves params on subsequent direct basic reads', async () => {
    const { adapter, model, dispatched } = fixture();
    const params = [new URLSearchParams('mode=second&mode=first'), new URLSearchParams('mode=first&mode=second')];
    const requests = params.map((value, index) => model.read(String(index), undefined, { params: value }));
    await expect(adapter.group(...requests)).rejects.toThrow(
      'Grouped requests must share the same axios request config',
    );
    expect(dispatched).toHaveLength(0);
    for (let index = 0; index < requests.length; index++) {
      expect((await requests[index]).success).toBe(true);
      expect(dispatched[index].query.getAll('mode')).toEqual(params[index].getAll('mode'));
      expect(dispatched[index].query.getAll('include_permissions')).toEqual(['true']);
    }
    expect(dispatched).toHaveLength(2);
  });
});
