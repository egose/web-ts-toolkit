import { describe, expect, it } from 'vitest';
import { AxiosHeaders, type AxiosRequestConfig } from 'axios';

import { CACHE_HEADER } from '../src/constants';
import { getWrapContext } from '../src/helpers';
import { setupIntegrationSuite, type Pet } from './support/integration-suite';

const suite = setupIntegrationSuite();

describe('access-router-client configuration immutability (ARC-12)', () => {
  describe('updateHeaders does not mutate caller headers', () => {
    it('returns a fresh object for plain-object headers and leaves the caller input unchanged', async () => {
      // Reuse the same caller headers object across two requests with different
      // ignoreCache settings; the caller input must remain equal to what was
      // passed in originally.
      const callerHeaders = { user: 'admin' } as Record<string, unknown>;
      const snapshot = { ...callerHeaders };

      const petService = suite.adapter.createDataService<Pet>({ dataName: 'pet-data', basePath: 'pets' });

      const first = await petService.read('Max', undefined, {
        headers: callerHeaders,
      });
      expect(first.success).toBe(true);

      const second = await petService.read(
        'Max',
        { ignoreCache: true },
        {
          headers: callerHeaders,
        },
      );
      expect(second.success).toBe(true);

      expect(callerHeaders).toEqual(snapshot);
      expect(Object.keys(callerHeaders).sort()).toEqual(['user']);
    });

    it('clones AxiosHeaders instances instead of mutating the caller instance', async () => {
      const callerHeaders = new AxiosHeaders({ user: 'admin' });
      // Sanity: caller input has no cache header before invocation.
      expect(callerHeaders.has(CACHE_HEADER)).toBe(false);

      const petService = suite.adapter.createDataService<Pet>({ dataName: 'pet-data', basePath: 'pets' });

      await petService.read('Max', undefined, {
        headers: callerHeaders as unknown as Record<string, unknown>,
      });

      // The caller AxiosHeaders instance must NOT have been mutated by the
      // request pipeline: it must still lack the cache header after the read.
      expect(callerHeaders.has(CACHE_HEADER)).toBe(false);
      expect(callerHeaders.get('user')).toBe('admin');
    });

    it('preserves a caller-supplied cache header over the ignoreCache default', async () => {
      // Precedence rule: caller-supplied CACHE_HEADER wins.
      const callerHeaders = { [CACHE_HEADER]: 'true', user: 'admin' } as Record<string, unknown>;
      const snapshot = { ...callerHeaders };

      const petService = suite.adapter.createDataService<Pet>({ dataName: 'pet-data', basePath: 'pets' });

      // ignoreCache=true would set 'false' if it won, but the caller value
      // ('true') must win and the caller input must remain unchanged.
      const result = await petService.read(
        'Max',
        { ignoreCache: true },
        {
          headers: callerHeaders,
        },
      );
      expect(result.success).toBe(true);
      expect(callerHeaders).toEqual(snapshot);
    });
  });

  describe('getWrapContext does not mutate caller config', () => {
    it('does not write queryParams into the passed config object', () => {
      const baseConfig: AxiosRequestConfig = { headers: { user: 'admin' } };
      const snapshotHeaders = { ...((baseConfig.headers as Record<string, unknown>) ?? {}) };
      const snapshotParams = baseConfig.params;

      const { finalConfig } = getWrapContext(
        '/api/echo/{{seg}}',
        { queryParams: { mode: 'list' }, pathParams: { seg: 'x' } },
        baseConfig,
      );

      // The returned config has the merged params; the input does NOT.
      expect((finalConfig as AxiosRequestConfig).params).toEqual({ mode: 'list' });
      expect(baseConfig.params).toBe(snapshotParams);
      expect(baseConfig.headers).toEqual(snapshotHeaders);
    });

    it('returns a fresh config object even when only queryParams is provided (no config arg)', () => {
      const { finalConfig } = getWrapContext('/api/x', { queryParams: { a: 1 } }, undefined);
      expect((finalConfig as AxiosRequestConfig).params).toEqual({ a: 1 });
    });

    it('is order-independent when reused for repeated wrapper invocations', () => {
      const baseConfig: AxiosRequestConfig = { headers: { user: 'admin' } };
      const first = getWrapContext('/api/echo/{{seg}}', { queryParams: { mode: 'a' } }, baseConfig);
      const second = getWrapContext('/api/echo/{{seg}}', { queryParams: { mode: 'b' } }, baseConfig);
      const third = getWrapContext('/api/echo/{{seg}}', { queryParams: { mode: 'c' } }, baseConfig);

      expect((first.finalConfig as AxiosRequestConfig).params).toEqual({ mode: 'a' });
      expect((second.finalConfig as AxiosRequestConfig).params).toEqual({ mode: 'b' });
      expect((third.finalConfig as AxiosRequestConfig).params).toEqual({ mode: 'c' });

      // Reused input is unchanged.
      expect(baseConfig.params).toBeUndefined();
    });
  });

  describe('wrap helpers do not mutate the captured default config across invocations', () => {
    it('clone with per-call options remains stable across repeated wrapGet calls (order-independent)', async () => {
      const defaultConfig: AxiosRequestConfig = { headers: { user: 'admin' } };
      const wrapGet = suite.adapter.wrapGet('/echo-segment/{{segment}}', defaultConfig);

      const first = await wrapGet({ pathParams: { segment: 'plain' }, queryParams: { mode: 'a' } });
      const second = await wrapGet({ pathParams: { segment: 'other' }, queryParams: { mode: 'b' } });

      expect(first.data.segment).toBe('plain');
      expect(second.data.segment).toBe('other');

      // The captured default config was never mutated by wrapper preparation:
      // its headers still contain only the caller's `user` header and no
      // package-owned CACHE_HEADER, and no `params` were leaked in.
      const headers = defaultConfig.headers as Record<string, unknown> | undefined;
      expect(headers?.user).toBe('admin');
      expect(headers?.[CACHE_HEADER]).toBeUndefined();
      expect(defaultConfig.params).toBeUndefined();
    });

    it('wrapPost default config is not mutated by repeated invocations', async () => {
      // Use the service-level wrapPost endpoint (`endpoints.chairman`) which
      // is registered on the integration suite via `/api/orgs/chairman`. We
      // build a separate service with our own default config so we can verify
      // the captured default is left untouched.
      const callerHeaders = new AxiosHeaders({ 'X-Caller': 'value' });
      const defaultConfig: AxiosRequestConfig = { headers: callerHeaders };
      const wrapPost = suite.adapter.wrapPost('orgs/chairman', defaultConfig);

      const res = await wrapPost({ flag: 'pencil' });
      expect(res.data).toEqual({ name: 'chairman', flag: 'pencil' });

      // The captured caller AxiosHeaders instance must not be mutated by the
      // wrapper preparation path.
      expect(callerHeaders.has(CACHE_HEADER)).toBe(false);
      expect(callerHeaders.get('X-Caller')).toBe('value');
    });

    it('wrapPut/wrapPatch/wrapDelete default configs survive repeated invocations with mixed params', async () => {
      const defaultConfig: AxiosRequestConfig = { headers: { scope: 'demo' } };

      const wrapPut = suite.adapter.wrapPut('test/wrap-success/{{name}}', defaultConfig);
      const wrapPatch = suite.adapter.wrapPatch('test/wrap-success/{{name}}', defaultConfig);
      const wrapDelete = suite.adapter.wrapDelete('test/wrap-success/{{name}}', defaultConfig);

      await wrapPut({ flag: 'blue' }, { pathParams: { name: 'alpha' }, queryParams: { mode: 'replace' } });
      await wrapPatch({ flag: 'green' }, { pathParams: { name: 'beta' }, queryParams: { mode: 'update' } });
      await wrapDelete({ pathParams: { name: 'gamma' }, queryParams: { mode: 'drop' } });

      const headers = defaultConfig.headers as Record<string, unknown> | undefined;
      expect(headers?.scope).toBe('demo');
      expect(headers?.[CACHE_HEADER]).toBeUndefined();
      expect(defaultConfig.params).toBeUndefined();
    });

    it('accepts AxiosHeaders in the default config without declaration errors and preserves the caller instance', async () => {
      const callerHeaders = new AxiosHeaders({ 'X-Caller': 'axios-instance' });
      const defaultConfig: AxiosRequestConfig = { headers: callerHeaders };

      const wrapGet = suite.adapter.wrapGet('/echo-segment/{{segment}}', defaultConfig);

      const res = await wrapGet({ pathParams: { segment: 'plain' }, queryParams: { mode: 'a' } });
      expect(res.data.segment).toBe('plain');

      // The caller's AxiosHeaders instance must not be mutated by the wrapper
      // preparation path: it must still lack the package-owned CACHE_HEADER.
      expect(callerHeaders.has(CACHE_HEADER)).toBe(false);
      expect(callerHeaders.get('X-Caller')).toBe('axios-instance');
    });
  });

  describe('service methods do not mutate caller axiosRequestConfig across calls', () => {
    it('model service read: caller axiosRequestConfig is unchanged after success and failure', async () => {
      const { services, seedState } = suite;
      const callerConfig: AxiosRequestConfig = {
        headers: { user: 'admin' },
        params: { include_permissions: true },
      };
      const snapshot = {
        headers: { ...(callerConfig.headers as Record<string, unknown>) },
        params: { ...(callerConfig.params as Record<string, unknown>) },
      };

      // Success path
      const ok = await services.userService.read(String(seedState.admin._id), undefined, callerConfig);
      expect(ok.success).toBe(true);
      // Failure path: bogus ObjectId returns 4xx from the server.
      const fail = await services.userService.read('000000000000000000000000', undefined, callerConfig);
      expect(fail.success).toBe(false);

      expect(callerConfig.headers).toEqual(snapshot.headers);
      expect(callerConfig.params).toEqual(snapshot.params);
    });

    it('reusing the same caller config object across many requests is order-independent', async () => {
      const { services } = suite;
      const callerConfig: AxiosRequestConfig = { headers: { user: 'admin' } };
      const snapshot = { headers: { ...(callerConfig.headers as Record<string, unknown>) } };

      // Interleave distinct reads to prove that no invocation bleeds
      // package-owned state into the caller config.
      for (let i = 0; i < 3; i++) {
        const r = await services.petService.read('Max', undefined, callerConfig);
        expect(r.success).toBe(true);
        expect(callerConfig.headers).toEqual(snapshot.headers);
      }
    });
  });

  describe('adapter services: caller-owned AxiosHeaders round-trip unchanged', () => {
    it('preserves caller AxiosHeaders across service read, including no package-owned cache key written', async () => {
      const { services } = suite;
      const callerHeaders = new AxiosHeaders({ user: 'admin' });

      const ok = await services.userService.list(undefined, undefined, {
        headers: callerHeaders as unknown as Record<string, unknown>,
      });
      expect(ok.success).toBe(true);

      // Caller instance must not carry the package-owned CACHE_HEADER
      // after the read returns.
      expect(callerHeaders.has(CACHE_HEADER)).toBe(false);
      expect(callerHeaders.get('user')).toBe('admin');
    });
  });
});
