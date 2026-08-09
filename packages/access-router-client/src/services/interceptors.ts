import axios, { AxiosHeaders, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { CACHE_HEADER } from '../constants';
import { normalizeConfigValue } from './cache-utils';

const SENSITIVE_CACHE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'www-authenticate',
]);

/**
 * Adapter-scoped cache control surface returned by `useCacheInterceptors`.
 * The adapter delegates `clearCache()` to {@link clear} on credential
 * transitions (login/logout/token refresh/tenant change) and
 * `disposeCache()` to {@link dispose} when the adapter is torn down to
 * release cache timers so they do not keep a Node process alive.
 */
export interface CacheController {
  clear(): void;
  dispose(): void;
}

/**
 * Resolves a stable, non-secret identity partition token for a credentialed
 * request. Requests that share a token share cache entries; requests with
 * different tokens never do. Returning `undefined` bypasses the cache for that
 * credentialed request, so credentials cannot be reused across identities.
 *
 * The token is mixed into the cache key alongside the URL and request body. Do
 * not return raw cookies, authorization values, or other secrets; sensitive
 * auth headers are excluded from cache keys regardless of the returned token.
 */
export type CachePartitioner = (config: InternalAxiosRequestConfig) => string | undefined;

export interface CachePolicy {
  ttl: number;
  withCredentialsDefault?: boolean;
  partitionForRequest?: CachePartitioner;
  onCacheKey?: (key: string) => void;
  /**
   * Maximum number of cache entries retained per adapter. When the limit is
   * exceeded, the least-recently accessed entry is evicted. Defaults to
   * unbounded, but callers should set a finite value to bound memory.
   */
  capacity?: number;
  /**
   * Returns an independent copy of `value` so callers cannot mutate the stored
   * entry. Defaults to a structured clone via `JSON.parse(JSON.stringify(v))`
   * which supports the documented JSON-serializable response-body contract.
   * Override only to support JSON-unsafe payloads; returning `value` directly
   * breaks cache isolation and is unsupported.
   */
  clone?: <U>(value: U) => U;
}

/**
 * Returns a fresh request config `headers` object that already includes the
 * cache-bypass header set to "false" without mutating any caller-supplied
 * headers. Mutations (create/update/upsert/delete/new and all subdocument
 * variants) must go through this helper so that:
 *
 * - cached reads never serve a previous reader's view of the data for that
 *   mutation, and
 * - the in-flight mutation is never itself cached as if it were a read.
 *
 * The returned object is detached from the caller; mutating it has no effect
 * on caller-owned AxiosHeaders or config objects.
 */
export const cloneConfigWithCacheBypass = <T extends { headers?: unknown }>(config: T | undefined): T => {
  const baseConfig = (config ?? {}) as T;
  const next = { ...baseConfig } as T & { headers: Record<string, unknown> };

  const sourceHeaders = config?.headers;
  if (sourceHeaders instanceof AxiosHeaders) {
    next.headers = sourceHeaders.toJSON();
  } else if (sourceHeaders && typeof sourceHeaders === 'object') {
    next.headers = { ...(sourceHeaders as Record<string, unknown>) };
  } else {
    next.headers = {};
  }

  (next.headers as Record<string, unknown>)[CACHE_HEADER] = 'false';
  return next;
};

class SimpleCache<T> {
  private cache = new Map<string, T>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly capacity: number | undefined;
  private readonly clone: <U>(value: U) => U;

