import axios, { mergeConfig, AxiosRequestConfig } from 'axios';
import { isEmpty } from '@web-ts-toolkit/utils';
import { ModelService, DataService } from './services';
import { DataRequest, ModelRequest, ResponseCallback, Document } from './types';
import { Defaults, DataDefaults } from './interface';
import { useCacheInterceptors, type CacheController, type CachePartitioner } from './services/interceptors';
import { createWrapHelper } from './services/wrap';
import { normalizeConfigValue } from './services/cache-utils';
import { applyGroupCallbacks, finalizeRootEntry } from './services/shared';
import { ADAPTER_ID_KEY } from './services/symbols';
import { STARTED_KEY } from './lazy-promise';

const defaultAxiosConfig = Object.freeze({
  baseURL: '/api',
  timeout: 0,
  withCredentials: true,
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Expires: '0',
  },
});

const noopCacheController: CacheController = {
  clear: () => {},
  dispose: () => {},
};

const serializeRequestConfig = (config?: AxiosRequestConfig) => JSON.stringify(normalizeConfigValue(config ?? {}));

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value);

const mergeServiceDefaults = <TDefaults extends object>(
  adapterDefaults?: TDefaults,
  serviceDefaults?: TDefaults,
): TDefaults | undefined => {
  if (!adapterDefaults && !serviceDefaults) return undefined;

  const merged: Record<string, unknown> = {};
  const adapterDefaultsRecord = (adapterDefaults ?? {}) as Record<string, unknown>;
  const serviceDefaultsRecord = (serviceDefaults ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(adapterDefaultsRecord), ...Object.keys(serviceDefaultsRecord)]);

  for (const key of keys) {
    const adapterValue = adapterDefaultsRecord[key];
    const serviceValue = serviceDefaultsRecord[key];

    if (isObjectRecord(adapterValue) || isObjectRecord(serviceValue)) {
      merged[key] = {
        ...(isObjectRecord(adapterValue) ? adapterValue : {}),
        ...(isObjectRecord(serviceValue) ? serviceValue : {}),
      };
      continue;
    }

    merged[key] = serviceValue ?? adapterValue;
  }

  return merged as TDefaults;
};

/**
 * Options for {@link createAdapter}. `rootRouterPath` is the single-segment
 * path used by `adapter.group(...)` for batched root requests
 * (defaults to `'root'`). Per-adapter `onSuccess`/`onFailure`/`throwOnError`
 * apply to every service created by this adapter and are overridden by
 * per-service options on {@link ModelServiceOptions} and
 * {@link DataServiceOptions}.
 *
 * Cache controls (only in effect when `cacheTTL > 0`):
 *
 * - `cacheTTL` — seconds a cached GET response is reused before revalidation.
 * - `cachePartition` — required to cache credentialed requests safely (see
 *   {@link CachePartitioner}); credentialed requests without a stable,
 *   non-secret partition token bypass the cache so one identity cannot
 *   receive a response created under another.
 * - `cacheCapacity` — bounds the number of cached entries; the LRU entry is
 *   evicted when the limit is exceeded.
 *
 * Use the returned adapter's `clearCache()` on credential transitions
 * (login/logout/token refresh/tenant change) and `disposeCache()` when the
 * adapter is no longer needed to release cache timers.
 */
export interface AdapterOptions {
  rootRouterPath?: string;
  onSuccess?: ResponseCallback;
  onFailure?: ResponseCallback;
  throwOnError?: boolean;
  cacheTTL?: number;
  /**
   * Partition strategy for credentialed cache entries. When the adapter is
   * credentialed (which is the default), caching is only enabled for requests
   * whose `cachePartition` returns a stable, non-secret identity token. Requests
   * without a partition key bypass the cache so that one identity can never
   * receive a response created under another identity.
   *
   * The returned value must be a stable, non-secret token (for example a user
   * id or tenant id). Never return raw cookies, authorization values, or other
   * secrets; those headers are excluded from cache keys regardless.
   */
  cachePartition?: CachePartitioner;
  /**
   * Maximum number of cached entries retained per adapter. Defaults to
   * unbounded; set a finite value to bound memory in long-lived processes.
   */
  cacheCapacity?: number;
  modelDefaults?: Defaults;
  dataDefaults?: DataDefaults;
}

