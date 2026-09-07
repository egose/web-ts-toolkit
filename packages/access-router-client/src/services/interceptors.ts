import axios, { AxiosError, AxiosHeaders, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { CACHE_HEADER } from '../constants';
import { normalizeConfigValue } from './cache-utils';

const DEFAULT_CACHE_CAPACITY = 100;
const CACHEABLE_METHODS = new Set(['get']);
const CACHEABLE_RESPONSE_TYPES = new Set(['', 'json', 'text']);
const CACHE_INVALIDATE_ON_SUCCESS = '__accessRouterClientCacheInvalidateOnSuccess';
const CACHE_INVALIDATE_HEADER = 'x-axios-cache-invalidate-on-success';

const AUTHENTICATION_REQUEST_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
]);

// Redaction for cache keys is derived from the recognized credential set plus
// response-only sensitive headers, so adding a credential header above
// automatically excludes it from keys without maintaining a second list.
const SENSITIVE_CACHE_HEADERS = new Set([...AUTHENTICATION_REQUEST_HEADERS, 'set-cookie', 'www-authenticate']);

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
  ttlMs: number;
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
 * on caller-owned AxiosHeaders or config objects. The bypass marker is
 * normalized to the single lowercase `CACHE_HEADER` key, and invalidation
 * intent is carried only as non-wire config metadata (never as a header), so
 * nothing internal reaches dispatch — even when caching is disabled and no
 * interceptor is installed to strip it.
 */
export const cloneConfigWithCacheBypass = <T extends { headers?: unknown }>(
  config: T | undefined,
  invalidateOnSuccess = true,
): T => {
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

  // Normalize to one lowercase bypass key: a caller-supplied mixed-case
  // `X-Axios-Cache` would otherwise survive alongside the forced entry and
  // send duplicate conflicting headers.
  for (const key of Object.keys(next.headers)) {
    if (key.toLowerCase() === CACHE_HEADER.toLowerCase()) {
      delete next.headers[key];
    }
  }
  (next.headers as Record<string, unknown>)[CACHE_HEADER] = 'false';
  if (invalidateOnSuccess) {
    (next as T & Record<typeof CACHE_INVALIDATE_ON_SUCCESS, true>)[CACHE_INVALIDATE_ON_SUCCESS] = true;
  }
  return next;
};

// One case-insensitive, nonmutating header access rule shared by the
// service (`updateHeaders` precedence) and interceptor (bypass) boundaries.
// `AxiosHeaders` accessors are already case-insensitive; plain objects are
// scanned for the first case-variant so `X-Axios-Cache` is honored exactly
// like `x-axios-cache`. Nothing here mutates the caller's headers.
const findHeaderKey = (headers: Record<string, unknown>, name: string): string | undefined => {
  const target = name.toLowerCase();
  return Object.keys(headers).find((key) => key.toLowerCase() === target);
};

/** Reads the package-owned cache-control value without mutating headers. */
export const getCacheControlValue = (headers: unknown): unknown => {
  if (!headers || typeof headers !== 'object') return undefined;
  if (headers instanceof AxiosHeaders) return headers.get(CACHE_HEADER);
  const key = findHeaderKey(headers as Record<string, unknown>, CACHE_HEADER);
  return key === undefined ? undefined : (headers as Record<string, unknown>)[key];
};

/** True when the caller explicitly set the package-owned cache header (any case). */
export const hasCacheControlHeader = (headers: unknown): boolean => getCacheControlValue(headers) !== undefined;

const hasInvalidateSignal = (headers: unknown): boolean => {
  if (!headers || typeof headers !== 'object') return false;
  if (headers instanceof AxiosHeaders) return headers.has(CACHE_INVALIDATE_HEADER);
  return findHeaderKey(headers as Record<string, unknown>, CACHE_INVALIDATE_HEADER) !== undefined;
};

const deleteInvalidateSignal = (headers: Record<string, unknown> | AxiosHeaders): void => {
  if (headers instanceof AxiosHeaders) {
    headers.delete(CACHE_INVALIDATE_HEADER);
    return;
  }
  const key = findHeaderKey(headers as Record<string, unknown>, CACHE_INVALIDATE_HEADER);
  if (key !== undefined) {
    delete (headers as Record<string, unknown>)[key];
  }
};