  constructor(opts: { capacity?: number; clone?: <U>(value: U) => U } = {}) {
    this.capacity = opts.capacity;
    this.clone = opts.clone ?? defaultClone;
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.capacity !== undefined && this.capacity > 0 && this.cache.size >= this.capacity && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey !== undefined) {
        this.delete(oldestKey);
      }
    }

    this.cache.delete(key);
    this.cache.set(key, value);

    if (ttl && ttl > 0) {
      const existing = this.timers.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        this.cache.delete(key);
        this.timers.delete(key);
      }, ttl);
      if (typeof timer === 'object' && timer && 'unref' in timer && typeof timer.unref === 'function') {
        timer.unref();
      }
      this.timers.set(key, timer);
    }
  }

  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value === undefined) {
      return undefined;
    }

    // LRU: re-insert so recently touched entries move to the back of the map.
    this.cache.delete(key);
    this.cache.set(key, value);

    return this.clone(value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    return this.cache.delete(key);
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.cache.clear();
  }

  dispose(): void {
    this.clear();
  }
}

const defaultClone = <U>(value: U): U => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as U;
  } catch {
    // Uncloneable value: return as-is and rely on the cache policy to bypass
    // unsupported body types via the response-interceptor guard below.
    return value;
  }
};

interface CachedResponseSnapshot {
  data: unknown;
  status: number;
  statusText: string;
  headers: Record<string, unknown>;
}

const isUnsupportedResponseBody = (response: AxiosResponse): boolean => {
  const responseType = response.config?.responseType;
  if (
    responseType === 'stream' ||
    responseType === 'arraybuffer' ||
    responseType === 'blob' ||
    responseType === 'document'
  ) {
    return true;
  }
  const data = response.data;
  if (data == null) return false;
  if (typeof data === 'string') return false;
  if (typeof data !== 'object') return false;
  if (Array.isArray(data)) return false;
  try {
    JSON.stringify(data);
    return false;
  } catch {
    return true;
  }
};

const snapshotResponse = (response: AxiosResponse): CachedResponseSnapshot => {
  const headers =
    response.headers instanceof AxiosHeaders ? response.headers.toJSON() : { ...(response.headers ?? {}) };
  return {
    data: defaultClone(response.data),
    status: response.status,
    statusText: response.statusText,
    headers: defaultClone(headers) as Record<string, unknown>,
  };
};

const IGNORED_CACHE_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'cache-control',
  'connection',
  'content-length',
  'content-type',
  'expires',
  'host',
  'pragma',
  'user-agent',
]);

const serializeHeaders = (headers: InternalAxiosRequestConfig['headers']) => {
  const resolvedHeaders = headers instanceof AxiosHeaders ? headers.toJSON() : headers;

  const normalizedHeaders = Object.entries(resolvedHeaders ?? {})
    .filter(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      return (
        normalizedKey !== CACHE_HEADER.toLowerCase() &&
        !IGNORED_CACHE_HEADERS.has(normalizedKey) &&
        !SENSITIVE_CACHE_HEADERS.has(normalizedKey) &&
        value !== undefined
      );
    })
    .reduce<Record<string, unknown>>((acc, [key, value]) => {
      acc[key.toLowerCase()] = value;
      return acc;
    }, {});

  return JSON.stringify(normalizeConfigValue(normalizedHeaders));
};

function generateCacheKey(config: InternalAxiosRequestConfig, partition?: string) {
  const key = `${config.baseURL}/${config.url}_${config.method}_${generateParamKey(config.params)}_${generateDataKey(
    config.data,
  )}_${partition ?? ''}_${serializeHeaders(config.headers)}`;

  return encodeURI(key);
}

function generateParamKey(params?: Record<string, unknown>) {
  if (!params) return '';
  return JSON.stringify(normalizeConfigValue(params));
}

function generateDataKey(data: unknown) {
  if (!data) return '';
  return typeof data === 'string' ? data : JSON.stringify(normalizeConfigValue(data));
}

const resolveWithCredentials = (config: InternalAxiosRequestConfig, withCredentialsDefault: boolean): boolean => {
  if (config.withCredentials !== undefined) {
    return Boolean(config.withCredentials);
  }
  return withCredentialsDefault;
};

