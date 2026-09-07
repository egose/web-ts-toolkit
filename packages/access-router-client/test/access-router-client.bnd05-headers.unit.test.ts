import { describe, expect, it } from 'vitest';
import axios, { AxiosHeaders, type AxiosInstance, type AxiosResponse } from 'axios';

import { cloneConfigWithCacheBypass, useCacheInterceptors } from '../src/services/interceptors';
import { createWrapHelper } from '../src/services/wrap';
import { Service } from '../src/services/service';
import { CACHE_HEADER } from '../src/constants';

// BND-05 reproduction:
// 1) `interceptors.ts` bypass uses case-sensitive indexing, and
//    `service.ts updateHeaders` recognizes plain-object overrides only by the
//    lowercase key. A caller `X-Axios-Cache: false` (upper/mixed) is ignored
//    or overwritten.
// 2) Wrappers/services always stamp an internal mutation header, but it is
//    consumed only when caching is enabled. With default TTL zero the header
//    reaches dispatch.

const INVALIDATE_HEADER = 'x-axios-cache-invalidate-on-success';

type SeenRequest = { url?: string; headers: Record<string, unknown> };

const snapshotHeaders = (headers: unknown): Record<string, unknown> => {
  const raw = headers instanceof AxiosHeaders ? headers.toJSON() : ((headers ?? {}) as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key.toLowerCase()] = value;
  }
  return out;
};

function createCapturingAdapter(handler: (config: Record<string, unknown>) => { data: unknown; status: number }): {
  instance: AxiosInstance;
  seen: SeenRequest[];
  invocations: () => number;
} {
  const seen: SeenRequest[] = [];
  const instance = axios.create({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      seen.push({ url: config.url, headers: snapshotHeaders(config.headers) });
      const result = handler(config as unknown as Record<string, unknown>);
      return {
        data: result.data,
        status: result.status,
        statusText: 'OK',
        headers: {},
        config,
      } as unknown as AxiosResponse;
    },
  });
  return { instance, seen, invocations: () => seen.length };
}

const HEADER_STYLES: Array<{ label: string; make: (value: string) => unknown; key: string }> = [
  { label: 'lowercase plain', make: (value) => ({ [CACHE_HEADER]: value }), key: CACHE_HEADER },
  { label: 'uppercase plain', make: (value) => ({ 'X-Axios-Cache': value }), key: 'X-Axios-Cache' },
  { label: 'mixed plain', make: (value) => ({ 'x-AxIoS-cAcHe': value }), key: 'x-AxIoS-cAcHe' },
  { label: 'lowercase AxiosHeaders', make: (value) => new AxiosHeaders({ [CACHE_HEADER]: value }), key: CACHE_HEADER },
  {
    label: 'uppercase AxiosHeaders',
    make: (value) => new AxiosHeaders({ 'X-Axios-Cache': value }),
    key: 'X-Axios-Cache',
  },
  { label: 'mixed AxiosHeaders', make: (value) => new AxiosHeaders({ 'x-AxIoS-cAcHe': value }), key: 'x-AxIoS-cAcHe' },
];

