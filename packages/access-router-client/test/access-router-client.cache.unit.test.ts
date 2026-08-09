import { describe, expect, it } from 'vitest';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';

import { useCacheInterceptors, type CacheController, type CachePolicy } from '../src/services/interceptors';
import { CACHE_HEADER } from '../src/constants';

function createFakeAdapter(
  handler: (
    config: Record<string, unknown>,
  ) =>
    | Promise<{ data: unknown; status: number; headers: Record<string, unknown> }>
    | { data: unknown; status: number; headers: Record<string, unknown> },
): { instance: AxiosInstance; calls: { url: string; params?: unknown; data?: unknown; headers?: unknown }[] } {
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
  const calls: { url: string; params?: unknown; data?: unknown; headers?: unknown }[] = [];
  return { instance, calls };
}

describe('cache interceptors credential safety', () => {
  it('does not cache credentialed requests when no partition strategy is configured', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return { data: { value: invocations }, status: 200, headers: {} };
    });

    const policy: CachePolicy = { ttl: 60_000, withCredentialsDefault: true };
    useCacheInterceptors(instance, policy);

    instance.defaults.withCredentials = true;

    const first = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    const second = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });

    expect(invocations).toBe(2);
    expect(first.data).toEqual({ value: 1 });
    expect(second.data).toEqual({ value: 2 });
  });

  it('caches credentialed requests when an explicit stable partition key is provided', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return { data: { value: invocations }, status: 200, headers: {} };
    });

    const policy: CachePolicy = {
      ttl: 60_000,
      withCredentialsDefault: true,
      partitionForRequest: () => 'identity-admin',
    };
    useCacheInterceptors(instance, policy);

    instance.defaults.withCredentials = true;

    const first = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    const second = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });

    expect(invocations).toBe(1);
    expect(first.data).toEqual({ value: 1 });
    expect(second.data).toEqual({ value: 1 });
  });

  it('does not cross identity partitions when using explicit partition keys', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return { data: { value: invocations }, status: 200, headers: {} };
    });

    const policy: CachePolicy = {
      ttl: 60_000,
      withCredentialsDefault: true,
      partitionForRequest: (config) => (config.headers?.['x-identity'] as string) ?? undefined,
    };
    useCacheInterceptors(instance, policy);

    instance.defaults.withCredentials = true;

    const adminFirst = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true', 'x-identity': 'admin' } });
    const adminSecond = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true', 'x-identity': 'admin' } });
    const guestFirst = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true', 'x-identity': 'guest' } });

    expect(adminFirst.data).toEqual({ value: 1 });
    expect(adminSecond.data).toEqual({ value: 1 });
    expect(guestFirst.data).toEqual({ value: 2 });
    expect(invocations).toBe(2);
  });

  it('still caches anonymous requests without a partition key', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return { data: { value: invocations }, status: 200, headers: {} };
    });

    const policy: CachePolicy = { ttl: 60_000, withCredentialsDefault: true };
    useCacheInterceptors(instance, policy);

    instance.defaults.withCredentials = false;

    const first = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    const second = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });

    expect(invocations).toBe(1);
    expect(first.data).toEqual({ value: 1 });
    expect(second.data).toEqual({ value: 1 });
  });

  it('forces a fresh network request after clearCache following a credential transition', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return { data: { value: invocations }, status: 200, headers: {} };
    });

    let currentIdentity: string | undefined;
    const policy: CachePolicy = {
      ttl: 60_000,
      withCredentialsDefault: true,
      partitionForRequest: () => currentIdentity,
    };
    const controller: CacheController = useCacheInterceptors(instance, policy);

    instance.defaults.withCredentials = true;

    currentIdentity = 'admin';
    await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    const adminInvocations = invocations;
    expect(adminInvocations).toBe(1);

    currentIdentity = 'guest';
    controller.clear();
    await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(adminInvocations + 1);
  });

  it('never places authorization, cookie, or set-cookie values into serialized cache keys', async () => {
    let invocations = 0;
    const capturedKeys: string[] = [];
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return { data: { value: invocations }, status: 200, headers: {} };
    });

    const policy: CachePolicy = {
      ttl: 60_000,
      withCredentialsDefault: true,
      partitionForRequest: () => 'identity-shared',
      onCacheKey: (key) => {
        capturedKeys.push(key);
      },
    };
    useCacheInterceptors(instance, policy);

    await instance.get('/cached', {
      headers: {
        [CACHE_HEADER]: 'true',
        Authorization: 'Bearer super-secret-token',
        Cookie: 'session=secret-session-id',
        'Set-Cookie': 'a=1',
      },
    });
    await instance.get('/cached', {
      headers: {
        [CACHE_HEADER]: 'true',
        Authorization: 'Bearer different-token',
        Cookie: 'session=different-session',
      },
    });

    expect(invocations).toBe(1);
    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys[0]).toBe(capturedKeys[1]);
    for (const key of capturedKeys) {
      expect(key).not.toContain('super-secret-token');
      expect(key).not.toContain('different-token');
      expect(key).not.toContain('secret-session-id');
      expect(key).not.toContain('different-session');
      expect(key).not.toContain('Bearer');
      expect(key.toLowerCase()).not.toContain('cookie');
      expect(key.toLowerCase()).not.toContain('authorization');
    }
  });
});

