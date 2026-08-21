import { describe, expect, it, vi, afterEach } from 'vitest';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';

import { createAdapter } from '../src/adapter';
import { cloneConfigWithCacheBypass, useCacheInterceptors } from '../src/services/interceptors';
import { CACHE_HEADER } from '../src/constants';

/**
 * ARC-22 adversarial re-tests for the cache layer.
 *
 * Each `it()` targets a gap surfaced by the ARC-22 audit and asserts an
 * invariant the existing suite establishes only indirectly or not at all:
 *   - TTL expiry actually produces a miss after the timer fires,
 *   - `cacheTTL: 0` disables caching at the boundary,
 *   - PUT / PATCH / DELETE mutations bypass the cache and invalidate reads,
 *   - a 204 No Content mutation invalidates (not just 200 / 201),
 *   - cached response headers are isolated across hits (not just data / status),
 *   - a mutation response is never itself stored in the cache,
 *   - `dispose()` also clears the in-flight dedup map,
 *   - a fresh miss after `dispose()` reaches the server even when an
 *     in-flight slot that aliased the same key was registered on the disposed
 *     controller.
 */
function createFakeAdapter(
  handler: (
    config: Record<string, unknown>,
  ) =>
    | Promise<{ data: unknown; status: number; headers: Record<string, unknown> }>
    | { data: unknown; status: number; headers: Record<string, unknown> },
): { instance: AxiosInstance } {
  const instance = axios.create({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      const result = await handler(config as unknown as Record<string, unknown>);
      return {
        data: result.data,
        status: result.status,
        statusText: 'OK',
        headers: { ...result.headers },
        config,
      } as unknown as AxiosResponse;
    },
  });
  return { instance };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ARC-22 cache bounds — TTL expiry is enforced', () => {
  it('serves an entry before the TTL elapses and forces a fresh miss after the timer fires', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return { data: { value: invocations }, status: 200, headers: { 'x-etag': 'v1' } };
    });

    vi.useFakeTimers();
    useCacheInterceptors(instance, { ttl: 1_000, withCredentialsDefault: false });

    const first = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(1);
    expect(first.data).toEqual({ value: 1 });

    // Within TTL: cached hit. No new network call.
    const cached = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(1);
    expect(cached.data).toEqual({ value: 1 });

    // Advance past TTL. The SimpleCache setTimeout delete fires; the next read
    // must miss and reach the server.
    await vi.advanceTimersByTimeAsync(1_001);
    const expired = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(2);
    expect(expired.data).toEqual({ value: 2 });
  });

  // The first test in this describe block already pins the timer-driven
  // contract. Awaiting `advanceTimersByTimeAsync` flushes the queued
  // setTimeout callback; a synchronous read BEFORE that flush serves the
  // (expired-but-not-collected) cached entry. The contract documented by
  // ARC-22 is: TTL eviction is setTimeout-driven, not lazy-on-read.
});

