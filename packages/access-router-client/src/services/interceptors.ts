import axios, { AxiosHeaders, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { CACHE_HEADER } from '../constants';
import { normalizeConfigValue } from './cache-utils';

const DEFAULT_CACHE_CAPACITY = 100;
const CACHEABLE_METHODS = new Set(['get']);
const MUTATION_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const CACHEABLE_RESPONSE_TYPES = new Set(['', 'json', 'text']);

const SENSITIVE_CACHE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'www-authenticate',
]);

const AUTHENTICATION_REQUEST_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
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
   * exceeded, the least-recently accessed entry is evicted. Defaults to 100.
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
  private readonly capacity: number;
  private readonly clone: <U>(value: U) => U;

  constructor(opts: { capacity?: number; clone?: <U>(value: U) => U } = {}) {
    this.capacity =
      opts.capacity !== undefined && Number.isFinite(opts.capacity) && opts.capacity > 0
        ? Math.floor(opts.capacity)
        : DEFAULT_CACHE_CAPACITY;
    this.clone = opts.clone ?? defaultClone;
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.capacity && !this.cache.has(key)) {
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

interface InflightSlot {
  readonly key: string;
  readonly generation: number;
  readonly promise: Promise<AxiosResponse>;
  readonly resolve: (response: AxiosResponse) => void;
  readonly reject: (error: unknown) => void;
  settled: boolean;
}

interface CacheRequestState {
  readonly key: string;
  readonly generation: number;
  readonly role: 'source' | 'tail' | 'hit';
  readonly slot?: InflightSlot;
}

const CACHE_REQUEST_STATE = Symbol('access-router-client.cache-request-state');
const CACHE_DISPOSED_ERROR = 'Access router client cache was disposed while the request was in flight';

type CacheRequestConfig = InternalAxiosRequestConfig & {
  [CACHE_REQUEST_STATE]?: CacheRequestState;
};

const setCacheRequestState = (config: InternalAxiosRequestConfig, state: CacheRequestState): void => {
  Object.defineProperty(config, CACHE_REQUEST_STATE, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze(state),
  });
};

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

