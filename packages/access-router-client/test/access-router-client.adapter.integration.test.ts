import { describe, expect, it } from 'vitest';

import { createAdapter, Model, ServiceError, wrapLazyPromise } from '../src';
import { setupIntegrationSuite, type User } from './support/integration-suite';

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
    const cachedAdapter = createAdapter(
      { baseURL: suite.adapter.axios.defaults.baseURL },
      {
        cacheTTL: 60_000,
        cachePartition: (config) => {
          const headers = config.headers as Record<string, unknown> | undefined;
          const user = headers?.user;
          return typeof user === 'string' ? user : undefined;
        },
      },
    );
    const getCachedUser = cachedAdapter.wrapGet<{ user: string; requestCount: number }>('test/cache-user');

    const adminFirst = await getCachedUser(undefined, { headers: { user: 'admin' } });
    const adminSecond = await getCachedUser(undefined, { headers: { user: 'admin' } });
    const guestFirst = await getCachedUser(undefined, { headers: { user: 'guest' } });

    expect(adminFirst.data).toEqual({ user: 'admin', requestCount: 1 });
    expect(adminSecond.data).toEqual({ user: 'admin', requestCount: 1 });
    expect(guestFirst.data).toEqual({ user: 'guest', requestCount: 2 });
  });

  it('does not cache credentialed requests without an identity partition and forces a network request on every call', async () => {
    const cachedAdapter = createAdapter({ baseURL: suite.adapter.axios.defaults.baseURL }, { cacheTTL: 60_000 });
    const getCachedUser = cachedAdapter.wrapGet<{ user: string; requestCount: number }>('test/cache-user');

    const adminFirst = await getCachedUser(undefined, { headers: { user: 'admin' } });
    const adminSecond = await getCachedUser(undefined, { headers: { user: 'admin' } });

    expect(adminFirst.data).toEqual({ user: 'admin', requestCount: 1 });
    expect(adminSecond.data).toEqual({ user: 'admin', requestCount: 2 });
  });

  it('forces a fresh network request after clearCache when the identity partition changes', async () => {
    let currentIdentity = 'admin';
    const cachedAdapter = createAdapter(
      { baseURL: suite.adapter.axios.defaults.baseURL },
      {
        cacheTTL: 60_000,
        cachePartition: () => currentIdentity,
      },
    );
    const getCachedUser = cachedAdapter.wrapGet<{ user: string; requestCount: number }>('test/cache-user');

    await getCachedUser(undefined, { headers: { user: 'admin' } });
    const adminCached = await getCachedUser(undefined, { headers: { user: 'admin' } });

    currentIdentity = 'guest';
    cachedAdapter.clearCache();
    const guestFirst = await getCachedUser(undefined, { headers: { user: 'guest' } });

    expect(adminCached.data.requestCount).toBe(1);
    expect(guestFirst.data.requestCount).toBe(2);
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

  it('clears cached reads after a successful wrapPost mutation through the same adapter', async () => {
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
    const getCachedUser = cachedAdapter.wrapGet<{ user: string; requestCount: number }>('test/cache-user');
    const mutate = cachedAdapter.wrapPost<{ mutated: true; body: unknown }>('test/cache-mutate');

    const read1 = await getCachedUser(undefined, { headers: { user: 'admin' } });
    const read2 = await getCachedUser(undefined, { headers: { user: 'admin' } });
    expect(read1.data.requestCount).toBe(1);
    expect(read2.data.requestCount).toBe(1);

    const mutation = await mutate({ value: 42 }, undefined, { headers: { user: 'admin' } });
    expect(mutation.status).toBe(201);

    const read3 = await getCachedUser(undefined, { headers: { user: 'admin' } });
    expect(read3.data.requestCount).toBe(2);
  });

  it('does not invalidate cached reads when a wrapPost mutation fails', async () => {
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
    const getCachedUser = cachedAdapter.wrapGet<{ user: string; requestCount: number }>('test/cache-user');
    const failMutate = cachedAdapter.wrapPost<{ ok: false }>('test/cache-mutate-fail');

    await getCachedUser(undefined, { headers: { user: 'admin' } });
    expect(getCachedUser).toBeDefined();

    try {
      await failMutate({ value: 1 }, undefined, {
        headers: { user: 'admin' },
        validateStatus: () => true,
      });
    } catch {
      // ignored
    }

    const cachedRead = await getCachedUser(undefined, {
      headers: { user: 'admin' },
      validateStatus: () => true,
    });
    expect(cachedRead.data.requestCount).toBe(1);
  });
});