/**
 * Options for {@link createAdapter}.createModelService<T>. Mirrors the
 * server-side `access-router` model route configuration: `modelName` is the
 * server-registered model name, `basePath` is the URL segment relative to
 * the adapter `baseURL` (e.g. `'users'` resolves to `${baseURL}/users`),
 * `queryPath` defaults to `'__query'` and `mutationPath` defaults to
 * `'__mutation'` — match these to the server's `queryRouteSegment` and
 * mutation route configuration. Per-service `onSuccess`/`onFailure`/
 * `throwOnError` override the adapter-level defaults.
 */
export interface ModelServiceOptions {
  modelName: string;
  basePath: string;
  queryPath?: string;
  mutationPath?: string;
  onSuccess?: ResponseCallback;
  onFailure?: ResponseCallback;
  throwOnError?: boolean;
}

/**
 * Options for {@link createAdapter}.createDataService<T>. Mirrors the
 * server-side `access-router` data route configuration: `dataName` is the
 * server-registered data name, `basePath` is the URL segment relative to
 * the adapter `baseURL`, `queryPath` defaults to `'__query'`. Per-service
 * `onSuccess`/`onFailure`/`throwOnError` override the adapter-level
 * defaults.
 */
export interface DataServiceOptions {
  dataName: string;
  basePath: string;
  queryPath?: string;
  onSuccess?: ResponseCallback;
  onFailure?: ResponseCallback;
  throwOnError?: boolean;
}

/**
 * Creates a typed API adapter for `@web-ts-toolkit/access-router` model and data routes.
 *
 * The adapter owns its own Axios instance, optional request cache, and
 * per-adapter identity token (used by {@link group} to reject requests
 * owned by a different adapter before any network activity). The returned
 * adapter is frozen and exposes:
 *
 * - `axios` — the underlying Axios instance for advanced configuration or
 *   attaching interceptors (the package's cache interceptors are installed
 *   when `cacheTTL > 0`).
 * - `createModelService<T>(...)` / `createDataService<T>(...)` — typed
 *   factories for the model and data route clients.
 * - `clearCache()` / `disposeCache()` — adapter-scoped cache controls
 *   installed by {@link AdapterOptions.cacheTTL}. `clearCache()` drops all
 *   cached entries (call on login/logout/token refresh/tenant switch);
 *   `disposeCache()` also releases the cache's timers so a long-lived
 *   adapter can be torn down cleanly.
 * - `wrapGet` / `wrapPost` / `wrapPut` / `wrapPatch` / `wrapDelete` —
 *   low-level helpers that wrap a raw Axios call to a single path segment
 *   with `pathParams`/`queryParams` templating and the package's
 *   normalized success/failure handling.
 * - `group(...)` — batches multiple lazy requests created by this
 *   adapter's services into one root round trip. Rejected before network
 *   activity if any input has already started execution or was created by
 *   a different adapter.
 *
 * @example
 * const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
 * const userService = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });
 */