describe('BND-05 case-insensitive cache bypass', () => {
  for (const style of HEADER_STYLES) {
    it(`explicit '${style.label}' false bypasses the cache without mutating caller input`, async () => {
      let n = 0;
      const { instance } = createCapturingAdapter(() => {
        n += 1;
        return { data: { value: n }, status: 200 };
      });
      useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

      // Prime a completed entry.
      const primed = await instance.get('/cached', { headers: { [CACHE_HEADER]: 'true' } });
      expect(primed.data).toEqual({ value: 1 });

      const callerHeaders = style.make('false');
      const callerSnapshot =
        callerHeaders instanceof AxiosHeaders
          ? callerHeaders.toJSON()
          : { ...(callerHeaders as Record<string, unknown>) };

      const first = await instance.get('/cached', { headers: callerHeaders as never });
      const second = await instance.get('/cached', { headers: callerHeaders as never });

      // Each bypassed read dispatches separately instead of hitting the entry.
      expect(n).toBe(3);
      expect(first.data).toEqual({ value: 2 });
      expect(second.data).toEqual({ value: 3 });

      // Caller input is unchanged (no stamped lowercase key, original intact).
      if (callerHeaders instanceof AxiosHeaders) {
        expect(callerHeaders.toJSON()).toEqual(callerSnapshot);
      } else {
        expect(callerHeaders).toEqual(callerSnapshot);
      }
    });
  }

  it('mixed-case true remains cache eligible (override honored, not bypassed)', async () => {
    let n = 0;
    const { instance } = createCapturingAdapter(() => {
      n += 1;
      return { data: { value: n }, status: 200 };
    });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

    await instance.get('/cached', { headers: { 'X-Axios-Cache': 'true' } });
    const hit = await instance.get('/cached', { headers: { 'x-AxIoS-cAcHe': 'true' } });
    expect(n).toBe(1);
    expect(hit.data).toEqual({ value: 1 });
  });

  it('bypassed reads dispatch separately against active entries and leave unrelated entries intact', async () => {
    type Deferred = { data: unknown; status: number };
    let reads = 0;
    const resolvers: Array<(value: Deferred) => void> = [];
    const seen: SeenRequest[] = [];
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        seen.push({ url: config.url, headers: snapshotHeaders(config.headers) });
        if (config.url === '/active') {
          reads += 1;
          const result = await new Promise<Deferred>((resolve) => resolvers.push(resolve));
          return {
            data: result.data,
            status: result.status,
            statusText: 'OK',
            headers: {},
            config,
          } as unknown as AxiosResponse;
        }
        return {
          data: { other: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        } as unknown as AxiosResponse;
      },
    });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

    // Unrelated completed entry.
    await instance.get('/other', { headers: { [CACHE_HEADER]: 'true' } });

    // Active source + tail on /active (one network dispatch).
    const source = instance.get('/active', { headers: { [CACHE_HEADER]: 'true' } });
    const tail = instance.get('/active', { headers: { [CACHE_HEADER]: 'true' } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(reads).toBe(1);

    // Mixed-case bypass must NOT join the active slot: separate dispatch.
    const bypassed = instance.get('/active', { headers: { 'X-Axios-Cache': 'false' } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(reads).toBe(2);

    resolvers[0]?.({ data: { generation: 'old' }, status: 200 });
    resolvers[1]?.({ data: { generation: 'bypass' }, status: 200 });

    await expect(source).resolves.toMatchObject({ data: { generation: 'old' } });
    await expect(tail).resolves.toMatchObject({ data: { generation: 'old' } });
    await expect(bypassed).resolves.toMatchObject({ data: { generation: 'bypass' } });

    // Unrelated entry survives the bypassed read.
    const otherAgain = await instance.get('/other', { headers: { [CACHE_HEADER]: 'true' } });
    expect(otherAgain.data).toEqual({ other: true });
    expect(seen.filter((s) => s.url === '/other')).toHaveLength(1);
  });
});

describe('BND-05 updateHeaders precedence is case-insensitive and nonmutating', () => {
  const service = new Service(axios.create(), 'base');

  for (const style of HEADER_STYLES) {
    it(`caller '${style.label}' false wins over ignoreCache:false without mutation`, () => {
      const callerHeaders = style.make('false');
      const snapshot =
        callerHeaders instanceof AxiosHeaders
          ? callerHeaders.toJSON()
          : { ...(callerHeaders as Record<string, unknown>) };

      const result = service.updateHeaders(callerHeaders as never, { ignoreCache: false });

      // Explicit caller override wins: effective value stays 'false'.
      const effective = snapshotHeaders(result);
      expect(effective[CACHE_HEADER]).toBe('false');
      // Caller input unchanged.
      if (callerHeaders instanceof AxiosHeaders) {
        expect(callerHeaders.toJSON()).toEqual(snapshot);
      } else {
        expect(callerHeaders).toEqual(snapshot);
      }
    });

    it(`caller '${style.label}' true wins over ignoreCache:true without mutation`, () => {
      const callerHeaders = style.make('true');
      const snapshot =
        callerHeaders instanceof AxiosHeaders
          ? callerHeaders.toJSON()
          : { ...(callerHeaders as Record<string, unknown>) };

      const result = service.updateHeaders(callerHeaders as never, { ignoreCache: true });

      const effective = snapshotHeaders(result);
      expect(effective[CACHE_HEADER]).toBe('true');
      if (callerHeaders instanceof AxiosHeaders) {
        expect(callerHeaders.toJSON()).toEqual(snapshot);
      } else {
        expect(callerHeaders).toEqual(snapshot);
      }
    });
  }
});

describe('BND-05 internal invalidation signal stays off the wire', () => {
  it('direct mutation dispatch excludes the signal with positive TTL and still invalidates', async () => {
    let reads = 0;
    const { instance, seen } = createCapturingAdapter((config) => {
      if ((config as { url?: string }).url === '/read') {
        reads += 1;
        return { data: { count: reads }, status: 200 };
      }
      return { data: { ok: true }, status: 200 };
    });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

    await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    await instance.post('/mutate', { a: 1 }, cloneConfigWithCacheBypass({}));
    const after = await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });

    expect(reads).toBe(2);
    expect(after.data).toEqual({ count: 2 });

    const mutationSeen = seen.filter((s) => s.url === '/mutate');
    expect(mutationSeen).toHaveLength(1);
    expect(mutationSeen[0].headers[INVALIDATE_HEADER]).toBeUndefined();
    expect(mutationSeen[0].headers[CACHE_HEADER]).toBe('false');
  });

  it('direct mutation dispatch excludes the signal with TTL zero (no interceptors)', async () => {
    const { instance, seen } = createCapturingAdapter(() => ({ data: { ok: true }, status: 200 }));

    await instance.post('/mutate', { a: 1 }, cloneConfigWithCacheBypass({}));

    expect(seen).toHaveLength(1);
    expect(seen[0].headers[INVALIDATE_HEADER]).toBeUndefined();
    expect(seen[0].headers[CACHE_HEADER]).toBe('false');
  });

  it('wrapper mutation dispatch excludes the signal with TTL zero and positive TTL', async () => {
    for (const ttlMs of [0, 60_000]) {
      const { instance, seen } = createCapturingAdapter(() => ({ data: { ok: true }, status: 200 }));
      if (ttlMs > 0) {
        useCacheInterceptors(instance, { ttlMs, withCredentialsDefault: false });
      }
      const wrapPost = createWrapHelper(instance).wrapPost('/mutate', {});
      await wrapPost({ a: 1 });

      expect(seen).toHaveLength(1);
      expect(seen[0].headers[INVALIDATE_HEADER]).toBeUndefined();
      expect(seen[0].headers[CACHE_HEADER]).toBe('false');
    }
  });

  it('legacy manual mixed-case invalidation header is consumed and stripped when caching is enabled', async () => {
    let reads = 0;
    const { instance, seen } = createCapturingAdapter((config) => {
      if ((config as { url?: string }).url === '/read') {
        reads += 1;
        return { data: { count: reads }, status: 200 };
      }
      return { data: { ok: true }, status: 200 };
    });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

    await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });
    await instance.post(
      '/mutate',
      { a: 1 },
      { headers: { 'X-Axios-Cache-Invalidate-On-Success': 'true', 'X-Axios-Cache': 'false' } },
    );
    const after = await instance.get('/read', { headers: { [CACHE_HEADER]: 'true' } });

    // Invalidation intent honored (case-insensitive) despite mixed case.
    expect(reads).toBe(2);
    expect(after.data).toEqual({ count: 2 });

    const mutationSeen = seen.filter((s) => s.url === '/mutate');
    expect(mutationSeen).toHaveLength(1);
    expect(mutationSeen[0].headers[INVALIDATE_HEADER]).toBeUndefined();
  });

  it('cloneConfigWithCacheBypass normalizes a mixed-case caller bypass key and emits no wire signal', () => {
    const plainSource = { headers: { 'X-Axios-Cache': 'true', other: '1' } };
    const plainResult = cloneConfigWithCacheBypass(plainSource);
    const plainHeaders = plainResult.headers as Record<string, unknown>;
    expect(plainHeaders[CACHE_HEADER]).toBe('false');
    expect(plainHeaders['X-Axios-Cache']).toBeUndefined();
    expect(plainHeaders[INVALIDATE_HEADER]).toBeUndefined();
    expect(plainSource.headers).toEqual({ 'X-Axios-Cache': 'true', other: '1' });

    const axiosSource = new AxiosHeaders({ 'X-Axios-Cache': 'true' });
    const axiosResult = cloneConfigWithCacheBypass({ headers: axiosSource });
    const axiosHeaders = axiosResult.headers as Record<string, unknown>;
    expect(axiosHeaders[CACHE_HEADER]).toBe('false');
    expect(axiosHeaders['X-Axios-Cache']).toBeUndefined();
    expect(axiosHeaders[INVALIDATE_HEADER]).toBeUndefined();
    expect(axiosSource.toJSON()).toEqual({ 'X-Axios-Cache': 'true' });
  });
});