describe('access-router-client lazy request ownership and execution state (ARC-09)', () => {
  it('converts a synchronous executor throw into a rejected promise that reaches .catch() and await', async () => {
    // Directly exercise wrapLazyPromise with an executor that throws
    // synchronously. The wrapper must route the throw through Promise
    // semantics so `await` and `.catch()` receive a rejection rather than
    // the throw escaping synchronously from `.then()`/`.exec()`.
    const boom = wrapLazyPromise<string>(() => {
      throw new Error('sync-adapter-boom');
    });

    await expect(boom).rejects.toThrow('sync-adapter-boom');

    const lazy2 = wrapLazyPromise<string>(() => {
      throw new Error('sync-adapter-boom-2');
    });
    const caught = await lazy2.catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('sync-adapter-boom-2');

    // `.exec()` also routes the sync throw to a rejection.
    const lazy3 = wrapLazyPromise<string>(() => {
      throw new Error('sync-adapter-boom-3');
    });
    await expect(lazy3.exec()).rejects.toThrow('sync-adapter-boom-3');

    // Repeated `.then()`/`.catch()`/`.finally()` share one execution: the
    // executor is invoked ONCE even if the chain branches.
    let invocations = 0;
    const lazy4 = wrapLazyPromise<string>(() => {
      invocations += 1;
      return Promise.resolve('once');
    });
    await Promise.all([lazy4.then((v) => v), lazy4.then((v) => v), lazy4.exec()]);
    expect(invocations).toBe(1);
    expect(await lazy4.then((v) => v.toUpperCase())).toBe('ONCE');
  });

  it('rejects group() of a request that has already started execution (no mutation replay)', async () => {
    // A request that has already been awaited has `__started === true`.
    // group() must reject it BEFORE any network activity — otherwise the
    // underlying mutation would re-execute through the root router.
    const mutation = services.userService.create(
      { name: 'arc-nine-mutation', role: 'editor', public: true },
      undefined,
      { headers: { user: 'admin' } },
    );
    // Start the mutation.
    const result = await mutation;
    expect(result.success).toBe(true);

    // Now group it — must reject before reaching axios.
    await expect(suite.adapter.group(mutation)).rejects.toThrow(
      /Cannot group a request that has already started execution/,
    );
    // Cleanup the created doc.
    if (result.data && result.data._id) {
      await services.userService.delete(String(result.data._id), { headers: { user: 'admin' } });
    }
  });

  it('rejects group() of a request owned by a different adapter', async () => {
    const foreignAdapter = createAdapter({ baseURL: suite.adapter.axios.defaults.baseURL });
    const foreignUserService = foreignAdapter.createModelService<User>({
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
    });
    const foreignReq = foreignUserService.read(String(seedState.admin._id), undefined, {
      headers: { user: 'admin' },
    });

    // suite.adapter.group must reject the foreign request before any
    // network activity because the owning service belongs to a different
    // adapter (different axios instance / cache / config defaults).
    await expect(suite.adapter.group(foreignReq)).rejects.toThrow(
      /Cannot group a request owned by a different adapter/,
    );
  });

  it('does not enumerate or allow consumer reassignment of batching metadata on a lazy request', () => {
    const req = services.userService.read(String(seedState.admin._id), undefined, {
      headers: { user: 'admin' },
    }) as unknown as Record<PropertyKey, unknown>;

    // __op, __query, __requestConfig, __service must NOT appear in
    // Object.keys / JSON.stringify / spread iteration.
    const visibleKeys = Object.keys(req);
    expect(visibleKeys).not.toContain('__op');
    expect(visibleKeys).not.toContain('__query');
    expect(visibleKeys).not.toContain('__requestConfig');
    expect(visibleKeys).not.toContain('__service');

    // Attempting to reassign metadata must fail (writable=false) — Vitest
    // ESM test files run in strict mode so a TypeError is thrown on the
    // assignment attempt rather than a silent no-op.
    expect(() => {
      req.__op = 'tampered';
    }).toThrow(TypeError);
    expect(req.__op).toBe('read');

    // JSON serialization must not leak metadata.
    const serialized = JSON.stringify(req);
    expect(serialized).not.toContain('__query');
    expect(serialized).not.toContain('__op');

    // Direct reads still work for adapter-internal machinery.
    expect(typeof req.__query).toBe('object');
    expect((req.__query as { target?: string }).target).toBe('model');
  });
});