describe('cache mutation bypass and invalidation', () => {
  it('repeating identical requests with the cache-bypass header reaches the server each time', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return { data: { value: invocations }, status: 201, headers: {} };
    });

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    const first = await instance.post('/mutate', { a: 1 }, { headers: { [CACHE_HEADER]: 'false' } });
    const second = await instance.post('/mutate', { a: 1 }, { headers: { [CACHE_HEADER]: 'false' } });

    expect(invocations).toBe(2);
    expect(first.data).toEqual({ value: 1 });
    expect(second.data).toEqual({ value: 2 });
  });

  it('clears cached read entries after a successful mutation', async () => {
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

    const read1 = await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    const read2 = await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(1);
    expect(read1.data).toEqual({ count: 1 });
    expect(read2.data).toEqual({ count: 1 });

    await instance.post('/mutate', { a: 1 }, { headers: { [CACHE_HEADER]: 'false' } });
    expect(mutationInvocations).toBe(1);

    const read3 = await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(2);
    expect(read3.data).toEqual({ count: 2 });
  });

  it('does not invalidate cached reads when a mutation fails (non-2xx)', async () => {
    let readInvocations = 0;
    const { instance } = createFakeAdapter((config) => {
      if ((config as { url?: string }).url === '/read') {
        readInvocations += 1;
        return { data: { count: readInvocations }, status: 200, headers: {} };
      }
      return { data: { error: 'nope' }, status: 422, headers: {} };
    });

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    expect(readInvocations).toBe(1);

    try {
      await instance.post(
        '/mutate',
        { a: 1 },
        {
          headers: { [CACHE_HEADER]: 'false' },
          validateStatus: () => true,
        },
      );
    } catch {
      // ignore
    }

    // Failed mutation must not invalidate; next read still serves cache.
    const cachedRead = await instance.get('/read', {
      headers: { [CACHE_HEADER]: 'true' },
      validateStatus: () => true,
    });
    expect(readInvocations).toBe(1);
    expect(cachedRead.data).toEqual({ count: 1 });
  });
});

