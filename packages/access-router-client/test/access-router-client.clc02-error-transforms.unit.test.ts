import { afterEach, describe, expect, it } from 'vitest';
import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { useCacheInterceptors, type CacheController } from '../src/services/interceptors';

const controllers: CacheController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

const strictJSON = {
  responseType: 'json',
  transitional: { silentJSONParsing: false, forcedJSONParsing: true },
} satisfies AxiosRequestConfig;

const reject404 = (status: number) => status >= 200 && status < 300;
const accept404 = () => true;
const orders = [
  { name: 'rejecting source', policies: [reject404, accept404] },
  { name: 'permissive source', policies: [accept404, reject404] },
];

// Hold the first network dispatch until every tail has attached. Like Axios's
// HTTP adapter, this fake settles the raw response using the source's policy;
// Axios dispatchRequest then owns JSON transformation on either outcome.
function createTransport() {
  let invocations = 0;
  let release!: (response: { data: string; status: number }) => void;
  let fail!: (error: Error) => void;
  const held = new Promise<{ data: string; status: number }>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  const instance = axios.create({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      invocations += 1;
      const wire = invocations === 1 ? await held : { data: '{"retry":true}', status: 200 };
      const response: AxiosResponse = {
        ...wire,
        statusText: wire.status === 404 ? 'Not Found' : 'OK',
        headers: { 'content-type': 'application/json' },
        config,
      };
      if (config.validateStatus && !config.validateStatus(wire.status)) {
        throw new AxiosError(
          `Request failed with status code ${wire.status}`,
          AxiosError.ERR_BAD_REQUEST,
          config,
          undefined,
          response,
        );
      }
      return response;
    },
  });
  controllers.push(useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false }));
  return { instance, release, fail, getInvocations: () => invocations };
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('cache slot did not settle')), 2000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe.each(orders)('CLC-02 transformed HTTP rejections: $name', ({ policies }) => {
  describe.each([
    { name: 'default JSON parsing', config: {} },
    { name: 'strict JSON parsing', config: strictJSON },
  ])('$name', ({ config }) => {
    it.each([
      { name: 'object', value: { error: 'not found' } },
      { name: 'numeric string', value: '123' },
      { name: 'object-looking string', value: '{"error":"not found"}' },
      { name: 'ordinary string', value: 'not found' },
    ])('shares a once-transformed $name with caller-owned status/config', async ({ value }) => {
      const { instance, release, getInvocations } = createTransport();
      const calls = policies.map((validateStatus) => instance.get('/missing', { ...config, validateStatus }));
      const pending = Promise.allSettled(calls);
      await new Promise((resolve) => setImmediate(resolve));
      expect(getInvocations()).toBe(1);
      release({ data: JSON.stringify(value), status: 404 });

      const results = await bounded(pending);
      const responses = results.map((result, index) => {
        const policy = policies[index];
        expect(result.status).toBe(policy === accept404 ? 'fulfilled' : 'rejected');
        let response: AxiosResponse;
        if (result.status === 'fulfilled') {
          response = result.value;
        } else {
          expect(result.reason).toBeInstanceOf(AxiosError);
          const error = result.reason as AxiosError;
          expect(error.code).toBe(AxiosError.ERR_BAD_REQUEST);
          expect(error.config?.validateStatus).toBe(policy);
          expect(error.response).toBeDefined();
          response = error.response!;
          expect(response.config).toBe(error.config);
        }
        expect(response.status).toBe(404);
        expect(response.config.validateStatus).toBe(policy);
        expect({ value: response.data, type: typeof response.data }).toEqual({ value, type: typeof value });
        return response;
      });
      expect(responses[0].config).not.toBe(responses[1].config);
      if (typeof value === 'object') expect(responses[0].data).not.toBe(responses[1].data);
      expect(getInvocations()).toBe(1);
    });
  });

  it('rejects all attached callers on malformed strict JSON and permits a fresh retry', async () => {
    const { instance, release, getInvocations } = createTransport();
    const calls = [...policies, ...policies].map((validateStatus) =>
      instance.get('/malformed', { ...strictJSON, validateStatus }),
    );
    const pending = Promise.allSettled(calls);
    await new Promise((resolve) => setImmediate(resolve));
    expect(getInvocations()).toBe(1);
    release({ data: '{not-json', status: 404 });

    const results = await bounded(pending);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected', 'rejected', 'rejected']);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(AxiosError);
        expect(result.reason).toMatchObject({ code: AxiosError.ERR_BAD_RESPONSE, name: 'SyntaxError' });
      }
    }

    const retry = await bounded(instance.get('/malformed', { ...strictJSON, validateStatus: policies[0] }));
    expect(retry.data).toEqual({ retry: true });
    expect(getInvocations()).toBe(2);
    const hit = await bounded(instance.get('/malformed', { ...strictJSON, validateStatus: policies[0] }));
    expect(hit.data).toEqual({ retry: true });
    expect(getInvocations()).toBe(2);
  });
});

describe('CLC-02 transport failure cleanup', () => {
  it('rejects source and tails on a plain transport error without config and retries', async () => {
    const { instance, fail, getInvocations } = createTransport();
    const pending = Promise.allSettled([
      instance.get('/transport'),
      instance.get('/transport', { validateStatus: accept404 }),
      instance.get('/transport'),
    ]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(getInvocations()).toBe(1);
    fail(new Error('transport failed'));

    const results = await bounded(pending);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected', 'rejected']);
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ message: 'transport failed' });
    }
    const retry = await bounded(instance.get('/transport'));
    expect(retry.data).toEqual({ retry: true });
    expect(getInvocations()).toBe(2);
  });
});
