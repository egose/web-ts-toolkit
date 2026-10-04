import { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { CorrelatedIncludeError, createAdapter, parentField } from '../src';
import { CACHE_HEADER } from '../src/constants';
import type {
  AdditionalReqConfig,
  Defaults,
  ListModelResponse,
  ModelRequest,
  ModelResponse,
  ModelService,
} from '../src';

type Doc = { _id: string; name: string; secret: string };
type RequestConfig = AxiosRequestConfig & AdditionalReqConfig;
type ListRequest = ModelRequest<ListModelResponse<Doc>>;
type ReadRequest = ModelRequest<ModelResponse<Doc>>;
type UpdateRequest = ModelRequest<ModelResponse<Doc>>;

function fixture(defaults?: Defaults, fail = false) {
  const dispatched: Array<{ config: InternalAxiosRequestConfig; query: URLSearchParams; body: unknown }> = [];
  const onSuccess = vi.fn();
  const onFailure = vi.fn();
  const doc: Doc = { _id: '1', name: 'alpha', secret: 's1' };
  const adapter = createAdapter({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      const query = new URL(adapter.axios.getUri(config)).searchParams;
      const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      dispatched.push({ config, query, body });
      const grouped = config.url === 'root' && Array.isArray(body);
      const response = {
        data: grouped
          ? body.map((entry: { op: string }) => ({
              result:
                entry.op === 'list'
                  ? { success: true, kind: 'list', data: [doc], count: 1, totalCount: 7 }
                  : { success: true, kind: 'single', data: doc },
              statusCode: 200,
              message: 'Success',
            }))
          : config.url === 'users'
            ? { data: [doc], meta: { totalCount: 7 } }
            : doc,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
      if (fail) {
        throw new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, undefined, {
          ...response,
          status: 403,
          data: { title: 'Forbidden' },
        });
      }
      return response;
    },
  });
  const model = adapter.createModelService<Doc>(
    { modelName: 'User', basePath: 'users', onSuccess, onFailure },
    defaults,
  );
  return { adapter, model, dispatched, onSuccess, onFailure };
}

const listForms: Array<{
  name: string;
  call: (model: ModelService<Doc>, config: RequestConfig) => ListRequest;
  includeCount: boolean;
}> = [
  {
    name: 'options and config',
    call: (model, config) => model.list({ includeCount: true }, config),
    includeCount: true,
  },
  {
    name: 'undefined args',
    call: (model, config) => model.list(undefined, { includeCount: true }, config),
    includeCount: true,
  },
  { name: 'empty args', call: (model, config) => model.list({}, { includeCount: true }, config), includeCount: true },
  { name: 'empty args and options', call: (model, config) => model.list({}, {}, config), includeCount: false },
  {
    name: 'undefined args and options',
    call: (model, config) => model.list(undefined, undefined, config),
    includeCount: false,
  },
  { name: 'empty shorthand options', call: (model, config) => model.list({}, config), includeCount: false },
  { name: 'undefined shorthand options', call: (model, config) => model.list(undefined, config), includeCount: false },
];

const readForms: Array<{
  name: string;
  call: (model: ModelService<Doc>, config: RequestConfig) => ReadRequest;
  tryList: boolean;
}> = [
  {
    name: 'legacy options and config',
    call: (model, config) => model.read('1', { tryList: false }, config),
    tryList: false,
  },
  {
    name: 'undefined args',
    call: (model, config) => model.read('1', undefined, { tryList: false }, config),
    tryList: false,
  },
  { name: 'empty args', call: (model, config) => model.read('1', {}, { tryList: false }, config), tryList: false },
  { name: 'empty args and options', call: (model, config) => model.read('1', {}, {}, config), tryList: true },
  {
    name: 'undefined args and options',
    call: (model, config) => model.read('1', undefined, undefined, config),
    tryList: true,
  },
  { name: 'empty legacy options', call: (model, config) => model.read('1', {}, config), tryList: true },
  { name: 'undefined legacy options', call: (model, config) => model.read('1', undefined, config), tryList: true },
];