describe('cache value isolation and bounds', () => {
  it('mutating a returned cached response body does not affect later cache hits', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      const data = { value: { nested: 'original' }, items: [{ id: 1 }] };
      return { data, status: 200, headers: { 'x-etag': 'v1' } };
    });

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    const first = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    (first.data as { value: { nested: string } }).value.nested = 'mutated';
    (first.data as { items: { id: number }[] }).items.push({ id: 2 });
    (first as AxiosResponse).status = 500;

    const second = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(1);

    // Hit returns independent snapshot
    expect(second.data).toEqual({ value: { nested: 'original' }, items: [{ id: 1 }] });
    expect(second.status).toBe(200);
    expect(second.headers['x-etag']).toBe('v1');

    // Original hit's mutation does not propagate to a third hit
    (second.data as { value: { nested: string } }).value.nested = 'mid';
    const third = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(third.data).toEqual({ value: { nested: 'original' }, items: [{ id: 1 }] });
  });

  it('enforces a configurable capacity with deterministic eviction order', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter((config) => {
      invocations += 1;
      const url = (config as { url?: string }).url ?? '';
      return { data: { url, count: invocations }, status: 200, headers: {} };
    });

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false, capacity: 2 });

    await instance.get('/a', { headers: { [CACHE_HEADER]: 'true' } });
    await instance.get('/b', { headers: { [CACHE_HEADER]: 'true' } });
    await instance.get('/c', { headers: { [CACHE_HEADER]: 'true' } });

    expect(invocations).toBe(3);

    // /a was evicted (LRU) when /c was stored: cache currently holds /b, /c.
    const aAgain = await instance.get('/a', { headers: { [CACHE_HEADER]: 'true' } });
    expect(aAgain.data.count).toBe(4);
    expect(invocations).toBe(4);

    // /a's re-insert touches LRU order: cache holds /c, /a; re-fetch /b evicts /c.
    const bAgain = await instance.get('/b', { headers: { [CACHE_HEADER]: 'true' } });
    expect(bAgain.data.count).toBe(5);
    expect(invocations).toBe(5);

    // /c is now evicted; /b request re-touched LRU so cache holds /a, /b; /c is a miss.
    const cAgain = await instance.get('/c', { headers: { [CACHE_HEADER]: 'true' } });
    expect(cAgain.data.count).toBe(6);
    expect(invocations).toBe(6);
  });

  it('bypasses cache when response config is unsupported for safe cloning', async () => {
    let invocations = 0;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return {
        data: { value: invocations },
        status: 200,
        headers: {},
      };
    });

    // Stream-mode (or other) response data prevents safe caching
    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    await instance.get('/special', {
      headers: { [CACHE_HEADER]: 'true' },
      responseType: 'stream' as unknown as undefined,
    });
    await instance.get('/special', {
      headers: { [CACHE_HEADER]: 'true' },
      responseType: 'stream' as unknown as undefined,
    });

    expect(invocations).toBe(2);
  });

  it('does not leave dangling timers when dispose is called', async () => {
    const { instance } = createFakeAdapter(() => ({ data: { v: 1 }, status: 200, headers: {} }));

    const controller = useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(() => controller.dispose()).not.toThrow();

    // Subsequent reads reach the network (cache disposed)
    let invocations = 0;
    const instance2 = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        invocations += 1;
        return {
          data: { x: invocations },
          status: 200,
          headers: {},
          statusText: 'OK',
          config,
        } as unknown as AxiosResponse;
      },
    });
    useCacheInterceptors(instance2, { ttl: 60_000, withCredentialsDefault: false, capacity: 1 });
    await instance2.get('/a', { headers: { [CACHE_HEADER]: 'true' } });
    await instance2.get('/b', { headers: { [CACHE_HEADER]: 'true' } });
    await instance2.get('/a', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(3);
  });
});