export const removeCacheInvalidationSignal = <T extends object>(config: T): T => {
  const headers = (config as { headers?: unknown }).headers;
  const hasHeaderSignal = hasInvalidateSignal(headers);

  if (CACHE_INVALIDATE_ON_SUCCESS in config || hasHeaderSignal) {
    const next = { ...config } as T & { headers?: unknown };
    delete (next as Record<string, unknown>)[CACHE_INVALIDATE_ON_SUCCESS];

    if (headers instanceof AxiosHeaders) {
      const clonedHeaders = AxiosHeaders.from(headers);
      clonedHeaders.delete(CACHE_INVALIDATE_HEADER);
      next.headers = clonedHeaders;
    } else if (headers && typeof headers === 'object') {
      next.headers = { ...(headers as Record<string, unknown>) };
      deleteInvalidateSignal(next.headers as Record<string, unknown>);
    }

    return next;
  }
  return config;
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

  set(key: string, value: T, ttlMs?: number): void {
    if (this.cache.size >= this.capacity && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey !== undefined) {
        this.delete(oldestKey);
      }
    }

    this.cache.delete(key);
    this.cache.set(key, value);

    if (ttlMs && ttlMs > 0) {
      const existing = this.timers.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        this.cache.delete(key);
        this.timers.delete(key);
      }, ttlMs);
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
  [CACHE_INVALIDATE_ON_SUCCESS]?: true;
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

const snapshotResponse = (response: AxiosResponse, clone: <U>(value: U) => U): CachedResponseSnapshot => {
  const headers =
    response.headers instanceof AxiosHeaders ? response.headers.toJSON() : { ...(response.headers ?? {}) };
  return {
    data: clone(response.data),
    status: response.status,
    statusText: response.statusText,
    headers: clone(headers) as Record<string, unknown>,
  };
};

// Single transformation boundary: snapshots hold already-transformed data.
// Synthetic hit/tail adapters must not reparse it through Axios transforms,
// so they run under an identity transform and settle per caller below.
const identityTransform = (data: unknown): unknown => data;

const bypassResponseTransform = (config: InternalAxiosRequestConfig): void => {
  config.transformResponse = [identityTransform as never];
};

const settleSyntheticResponse = (callerConfig: InternalAxiosRequestConfig, response: AxiosResponse): AxiosResponse => {
  const status = response.status;
  const validateStatus = (callerConfig as { validateStatus?: (status: number) => boolean }).validateStatus;
  if (!status || !validateStatus || validateStatus(status)) {
    return response;
  }
  throw new AxiosError(
    `Request failed with status code ${status}`,
    status >= 400 && status < 500 ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_BAD_RESPONSE,
    callerConfig as never,
    undefined,
    response,
  );
};

// Returns true when `error` is an adapter-level settlement rejection for
// `sourceConfig` (status present and rejected by that caller's policy). Only
// then can tails safely re-settle the shared network response under their own
// policy; transform failures and transport errors without a settlement
// decision must reject the slot.
const isSettlementRejectionFor = (error: unknown, sourceConfig: InternalAxiosRequestConfig): boolean => {
  const response = (error as { response?: AxiosResponse })?.response;
  if (!response || !response.status) return false;
  const validateStatus = (sourceConfig as { validateStatus?: (status: number) => boolean }).validateStatus;
  if (!validateStatus) {
    // Mirrors Axios settle with transitional validateStatusUndefinedResolves:
    // undefined policy resolves, so a rejection carrying a response is not a
    // settlement decision (e.g. transform failure).
    return false;
  }
  try {
    return !validateStatus(response.status);
  } catch {
    return false;
  }
};

