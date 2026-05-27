import { describe, expect, it } from 'vitest';

import { setupIntegrationSuite } from './support/integration-suite';

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
      { select: 'name', limit: 10 },
      { includeCount: true },
      { headers: { user: 'admin' } },
    );
    expect(advancedList.data.map((row) => row.name).sort()).toEqual(['Bella', 'Max']);

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
});
