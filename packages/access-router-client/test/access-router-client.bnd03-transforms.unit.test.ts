import { describe, expect, it } from 'vitest';
import axios, { type AxiosResponse } from 'axios';
import { useCacheInterceptors } from '../src/services/interceptors';

// BND-03 reproduction: construction-time custom transforms must bypass caching
// (README: "custom transforms or serializers always bypass caching"), and a
// throwing transform must settle every registered call instead of stranding
// tails on an abandoned slot.

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

describe('BND-03 instance-level custom transform bypass', () => {
  it('construction-time non-idempotent transform runs per response and bypasses reuse', async () => {
    let invocations = 0;
    let transformCalls = 0;
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        invocations += 1;
        return {
          data: JSON.stringify({ invocation: invocations }),
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        } as unknown as AxiosResponse;
      },
      transformResponse: [
        (data: unknown) => {
          transformCalls += 1;
          const parsed = typeof data === 'string' ? (JSON.parse(data) as { invocation: number }) : data;
          return { ...(parsed as object), seen: transformCalls };
        },
      ],
    });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

    const first = await instance.get('/bnd03-instance-transform');
    const second = await instance.get('/bnd03-instance-transform');

    expect(invocations).toBe(2);
    expect(transformCalls).toBe(2);
    expect(first.data).toEqual({ invocation: 1, seen: 1 });
    expect(second.data).toEqual({ invocation: 2, seen: 2 });
  });

  it('construction-time custom transform bypasses dedup for concurrent calls', async () => {
    let invocations = 0;
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        const n = (invocations += 1);
        await new Promise((r) => setImmediate(r));
        return { data: { n }, status: 200, statusText: 'OK', headers: {}, config } as unknown as AxiosResponse;
      },
      transformResponse: [(data: unknown) => data],
    });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

    const [a, b] = await withTimeoutGuard(
      Promise.all([instance.get('/bnd03-dedup'), instance.get('/bnd03-dedup')]),
      5000,
      'concurrent custom-transform requests',
    );
    expect(invocations).toBe(2);
    expect(a.data).not.toEqual(b.data);
  });

  it('throwing plain-error construction-time transform settles all calls and later retry dispatches', async () => {
    let invocations = 0;
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        invocations += 1;
        await new Promise((r) => setImmediate(r));
        return { data: '{"ok":true}', status: 200, statusText: 'OK', headers: {}, config } as unknown as AxiosResponse;
      },
      transformResponse: [
        () => {
          throw new Error('plain boom');
        },
      ],
    });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });

    const settled = await withTimeoutGuard(
      Promise.allSettled([instance.get('/bnd03-throw'), instance.get('/bnd03-throw')]),
      5000,
      'throwing-transform concurrent calls',
    );
    expect(settled.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    for (const r of settled) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(Error);
      expect((r as PromiseRejectedResult).reason.message).toBe('plain boom');
    }
    expect(invocations).toBe(2);

    // A later retry must dispatch anew rather than join an abandoned slot.
    await withTimeoutGuard(
      instance.get('/bnd03-throw').then(
        () => {
          throw new Error('expected retry to reject');
        },
        (error: Error) => {
          expect(error.message).toBe('plain boom');
        },
      ),
      5000,
      'throwing-transform retry',
    );
    expect(invocations).toBe(3);
  });

  it('custom parseReviver bypasses cache reuse', async () => {
    let invocations = 0;
    const base = axios.create({
      baseURL: 'http://localhost',
      adapter: async (config) => {
        invocations += 1;
        return { data: '{"n":1}', status: 200, statusText: 'OK', headers: {}, config } as unknown as AxiosResponse;
      },
    });
    useCacheInterceptors(base, { ttlMs: 60_000, withCredentialsDefault: false });

    const plain = await base.get('/bnd03-reviver');
    const revived = await base.get('/bnd03-reviver', {
      parseReviver: (key: string, value: unknown) => (key === 'n' && typeof value === 'number' ? value * 10 : value),
    });
    const plainAgain = await base.get('/bnd03-reviver');

    expect(plain.data).toEqual({ n: 1 });
    expect(revived.data).toEqual({ n: 10 });
    expect(plainAgain.data).toEqual({ n: 1 });
    // plain + revived-bypass dispatch; plainAgain is a legitimate hit of the
    // plain entry (the revived response must not poison it).
    expect(invocations).toBe(2);

    // A repeated revived read dispatches again (bypassed responses are never
    // stored or reused) rather than reusing any entry.
    const revivedAgain = await base.get('/bnd03-reviver', {
      parseReviver: (key: string, value: unknown) => (key === 'n' && typeof value === 'number' ? value * 10 : value),
    });
    expect(revivedAgain.data).toEqual({ n: 10 });
    expect(invocations).toBe(3);
  });

  it('settles source and tail when a default-transform strict parse fails', async () => {
    let invocations = 0;
    let releaseNet: (() => void) | undefined;
    const instance = axios.create({
      baseURL: 'http://localhost',
      adapter: (config) => {
        invocations += 1;
        if (invocations === 1) {
          return new Promise<AxiosResponse>((resolve) => {
            releaseNet = () =>
              resolve({
                data: 'not-json{{{',
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
              } as unknown as AxiosResponse);
          });
        }
        return Promise.resolve({
          data: 'not-json{{{',
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        } as unknown as AxiosResponse);
      },
    });
    useCacheInterceptors(instance, { ttlMs: 60_000, withCredentialsDefault: false });
    const strict = { transitional: { silentJSONParsing: false, forcedJSONParsing: true } } as const;

    const source = instance.get('/bnd03-strict-fail', { responseType: 'json', ...strict });
    const tail = instance.get('/bnd03-strict-fail', { responseType: 'json', ...strict });
    await new Promise((r) => setImmediate(r));
    expect(invocations).toBe(1);
    releaseNet?.();

    const settled = await withTimeoutGuard(Promise.allSettled([source, tail]), 5000, 'strict-parse concurrent calls');
    expect(settled.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(invocations).toBe(1);

    // The failed source must not leave an abandoned slot: a retry dispatches.
    await withTimeoutGuard(
      instance.get('/bnd03-strict-fail', { responseType: 'json', ...strict }).then(
        () => {
          throw new Error('expected retry to reject on malformed body');
        },
        () => undefined,
      ),
      5000,
      'strict-parse retry',
    );
    expect(invocations).toBe(2);
  });
});