export function useCacheInterceptors(instance: AxiosInstance, policyOrTtl: CachePolicy | number): CacheController {
  const policy: CachePolicy = typeof policyOrTtl === 'number' ? { ttl: policyOrTtl } : policyOrTtl;
  const store = new SimpleCache<CachedResponseSnapshot>({ capacity: policy.capacity, clone: policy.clone });
  const withCredentialsDefault =
    policy.withCredentialsDefault ?? Boolean((instance.defaults as { withCredentials?: boolean }).withCredentials);

  // In-flight dedup of identical cacheable misses. Each key maps to a promise of
  // a freshly-cloned snapshot, so concurrent callers see one network round-trip
  // but each gets an independent snapshot per ARC-03 isolation. Mutations and
  // requests that bypass cache do NOT enter this map.
  const inflight = new Map<string, Promise<AxiosResponse>>();

  const finalizeInflight = (key: string) => {
    inflight.delete(key);
  };

  instance.interceptors.request.use(
    async (config) => {
      if (config.headers[CACHE_HEADER] === 'false') return config;

      const isCredentialed = resolveWithCredentials(config, withCredentialsDefault);
      const partitionKey = policy.partitionForRequest?.(config);

      if (isCredentialed && !partitionKey) {
        return config;
      }

      const key = generateCacheKey(config, partitionKey);
      policy.onCacheKey?.(key);

      // 1) A finished cache hit: serve a fresh clone of the snapshot directly.
      const snapshot = store.get(key);
      if (snapshot) {
        config.adapter = async (_config) => {
          return {
            data: snapshot.data,
            status: snapshot.status,
            statusText: snapshot.statusText,
            headers: { ...snapshot.headers, [CACHE_HEADER]: 'true' },
            config: _config,
          } as unknown as AxiosResponse;
        };
        return config;
      }

      // 2) In-flight miss: dedup. Attach a tail adapter that awaits the
      //    in-flight response and returns an independent clone to each caller.
      const existing = inflight.get(key);
      if (existing) {
        // The tail adapter awaits `existing`, then returns an independent
        // clone on success or re-throws on failure. `inflightPromise` has
        // a no-op `.catch` attached at registration time so an early
        // rejection never surfaces as an unhandledRejection before the
        // caller attaches its own handler (e.g. via Promise.allSettled).
        config.adapter = async (_config) => {
          const response = await existing;
          const shared = response as unknown as CachedResponseSnapshot & { config?: unknown };
          return {
            data: defaultClone(shared.data),
            status: shared.status,
            statusText: shared.statusText,
            headers: { ...shared.headers, [CACHE_HEADER]: 'true' },
            config: _config,
          } as unknown as AxiosResponse;
        };
        return config;
      }

      // 3) Fresh miss: register an in-flight slot that resolves when this
      //    request's response interceptor stores the snapshot (or rejects
      //    when the request fails). Wrap the adapter so the slot rejects and
      //    is finalized on rejection from the wrapped network call —
      //    AxiosError may not carry config through reliably when the adapter
      //    throws a plain Error, so response-interceptor error handling alone
      //    is unsafe.
      let resolveInflight!: (response: AxiosResponse) => void;
      let rejectInflight!: (error: unknown) => void;
      const inflightPromise = new Promise<AxiosResponse>((resolve, reject) => {
        resolveInflight = resolve;
        rejectInflight = reject;
      });
      // Pre-attach a no-op rejection handler so that if this slot rejects
      // before any tail caller attaches its own handler (e.g. via
      // Promise.allSettled), Node does not raise an unhandledRejection for
      // `inflightPromise` itself. Tail callers re-await `inflightPromise`
      // and re-throw on failure, so the error still reaches them.
      inflightPromise.catch(() => {});
      inflight.set(key, inflightPromise);

      const nextConfig = {
        ...config,
      } as InternalAxiosRequestConfig & {
        __arcInflightKey?: string;
        __arcResolve?: typeof resolveInflight;
        __arcReject?: typeof rejectInflight;
        adapter?: unknown;
      };
      nextConfig.__arcInflightKey = key;
      nextConfig.__arcResolve = resolveInflight;
      nextConfig.__arcReject = rejectInflight;

      // Use the original adapter wrapped so we control the in-flight rejection
      // at the source rather than at Axios's response pipeline. Axios's
      // `getAdapter` resolves a string/array adapter spec to a concrete
      // function; we call it once so the per-request dispatch is consistent
      // with how Axios itself would have invoked the adapter.
      let realAdapter: unknown = config.adapter;
      if (realAdapter === undefined || realAdapter === null) {
        realAdapter = instance.defaults.adapter;
      }
      const dispatch: ((c: InternalAxiosRequestConfig) => Promise<AxiosResponse>) | undefined =
        typeof realAdapter === 'function'
          ? (realAdapter as (c: InternalAxiosRequestConfig) => Promise<AxiosResponse>)
          : typeof (axios as { getAdapter?: unknown }).getAdapter === 'function'
            ? ((axios as { getAdapter: (a: unknown, d: unknown) => unknown }).getAdapter(
                realAdapter as string | string[] | Array<unknown>,
                instance.defaults,
              ) as (c: InternalAxiosRequestConfig) => Promise<AxiosResponse>)
            : undefined;
      nextConfig.adapter = async (adapterConfig: InternalAxiosRequestConfig) => {
        if (!dispatch) {
          // Should never happen if `getAdapter` is available; fall back to
          // letting Axios dispatch by leaving config.adapter unset. The
          // rejection path will then rely on the response error interceptor
          // (markers on config), which handles AxiosError rejects but not
          // plain Errors thrown by custom adapters.
          const response = await (adapterConfig as { adapter?: unknown }).adapter;
          return response as unknown as AxiosResponse;
        }
        try {
          const response = await dispatch(adapterConfig);
          return response;
        } catch (error) {
          rejectInflight(error);
          finalizeInflight(key);
          throw error;
        }
      };

      return nextConfig;
    },
    (error) => Promise.reject(error),
  );

  instance.interceptors.response.use(
    (response) => {
      // Mutations set the cache-bypass header to "false"; clear the cache on
      // 2xx success so subsequent reads cannot observe the pre-mutation entry.
      // Failed mutations (4xx/5xx) reach the error interceptor below and never
      // invalidate, even when a caller opts into receiving the raw response.
      if (response.config.headers[CACHE_HEADER] === 'false') {
        if (response.status >= 200 && response.status < 300) {
          store.clear();
        }
        return response;
      }

      const isCredentialed = resolveWithCredentials(response.config, withCredentialsDefault);
      const partitionKey = policy.partitionForRequest?.(response.config);

      if (isCredentialed && !partitionKey) {
        return response;
      }

      const key = generateCacheKey(response.config, partitionKey);
      const inflightSlot = inflight.get(key);

      if (response.status >= 200 && response.status < 300) {
        if (!isUnsupportedResponseBody(response)) {
          store.set(key, snapshotResponse(response), policy.ttl);
        }
      }

      if (inflightSlot) {
        const resolveInflight = (
          response.config as InternalAxiosRequestConfig & { __arcResolve?: (response: AxiosResponse) => void }
        ).__arcResolve;
        if (resolveInflight) {
          // Other callers receive an independent clone (defaultClone via
          // SimpleCache.get when they read the snapshot through the cache, but
          // they have already captured the in-flight snapshot via the adapter
          // tail; the clone-on-emit there is what protects them).
          resolveInflight(response);
        }
        finalizeInflight(key);
      }

      return response;
    },
    (error) => {
      const config = (error?.config ?? {}) as InternalAxiosRequestConfig & {
        __arcInflightKey?: string;
        __arcReject?: (error: unknown) => void;
      };
      if (config.__arcInflightKey && config.__arcReject) {
        config.__arcReject(error);
        finalizeInflight(config.__arcInflightKey);
      }
      return Promise.reject(error);
    },
  );

  return {
    clear: () => store.clear(),
    dispose: () => {
      store.dispose();
      inflight.clear();
    },
  };
}
