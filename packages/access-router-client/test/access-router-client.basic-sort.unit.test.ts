import { type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import { createAdapter, parentField } from '../src';
import type { Defaults, Sort } from '../src';
import { serializeSortParam } from '../src/services/shared';

type Doc = { _id: string; name: string; age: number };

const sortCases: Array<{ name: string; sort: Sort; wire: string }> = [
  { name: 'ascending string', sort: 'name', wire: 'name' },
  { name: 'descending string', sort: '-age', wire: '-age' },
  { name: 'multi-field string', sort: 'name -age', wire: 'name -age' },
  { name: 'numeric object', sort: { name: 1, age: -1 }, wire: 'name -age' },
  { name: 'alias object', sort: { age: 'descending', name: 'ascending' }, wire: '-age name' },
  {
    name: 'ordered tuples',
    sort: [
      ['age', 'desc'],
      ['name', 'asc'],
    ],
    wire: '-age name',
  },
  { name: 'dotted field', sort: { 'profile.rank': -1 }, wire: '-profile.rank' },
];

function fixture(defaults?: Defaults) {
  const dispatched: Array<{ config: InternalAxiosRequestConfig; query: URLSearchParams; body: unknown }> = [];
  const adapter = createAdapter({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      const query = new URL(adapter.axios.getUri(config)).searchParams;
      const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      dispatched.push({ config, query, body });
      const doc = { _id: '1', name: 'alpha', age: 2 };
      return {
        data:
          config.url === 'root' && Array.isArray(body)
            ? body.map(() => ({
                result: { success: true, kind: 'list', data: [doc], count: 1, totalCount: 1 },
                statusCode: 200,
                message: 'Success',
              }))
            : { data: [doc], meta: { totalCount: 1 } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    },
  });
  const model = adapter.createModelService<Doc>({ modelName: 'User', basePath: 'users' }, defaults);
  return { adapter, model, dispatched };
}

describe('basic model list sort', () => {
  it.each(sortCases)('serializes $name as one signed-field GET param and retains metadata', async ({ sort, wire }) => {
    const { model, dispatched } = fixture();
    const request = model.list({ sort });
    expect(dispatched).toHaveLength(0);
    expect(request.__query.args?.sort).toEqual(sort);
    const result = await request;
    expect(result.success).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].config.method).toBe('get');
    expect(dispatched[0].query.getAll('sort')).toEqual([wire]);
    expect(request.__query.args?.sort).toEqual(sort);
  });

  it('omits an unspecified sort from GET and correlated payloads', async () => {
    const { model, dispatched } = fixture();
    const request = model.list();
    expect(request.$include('users', { filter: { name: 'alpha' } }).args?.sort).toBeUndefined();
    await request;
    expect(dispatched[0].query.has('sort')).toBe(false);
  });

  it('applies adapter/service sort defaults with per-call precedence even in options-only calls', async () => {
    const { adapter, dispatched } = fixture();
    const model = adapter.createModelService<Doc>(
      { modelName: 'User', basePath: 'users' },
      { listArgs: { sort: { name: 'descending' } } },
    );
    await model.list({ includeCount: true });
    expect(dispatched[0].query.get('sort')).toBe('-name');
    await model.list({ sort: [['age', 1]] }, { includeCount: true });
    expect(dispatched[1].query.get('sort')).toBe('age');

    const inheritedAdapter = createAdapter(
      { baseURL: 'http://localhost' },
      {
        modelDefaults: { listArgs: { sort: '-age' } },
      },
    );
    const inherited = inheritedAdapter.createModelService<Doc>({ modelName: 'User', basePath: 'users' });
    expect(inherited.list({ includeCount: true }).__query.args?.sort).toBe('-age');
    const overridden = inheritedAdapter.createModelService<Doc>(
      { modelName: 'User', basePath: 'users' },
      { listArgs: { sort: 'name' } },
    );
    expect(overridden.list().$include('users', { filter: { name: 'alpha' } }).args?.sort).toBe('name');
  });

  it.each(['', [], {}] as Sort[])('sends explicit empty sort %j to override backend defaults', async (sort) => {
    const { model, dispatched } = fixture({ listArgs: { sort: '-name' } });
    const request = model.list({ sort });
    expect(request.__query.args?.sort).toEqual(sort);
    await request;
    expect(dispatched[0].query.has('sort')).toBe(true);
    expect(dispatched[0].query.get('sort')).toBe('');
  });

  it('keeps caller configs and sort objects immutable with generated query precedence', async () => {
    const { model, dispatched } = fixture();
    const sort = Object.freeze({ age: -1 as const, name: 1 as const });
    const params = new URLSearchParams('sort=caller&mode=second&sort=other&mode=first');
    const before = params.toString();
    const config = Object.freeze({ params, timeout: 1234 });
    await model.list({ select: ['name'], sort, limit: 5 }, { includeCount: true }, config);
    expect(dispatched[0].query.getAll('sort')).toEqual(['-age name']);
    expect(dispatched[0].query.getAll('mode')).toEqual(['second', 'first']);
    expect(dispatched[0].query.get('select')).toBe('name');
    expect(dispatched[0].query.get('limit')).toBe('5');
    expect(dispatched[0].config.timeout).toBe(1234);
    expect(params.toString()).toBe(before);
    expect(sort).toEqual({ age: -1, name: 1 });
  });

  it('keeps original sort forms in grouped entries instead of the GET string', async () => {
    const { adapter, model, dispatched } = fixture();
    const objectSort: Sort = { age: 'desc', name: 'asc' };
    const tupleSort: Sort = [
      ['name', -1],
      ['age', 1],
    ];
    const results = await adapter.group(model.list({ sort: objectSort }), model.list({ sort: tupleSort }));
    expect(results.every((result) => result.success)).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].body).toMatchObject([{ args: { sort: objectSort } }, { args: { sort: tupleSort } }]);
    expect(dispatched[0].query.has('sort')).toBe(false);
  });

  it('forwards explicit and default sorts into detached correlated includes', () => {
    const sort: Sort = { age: 'desc', name: 'asc' };
    const { model, dispatched } = fixture({ listArgs: { sort: '-name' } });
    const filter = { _id: parentField('userId') };
    const request = model.list({ sort, limit: 2 });
    const first = request.$include('users', { filter });
    sort.age = 1;
    expect(first.args).toEqual({ sort: { age: 'desc', name: 'asc' }, limit: 2 });
    expect(request.$include('users', { filter }).args).toEqual(first.args);
    expect(first.args?.sort).not.toBe(sort);
    expect(model.list({}).$include('users', { filter }).args?.sort).toBe('-name');
    expect(dispatched).toHaveLength(0);
  });

  it('detaches configured sort defaults from input changes and per-request metadata', () => {
    const sort: Sort = { name: -1 };
    const { model } = fixture({ listArgs: { sort } });
    sort.name = 1;
    const first = model.list();
    const second = model.list();
    expect(first.__query.args?.sort).toEqual({ name: -1 });
    expect(first.__query.args?.sort).not.toBe(second.__query.args?.sort);
    (first.__query.args?.sort as { name: number }).name = 1;
    expect(second.__query.args?.sort).toEqual({ name: -1 });
  });

  it('does not mistake a sort-only argument for execution options', async () => {
    const { model, dispatched } = fixture();
    await model.list({ sort: '-name' }, { includeCount: false });
    expect(dispatched[0].query.get('sort')).toBe('-name');
    expect(dispatched[0].query.get('include_count')).toBe('false');
    expect(() => model.list({ sort: '-name', includeCount: true } as never)).toThrow(
      "'includeCount' belongs in options",
    );
  });

  it.each([
    [{ name: 'sideways' }, /Invalid sort order/],
    [[['name']], /Invalid sort entry/],
    [{ '-name': 1 }, /Invalid sort field/],
    [{ 'name age': -1 }, /Invalid sort field/],
  ])('rejects malformed non-string sorts rather than silently rewriting them: %j', (sort, message) => {
    expect(() => serializeSortParam(sort as Sort)).toThrow(message as RegExp);
  });

  it('omits nullish sort values and preserves the explicit empty string', () => {
    expect(serializeSortParam(undefined)).toBeUndefined();
    expect(serializeSortParam(null)).toBeUndefined();
    expect(serializeSortParam('')).toBe('');
  });
});
