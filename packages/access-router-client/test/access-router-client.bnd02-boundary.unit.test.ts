import { describe, expect, it } from 'vitest';
import axios, { AxiosError, type AxiosResponse } from 'axios';
import { useCacheInterceptors } from '../src/services/interceptors';
import { CACHE_HEADER } from '../src/constants';

// Raw wire bodies: JSON-encoded strings (with quotes) whose inner text looks
// numeric/boolean/null/ordinary/object-like. Source parses once to string;
// double-transform would reparse the string to number/boolean/null/object.
const RAW_CASES: Array<{ name: string; raw: string; expected: unknown; expectedType: string }> = [
  { name: 'numeric-text', raw: JSON.stringify('123'), expected: '123', expectedType: 'string' },
  { name: 'boolean-text', raw: JSON.stringify('true'), expected: 'true', expectedType: 'string' },
  { name: 'null-text', raw: JSON.stringify('null'), expected: 'null', expectedType: 'string' },
  { name: 'ordinary-text', raw: JSON.stringify('hello world'), expected: 'hello world', expectedType: 'string' },
  { name: 'object-looking-text', raw: JSON.stringify('{"a":1}'), expected: '{"a":1}', expectedType: 'string' },
];

describe('BND-02 response transformation boundary', () => {
  it.each(RAW_CASES)(
    'source/tail/completed-hit agree on value+type for $name',
    async ({ raw, expected, expectedType }) => {
      let invocations = 0;
      let resolveNet: ((v: { data: unknown; status: number; headers: Record<string, unknown> }) => void) | undefined;
      const instance = axios.create({
        baseURL: 'http://localhost',
        adapter: async (config) => {
          invocations += 1;
          if (invocations === 1) {
            return new Promise<AxiosResponse>((resolve) => {
              resolveNet = (v) =>
                resolve({
                  data: v.data,
                  status: v.status,
                  statusText: 'OK',
                  headers: v.headers,
                  config,
                } as unknown as AxiosResponse);
            });
          }
          return { data: raw, status: 200, statusText: 'OK', headers: {}, config } as unknown as AxiosResponse;
        },
      });
      useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

      const url = `/bnd02-transform-${expectedType}-${String(expected).slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`;
      const source = instance.get(url, { headers: { [CACHE_HEADER]: 'true' } });
      const tail = instance.get(url, { headers: { [CACHE_HEADER]: 'true' } });
      await new Promise((r) => setImmediate(r));
      expect(invocations).toBe(1);
      resolveNet?.({ data: raw, status: 200, headers: {} });
      const [sourceRes, tailRes] = await Promise.all([source, tail]);
      const hitRes = await instance.get(url, { headers: { [CACHE_HEADER]: 'true' } });

      for (const [label, res] of [
        ['source', sourceRes],
        ['tail', tailRes],
        ['hit', hitRes],
      ] as const) {
        expect({ label, value: res.data, type: typeof res.data }).toEqual({
          label,
          value: expected,
          type: expectedType,
        });
      }
      expect(invocations).toBe(1);
    },
  );

  it('strict JSON mode agrees on value+type (no reparse throw)', async () => {
    const raw = JSON.stringify('hello world'); // '"hello world"'
    let invocations = 0;
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        invocations += 1;
        return { data: raw, status: 200, statusText: 'OK', headers: {}, config } as unknown as AxiosResponse;
      },
    });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });
    const strict = { transitional: { silentJSONParsing: false, forcedJSONParsing: true } } as const;
    const url = `/bnd02-strict-${Math.random().toString(36).slice(2, 7)}`;
    const source = await instance.get(url, {
      headers: { [CACHE_HEADER]: 'true' },
      responseType: 'json',
      ...strict,
    });
    const hit = await instance.get(url, {
      headers: { [CACHE_HEADER]: 'true' },
      responseType: 'json',
      ...strict,
    });
    expect(source.data).toBe('hello world');
    expect(typeof source.data).toBe('string');
    expect(hit.data).toBe('hello world');
    expect(typeof hit.data).toBe('string');
    expect(invocations).toBe(1);
  });
});

// --- validateStatus with Axios-equivalent settlement in fake network ---

function createSettlingFake(status: number, raw: unknown) {
  let invocations = 0;
  const instance = axios.create({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      invocations += 1;
      const response = {
        data: raw,
        status,
        statusText: 'S',
        headers: {},
        config,
      } as unknown as AxiosResponse;
      const validateStatus = (config as unknown as { validateStatus?: (s: number) => boolean }).validateStatus;
      if (status && validateStatus && !validateStatus(status)) {
        const err = new AxiosError(
          `Request failed with status code ${status}`,
          status >= 400 && status < 500 ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_BAD_RESPONSE,
          config as never,
          undefined,
          response,
        );
        throw err;
      }
      return response;
    },
  });
  return { instance, getInvocations: () => invocations };
}

const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason: unknown) => ({ status: 'rejected' as const, reason }),
  );