export function createAdapter(axiosConfig?: AxiosRequestConfig, adapterOptions?: AdapterOptions) {
  const merged = mergeConfig(defaultAxiosConfig, axiosConfig ?? {});
  const instance = axios.create(merged);
  const {
    rootRouterPath = 'root',
    onSuccess: onSuccessRoot,
    onFailure: onFailureRoot,
    throwOnError: throwOnErrorRoot,
    cacheTTL = 0,
    cachePartition,
    cacheCapacity,
    modelDefaults: adapterModelDefaults,
    dataDefaults: adapterDataDefaults,
  } = adapterOptions ?? {};

  const cacheController: CacheController =
    cacheTTL > 0
      ? useCacheInterceptors(instance, {
          ttl: cacheTTL,
          capacity: cacheCapacity,
          withCredentialsDefault: Boolean((instance.defaults as { withCredentials?: boolean }).withCredentials),
          partitionForRequest: cachePartition,
        })
      : noopCacheController;

  const wraps = createWrapHelper(instance);

  // Unique per-adapter identity token. Stamped non-enumerably onto every
  // ModelService/DataService created by this adapter so `group()` can reject
  // requests owned by a different adapter before any network activity begins.
  const adapterId = Symbol('adapter');

  const stampAdapterId = <S>(service: S): S => {
    Object.defineProperty(service, ADAPTER_ID_KEY, {
      value: adapterId,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    return service;
  };

  return Object.freeze({
    axios: instance,
    clearCache: cacheController.clear,
    disposeCache: cacheController.dispose,
    createModelService: <T extends Document>(
      {
        modelName,
        basePath,
        queryPath = '__query',
        mutationPath = '__mutation',
        onSuccess,
        onFailure,
        throwOnError,
      }: ModelServiceOptions,
      defaults?: Defaults,
    ) => {
      const service = new ModelService<T>(
        {
          axios: instance,
          modelName,
          basePath,
          queryPath,
          mutationPath,
          onSuccess: onSuccess ?? onSuccessRoot,
          onFailure: onFailure ?? onFailureRoot,
          throwOnError: throwOnError ?? throwOnErrorRoot ?? false,
        },
        mergeServiceDefaults(adapterModelDefaults, defaults),
      );
      return stampAdapterId(service);
    },
    createDataService: <T>(
      { dataName, basePath, queryPath = '__query', onSuccess, onFailure, throwOnError }: DataServiceOptions,
      defaults?: DataDefaults,
    ) => {
      const service = new DataService<T>(
        {
          axios: instance,
          dataName,
          basePath,
          queryPath,
          onSuccess: onSuccess ?? onSuccessRoot,
          onFailure: onFailure ?? onFailureRoot,
          throwOnError: throwOnError ?? throwOnErrorRoot ?? false,
        },
        mergeServiceDefaults(adapterDataDefaults, defaults),
      );
      return stampAdapterId(service);
    },
    wrapGet: wraps.wrapGet,
    wrapPost: wraps.wrapPost,
    wrapPut: wraps.wrapPut,
    wrapPatch: wraps.wrapPatch,
    wrapDelete: wraps.wrapDelete,
    group: async <T extends readonly (ModelRequest<unknown> | DataRequest<unknown>)[]>(
      ...proms: T
    ): Promise<{ [K in keyof T]: Awaited<T[K]> }> => {
      let sharedConfig: AxiosRequestConfig | undefined;
      let sharedConfigKey: string | undefined;
      const defs = proms.map((prom, index) => {
        // ARC-09: reject already-started requests before any network activity,
        // so an executed mutation cannot be resubmitted through group().
        if (prom[STARTED_KEY] === true) {
          throw new Error(
            'Cannot group a request that has already started execution; group() must be called before await/then/catch/finally/exec on each input',
          );
        }
        // ARC-09: reject foreign-adapter requests. The adapter's per-instance
        // identity token is stamped non-enumerably on the service; a request
        // whose owning service was constructed by a different adapter cannot
        // be honored because the underlying axios instance, cache, and
        // request-config defaults belong to that other adapter.
        const service = prom.__service as { [ADAPTER_ID_KEY]?: symbol } | undefined;
        if (!service || service[ADAPTER_ID_KEY] !== adapterId) {
          throw new Error(
            "Cannot group a request owned by a different adapter; create the request from this adapter's services",
          );
        }

        if (!isEmpty(prom.__requestConfig)) {
          const configKey = serializeRequestConfig(prom.__requestConfig);

          if (sharedConfigKey && sharedConfigKey !== configKey) {
            throw new Error('Grouped requests must share the same axios request config');
          }

          sharedConfig = prom.__requestConfig;
          sharedConfigKey = configKey;
        }

        const query = { ...prom.__query };
        if (prom.__query.order == null) {
          query.order = index;
        }

        return query;
      });

      const result = await instance.post(rootRouterPath, defs, sharedConfig ?? {}).then((res) => {
        const responseHeaders = res.headers ?? {};
        const rawEntries = res.data.map(({ result, message, statusCode, op }) => ({
          result,
          message,
          statusCode,
          op,
        }));

        // Finalize each entry through the shared normalization boundary
        // (`finalizeRootEntry`) used identically by `adapter.ts` so direct
        // and grouped execution of the same operation produce equivalent
        // normalized results.
        const finalized = rawEntries.map((rawEntry, index) => {
          const service = proms[index].__service;
          const query = proms[index].__query;
          return finalizeRootEntry(query, rawEntry, responseHeaders, service);
        });

        // Derive the batch-level `throwOnError` policy once from the shared
        // per-call request metadata. `group(...)` requires every member of a
        // batch to share one AxiosRequestConfig, so the policy is uniform
        // across the batch: either every per-failure `throwOnError` is
        // honored (short-circuit on the first failing entry) or every
        // entry returns its normalized `{ success: false }` payload. The
        // per-call `throwOnError` flag travels in `__throwOnError` on the
        // request metadata (each service method captures it from the
        // `axiosRequestConfig` parameter before stripping it from
        // `__requestConfig`).
        const groupThrowOnError = sharedConfig != null && proms.some((p) => p.__throwOnError === true);

        return applyGroupCallbacks(
          finalized,
          proms.map((p) => p.__service),
          groupThrowOnError,
        ) as {
          [K in keyof T]: Awaited<T[K]>;
        };
      });

      return result;
    },
  });
}