const serializeHeaders = (headers: InternalAxiosRequestConfig['headers']) => {
  const resolvedHeaders = headers instanceof AxiosHeaders ? headers.toJSON() : headers;

  const normalizedHeaders = Object.entries(resolvedHeaders ?? {})
    .filter(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      return (
        normalizedKey !== CACHE_HEADER.toLowerCase() &&
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

const hasHeaderValue = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasHeaderValue);
  if (value == null || value === false) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const hasAuthenticationHeader = (headers: InternalAxiosRequestConfig['headers']): boolean => {
  const resolvedHeaders = headers instanceof AxiosHeaders ? headers.toJSON() : headers;
  return Object.entries(resolvedHeaders ?? {}).some(
    ([key, value]) => AUTHENTICATION_REQUEST_HEADERS.has(key.toLowerCase()) && hasHeaderValue(value),
  );
};

const hasStableCacheValue = (value: unknown, seen = new Set<object>()): boolean => {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return true;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;

  if (value instanceof AxiosHeaders) {
    return hasStableCacheValue(value.toJSON(), seen);
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;

  seen.add(value);
  const stable = Object.values(value).every((item) => hasStableCacheValue(item, seen));
  seen.delete(value);
  return stable;
};

const sameTransform = (configured: unknown, defaultValue: unknown): boolean => {
  const configuredList = Array.isArray(configured) ? configured : [configured];
  const defaultList = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
  return (
    configuredList.length === defaultList.length && configuredList.every((item, index) => item === defaultList[index])
  );
};

const sameConfigIdentity = (configured: unknown, defaultValue: unknown): boolean => {
  if (Array.isArray(configured) && Array.isArray(defaultValue)) {
    return configured.length === defaultValue.length && configured.every((item, index) => item === defaultValue[index]);
  }
  return configured === defaultValue;
};

const isCacheEligible = (config: InternalAxiosRequestConfig, instance: AxiosInstance): boolean => {
  const method = (config.method ?? 'get').toLowerCase();
  const responseType = config.responseType ?? '';

  return (
    CACHEABLE_METHODS.has(method) &&
    CACHEABLE_RESPONSE_TYPES.has(responseType) &&
    config.paramsSerializer === undefined &&
    config.auth === undefined &&
    config.signal === undefined &&
    config.cancelToken === undefined &&
    config.onDownloadProgress === undefined &&
    config.onUploadProgress === undefined &&
    sameConfigIdentity(config.adapter, instance.defaults.adapter) &&
    sameTransform(config.transformRequest, instance.defaults.transformRequest) &&
    sameTransform(config.transformResponse, instance.defaults.transformResponse) &&
    hasStableCacheValue(config.params) &&
    hasStableCacheValue(config.data) &&
    hasStableCacheValue(config.headers)
  );
};

function generateCacheKey(config: InternalAxiosRequestConfig, partition?: string) {
  const responseSemantics = JSON.stringify({
    responseType: config.responseType ?? '',
    responseEncoding: config.responseEncoding ?? '',
    decompress: config.decompress ?? true,
    timeout: config.timeout ?? 0,
    maxContentLength: config.maxContentLength ?? -1,
    maxBodyLength: config.maxBodyLength ?? -1,
    withCredentials: Boolean(config.withCredentials),
    transitional: normalizeConfigValue(config.transitional),
  });
  const key = `${config.baseURL}/${config.url}_${config.method}_${generateParamKey(config.params)}_${generateDataKey(
    config.data,
  )}_${partition ?? ''}_${serializeHeaders(config.headers)}_${responseSemantics}`;

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

const hasUsablePartition = (partition: string | undefined): partition is string =>
  typeof partition === 'string' && partition.trim().length > 0;

export function useCacheInterceptors(instance: AxiosInstance, policyOrTtl: CachePolicy | number): CacheController {
  const policy: CachePolicy = typeof policyOrTtl === 'number' ? { ttl: policyOrTtl } : policyOrTtl;
  const store = new SimpleCache<CachedResponseSnapshot>({ capacity: policy.capacity, clone: policy.clone });
  const withCredentialsDefault =
    policy.withCredentialsDefault ?? Boolean((instance.defaults as { withCredentials?: boolean }).withCredentials);

  // In-flight dedup of identical cacheable misses. Each key maps to a promise of
  // a freshly-cloned snapshot, so concurrent callers see one network round-trip
  // but each gets an independent snapshot per ARC-03 isolation. Mutations and
  // requests that bypass cache do NOT enter this map.
  const inflight = new Map<string, InflightSlot>();
  let generation = 0;
  let disposed = false;

  const finalizeInflight = (slot: InflightSlot) => {
    if (inflight.get(slot.key) === slot) {
      inflight.delete(slot.key);
    }
  };

  const resolveInflight = (slot: InflightSlot, response: AxiosResponse) => {
    if (slot.settled) return;
    slot.settled = true;
    slot.resolve(response);
    finalizeInflight(slot);
  };

  const rejectInflight = (slot: InflightSlot, error: unknown) => {
    if (slot.settled) return;
    slot.settled = true;
    slot.reject(error);
    finalizeInflight(slot);
  };

  const invalidate = () => {
    generation += 1;
    store.clear();
    // Existing sources and their attached tails retain their slots, but new
    // requests cannot join reads started before the invalidation boundary.
    inflight.clear();
  };

  instance.interceptors.request.use(
    async (config) => {
      if (disposed || config.headers[CACHE_HEADER] === 'false' || !isCacheEligible(config, instance)) return config;

      const isCredentialed =
        resolveWithCredentials(config, withCredentialsDefault) || hasAuthenticationHeader(config.headers);
      const partitionKey = policy.partitionForRequest?.(config);

      if (isCredentialed && !hasUsablePartition(partitionKey)) {
        return config;
      }

      const key = generateCacheKey(config, partitionKey);
      policy.onCacheKey?.(key);

      // 1) A finished cache hit: serve a fresh clone of the snapshot directly.
      const snapshot = store.get(key);
      if (snapshot) {
        setCacheRequestState(config, Object.freeze({ key, generation, role: 'hit' }));
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
          const response = await existing.promise;
          const shared = response as unknown as CachedResponseSnapshot & { config?: unknown };
          return {
            data: defaultClone(shared.data),
            status: shared.status,
            statusText: shared.statusText,
            headers: { ...shared.headers, [CACHE_HEADER]: 'true' },
            config: _config,
          } as unknown as AxiosResponse;
        };
        setCacheRequestState(config, Object.freeze({ key, generation, role: 'tail', slot: existing }));
        return config;
      }

      // 3) Fresh miss: register an in-flight slot that resolves when this
      //    request's response interceptor stores the snapshot (or rejects
      //    when the request fails). Wrap the adapter so the slot rejects and
      //    is finalized on rejection from the wrapped network call —
      //    AxiosError may not carry config through reliably when the adapter
      //    throws a plain Error, so response-interceptor error handling alone
      //    is unsafe.
      let resolvePromise!: (response: AxiosResponse) => void;
      let rejectPromise!: (error: unknown) => void;
      const inflightPromise = new Promise<AxiosResponse>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      // Pre-attach a no-op rejection handler so that if this slot rejects
      // before any tail caller attaches its own handler (e.g. via
      // Promise.allSettled), Node does not raise an unhandledRejection for
      // `inflightPromise` itself. Tail callers re-await `inflightPromise`
      // and re-throw on failure, so the error still reaches them.
      inflightPromise.catch(() => {});
      const slot: InflightSlot = {
        key,
        generation,
        promise: inflightPromise,
        resolve: resolvePromise,
        reject: rejectPromise,
        settled: false,
      };
      inflight.set(key, slot);

      const nextConfig = { ...config } as InternalAxiosRequestConfig;
      setCacheRequestState(nextConfig, Object.freeze({ key, generation, role: 'source', slot }));

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
          rejectInflight(slot, error);
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
      const method = (response.config.method ?? 'get').toLowerCase();
      if (response.config.headers[CACHE_HEADER] === 'false' || MUTATION_METHODS.has(method)) {
        if (response.status >= 200 && response.status < 300) {
          invalidate();
        }
        return response;
      }

      const state = (response.config as CacheRequestConfig)[CACHE_REQUEST_STATE];
      if (!state || state.role !== 'source' || !state.slot) {
        return response;
      }

      if (response.status >= 200 && response.status < 300) {
        if (!disposed && state.generation === generation && !isUnsupportedResponseBody(response)) {
          store.set(state.key, snapshotResponse(response), policy.ttl);
        }
      }

      // Tails captured this exact slot in the request phase. Resolving the slot
      // does not depend on mutable credentials or on its current map ownership.
      resolveInflight(state.slot, response);

      return response;
    },
    (error) => {
      const state = ((error?.config ?? {}) as CacheRequestConfig)[CACHE_REQUEST_STATE];
      if (state?.role === 'source' && state.slot) {
        rejectInflight(state.slot, error);
      }
      return Promise.reject(error);
    },
  );

  return {
    clear: invalidate,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      generation += 1;
      store.dispose();
      const error = new Error(CACHE_DISPOSED_ERROR);
      for (const slot of inflight.values()) {
        rejectInflight(slot, error);
      }
      inflight.clear();
    },
  };
}
