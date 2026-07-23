import { describe, expect, it } from 'vitest';

import { createAdapter, Model, ServiceError } from '../src';
import { setupIntegrationSuite } from './support/integration-suite';

const suite = setupIntegrationSuite();
const { services, seedState } = suite;

describe('access-router-client adapter integration', () => {
  it('groups root-router operations using the current access-router payload contract', async () => {
    const result = await suite.adapter.group(
      services.userService.create({ name: 'group-user', role: 'editor', public: true }, undefined, {
        headers: { user: 'admin' },
      }),
      services.orgService.count(),
    );

    expect(result).toHaveLength(2);
    expect(result[0].success).toBe(true);
    expect(result[0].status).toBe(201);
    expect(result[0].data).toBeInstanceOf(Model);
    expect(result[0].data.name).toBe('group-user');
    expect(result[1]).toMatchObject({ success: true, status: 200, data: 2, raw: 2 });
  });

  it('preserves response headers from grouped batch requests', async () => {
    const result = await suite.adapter.group(
      services.userService.list(undefined, { includeCount: true }, { headers: { user: 'admin' } }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(true);
    expect(result[0].headers).toBeDefined();
    expect(typeof result[0].headers).toBe('object');
  });

  it('sets default order on grouped requests', async () => {
    const first = services.userService.create({ name: 'order-0-user', role: 'viewer', public: true }, undefined, {
      headers: { user: 'admin' },
    });
    const second = services.orgService.count();

    const result = await suite.adapter.group(first, second);

    expect(result).toHaveLength(2);
    expect(result[0].success).toBe(true);
    expect(result[1].success).toBe(true);
  });

  it('handles group partial failures gracefully', async () => {
    const successful = services.userService.readAdvanced(String(seedState.admin._id), { select: ['name'] }, undefined, {
      headers: { user: 'admin' },
    });
    const failed = services.userService.readAdvanced('000000000000000000000000', { select: ['name'] }, undefined, {
      headers: { user: 'admin' },
    });

    const result = await suite.adapter.group(successful, failed);

    expect(result).toHaveLength(2);
    expect(result[0].success).toBe(true);
    expect(result[0].data.name).toBe('admin-user');
    expect(result[1].success).toBe(false);
    expect(result[1].data).toBeNull();
    expect(result[1].status).toBeGreaterThanOrEqual(400);
    expect(typeof result[1].message).toBe('string');
  });

  it('rejects grouped requests with conflicting axios configs', async () => {
    const first = services.userService.read(String(seedState.admin._id), undefined, { headers: { user: 'admin' } });
    const second = services.userService.read(String(seedState.lucy2._id), undefined, { headers: { user: 'guest' } });

    await expect(suite.adapter.group(first, second)).rejects.toThrow(
      'Grouped requests must share the same axios request config',
    );
  });

  it('supports lazy request catch and finally semantics', async () => {
    let finalized = false;

    const finalizedResult = await services.userService
      .read(String(seedState.admin._id), undefined, { headers: { user: 'admin' } })
      .finally(() => {
        finalized = true;
      });

    expect(finalized).toBe(true);
    expect(finalizedResult.success).toBe(true);
    expect(finalizedResult.data.name).toBe('admin-user');

    const error = await services.userService
      .read('000000000000000000000000', undefined, { headers: { user: 'admin' }, throwOnError: true })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceError);
    expect(error).toMatchObject({ status: 404 });
  });

  it('scopes cached responses to each adapter instance and request headers', async () => {
    const cachedAdapter = createAdapter({ baseURL: suite.adapter.axios.defaults.baseURL }, { cacheTTL: 60_000 });
    const getCachedUser = cachedAdapter.wrapGet<{ user: string; requestCount: number }>('test/cache-user');

    const adminFirst = await getCachedUser(undefined, { headers: { user: 'admin' } });
    const adminSecond = await getCachedUser(undefined, { headers: { user: 'admin' } });
    const guestFirst = await getCachedUser(undefined, { headers: { user: 'guest' } });

    expect(adminFirst.data).toEqual({ user: 'admin', requestCount: 1 });
    expect(adminSecond.data).toEqual({ user: 'admin', requestCount: 1 });
    expect(guestFirst.data).toEqual({ user: 'guest', requestCount: 2 });
  });

  it('falls back to adapter-level model defaults and lets service defaults override them', async () => {
    const adapter = createAdapter(
      { baseURL: suite.adapter.axios.defaults.baseURL },
      { modelDefaults: { listArgs: { limit: 1 }, listOptions: { includeCount: true } } },
    );
    const userService = adapter.createModelService(
      { modelName: 'AdapterJsIntegrationUser', basePath: 'users' },
      { listArgs: { limit: 2 } },
    );

    const list = await userService.list(undefined, undefined, { headers: { user: 'admin' } });

    expect(list.success).toBe(true);
    expect(list.raw).toHaveLength(2);
    expect(list.totalCount).toBeGreaterThanOrEqual(2);
  });

  it('falls back to adapter-level data defaults and lets service defaults override them', async () => {
    const adapter = createAdapter(
      { baseURL: suite.adapter.axios.defaults.baseURL },
      { dataDefaults: { listArgs: { limit: 1 }, listOptions: { includeCount: true } } },
    );
    const petService = adapter.createDataService(
      { dataName: 'pet-data', basePath: 'pets' },
      { listArgs: { limit: 2 } },
    );

    const list = await petService.list(undefined, undefined, { headers: { user: 'admin' } });

    expect(list.success).toBe(true);
    expect(list.raw).toHaveLength(2);
    expect(list.totalCount).toBe(3);
  });
});
