import axios, { mergeConfig, AxiosRequestConfig } from 'axios';
import { castArray, isEmpty } from '@web-ts-toolkit/utils';
import { ModelService, DataService } from './services';
import { Model } from './model';
import { DataRequest, Document, ModelRequest, ResponseCallback, RootQueryMeta } from './types';
import { Defaults, DataDefaults } from './interface';
import { useCacheInterceptors } from './services/interceptors';
import { createWrapHelper } from './services/wrap';
import { normalizeConfigValue } from './services/cache-utils';

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

const isModelQuery = (query: RootQueryMeta): query is Extract<RootQueryMeta, { target: 'model' }> =>
  query.target === 'model';

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

export interface AdapterOptions {
  rootRouterPath?: string;
  onSuccess?: ResponseCallback;
  onFailure?: ResponseCallback;
  throwOnError?: boolean;
  cacheTTL?: number;
  modelDefaults?: Defaults;
  dataDefaults?: DataDefaults;
}

interface ModelServiceOptions {
  modelName: string;
  basePath: string;
  queryPath?: string;
  mutationPath?: string;
  onSuccess?: ResponseCallback;
  onFailure?: ResponseCallback;
  throwOnError?: boolean;
}

interface DataServiceOptions {
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
    modelDefaults: adapterModelDefaults,
    dataDefaults: adapterDataDefaults,
  } = adapterOptions ?? {};

  if (cacheTTL > 0) useCacheInterceptors(instance, cacheTTL);

  const wraps = createWrapHelper(instance);

  return Object.freeze({
    axios: instance,
    createModelService: <T>(
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
      return new ModelService<T>(
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
    },
    createDataService: <T>(
      { dataName, basePath, queryPath = '__query', onSuccess, onFailure, throwOnError }: DataServiceOptions,
      defaults?: DataDefaults,
    ) => {
      return new DataService<T>(
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
        return res.data.map(({ result, message, statusCode, op }, index) => {
          const service = proms[index].__service;
          const query = proms[index].__query;
          const success = result.success;
          let _raw = success ? result.data : null;
          let _data = _raw;

          if (!success) {
            _data = null;
          } else if (isModelQuery(query)) {
            const modelService = service as ModelService<Document>;

            if (result.kind === 'list' && Array.isArray(result.data)) {
              if (op === 'create' && result.data.length === 1) {
                _raw = result.data[0];
                _data = Model.create(result.data[0], modelService);
              } else if (!['distinct', 'subList'].includes(op)) {
                _data = castArray(result.data).map((item) => Model.create(item, modelService));
              }
            } else if (result.kind === 'single' && ['new', 'read', 'update', 'upsert'].includes(op)) {
              _data = Model.create(result.data, modelService);
            }
          }

          return {
            success,
            raw: _raw,
            data: _data,
            message,
            status: statusCode,
            totalCount: result.success && result.kind === 'list' ? (result.totalCount ?? result.count ?? 0) : 0,
            headers: responseHeaders,
          };
        }) as { [K in keyof T]: Awaited<T[K]> };
      });

      return result;
    },
  });
}