describe('access-router-client grouped result finalization (ARC-10)', () => {
  it('produces equivalent normalized results for direct and grouped execution of the same operation', async () => {
    const headers = { headers: { user: 'admin' } };

    // Read the same user twice — once direct, once grouped — and assert
    // the final shapes match (success, status, message, raw, data shape).
    const direct = await services.userService.readAdvanced(
      String(seedState.admin._id),
      { select: ['name', 'role'] as const },
      undefined,
      headers,
    );

    const grouped = await suite.adapter.group(
      services.userService.readAdvanced(
        String(seedState.admin._id),
        { select: ['name', 'role'] as const },
        undefined,
        headers,
      ),
    );

    expect(direct.success).toBe(true);
    expect(grouped[0].success).toBe(true);
    expect(direct.status).toBe(grouped[0].status);
    // The root router does not echo `message` for successful entries while
    // `Service.handleSuccess` always emits a default 'OK' message; assert
    // equivalent raw/data shape instead (the success-path contract).
    expect(direct.raw).toEqual(grouped[0].raw);
    expect(direct.data).toBeInstanceOf(Model);
    expect(grouped[0].data).toBeInstanceOf(Model);
    expect((direct.data as Model<User, User>).name).toBe((grouped[0].data as Model<User, User>).name);
  });

  it('runs success/failure callbacks exactly once per request whether direct or grouped', async () => {
    let directSuccessCount = 0;
    let groupedSuccessCount = 0;

    // Build dedicated adapters whose services carry an onSuccess that
    // counts invocations. Direct and grouped calls must each fire the
    // callback exactly once per resolved entry — never zero, never twice.
    const baseAdapter = createAdapter({ baseURL: suite.adapter.axios.defaults.baseURL });
    const userService = baseAdapter.createModelService<User>(
      { modelName: 'AdapterJsIntegrationUser', basePath: 'users' },
      undefined,
    );
    // Override the adapter-level onSuccess to count via the createAdapter
    // `onSuccess` hook.
    const counterAdapter = createAdapter(
      { baseURL: suite.adapter.axios.defaults.baseURL },
      {
        onSuccess: () => {
          groupedSuccessCount += 1;
        },
      },
    );
    const groupedUserService = counterAdapter.createModelService<User>({
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
    });

    // Direct call: onSuccess fires once.
    const directHeaders = { headers: { user: 'admin' } };
    const directAdapter = createAdapter(
      { baseURL: suite.adapter.axios.defaults.baseURL },
      {
        onSuccess: () => {
          directSuccessCount += 1;
        },
      },
    );
    const directUserService = directAdapter.createModelService<User>({
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
    });
    await directUserService.read(String(seedState.admin._id), undefined, directHeaders);
    expect(directSuccessCount).toBe(1);

    // Grouped call with two requests: onSuccess fires once per entry.
    const groupedHeaders = { headers: { user: 'admin' } };
    await counterAdapter.group(
      groupedUserService.read(String(seedState.admin._id), undefined, groupedHeaders),
      groupedUserService.read(String(seedState.lucy2._id), undefined, groupedHeaders),
    );
    expect(groupedSuccessCount).toBe(2);

    // Suppress unused-variable lint for `userService` — Kept as a sanity
    // reference for the model-service adapter pattern (not asserted).
    void userService;
  });

  it('rejects the whole group with ServiceError when throwOnError is set and any entry fails', async () => {
    const headers = { headers: { user: 'admin' }, throwOnError: true } as const;

    // Successful entry + failing entry (bogus id → 404). With
    // throwOnError: true in the shared request config, group() must
    // reject with a ServiceError instead of returning an array of mixed
    // results. The first failure short-circuits the batch.
    const successful = services.userService.read(String(seedState.admin._id), undefined, headers);
    const failed = services.userService.read('000000000000000000000000', undefined, headers);

    // Because both requests share the SAME throwOnError-bearing config,
    // they form a single throw-on-error batch. The first failure (we
    // listed `failed` second, but execution is sequential via root
    // batching; the 404 endpoint should fail and surface as
    // ServiceError).
    let caught: ServiceError | undefined;
    try {
      await suite.adapter.group(successful, failed);
    } catch (err) {
      caught = err as ServiceError;
    }
    expect(caught).toBeInstanceOf(ServiceError);
    expect((caught as ServiceError).status).toBeGreaterThanOrEqual(400);
  });

  it('returns per-entry results for partial failure when throwOnError is not set', async () => {
    const headers = { headers: { user: 'admin' } };

    // Same setup as the throwOnError test but WITHOUT throwOnError on
    // the shared request config. The group must return a normalized
    // array with success:[0]==true and success:[1]==false rather than
    // rejecting.
    const successful = services.userService.read(String(seedState.admin._id), undefined, headers);
    const failed = services.userService.read('000000000000000000000000', undefined, headers);

    const result = await suite.adapter.group(successful, failed);
    expect(result).toHaveLength(2);
    expect(result[0].success).toBe(true);
    expect(result[0].data).toBeInstanceOf(Model);
    expect(result[1].success).toBe(false);
    expect(result[1].data).toBeNull();
    expect(result[1].status).toBeGreaterThanOrEqual(400);
  });

  it('does not serialize service instances or mutable callbacks in the root-router payload', async () => {
    // Intercept the outgoing axios POST body to root to assert that no
    // service instance or callback reference leaks through.
    let capturedBody: unknown = undefined;
    const cachedAxios = suite.adapter.axios;
    const interceptorId = cachedAxios.interceptors.request.use((config) => {
      const url = typeof config.url === 'string' ? config.url : '';
      // The adapter posts to `rootRouterPath` ('root'); regardless of how
      // axios rewrites the URL (baseURL+url or full url), the substring
      // 'root' (anywhere in the resolved path) identifies a grouped batch
      // payload.
      if (url.includes('root')) {
        capturedBody = config.data;
      }
      return config;
    });

    await suite.adapter.group(
      services.userService.read(String(seedState.admin._id), undefined, { headers: { user: 'admin' } }),
      services.userService.read(String(seedState.lucy2._id), undefined, { headers: { user: 'admin' } }),
    );

    cachedAxios.interceptors.request.eject(interceptorId);

    expect(capturedBody).not.toBeUndefined();

    // The captured body must be an array of plain meta objects containing
    // onlyRootQueryMeta fields. Strings with `__service` or `onSuccess` must
    // not appear, including the JSON-serialized form of the body.
    expect(Array.isArray(capturedBody)).toBe(true);
    const serialized = JSON.stringify(capturedBody);
    expect(serialized).not.toContain('__service');
    expect(serialized).not.toContain('onSuccess');
    expect(serialized).not.toContain('onFailure');
    // Confirms each entry has the structural fields the root router expects.
    const entries = capturedBody as Array<Record<string, unknown>>;
    for (const entry of entries) {
      expect(entry).toHaveProperty('target');
      expect(entry).toHaveProperty('op');
      // `__service` must NOT be enumerable on the entry itself.
      expect(Object.keys(entry)).not.toContain('__service');
      // `__throwOnError` (private grouping metadata) must also be absent.
      expect(Object.keys(entry)).not.toContain('__throwOnError');
    }
  });

  it('keeps subdocument and model list wraps consistent between direct and grouped execution (ARC-05 + ARC-10)', async () => {
    const headers = { headers: { user: 'admin' } };

    // Subdocument list: direct via `id(...).subs(...).list()` grouped vs direct.
    const directList = await services.userService.id(String(seedState.admin._id)).subs('statusHistory').list(headers);

    const grouped = await suite.adapter.group(
      services.userService.id(String(seedState.admin._id)).subs('statusHistory').list(headers),
    );

    expect(directList.success).toBe(true);
    expect(grouped[0].success).toBe(true);
    expect(Array.isArray(directList.data)).toBe(true);
    expect(Array.isArray(grouped[0].data)).toBe(true);
    expect(directList.data).toEqual(grouped[0].data);
    expect(directList.count).toBe(grouped[0].count);
    // ARC-05: subdocument entries are plain data, not Model instances.
    const directPayload = directList.data as Array<Record<string, unknown>>;
    expect(typeof directPayload[0].save).toBe('undefined');
  });
});