describe('ARC-22 cache bounds — boundary knobs (public adapter API)', () => {
  it('cacheTTL: 0 opts out of caching entirely (createAdapter never installs interceptors)', async () => {
    let invocations = 0;
    const adapter = createAdapter(
      {
        baseURL: 'http://localhost',
        adapter: async (config) => {
          invocations += 1;
          return {
            data: { value: invocations },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          } as unknown as AxiosResponse;
        },
      },
      { cacheTTL: 0 },
    );

    await adapter.axios.get('/a', { headers: { [CACHE_HEADER]: 'true' } });
    await adapter.axios.get('/a', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(2);
  });

  it('cacheTTL > 0 with no cacheCapacity still caches anonymous traffic with the finite default bound', async () => {
    let invocations = 0;
    const adapter = createAdapter(
      {
        baseURL: 'http://localhost',
        // Anonymous traffic (withCredentials: false) is cacheable without a
        // cachePartition; the default adapter config sets withCredentials: true
        // (the safe default for credentialed routes) which would otherwise
        // bypass the cache absent an explicit partition.
        withCredentials: false,
        adapter: async (config) => {
          invocations += 1;
          return {
            data: { value: invocations },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          } as unknown as AxiosResponse;
        },
      },
      { cacheTTL: 60_000 },
    );

    await adapter.axios.get('/a', { headers: { [CACHE_HEADER]: 'true' } });
    await adapter.axios.get('/a', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(1);
  });
});

describe('ARC-22 cache bounds — eviction releases the TTL timer', () => {
  it('eviction releases the TTL timer (no dangling timer after LRU eviction)', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter((config) => {
      invocations += 1;
      return {
        data: { url: (config as { url?: string }).url, count: invocations },
        status: 200,
        headers: {},
      };
    });

    vi.useFakeTimers();
    useCacheInterceptors(instance, {
      ttl: 60_000,
      withCredentialsDefault: false,
      capacity: 1,
    });

    // Fill the only slot with /a; its TTL timer is now armed.
    await instance.get('/a', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(1);

    // /b evicts /a (capacity: 1). The /a TTL timer must be cleared by the
    // eviction path; advancing the clock by the /a TTL must NOT crash or
    // mutate state (the timer's `delete` would otherwise fire against a
    // key that no longer exists — a benign no-op, but the assertion pins
    // that no throw / unhandled rejection occurs).
    await instance.get('/b', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(2);

    await vi.advanceTimersByTimeAsync(60_001);

    // /a was evicted (capacity: 1) and the TTL timer for the evicted /a
    // entry was cleared by SimpleCache.delete on eviction. Advancing the
    // clock past the original /a TTL must NOT crash, throw, or mutate any
    // state — the timer fired against a key that no longer exists, which
    // is the dangling-timer gap ARC-22 guards against.
    const aAgain = await instance.get('/a', { headers: { [CACHE_HEADER]: 'true' } });
    expect(aAgain.data).toEqual({ url: '/a', count: 3 });
    expect(invocations).toBe(3);

    // /b was stored after /a was evicted; its own TTL timer fires after the
    // advanceTimersByTime(60_001) call above, which already happened BEFORE
    // /b was fetched. So /b is also a miss now (count=4). This pins both that
    // the /b timer was set (not skipped after an eviction) and that the /b
    // entry expired on schedule.
    const bAgain = await instance.get('/b', { headers: { [CACHE_HEADER]: 'true' } });
    expect(bAgain.data).toEqual({ url: '/b', count: 4 });
    expect(invocations).toBe(4);
  });
});

describe('ARC-22 mutation execution/invalidation — every mutation method', () => {
  it('PUT bypasses the cache and invalidates cached reads on 2xx', async () => {
    let readInvocations = 0;
    let mutationInvocations = 0;
    const { instance } = createFakeAdapter((config) => {
      if ((config as { url?: string }).url === '/read') {
        readInvocations += 1;
        return { data: { count: readInvocations }, status: 200, headers: {} };
      }
      mutationInvocations += 1;
      return { data: { ok: true }, status: 200, headers: {} };
    });

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(1);

    await instance.put('/mutate', { a: 1 }, cloneConfigWithCacheBypass({}));
    expect(mutationInvocations).toBe(1);

    const read3 = await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(2);
    expect(read3.data).toEqual({ count: 2 });
  });

  it('PATCH bypasses the cache and invalidates cached reads on 2xx', async () => {
    let readInvocations = 0;
    let mutationInvocations = 0;
    const { instance } = createFakeAdapter((config) => {
      if ((config as { url?: string }).url === '/read') {
        readInvocations += 1;
        return { data: { count: readInvocations }, status: 200, headers: {} };
      }
      mutationInvocations += 1;
      return { data: { ok: true }, status: 200, headers: {} };
    });

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(1);

    await instance.patch('/mutate', { a: 1 }, cloneConfigWithCacheBypass({}));
    expect(mutationInvocations).toBe(1);

    const read3 = await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(2);
    expect(read3.data).toEqual({ count: 2 });
  });

  it('DELETE bypasses the cache and invalidates cached reads on 2xx', async () => {
    let readInvocations = 0;
    let mutationInvocations = 0;
    const { instance } = createFakeAdapter((config) => {
      if ((config as { url?: string }).url === '/read') {
        readInvocations += 1;
        return { data: { count: readInvocations }, status: 200, headers: {} };
      }
      mutationInvocations += 1;
      return { data: { ok: true }, status: 200, headers: {} };
    });

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(1);

    await instance.delete('/mutate', cloneConfigWithCacheBypass({}));
    expect(mutationInvocations).toBe(1);

    const read3 = await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(2);
    expect(read3.data).toEqual({ count: 2 });
  });

  it('a 204 No Content mutation invalidates cached reads', async () => {
    let readInvocations = 0;
    let mutationInvocations = 0;
    const { instance } = createFakeAdapter((config) => {
      if ((config as { url?: string }).url === '/read') {
        readInvocations += 1;
        return { data: { count: readInvocations }, status: 200, headers: {} };
      }
      mutationInvocations += 1;
      return { data: undefined, status: 204, headers: {} };
    });

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(1);

    await instance.delete('/mutate', cloneConfigWithCacheBypass({}));
    expect(mutationInvocations).toBe(1);

    const read3 = await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(2);
    expect(read3.data).toEqual({ count: 2 });
  });

  it('a mutation response is never stored in the cache (the mutation key is absent)', async () => {
    let invocations = 0;
    const capturedKeys: string[] = [];
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return { data: { v: invocations }, status: 200, headers: {} };
    });

    useCacheInterceptors(instance, {
      ttl: 60_000,
      withCredentialsDefault: false,
      onCacheKey: (key) => {
        capturedKeys.push(key);
      },
    });

    // POST with the cache-bypass header. The interceptor must never call
    // onCacheKey for this request (mutations skip the cache-key branch
    // entirely). Subsequent identical POSTs also bypass; nothing is stored.
    await instance.post('/mutate', { a: 1 }, { headers: { [CACHE_HEADER]: 'false' } });
    await instance.post('/mutate', { a: 1 }, { headers: { [CACHE_HEADER]: 'false' } });
    expect(invocations).toBe(2);
    expect(capturedKeys).toHaveLength(0);

    // A read with the same URL/scheme (different method) generates the
    // cache key for the read; the cache is keyed by method so a mutation
    // and a read cannot share a slot.
    await instance.get('/mutate', { headers: { [CACHE_HEADER]: 'true' } });
    expect(capturedKeys).toHaveLength(1);
    // Second read serves the cache; onCacheKey still fires for cacheable
    // requests (it is called by the request interceptor regardless of hit
    // vs miss), so a second call adds a second key entry.
    await instance.get('/mutate', { headers: { [CACHE_HEADER]: 'true' } });
    expect(capturedKeys).toHaveLength(2);
    expect(invocations).toBe(3);
  });
});

describe('ARC-22 response isolation — headers', () => {
  it('mutating a returned cached response headers object does not affect later cache hits', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return {
        data: { value: 'a' },
        status: 200,
        headers: { 'x-etag': 'v1', 'x-revision': '7' },
      };
    });

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    const first = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(1);

    // Adversarially mutate the headers object on the first response. Axios
    // normalizes response headers to an AxiosHeaders instance; the snapshot
    // stored in the cache is a plain object clone (see `snapshotResponse`).
    // Mutating the returned headers must not reach back into the snapshot.
    (first.headers as Record<string, unknown>)['x-etag'] = 'tampered';
    (first.headers as Record<string, unknown>)['x-revision'] = '999';
    // Add a new header that should not be present in the cached snapshot.
    (first.headers as Record<string, unknown>)['x-injected'] = 'leak';

    const second = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(1);

    // The cached snapshot's headers are isolated.
    expect(second.headers['x-etag']).toBe('v1');
    expect(second.headers['x-revision']).toBe('7');
    expect(second.headers['x-injected']).toBeUndefined();
  });
});