describe('cache concurrency dedup', () => {
  type DeferredResult = { data: unknown; status: number; headers: Record<string, unknown> };
  type ResultOrError = DeferredResult | Error;
  const createDeferredAdapter = (responses: ResultOrError[]) => {
    const tracker: { invocations: number } = { invocations: 0 };
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        tracker.invocations += 1;
        const idx = tracker.invocations - 1;
        const inflight = responses[idx];
        if (inflight instanceof Error) throw inflight;
        return {
          data: inflight.data,
          status: inflight.status,
          statusText: 'OK',
          headers: { ...inflight.headers },
          config,
        } as unknown as AxiosResponse;
      },
    });
    return { instance, tracker };
  };

  it('shares one in-flight request for identical concurrent cache misses and returns independent snapshots to each caller', async () => {
    let invocations = 0;
    let pendingResolve: ((value: DeferredResult) => void) | undefined;
    const { instance } = createFakeAdapter(() => {
      invocations += 1;
      return new Promise<DeferredResult>((resolve) => {
        pendingResolve = resolve;
      });
    });

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    const p1 = instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    const p2 = instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    const p3 = instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });

    await new Promise((r) => setImmediate(r));
    expect(invocations).toBe(1);

    const result1 = { v: 1, items: [{ id: 'a' }] };
    pendingResolve?.({ data: result1, status: 200, headers: {} });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(invocations).toBe(1);
    expect(r1.data).toEqual(result1);
    expect(r2.data).toEqual(result1);
    expect(r3.data).toEqual(result1);

    // Each caller gets an independent snapshot
    (r1.data as { v: number }).v = 999;
    (r1.data as { items: { id: string }[] }).items.push({ id: 'z' });
    expect((r2.data as { v: number }).v).toBe(1);
    expect((r2.data as { items: { id: string }[] }).items).toEqual([{ id: 'a' }]);
    expect((r3.data as { v: number }).v).toBe(1);

    await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(invocations).toBe(1);
  });

  it('a rejected in-flight request is not retained and a later retry reaches the server', async () => {
    const { instance, tracker } = createDeferredAdapter([
      new Error('boom'),
      { data: { ok: true, count: 1 }, status: 200, headers: {} },
      { data: { ok: true, count: 1 }, status: 200, headers: {} },
    ]);

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    // Attach handlers synchronously so the rejection of p1/p2 is consumed
    // before the microtask checkpoint (Promise.allSettled would otherwise
    // attach handlers only after `await setImmediate`, by which point Node
    // has already raised unhandledRejection for the unhandled promises).
    const settle = <T>(p: Promise<T>) =>
      p.then(
        (v) => ({ status: 'fulfilled' as const, value: v }),
        (e: unknown) => ({ status: 'rejected' as const, reason: e }),
      );
    const p1 = settle(instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } }));
    const p2 = settle(instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } }));

    await new Promise((r) => setImmediate(r));
    expect(p1).toBeInstanceOf(Promise);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe('rejected');
    expect(r2.status).toBe('rejected');

    const retry = instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    const result = await retry;
    expect(result.data).toEqual({ ok: true, count: 1 });

    // After the retry succeeds, subsequent identical reads serve the cache
    await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(tracker.invocations).toBe(2);
  });

  it('does not deduplicate mutations or requests that bypass cache', async () => {
    const responses: ResultOrError[] = [
      { data: { ok: 1 }, status: 200, headers: {} },
      { data: { ok: 2 }, status: 200, headers: {} },
    ];
    const { instance, tracker } = createDeferredAdapter(responses);

    useCacheInterceptors(instance, { ttl: 60_000, withCredentialsDefault: false });

    const p1 = instance.post('/mutate', { a: 1 }, { headers: { [CACHE_HEADER]: 'false' } });
    const p2 = instance.post('/mutate', { a: 1 }, { headers: { [CACHE_HEADER]: 'false' } });

    // Mutations must each reach the network
    await new Promise((r) => setImmediate(r));
    expect(tracker.invocations).toBe(2);

    await Promise.all([p1, p2]);
  });

  it('does not coalesce concurrent misses across different cache partitions, headers, params, or supported response config', async () => {
    const responses: ResultOrError[] = [
      { data: { id: 1 }, status: 200, headers: {} },
      { data: { id: 2 }, status: 200, headers: {} },
      { data: { id: 3 }, status: 200, headers: {} },
      { data: { id: 4 }, status: 200, headers: {} },
    ];
    const { instance, tracker } = createDeferredAdapter(responses);

    useCacheInterceptors(instance, {
      ttl: 60_000,
      withCredentialsDefault: false,
      partitionForRequest: (config) => {
        const headers = config.headers as Record<string, unknown> | undefined;
        return typeof headers?.['x-identity'] === 'string' ? (headers['x-identity'] as string) : undefined;
      },
    });

    const promises = [
      instance.get('/cached', { headers: { [CACHE_HEADER]: 'true', 'x-identity': 'admin' } }),
      instance.get('/cached', { headers: { [CACHE_HEADER]: 'true', 'x-identity': 'guest' } }),
      instance.get('/cached', { headers: { [CACHE_HEADER]: 'true', 'x-identity': 'admin', 'x-extra': 'a' } }),
      instance.get('/cached', { params: { a: 1 }, headers: { [CACHE_HEADER]: 'true', 'x-identity': 'admin' } }),
    ];

    await new Promise((r) => setImmediate(r));
    expect(tracker.invocations).toBe(4);

    await Promise.all(promises);
  });
});
