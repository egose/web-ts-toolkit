import { describe, expect, it } from 'vitest';

import { createAdapter, CustomHeaders } from '../src';
import { CACHE_HEADER } from '../src/constants';
import { setupIntegrationSuite, type Pet } from './support/integration-suite';

const suite = setupIntegrationSuite();
const { endpoints, services } = suite;

describe('access-router-client data-service and wrap integration', () => {
  it('supports data services, advanced reads, and custom wrapped endpoints', async () => {
    const list = await services.petService.list({ limit: 2 }, { includeCount: true }, { headers: { user: 'admin' } });
    expect(list.success).toBe(true);
    expect(list.raw).toHaveLength(2);
    expect(list.totalCount).toBe(3);

    const advancedList = await services.petService.listAdvanced(
      { public: true },
      { select: 'age', limit: 10 },
      { includeCount: true },
      { headers: { user: 'admin' } },
    );

    expect(advancedList.data.map((row) => row.age).sort((left, right) => left - right)).toEqual([1, 3]);

    const read = await services.petService.read('Max', undefined, { headers: { user: 'admin' } });
    expect(read.data.name).toBe('Max');

    const advancedRead = await services.petService.readAdvanced('Max', { select: ['name'] as const }, undefined, {
      headers: { user: 'admin' },
    });
    expect(advancedRead.data).toEqual({ name: 'Max' });

    const advancedReadFilter = await services.petService.readAdvancedFilter(
      { sex: 'female' },
      { select: ['name'] as const },
      undefined,
      { headers: { user: 'admin' } },
    );
    expect(advancedReadFilter.data).toEqual({ name: 'Bella' });

    const apple = await endpoints.apple({ pathParams: { name: 'apple' }, queryParams: { q1: 'a', q2: 'b' } });
    expect(apple.data).toEqual({ pathParams: { name: 'apple' }, queryParams: { q1: 'a', q2: 'b' } });

    const chairman = await endpoints.chairman({ flag: 'pencil' });
    expect(chairman.data).toEqual({ name: 'chairman', flag: 'pencil' });
  });

  it('reads totalCount from access-router extra headers', async () => {
    const list = await services.petService.list(
      { limit: 1 },
      { includeCount: true, includeExtraHeaders: true },
      { headers: { user: 'admin' } },
    );

    expect(list.success).toBe(true);
    expect(list.raw).toHaveLength(1);
    expect(list.totalCount).toBe(3);
  });

  it('handles wrapGet and wrapPost errors appropriately', async () => {
    const wrapGet404 = suite.adapter.wrapGet('test/wrap-error-404/test');
    await expect(wrapGet404({})).rejects.toMatchObject({
      response: {
        status: 404,
      },
    });

    const wrapGet500 = suite.adapter.wrapGet('test/wrap-error-500/test');
    await expect(wrapGet500({})).rejects.toMatchObject({
      response: {
        status: 500,
      },
    });

    const wrapPost500 = suite.adapter.wrapPost('test/wrap-error-500/test');
    await expect(wrapPost500({})).rejects.toMatchObject({
      response: {
        status: 500,
      },
    });
  });

  it('supports wrapPut, wrapPatch, and wrapDelete success flows', async () => {
    const wrapPut = suite.adapter.wrapPut('test/wrap-success/{{name}}');
    const wrapPatch = suite.adapter.wrapPatch('test/wrap-success/{{name}}');
    const wrapDelete = suite.adapter.wrapDelete('test/wrap-success/{{name}}');

    const putResponse = await wrapPut(
      { flag: 'blue' },
      { pathParams: { name: 'alpha' }, queryParams: { mode: 'replace' } },
    );
    expect(putResponse.data).toEqual({
      method: 'put',
      pathParams: { name: 'alpha' },
      queryParams: { mode: 'replace' },
      body: { flag: 'blue' },
    });

    const patchResponse = await wrapPatch(
      { flag: 'green' },
      { pathParams: { name: 'beta' }, queryParams: { mode: 'update' } },
    );
    expect(patchResponse.data).toEqual({
      method: 'patch',
      pathParams: { name: 'beta' },
      queryParams: { mode: 'update' },
      body: { flag: 'green' },
    });

    const deleteResponse = await wrapDelete({ pathParams: { name: 'gamma' }, queryParams: { mode: 'drop' } });
    expect(deleteResponse.data).toEqual({
      method: 'delete',
      pathParams: { name: 'gamma' },
      queryParams: { mode: 'drop' },
    });
  });

  it('exposes all CustomHeaders enum members with correct values', () => {
    expect(CustomHeaders.TotalCount).toBe('wtt-total-count');
    expect(CustomHeaders.ReturnedCount).toBe('wtt-returned-count');
    expect(CustomHeaders.Page).toBe('wtt-page');
    expect(CustomHeaders.PageSize).toBe('wtt-page-size');
    expect(CustomHeaders.TotalPages).toBe('wtt-total-pages');
    expect(CustomHeaders.HasNextPage).toBe('wtt-has-next-page');
    expect(CustomHeaders.HasPreviousPage).toBe('wtt-has-previous-page');
  });

  it('reads page-related extra headers from list responses', async () => {
    const list = await services.petService.list(
      { limit: 1, page: 1 },
      { includeCount: true, includeExtraHeaders: true },
      { headers: { user: 'admin' } },
    );

    expect(list.success).toBe(true);
    expect(list.headers).toBeDefined();
    expect(list.totalCount).toBe(3);

    const totalCount = list.headers[CustomHeaders.TotalCount];
    if (totalCount != null) {
      expect(Number(totalCount)).toBe(3);
    }

    const page = list.headers[CustomHeaders.Page];
    if (page != null) {
      expect(Number(page)).toBeGreaterThanOrEqual(1);
    }

    const pageSize = list.headers[CustomHeaders.PageSize];
    if (pageSize != null) {
      expect(Number(pageSize)).toBeGreaterThanOrEqual(1);
    }

    const totalPages = list.headers[CustomHeaders.TotalPages];
    if (totalPages != null) {
      expect(Number(totalPages)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('access-router-client data-service advanced reads (ARC-08)', () => {
  it('reads ignoreCache from the options position (not args) on readAdvanced and bypasses an existing cache entry', async () => {
    const cachedAdapter = createAdapter(
      { baseURL: suite.adapter.axios.defaults.baseURL },
      {
        cacheTTL: 60_000,
        cachePartition: (config) => {
          const headers = config.headers as Record<string, unknown> | undefined;
          return typeof headers?.user === 'string' ? (headers.user as string) : 'anon';
        },
      },
    );
    const petService = cachedAdapter.createDataService<Pet>({ dataName: 'pet-data', basePath: 'pets' });

    const headers = { user: 'admin' };

    // First call: hits the server, populates the cache.
    const first = await petService.readAdvanced<Pet, 'name'>('Max', { select: ['name'] as const }, undefined, {
      headers,
    });
    expect(first.success).toBe(true);
    expect(first.data).toEqual({ name: 'Max' });

    // Capture the cache-bypass header from each subsequent call so we can
    // assert that options.ignoreCache is honored and emits 'false' (the
    // interceptor's cache-bypass value), while omitting ignoreCache emits
    // 'true' (cache-eligible).
    const seenHeaders: string[] = [];
    cachedAdapter.axios.interceptors.request.use((config) => {
      const h = config.headers;
      const value = (h as Record<string, unknown> | undefined)?.[CACHE_HEADER];
      seenHeaders.push(typeof value === 'string' ? value : String(value ?? ''));
      return config;
    });

    // Without ignoreCache in options ⇒ cache-bypass header is 'true'.
    await petService.readAdvanced<Pet, 'name'>('Max', { select: ['name'] as const }, undefined, { headers });
    // With ignoreCache: true in the OPTIONS position ⇒ cache-bypass header
    // is 'false' (the documented cache-bypass value).
    await petService.readAdvanced<Pet, 'name'>(
      'Max',
      { select: ['name'] as const },
      { ignoreCache: true },
      { headers },
    );

    expect(seenHeaders[0]).toBe('true');
    expect(seenHeaders[1]).toBe('false');
  });

  it('reads ignoreCache from the options position on readAdvancedFilter and bypasses an existing cache entry', async () => {
    const cachedAdapter = createAdapter(
      { baseURL: suite.adapter.axios.defaults.baseURL },
      {
        cacheTTL: 60_000,
        cachePartition: (config) => {
          const headers = config.headers as Record<string, unknown> | undefined;
          return typeof headers?.user === 'string' ? (headers.user as string) : 'anon';
        },
      },
    );
    const petService = cachedAdapter.createDataService<Pet>({ dataName: 'pet-data', basePath: 'pets' });

    const headers = { user: 'admin' };
    const first = await petService.readAdvancedFilter<Pet, 'name'>(
      { sex: 'female' },
      { select: ['name'] as const },
      undefined,
      { headers },
    );
    expect(first.success).toBe(true);
    expect(first.data).toEqual({ name: 'Bella' });

    const seenHeaders: string[] = [];
    cachedAdapter.axios.interceptors.request.use((config) => {
      const h = config.headers;
      const value = (h as Record<string, unknown> | undefined)?.[CACHE_HEADER];
      seenHeaders.push(typeof value === 'string' ? value : String(value ?? ''));
      return config;
    });

    // No-ignoreCache call ⇒ 'true'.
    await petService.readAdvancedFilter<Pet, 'name'>({ sex: 'female' }, { select: ['name'] as const }, undefined, {
      headers,
    });
    // ignoreCache in options ⇒ 'false'.
    await petService.readAdvancedFilter<Pet, 'name'>(
      { sex: 'female' },
      { select: ['name'] as const },
      { ignoreCache: true },
      { headers },
    );

    expect(seenHeaders[0]).toBe('true');
    expect(seenHeaders[1]).toBe('false');
  });

  it('keeps grouped data advanced reads equivalent to direct reads (no includePermissions asymmetry)', async () => {
    const petService = suite.adapter.createDataService<Pet>({ dataName: 'pet-data', basePath: 'pets' });
    const headers = { user: 'admin' };

    const direct = await petService.readAdvanced<Pet, 'name'>('Max', { select: ['name'] as const }, undefined, {
      headers,
    });
    const grouped = await suite.adapter.group(
      petService.readAdvanced<Pet, 'name'>('Max', { select: ['name'] as const }, undefined, { headers }),
    );

    expect(direct.success).toBe(true);
    expect(grouped[0].success).toBe(true);
    // The grouped result also omits includePermissions-derived fields
    // (e.g., no _permissions on data records) — both paths return only the
    // selected fields.
    expect(direct.raw).toEqual(grouped[0].raw);
    expect(direct.data).toEqual({ name: 'Max' });
    expect(grouped[0].data).toEqual({ name: 'Max' });
  });
});