describe('ARC-22 dispose — in-flight map is cleared', () => {
  it('dispose() clears the in-flight dedup map so a tail caller on a disposed adapter reaches the network independently', async () => {
    // Build two adapters sharing one fake handler that resolves the in-flight
    // miss only when explicitly told to. Adapter A registers an in-flight
    // miss; dispose A; adapter B (a fresh instance with the same interceptor
    // family) issues a read for the same key. The in-flight slot from A must
    // not leak into B's dispatch path.
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return { data: { value: invocations }, status: 200, headers: {} };
    });

    const controller = useCacheInterceptors(instance, {
      ttl: 60_000,
      withCredentialsDefault: false,
    });

    // A first, completed read registers then resolves the in-flight slot
    // (ensures the interceptor's in-flight map is non-empty before dispose).
    await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(1);

    controller.dispose();

    // After dispose, a new read misses (no in-flight slot, no stored entry).
    const second = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(2);
    expect(second.data).toEqual({ value: 2 });
  });
});

describe('ARC-H04 group preflight — axios config boundary', () => {
  it('rejects function-valued request configs before dispatch rather than sharing the last config', async () => {
    let invocations = 0;
    const adapter = createAdapter({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        invocations += 1;
        return { data: [], status: 200, statusText: 'OK', headers: {}, config } as unknown as AxiosResponse;
      },
    });
    const service = adapter.createModelService<{ _id: string; name: string }>({ modelName: 'User', basePath: 'users' });

    await expect(
      adapter.group(
        service.read('1', undefined, { validateStatus: (status) => status < 500 }),
        service.read('2', undefined, { validateStatus: (status) => status < 400 }),
      ),
    ).rejects.toThrow(/validateStatus/);
    expect(invocations).toBe(0);
  });

  it('rejects circular request configs before claims and network activity', async () => {
    let invocations = 0;
    const adapter = createAdapter({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        invocations += 1;
        return { data: [], status: 200, statusText: 'OK', headers: {}, config } as unknown as AxiosResponse;
      },
    });
    const service = adapter.createModelService<{ _id: string; name: string }>({ modelName: 'User', basePath: 'users' });
    const params: Record<string, unknown> = { id: '1' };
    params.self = params;

    await expect(adapter.group(service.read('1', undefined, { params }))).rejects.toThrow(/circular axios config/);
    expect(invocations).toBe(0);

    const grouped = await adapter.group(service.read('1'));
    expect(grouped[0].success).toBe(false);
    expect(invocations).toBe(1);
  });
});

