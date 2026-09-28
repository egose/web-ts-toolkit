import { describe, expect, it, onTestFinished } from 'vitest';
import axios, { type AxiosRequestConfig } from 'axios';
import { CACHE_HEADER } from '../src/constants';
import { useCacheInterceptors } from '../src/services/interceptors';

const identities = [
  { partition: 'tenant_a', body: 'payload', credential: 'Bearer synthetic-secret-A' },
  { partition: 'a', body: 'payload_tenant', credential: 'Bearer synthetic-secret-B' },
] as const;

const secretHeaders = {
  Cookie: 'synthetic-cookie-secret',
  'Proxy-Authorization': 'synthetic-proxy-secret',
  'X-Api-Key': 'synthetic-api-key-secret',
  'X-Auth-Token': 'synthetic-auth-token-secret',
  'X-Access-Token': 'synthetic-access-token-secret',
  'Set-Cookie': 'synthetic-set-cookie-secret',
  'WWW-Authenticate': 'synthetic-challenge-secret',
};

function createIdentityCache(gate: Promise<void> = Promise.resolve()) {
  const keys: string[] = [];
  const dispatches: Array<{ identity: string | undefined; body: unknown }> = [];
  const instance = axios.create({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      const identity = identities.find((entry) => entry.credential === config.headers.get('Authorization'));
      const data = { identity: identity?.partition, body: config.data };
      dispatches.push(data);
      await gate;
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    },
  });
  const controller = useCacheInterceptors(instance, {
    ttlMs: 60_000,
    partitionForRequest: (config) =>
      identities.find((entry) => entry.credential === config.headers.get('Authorization'))?.partition,
    onCacheKey: (key) => keys.push(key),
  });
  onTestFinished(() => controller.dispose());
  const request = (identity: (typeof identities)[number]) =>
    instance.get('/clc01', {
      data: identity.body,
      headers: { ...secretHeaders, Authorization: identity.credential },
    });
  return { keys, dispatches, request };
}

function expectRedacted(keys: string[]) {
  expect(keys.length).toBeGreaterThan(0);
  for (const key of keys) {
    for (const secret of [...identities.map((identity) => identity.credential), ...Object.values(secretHeaders)]) {
      expect(key).not.toContain(secret);
      expect(decodeURI(key)).not.toContain(secret);
    }
  }
}

describe('CLC-01 structural cache keys', () => {
  it.each([false, true])(
    'isolates concurrent colliding partitions and reuses each identity (reverse=%s)',
    async (reverse) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { keys, dispatches, request } = createIdentityCache(gate);
      const ordered = reverse ? [...identities].reverse() : [...identities];
      // Neither request adds an identity header to accidentally disambiguate the
      // old key. Only the redacted credential and the body differ on the wire.
      const pending = ordered.flatMap((identity) => [request(identity), request(identity)]);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const concurrentDispatches = dispatches.length;
      release();
      const responses = await Promise.all(pending);

      expect.soft(concurrentDispatches).toBe(2);
      expect.soft(keys[0]).toBe(keys[1]);
      expect.soft(keys[2]).toBe(keys[3]);
      expect.soft(keys[0]).not.toBe(keys[2]);
      for (const [index, identity] of ordered.entries()) {
        const expected = { identity: identity.partition, body: identity.body };
        expect.soft(responses[index * 2].data).toEqual(expected);
        expect.soft(responses[index * 2 + 1].data).toEqual(expected);
        expect(responses[index * 2].data).not.toBe(responses[index * 2 + 1].data);
        responses[index * 2].data.body = 'caller mutation';
        const hit = await request(identity);
        expect.soft(hit.data).toEqual(expected);
        expect(hit.headers[CACHE_HEADER]).toBe('true');
      }
      expect.soft(dispatches).toHaveLength(2);
      expectRedacted(keys);
    },
  );

  it.each([false, true])('does not serve a completed entry to the colliding identity (reverse=%s)', async (reverse) => {
    const { keys, dispatches, request } = createIdentityCache();
    const ordered = reverse ? [...identities].reverse() : [...identities];
    for (const identity of ordered) {
      const source = await request(identity);
      const hit = await request(identity);
      const expected = { identity: identity.partition, body: identity.body };
      expect.soft(source.data).toEqual(expected);
      expect.soft(hit.data).toEqual(expected);
      expect(hit.headers[CACHE_HEADER]).toBe('true');
    }
    expect.soft(dispatches).toHaveLength(2);
    expect.soft(keys[0]).toBe(keys[1]);
    expect.soft(keys[2]).toBe(keys[3]);
    expect.soft(keys[0]).not.toBe(keys[2]);
    expectRedacted(keys);
  });

  it.each([
    { name: 'absent / empty string', left: undefined, right: '' },
    { name: 'null / absent', left: null, right: undefined },
    { name: 'false / absent', left: false, right: undefined },
    { name: 'zero / absent', left: 0, right: undefined },
    { name: 'false / zero', left: false, right: 0 },
    { name: 'zero / string zero', left: 0, right: '0' },
    { name: 'false / string false', left: false, right: 'false' },
    { name: 'null / string null', left: null, right: 'null' },
    { name: 'number / string', left: 1, right: '1' },
    { name: 'boolean / string', left: true, right: 'true' },
    { name: 'object / JSON string', left: { a: 1 }, right: '{"a":1}' },
    { name: 'array / JSON string', left: [1], right: '[1]' },
  ])('preserves body distinctions: $name', async ({ left, right }) => {
    const keys: string[] = [];
    let dispatches = 0;
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => ({
        data: { dispatch: ++dispatches },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }),
    });
    const controller = useCacheInterceptors(instance, {
      ttlMs: 60_000,
      onCacheKey: (key) => keys.push(key),
    });
    onTestFinished(() => controller.dispose());
    // Pin Content-Type so body normalization, not different headers, decides
    // whether the two inputs share an entry. Axios still uses built-in transforms.
    const request = (data: AxiosRequestConfig['data']) =>
      instance.get('/bodies', {
        data,
        headers: { 'Content-Type': 'application/json' },
      });
    const first = await request(left);
    const second = await request(right);
    expect.soft(keys[0]).not.toBe(keys[1]);
    expect.soft(first.data).toEqual({ dispatch: 1 });
    expect.soft(second.data).toEqual({ dispatch: 2 });
    expect.soft((await request(left)).data).toEqual({ dispatch: 1 });
    expect.soft((await request(right)).data).toEqual({ dispatch: 2 });
    expect.soft(dispatches).toBe(2);
  });
});