const updateForms: Array<{
  name: string;
  call: (model: ModelService<Doc>, config: RequestConfig) => UpdateRequest;
  returningAll: boolean;
}> = [
  {
    name: 'legacy options and config',
    call: (model, config) => model.update('1', { name: 'beta' }, { returningAll: false }, config),
    returningAll: false,
  },
  {
    name: 'undefined args',
    call: (model, config) => model.update('1', { name: 'beta' }, undefined, { returningAll: false }, config),
    returningAll: false,
  },
  {
    name: 'empty args',
    call: (model, config) => model.update('1', { name: 'beta' }, {}, { returningAll: false }, config),
    returningAll: false,
  },
  {
    name: 'empty args and options',
    call: (model, config) => model.update('1', { name: 'beta' }, {}, {}, config),
    returningAll: true,
  },
  {
    name: 'undefined args and options',
    call: (model, config) => model.update('1', { name: 'beta' }, undefined, undefined, config),
    returningAll: true,
  },
  {
    name: 'empty legacy options',
    call: (model, config) => model.update('1', { name: 'beta' }, {}, config),
    returningAll: true,
  },
  {
    name: 'undefined legacy options',
    call: (model, config) => model.update('1', { name: 'beta' }, undefined, config),
    returningAll: true,
  },
];