describe('BND-02 per-caller status settlement', () => {
  it('cached 200 rejects under validateStatus ()=>false (caller ownership)', async () => {
    const { instance, getInvocations } = createSettlingFake(200, { ok: true });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });
    const url = `/bnd02-vs-${Math.random().toString(36).slice(2, 7)}`;
    const first = await instance.get(url, { headers: { [CACHE_HEADER]: 'true' } });
    expect(first.data).toEqual({ ok: true });
    const strictCall = settle(instance.get(url, { headers: { [CACHE_HEADER]: 'true' }, validateStatus: () => false }));
    const strictRes = await strictCall;
    expect(strictRes.status).toBe('rejected');
    if (strictRes.status === 'rejected') {
      expect(strictRes.reason).toBeInstanceOf(AxiosError);
      expect((strictRes.reason as AxiosError).config?.validateStatus?.(200)).toBe(false);
    }
    expect(getInvocations()).toBe(1);
  });

  it.each([
    { order: 'strict-first', firstVs: 'default', secondVs: 'permissive' },
    { order: 'permissive-first', firstVs: 'permissive', secondVs: 'default' },
  ])('divergent 404 policies settle per caller regardless of source order ($order)', async ({ firstVs, secondVs }) => {
    const mkVs = (kind: string) => (kind === 'default' ? undefined : () => true);
    let invocations = 0;
    let resolveNet: ((v: { data: unknown; status: number }) => void) | undefined;
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        invocations += 1;
        if (invocations === 1) {
          // Deferred raw 404; apply caller-equivalent settlement at network:
          // emulate real http adapter settling per SOURCE config, so slot logic
          // must still give per-caller results to tails.
          return new Promise<AxiosResponse>((resolve, reject) => {
            resolveNet = (v) => {
              const response = {
                data: v.data,
                status: v.status,
                statusText: 'NF',
                headers: {},
                config,
              } as unknown as AxiosResponse;
              const vs = (config as unknown as { validateStatus?: (s: number) => boolean }).validateStatus;
              if (v.status && vs && !vs(v.status)) {
                reject(
                  new AxiosError(
                    `Request failed with status code ${v.status}`,
                    AxiosError.ERR_BAD_REQUEST,
                    config as never,
                    undefined,
                    response,
                  ),
                );
              } else if (v.status && !vs) {
                // default axios validateStatus rejects non-2xx
                if (v.status < 200 || v.status >= 300) {
                  reject(
                    new AxiosError(
                      `Request failed with status code ${v.status}`,
                      AxiosError.ERR_BAD_REQUEST,
                      config as never,
                      undefined,
                      response,
                    ),
                  );
                } else resolve(response);
              } else resolve(response);
            };
          });
        }
        throw new Error('unexpected second network call in dedup test');
      },
    });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });
    const url = `/bnd02-404-${firstVs}-${secondVs}-${Math.random().toString(36).slice(2, 7)}`;
    const firstOpts: Record<string, unknown> = { headers: { [CACHE_HEADER]: 'true' } };
    const secondOpts: Record<string, unknown> = { headers: { [CACHE_HEADER]: 'true' } };
    const fvs = mkVs(firstVs);
    const svs = mkVs(secondVs);
    if (fvs) firstOpts['validateStatus'] = fvs;
    if (svs) secondOpts['validateStatus'] = svs;

    const p1 = settle(instance.get(url, firstOpts));
    const p2 = settle(instance.get(url, secondOpts));
    await new Promise((r) => setImmediate(r));
    expect(invocations).toBe(1);
    resolveNet?.({ data: { err: 'nf' }, status: 404 });
    const [r1, r2] = await Promise.all([p1, p2]);
    // firstVs default => reject; permissive => fulfill. Check per-caller.
    const expectFirst = firstVs === 'default' ? 'rejected' : 'fulfilled';
    const expectSecond = secondVs === 'default' ? 'rejected' : 'fulfilled';
    expect(r1.status).toBe(expectFirst);
    expect(r2.status).toBe(expectSecond);
    if (r1.status === 'fulfilled') expect((r1.value as AxiosResponse).data).toEqual({ err: 'nf' });
    if (r2.status === 'fulfilled') expect((r2.value as AxiosResponse).data).toEqual({ err: 'nf' });
    // caller config ownership: rejection carries its own caller config
    if (r1.status === 'rejected') {
      const cfg = (r1.reason as AxiosError).config as unknown as { validateStatus?: (s: number) => boolean };
      if (firstOpts['validateStatus']) {
        expect(cfg?.validateStatus).toBe(firstOpts['validateStatus']);
      } else {
        expect(typeof cfg?.validateStatus).toBe('function');
        expect(cfg?.validateStatus?.(404)).toBe(false);
        if (secondOpts['validateStatus']) expect(cfg?.validateStatus).not.toBe(secondOpts['validateStatus']);
      }
    }
    if (r2.status === 'rejected') {
      const cfg = (r2.reason as AxiosError).config as unknown as { validateStatus?: (s: number) => boolean };
      if (secondOpts['validateStatus']) {
        expect(cfg?.validateStatus).toBe(secondOpts['validateStatus']);
      } else {
        expect(typeof cfg?.validateStatus).toBe('function');
        expect(cfg?.validateStatus?.(404)).toBe(false);
        if (firstOpts['validateStatus']) expect(cfg?.validateStatus).not.toBe(firstOpts['validateStatus']);
      }
    }
    expect(invocations).toBe(1);
  });

  it('ordinary hits/dedup still save network requests', async () => {
    const { instance, getInvocations } = createSettlingFake(200, { v: 1 });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });
    const url = `/bnd02-ordinary-${Math.random().toString(36).slice(2, 7)}`;
    const [a, b] = await Promise.all([
      instance.get(url, { headers: { [CACHE_HEADER]: 'true' } }),
      instance.get(url, { headers: { [CACHE_HEADER]: 'true' } }),
    ]);
    expect(a.data).toEqual({ v: 1 });
    expect(b.data).toEqual({ v: 1 });
    const c = await instance.get(url, { headers: { [CACHE_HEADER]: 'true' } });
    expect(c.data).toEqual({ v: 1 });
    expect(getInvocations()).toBe(1);
  });
});