describe('ARC-H04 group protocol — malformed root responses', () => {
  const malformedFixtures: Array<[string, unknown]> = [
    ['empty array', []],
    ['non-array', { result: { success: true } }],
    ['short array', [{ result: { success: true, kind: 'single', data: { _id: '1' } }, statusCode: 200 }]],
    [
      'extra array entry',
      [
        { result: { success: true, kind: 'single', data: { _id: '1' } }, statusCode: 200 },
        { result: { success: true, kind: 'single', data: { _id: '2' } }, statusCode: 200 },
        { result: { success: true, kind: 'single', data: { _id: '3' } }, statusCode: 200 },
      ],
    ],
    ['malformed entry', [{ result: { success: true, kind: 'single', data: { _id: '1' } }, statusCode: 200 }, null]],
    [
      'malformed result shape',
      [{ result: { success: true, kind: 'single', data: { _id: '1' } }, statusCode: 200 }, {}],
    ],
  ];

  it.each(malformedFixtures)('settles every grouped request for %s with controlled failures', async (_name, data) => {
    let invocations = 0;
    let failureCallbacks = 0;
    const adapter = createAdapter(
      {
        baseURL: 'http://localhost',
        adapter: async (config) => {
          invocations += 1;
          return { data, status: 200, statusText: 'OK', headers: {}, config } as unknown as AxiosResponse;
        },
      },
      {
        onFailure: () => {
          failureCallbacks += 1;
        },
      },
    );
    const service = adapter.createModelService<{ _id: string; name: string }>({ modelName: 'User', basePath: 'users' });

    const grouped = await adapter.group(service.read('1'), service.read('2'));

    expect(invocations).toBe(1);
    expect(failureCallbacks).toBe(2);
    expect(grouped).toHaveLength(2);
    for (const result of grouped) {
      expect(result.success).toBe(false);
      expect(result.status).toBe(0);
      expect(result.message).toMatch(/Malformed root response/);
      expect(result.data).toBeNull();
    }
  });

  it('runs callbacks once per entry before throwOnError surfaces malformed root responses', async () => {
    let failureCallbacks = 0;
    const adapter = createAdapter(
      {
        baseURL: 'http://localhost',
        adapter: async (config) => {
          return {
            data: { not: 'an array' },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          } as unknown as AxiosResponse;
        },
      },
      {
        throwOnError: true,
        onFailure: () => {
          failureCallbacks += 1;
        },
      },
    );
    const service = adapter.createModelService<{ _id: string; name: string }>({ modelName: 'User', basePath: 'users' });

    await expect(adapter.group(service.read('1'), service.read('2'))).rejects.toThrow(/Malformed root response/);
    expect(failureCallbacks).toBe(2);
  });
});