describe('basic model args/options overloads', () => {
  it.each(listForms)('list retains config and defaults with $name', async ({ call, includeCount }) => {
    const { model, dispatched, onSuccess } = fixture({ listArgs: { select: ['name'], limit: 4 } });
    const config = Object.freeze({ timeout: 1234, headers: Object.freeze({ 'X-Caller': 'list' }) });
    const request = call(model, config);
    expect(dispatched).toHaveLength(0);
    expect(request.__query.args).toMatchObject({ select: ['name'], limit: 4 });
    expect(request.__query.options).toMatchObject({ includeCount });
    const result = await request.exec();
    expect(result.success).toBe(true);
    expect(result.totalCount).toBe(includeCount ? 7 : 0);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].query.get('select')).toBe('name');
    expect(dispatched[0].query.get('include_count')).toBe(String(includeCount));
    expect(dispatched[0].config.timeout).toBe(1234);
    expect(dispatched[0].config.headers.get('X-Caller')).toBe('list');
    expect(config).toEqual({ timeout: 1234, headers: { 'X-Caller': 'list' } });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it.each(readForms)('read retains config and defaults with $name', async ({ call, tryList }) => {
    const { model, dispatched, onSuccess } = fixture({ readArgs: { select: ['name'] } });
    const config = Object.freeze({ timeout: 2345, headers: Object.freeze({ 'X-Caller': 'read' }) });
    const request = call(model, config);
    expect(dispatched).toHaveLength(0);
    expect(request.__query.args).toEqual({ select: ['name'] });
    expect(request.__query.options).toMatchObject({ tryList });
    const result = await request.exec();
    expect(result.success).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].query.get('select')).toBe('name');
    expect(dispatched[0].query.get('try_list')).toBe(String(tryList));
    expect(dispatched[0].config.timeout).toBe(2345);
    expect(dispatched[0].config.headers.get('X-Caller')).toBe('read');
    expect(config).toEqual({ timeout: 2345, headers: { 'X-Caller': 'read' } });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it.each(updateForms)('update retains config and defaults with $name', async ({ call, returningAll }) => {
    const { model, dispatched, onSuccess } = fixture({ updateArgs: { select: ['name'] } });
    const config = Object.freeze({ timeout: 3456, headers: Object.freeze({ 'X-Caller': 'update' }) });
    const request = call(model, config);
    expect(dispatched).toHaveLength(0);
    expect(request.__query.args).toEqual({ select: ['name'] });
    expect(request.__query.options).toMatchObject({ returningAll });
    const result = await request.exec();
    expect(result.success).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].query.get('select')).toBe('name');
    expect(dispatched[0].query.get('returning_all')).toBe(String(returningAll));
    expect(dispatched[0].config.timeout).toBe(3456);
    expect(dispatched[0].config.headers.get('X-Caller')).toBe('update');
    expect(config).toEqual({ timeout: 3456, headers: { 'X-Caller': 'update' } });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('list accepts options alone and preserves false options and zero args', async () => {
    const { model, dispatched } = fixture({
      listArgs: { limit: 5, page: 2, skip: 1 },
      listOptions: { skim: true, includeCount: true, includePermissions: true, ignoreCache: false },
    });
    const options = Object.freeze({ skim: false, includeCount: false, includePermissions: false, ignoreCache: true });
    await model.list(options);
    expect(dispatched[0].query.get('limit')).toBe('5');
    expect(dispatched[0].query.get('skim')).toBe('false');
    expect(dispatched[0].query.get('include_count')).toBe('false');
    expect(dispatched[0].query.get('include_permissions')).toBe('false');
    expect(dispatched[0].config.headers.get(CACHE_HEADER)).toBe('false');

    const args = Object.freeze({ limit: 0, page: 0, skip: 0 });
    await model.list(args, options);
    expect(dispatched[1].query.get('limit')).toBe('0');
    expect(dispatched[1].query.get('page')).toBe('0');
    expect(dispatched[1].query.get('skip')).toBe('0');
    expect(args).toEqual({ limit: 0, page: 0, skip: 0 });
  });

  it('recognizes undefined-valued args/options keys without moving them into config', async () => {
    const { model, dispatched } = fixture({
      listArgs: { select: ['name'], limit: 3 },
      readArgs: { select: ['name'] },
      readOptions: { tryList: false },
    });
    const list = model.list({ limit: undefined }, { includeCount: undefined });
    const read = model.read('1', { select: undefined }, { tryList: undefined });
    expect(list.__requestConfig).not.toHaveProperty('includeCount');
    expect(read.__requestConfig).not.toHaveProperty('tryList');
    await list;
    await read;
    expect(dispatched[0].query.get('limit')).toBe('3');
    expect(dispatched[1].query.get('select')).toBe('name');
    expect(dispatched[1].query.get('try_list')).toBe('false');
  });

  it('retains unknown-key options in their original slot and enforces capture bounds', () => {
    const { model, dispatched } = fixture();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const options = { extension: cyclic };
    expect(() => model.list(undefined, options as never)).toThrow(CorrelatedIncludeError);
    expect(() => model.read('1', options as never)).toThrow(CorrelatedIncludeError);
    expect(Object.isFrozen(options)).toBe(false);
    expect(Object.isFrozen(cyclic)).toBe(false);
    expect(dispatched).toHaveLength(0);
  });

  it('preserves the empty-object interpretation and explicit final undefined position', async () => {
    const { model, dispatched } = fixture();
    const list = model.list({}, {});
    const read = model.read('1', {}, {});
    expect(list.__requestConfig).toEqual({ headers: expect.anything() });
    expect(read.__requestConfig).toEqual({ headers: expect.anything() });
    const fullList = model.list({}, {}, undefined);
    const fullRead = model.read('1', {}, {}, undefined);
    expect(fullList.__requestConfig).toEqual({ headers: expect.anything() });
    expect(fullRead.__requestConfig).toEqual({ headers: expect.anything() });
    await fullList;
    await fullRead;
    expect(dispatched).toHaveLength(2);
  });

  it('keeps caller URLSearchParams and headers immutable in the shorthand', async () => {
    const { model, dispatched } = fixture();
    const params = new URLSearchParams('mode=second&mode=first&include_count=caller');
    const before = params.toString();
    const headers = Object.freeze({ 'X-Caller': 'unchanged' });
    const config = Object.freeze({ params, headers, timeout: 3456 });
    const options = Object.freeze({ includeCount: true });
    await model.list(options, config);
    expect(dispatched[0].query.getAll('mode')).toEqual(['second', 'first']);
    expect(dispatched[0].query.getAll('include_count')).toEqual(['true']);
    expect(dispatched[0].config.params).toBeInstanceOf(URLSearchParams);
    expect(dispatched[0].config.params).not.toBe(params);
    expect(params.toString()).toBe(before);
    expect(config.params).toBe(params);
    expect(config.headers).toBe(headers);
    expect(options).toEqual({ includeCount: true });
  });

  it('uses resolved shorthand options in grouped entries and invokes callbacks once per entry', async () => {
    const { adapter, model, dispatched, onSuccess } = fixture({ listArgs: { select: ['name'], limit: 2 } });
    const shorthand = model.list({ includeCount: true });
    const full = model.list(undefined, { includeCount: true });
    const read = model.read('1', { select: ['name'] }, { tryList: false });
    expect(shorthand.__query).toEqual(full.__query);
    const results = await adapter.group(shorthand, full, read);
    expect(results.every((result) => result.success)).toBe(true);
    expect(results[0].totalCount).toBe(7);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].body).toMatchObject([
      { op: 'list', args: { select: ['name'], limit: 2 }, options: { includeCount: true } },
      { op: 'list', args: { select: ['name'], limit: 2 }, options: { includeCount: true } },
      { op: 'read', id: '1', args: { select: ['name'] }, options: { tryList: false } },
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(3);
  });

  it('retains subquery options and honors throwOnError config in the shorthand', async () => {
    const { model, dispatched, onFailure } = fixture(undefined, true);
    const sq = Object.freeze({ path: 'name', compact: true });
    const request = model.list({ sq }, { throwOnError: true });
    expect(request.__query.sqOptions).toEqual(sq);
    expect(request.__throwOnError).toBe(true);
    await expect(request).rejects.toMatchObject({ name: 'ServiceError' });
    expect(dispatched).toHaveLength(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('forwards default args into correlated payloads after resolving the call form', () => {
    const { model, dispatched } = fixture({
      listArgs: { select: ['name'], limit: 2 },
      readArgs: { select: ['name'] },
      listOptions: { includeCount: true },
    });
    const supplemental = { filter: { _id: parentField('userId') } };
    const shortList = model.list({}).$include('users', supplemental);
    const fullList = model.list(undefined, {}).$include('users', supplemental);
    expect(shortList).toEqual(fullList);
    expect(shortList.args).toMatchObject({ select: ['name'], limit: 2 });
    const ref = parentField('userId');
    const shortRead = model.read(ref, {}).$include('user');
    const fullRead = model.read(ref, {}, {}).$include('user');
    expect(shortRead).toEqual(fullRead);
    expect(shortRead.args).toEqual({ select: ['name'] });
    expect(dispatched).toHaveLength(0);
    expect(() => model.list({ includeCount: false }).$include('users', supplemental)).toThrow(/execution-only/);
  });

  it('keeps reference-bearing reads transport-inert and rejects transport config in all forms', () => {
    const { model, dispatched } = fixture();
    const ref = parentField('userId');
    expect(model.read(ref, { select: ['name'] }).$include('user').args).toEqual({ select: ['name'] });
    expect(() => model.read(ref, {}, {}, { timeout: 100 })).toThrow(/transport config/);
    expect(() => model.read(ref, {}, { timeout: 100 })).toThrow(/transport config/);
    expect(dispatched).toHaveLength(0);
  });

  it('rejects mixed args/options objects before dispatch', () => {
    const { model, dispatched } = fixture();
    expect(() => model.list({ select: ['name'], includeCount: true } as never)).toThrow(
      "'includeCount' belongs in options",
    );
    expect(() => model.list({ limit: 0, skim: false } as never)).toThrow("'skim' belongs in options");
    expect(() => model.read('1', { select: undefined, tryList: false } as never)).toThrow(
      "'tryList' belongs in options",
    );
    expect(() => model.update('1', { name: 'beta' }, { select: ['name'], returningAll: false } as never)).toThrow(
      "'returningAll' belongs in options",
    );
    expect(dispatched).toHaveLength(0);
  });
});
