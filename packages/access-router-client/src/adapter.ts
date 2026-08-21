import axios, { mergeConfig, AxiosRequestConfig } from 'axios';
import { ModelService, DataService } from './services';
import { DataRequest, ModelRequest, ResponseCallback, Document } from './types';
import { Defaults, DataDefaults } from './interface';
import {
  removeCacheInvalidationSignal,
  useCacheInterceptors,
  type CacheController,
  type CachePartitioner,
} from './services/interceptors';
import { createWrapHelper } from './services/wrap';
import { normalizeGroupedRequestConfig } from './services/cache-utils';
import { applyGroupCallbacks, finalizeRootEntry, finalizeRootTransportFailure } from './services/shared';
import { ADAPTER_ID_KEY } from './services/symbols';
import { claimLazyRequest, releaseLazyRequestClaim } from './lazy-promise';

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

const noopResponseCallback: ResponseCallback = () => {};

const ROOT_MUTATION_OPS = new Set([
  'create',
  'update',
  'upsert',
  'delete',
  'subCreate',
  'subUpdate',
  'subBulkUpdate',
  'subDelete',
]);

const serializeRequestConfig = (config?: AxiosRequestConfig) =>
  JSON.stringify(normalizeGroupedRequestConfig(removeCacheInvalidationSignal(config ?? {})));

const createMalformedRootResponseError = (message: string) => {
  const error = new Error(message);
  error.name = 'MalformedRootResponseError';
  return error;
};

const validateRootResponseEntries = (data: unknown, expectedLength: number) => {
  if (!Array.isArray(data)) {
    throw createMalformedRootResponseError('Malformed root response: expected an array');
  }

  if (data.length !== expectedLength) {
    throw createMalformedRootResponseError(
      `Malformed root response: expected ${expectedLength} entries but received ${data.length}`,
    );
  }

  return data.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw createMalformedRootResponseError(`Malformed root response: entry ${index} is not an object`);
    }

    const { result, message, statusCode, op } = entry as Record<string, unknown>;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw createMalformedRootResponseError(`Malformed root response: entry ${index} result is not an object`);
    }

    if (typeof (result as { success?: unknown }).success !== 'boolean') {
      throw createMalformedRootResponseError(`Malformed root response: entry ${index} result.success is not boolean`);
    }

    if (typeof statusCode !== 'number' || !Number.isFinite(statusCode)) {
      throw createMalformedRootResponseError(
        `Malformed root response: entry ${index} statusCode is not a finite number`,
      );
    }

    if (message != null && typeof message !== 'string') {
      throw createMalformedRootResponseError(`Malformed root response: entry ${index} message is not a string`);
    }

    if (op != null && typeof op !== 'string') {
      throw createMalformedRootResponseError(`Malformed root response: entry ${index} op is not a string`);
    }

    return {
      result: result as { success: boolean; [key: string]: unknown },
      message: message ?? '',
      statusCode,
      op,
    };
  });
};

const applyRootTransportFailure = <T extends readonly (ModelRequest<unknown> | DataRequest<unknown>)[]>(
  proms: T,
  groupThrowOnError: boolean | undefined,
  error: unknown,
) => {
  const failures = proms.map((prom) => finalizeRootTransportFailure(prom.__query, error));
  return applyGroupCallbacks(
    failures,
    proms.map((p) => p.__service),
    groupThrowOnError ?? false,
  ) as { [K in keyof T]: Awaited<T[K]> };
};

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
 *   {@link CachePartitioner}); requests using browser cookies,
 *   `withCredentials`, or explicit auth headers without a stable, non-secret
 *   partition token bypass the cache so one identity cannot receive a
 *   response created under another.
 * - `cacheCapacity` — bounds the number of cached entries; defaults to 100 and
 *   evicts the LRU entry when the limit is exceeded.
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
   * Partition strategy for credentialed cache entries. When a request uses
   * browser cookies, `withCredentials`, or explicit auth headers, caching is
   * only enabled when `cachePartition` returns a stable, non-secret identity
   * token. Requests without a partition key bypass the cache so that one
   * identity can never receive a response created under another identity.
   *
   * The returned value must be a stable, non-secret token (for example a user
   * id or tenant id). Never return raw cookies, authorization values, or other
   * secrets; those headers are excluded from cache keys regardless.
   */
  cachePartition?: CachePartitioner;
  /**
   * Maximum number of cached entries retained per adapter. Defaults to 100.
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
          onSuccess: onSuccess ?? onSuccessRoot ?? noopResponseCallback,
          onFailure: onFailure ?? onFailureRoot ?? noopResponseCallback,
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
          onSuccess: onSuccess ?? onSuccessRoot ?? noopResponseCallback,
          onFailure: onFailure ?? onFailureRoot ?? noopResponseCallback,
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
      let groupThrowOnError: boolean | undefined;
      const defs = proms.map((prom, index) => {
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

        if (groupThrowOnError != null && groupThrowOnError !== prom.__throwOnError) {
          throw new Error('Grouped requests must share the same effective throwOnError policy');
        }
        groupThrowOnError = prom.__throwOnError;

        const configKey = serializeRequestConfig(prom.__requestConfig);
        if (sharedConfigKey != null && sharedConfigKey !== configKey) {
          throw new Error('Grouped requests must share the same axios request config');
        }
        sharedConfig ??= prom.__requestConfig ?? {};
        sharedConfigKey = configKey;

        const query = { ...prom.__query };
        if (query.target === 'model') {
          delete query.model;
        }
        if (prom.__query.order == null) {
          query.order = index;
        }

        return query;
      });

      // Validate the complete batch before claiming any request. The claim
      // loop is synchronous, so competing group() calls cannot both reserve
      // the same lazy request. Roll back only this group's claims if a
      // duplicate or already-owned request fails the claim phase.
      const groupOwner = Symbol('group');
      const claimed: (ModelRequest<unknown> | DataRequest<unknown>)[] = [];
      try {
        for (const prom of proms) {
          claimLazyRequest(prom, 'grouped', groupOwner);
          claimed.push(prom);
        }
      } catch (error) {
        for (const prom of claimed) {
          releaseLazyRequestClaim(prom, groupOwner);
        }
        throw error;
      }

      const groupConfig = removeCacheInvalidationSignal(sharedConfig ?? {});
      const result = await instance.post(rootRouterPath, defs, groupConfig).then(
        (res) => {
          let rawEntries;
          try {
            rawEntries = validateRootResponseEntries(res.data, proms.length);
          } catch (error) {
            return applyRootTransportFailure(proms, groupThrowOnError, error);
          }

          if (
            rawEntries.some(
              (entry, index) =>
                ROOT_MUTATION_OPS.has(proms[index].__query.op) &&
                entry.result?.success === true &&
                entry.statusCode >= 200 &&
                entry.statusCode < 300,
            )
          ) {
            cacheController.clear();
          }

          const finalized = rawEntries.map((rawEntry, index) =>
            finalizeRootEntry(proms[index].__query, rawEntry, {}, proms[index].__service),
          );

          return applyGroupCallbacks(
            finalized,
            proms.map((p) => p.__service),
            groupThrowOnError ?? false,
          ) as { [K in keyof T]: Awaited<T[K]> };
        },
        (error: unknown) => {
          return applyRootTransportFailure(proms, groupThrowOnError, error);
        },
      );

      return result;
    },
  });
}