const serializeHeaders = (headers: InternalAxiosRequestConfig['headers']) => {
  const resolvedHeaders = headers instanceof AxiosHeaders ? headers.toJSON() : headers;

  const normalizedHeaders = Object.entries(resolvedHeaders ?? {})
    .filter(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      return (
        normalizedKey !== CACHE_HEADER.toLowerCase() &&
        normalizedKey !== CACHE_INVALIDATE_HEADER.toLowerCase() &&
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

const consumeCacheInvalidationSignal = (config: CacheRequestConfig): void => {
  // Back-compat: callers that still stamp the legacy wire header get the
  // same invalidation intent, consumed here (any letter case) before the
  // request reaches dispatch. The package itself no longer emits the header.
  const headers = config.headers;
  const hasSignal = hasInvalidateSignal(headers);

  if (!hasSignal && !config[CACHE_INVALIDATE_ON_SUCCESS]) return;

  config[CACHE_INVALIDATE_ON_SUCCESS] = true;
  if (headers instanceof AxiosHeaders) {
    headers.delete(CACHE_INVALIDATE_HEADER);
  } else if (headers && typeof headers === 'object') {
    deleteInvalidateSignal(headers as Record<string, unknown>);
  }
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

// Pristine Axios built-in parsing hooks, snapshotted at module load.
// Eligibility must compare request transforms against these built-ins, never
// against the mutable instance defaults: `createAdapter` merges
// construction-time `transformRequest`/`transformResponse` into
// `instance.defaults`, so comparing against instance defaults mistakes a
// custom instance default for an Axios built-in and caches responses the
// README promises to bypass ("custom transforms or serializers always bypass
// caching").
//
// Supported parsing boundary for the installed Axios (1.x): the default
// response transform honors per-request `parseReviver`, and the default
// request transform honors per-request `formSerializer`; either hook changes
// the transformed value without changing transform identity, so a defined
// hook bypasses caching (construction-time values propagate through Axios's
// config merge, so checking the merged request config covers both). The
// `transitional` JSON-parsing flags remain cache-keyed (independent entries
// per flag set). `env` only selects FormData/Blob/fetch implementations for
// non-GET bodies, which are ineligible for caching regardless.
const PRISTINE_TRANSFORM_REQUEST: unknown = axios.defaults.transformRequest;
const PRISTINE_TRANSFORM_RESPONSE: unknown = axios.defaults.transformResponse;

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
    sameTransform(config.transformRequest, PRISTINE_TRANSFORM_REQUEST) &&
    sameTransform(config.transformResponse, PRISTINE_TRANSFORM_RESPONSE) &&
    config.parseReviver === undefined &&
    config.formSerializer === undefined &&
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
  const policy: CachePolicy = typeof policyOrTtl === 'number' ? { ttlMs: policyOrTtl } : policyOrTtl;
  const clone = policy.clone ?? defaultClone;
  const store = new SimpleCache<CachedResponseSnapshot>({ capacity: policy.capacity, clone: policy.clone });
  const withCredentialsDefault =
    policy.withCredentialsDefault ?? Boolean((instance.defaults as { withCredentials?: boolean }).withCredentials);

  // In-flight dedup of identical cacheable misses. Each key maps to a promise of
  // a freshly-cloned snapshot, so concurrent callers see one network round-trip
  // but each gets an independent snapshot per ARC-03 isolation. Mutations and
  // requests that bypass cache do NOT enter this map.
  const inflight = new Map<string, InflightSlot>();
  // Lifecycle ownership of every unsettled slot, independent of join
  // eligibility. `inflight` gates new joins; invalidation clears it to detach
  // old generations, but detached slots stay in `activeSlots` until they
  // settle so disposal can still reject them. Settling removes the slot
  // from both collections.
  const activeSlots = new Set<InflightSlot>();
  let generation = 0;
  let disposed = false;

  const finalizeInflight = (slot: InflightSlot) => {
    if (inflight.get(slot.key) === slot) {
      inflight.delete(slot.key);
    }
    activeSlots.delete(slot);
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
    // Existing sources and their attached tails retain lifecycle ownership in
    // `activeSlots`, but new requests cannot join reads started before the
    // invalidation boundary.
    inflight.clear();
  };

  instance.interceptors.request.use(
    async (config) => {
      consumeCacheInvalidationSignal(config as CacheRequestConfig);
      if (disposed || getCacheControlValue(config.headers) === 'false' || !isCacheEligible(config, instance))
        return config;

      const isCredentialed =
        resolveWithCredentials(config, withCredentialsDefault) || hasAuthenticationHeader(config.headers);
      const partitionKey = policy.partitionForRequest?.(config);

      if (isCredentialed && !hasUsablePartition(partitionKey)) {
        return config;
      }

      const key = generateCacheKey(config, partitionKey);
      policy.onCacheKey?.(key);

      // 1) A finished cache hit: serve a fresh clone of the snapshot directly.
      // Snapshots are already transformed; run under an identity transform so
      // Axios does not reparse them, then settle per caller config.
      const snapshot = store.get(key);
      if (snapshot) {
        setCacheRequestState(config, Object.freeze({ key, generation, role: 'hit' }));
        bypassResponseTransform(config);
        config.adapter = async (_config) => {
          const response = {
            data: snapshot.data,
            status: snapshot.status,
            statusText: snapshot.statusText,
            headers: { ...snapshot.headers, [CACHE_HEADER]: 'true' },
            config: _config,
          } as unknown as AxiosResponse;
          return settleSyntheticResponse(_config, response);
        };
        return config;
      }

      // 2) In-flight miss: dedup. Attach a tail adapter that awaits the
      //    in-flight response and returns an independent clone to each caller.
      //    The shared slot holds the once-transformed network response; tails
      //    run under an identity transform and settle per their own
      //    validateStatus so divergent policies stay source-order independent.
      const existing = inflight.get(key);
      if (existing) {
        // The tail adapter awaits `existing`, then returns an independent
        // clone on success or re-throws on failure. `inflightPromise` has
        // a no-op `.catch` attached at registration time so an early
        // rejection never surfaces as an unhandledRejection before the
        // caller attaches its own handler (e.g. via Promise.allSettled).
        bypassResponseTransform(config);
        config.adapter = async (_config) => {
          const response = await existing.promise;
          const shared = response as unknown as CachedResponseSnapshot & { config?: unknown };
          const tailResponse = {
            data: clone(shared.data),
            status: shared.status,
            statusText: shared.statusText,
            headers: { ...shared.headers, [CACHE_HEADER]: 'true' },
            config: _config,
          } as unknown as AxiosResponse;
          return settleSyntheticResponse(_config, tailResponse);
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
      activeSlots.add(slot);

      const nextConfig = { ...config } as InternalAxiosRequestConfig;
      setCacheRequestState(nextConfig, Object.freeze({ key, generation, role: 'source', slot }));

      // Settle the registered slot on any transformation failure. Axios runs
      // `transformRequest`/`transformResponse` inside `dispatchRequest`, after
      // the wrapped adapter above has already resolved, and a throwing
      // transform (e.g. a plain Error, which carries no `config`) never
      // reaches the adapter catch or the response error interceptor's
      // `error.config` lookup — leaving the slot (and every tail awaiting it)
      // abandoned. Wrapping at the throw site settles the slot independently
      // of what the error carries.
      const settleTransformFailure = (error: unknown): never => {
        rejectInflight(slot, error);
        throw error;
      };
      const wrapTransformList = (value: unknown): unknown => {
        const list = Array.isArray(value) ? value : [value];
        return list.map((fn) => {
          if (typeof fn !== 'function') return fn;
          const original = fn as (...args: never[]) => unknown;
          return function (this: unknown, ...args: never[]) {
            try {
              const result = original.apply(this, args);
              if (result && typeof (result as { catch?: unknown }).catch === 'function') {
                return (result as Promise<unknown>).catch((error: unknown) => settleTransformFailure(error));
              }
              return result;
            } catch (error) {
              return settleTransformFailure(error);
            }
          };
        });
      };
      nextConfig.transformRequest = wrapTransformList(nextConfig.transformRequest) as never;
      nextConfig.transformResponse = wrapTransformList(nextConfig.transformResponse) as never;

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
          // Decouple slot settlement from the source's status policy so tails
          // can re-settle the shared network response under their own
          // validateStatus. Settlement rejections resolve the slot with the
          // response; transform/transport failures reject it.
          const errResponse = (error as { response?: AxiosResponse })?.response;
          if (errResponse && isSettlementRejectionFor(error, adapterConfig)) {
            resolveInflight(slot, errResponse);
          } else {
            rejectInflight(slot, error);
          }
          throw error;
        }
      };

      return nextConfig;
    },
    (error) => Promise.reject(error),
  );

  instance.interceptors.response.use(
    (response) => {
      // Cache bypass only controls cache eligibility. Service mutations carry a
      // separate internal signal so cache-bypassed reads do not evict entries.
      if ((response.config as CacheRequestConfig)[CACHE_INVALIDATE_ON_SUCCESS]) {
        if (response.status >= 200 && response.status < 300) {
          invalidate();
        }
        return response;
      }

      const state = (response.config as CacheRequestConfig)[CACHE_REQUEST_STATE];
      if (!state || state.role !== 'source' || !state.slot) {
        return response;
      }

      if (response.status >= 200 && response.status < 300 && !isUnsupportedResponseBody(response)) {
        const snapshot = snapshotResponse(response, clone);
        response.data = clone(snapshot.data);
        response.headers = clone(snapshot.headers) as AxiosResponse['headers'];
        if (!disposed && state.generation === generation) {
          store.set(state.key, snapshot, policy.ttlMs);
        }
        resolveInflight(state.slot, snapshot as unknown as AxiosResponse);
        return response;
      }

      // Tails captured this exact slot in the request phase. Resolving the slot
      // does not depend on mutable credentials or on its current map ownership.
      resolveInflight(state.slot, response);

      return response;
    },
    (error) => {
      const state = ((error?.config ?? {}) as CacheRequestConfig)[CACHE_REQUEST_STATE];
      if (state?.role === 'source' && state.slot) {
        // Same decoupling as the source adapter wrapper: settlement
        // rejections share the response with tails for per-caller settlement.
        // Fallback path when the wrapper could not dispatch (no `dispatch`).
        const errResponse = (error as { response?: AxiosResponse })?.response;
        const sourceConfig = (error?.config ?? {}) as InternalAxiosRequestConfig;
        if (errResponse && isSettlementRejectionFor(error, sourceConfig)) {
          resolveInflight(state.slot, errResponse);
        } else {
          rejectInflight(state.slot, error);
        }
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
      // Reject every unsettled slot, including generations detached by an
      // earlier clear/mutation. `rejectInflight` finalizes each slot out of
      // both collections; the trailing clears only guard against reentry.
      for (const slot of [...activeSlots]) {
        rejectInflight(slot, error);
      }
      inflight.clear();
      activeSlots.clear();
    },
  };
}
