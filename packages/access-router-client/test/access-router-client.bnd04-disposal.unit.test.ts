import { describe, expect, it } from 'vitest';
import axios, { type AxiosResponse } from 'axios';
import { cloneConfigWithCacheBypass, useCacheInterceptors } from '../src/services/interceptors';
import { CACHE_HEADER } from '../src/constants';

// BND-04 reproduction: invalidation detaches unsettled slots from the join
// map, but disposal must still own them. Start source+tail, clear (or
// successful mutate), then dispose before source completion: the detached
// tail must reject, late source completion must not repopulate the cache.

type DeferredResult = { data: unknown; status: number; headers: Record<string, unknown> };

const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason: unknown) => ({ status: 'rejected' as const, reason }),
  );

const withTimeoutGuard = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out waiting for ${label} — slot abandoned`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const DISPOSED_MESSAGE = 'Access router client cache was disposed while the request was in flight';

describe('BND-04 dispose owns detached generations', () => {
  it('clear-then-dispose rejects old tails before held source released; late completion cannot repopulate', async () => {
    let getInvocations = 0;
    const resolvers: Array<(value: DeferredResult) => void> = [];
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        getInvocations += 1;
        const result = await new Promise<DeferredResult>((resolve) => {
          resolvers.push(resolve);
        });
        return {
          data: result.data,
          status: result.status,
          statusText: 'OK',
          headers: { ...result.headers },
          config,
        } as unknown as AxiosResponse;
      },
    });
    const controller = useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

    const source = settle(instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } }));
    const tail = settle(instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } }));
    await new Promise((r) => setImmediate(r));
    expect(getInvocations).toBe(1);

    controller.clear();
    controller.dispose();

    const tailResult = await withTimeoutGuard(tail, 5000, 'detached tail after clear-then-dispose');
    expect(tailResult.status).toBe('rejected');
    if (tailResult.status === 'rejected') {
      expect((tailResult.reason as Error).message).toBe(DISPOSED_MESSAGE);
    }

    // Old source still held; releasing it must resolve the source itself
    // without repopulating the cache.
    resolvers[0]?.({ data: { generation: 'old' }, status: 200, headers: {} });
    const sourceResult = await withTimeoutGuard(source, 5000, 'detached source after clear-then-dispose');
    expect(sourceResult.status).toBe('fulfilled');

    // Disposal is terminal: future reads bypass the cache and reach the
    // network independently (documented noncached behavior). Late completion
    // of the old source must not repopulate the cache.
    controller.dispose();
    const after = settle(instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } }));
    await new Promise((r) => setImmediate(r));
    expect(getInvocations).toBe(2);
    resolvers[1]?.({ data: { generation: 'new' }, status: 200, headers: {} });
    const afterResult = await withTimeoutGuard(after, 5000, 'read after dispose');
    expect(afterResult.status).toBe('fulfilled');
    if (afterResult.status === 'fulfilled') {
      expect(afterResult.value.data).toEqual({ generation: 'new' });
    }
  });

  it('mutation-then-dispose rejects old tails before held source released', async () => {
    let getInvocations = 0;
    let resolveGet: ((value: DeferredResult) => void) | undefined;
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        if ((config.method ?? 'get').toLowerCase() !== 'get') {
          return {
            data: { ok: true },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          } as unknown as AxiosResponse;
        }
        getInvocations += 1;
        const result = await new Promise<DeferredResult>((resolve) => {
          resolveGet = resolve;
        });
        return {
          data: result.data,
          status: result.status,
          statusText: 'OK',
          headers: { ...result.headers },
          config,
        } as unknown as AxiosResponse;
      },
    });
    const controller = useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

    const source = settle(instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } }));
    const tail = settle(instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } }));
    await new Promise((r) => setImmediate(r));
    expect(getInvocations).toBe(1);

    // Successful mutation invalidates (detaches the old GET generation).
    await instance.post('/mutate', { a: 1 }, cloneConfigWithCacheBypass({}));
    controller.dispose();

    const tailResult = await withTimeoutGuard(tail, 5000, 'detached tail after mutation-then-dispose');
    expect(tailResult.status).toBe('rejected');
    if (tailResult.status === 'rejected') {
      expect((tailResult.reason as Error).message).toBe(DISPOSED_MESSAGE);
    }

    resolveGet?.({ data: { generation: 'old' }, status: 200, headers: {} });
    const sourceResult = await withTimeoutGuard(source, 5000, 'detached source after mutation-then-dispose');
    expect(sourceResult.status).toBe('fulfilled');

    controller.dispose();
    const after = settle(instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } }));
    await new Promise((r) => setImmediate(r));
    expect(getInvocations).toBe(2);
    resolveGet?.({ data: { generation: 'new' }, status: 200, headers: {} });
    const afterResult = await withTimeoutGuard(after, 5000, 'read after mutation-dispose');
    expect(afterResult.status).toBe('fulfilled');
    if (afterResult.status === 'fulfilled') {
      expect(afterResult.value.data).toEqual({ generation: 'new' });
    }
  });

  it('settled slots are released and dispose stays idempotent', async () => {
    let invocations = 0;
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        invocations += 1;
        return {
          data: { n: invocations },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        } as unknown as AxiosResponse;
      },
    });
    const controller = useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

    const first = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
    expect(first.data).toEqual({ n: 1 });
    controller.dispose();
    expect(() => controller.dispose()).not.toThrow();

    const after = await withTimeoutGuard(
      instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } }),
      5000,
      'noncached read after dispose',
    );
    expect(after.data).toEqual({ n: 2 });
    expect(invocations).toBe(2);
  });
});
