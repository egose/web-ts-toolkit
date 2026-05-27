import axios, { AxiosHeaders, mergeConfig, AxiosRequestConfig } from 'axios';
import { castArray, isEmpty, set } from '@web-ts-toolkit/utils';
import { ModelService, DataService } from './services';
import { Model } from './model';
import {
  DataPromiseMeta,
  Document,
  LazyRequest,
  ModelPromiseMeta,
  ResponseCallback,
  RootQueryMeta,
  WrapOptions,
} from './types';
import { Defaults, DataDefaults } from './interface';
import { useCacheInterceptors } from './services/interceptors';
import { getWrapContext } from './helpers';
import { CACHE_HEADER } from './constants';

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

const normalizeConfigValue = (value: unknown): unknown => {
  if (value == null) return value;

  if (value instanceof AxiosHeaders) {
    return normalizeConfigValue(value.toJSON());
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeConfigValue(item));
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, [key, item]) => {
        acc[key] = normalizeConfigValue(item);
        return acc;
      }, {});
  }

  return value;
};

const serializeRequestConfig = (config?: AxiosRequestConfig) => JSON.stringify(normalizeConfigValue(config ?? {}));

interface AdapterOptions {
  rootRouterPath?: string;
  onSuccess?: ResponseCallback;
  onFailure?: ResponseCallback;
  throwOnError?: boolean;
  cacheTTL?: number;
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

export function createAdapter(axiosConfig?: AxiosRequestConfig, adapterOptions?: AdapterOptions) {
  const merged = mergeConfig(defaultAxiosConfig, axiosConfig ?? {});
  const instance = axios.create(merged);
  const {
    rootRouterPath = 'root',
    onSuccess: onSuccessRoot,
    onFailure: onFailureRoot,
    throwOnError: throwOnErrorRoot,
    cacheTTL = 0,
  } = adapterOptions ?? {};

  if (cacheTTL > 0) useCacheInterceptors(instance, cacheTTL);

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
        defaults,
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
        defaults,
      );
    },
    wrapGet: <T = unknown>(url: string, defaultAxiosRequestConfig: AxiosRequestConfig = {}) => {
      set(defaultAxiosRequestConfig, `headers.${CACHE_HEADER}`, 'true');
      return (options?: WrapOptions, axiosRequestConfig?: AxiosRequestConfig) => {
        const { finalUrl, finalConfig } = getWrapContext(
          url,
          options,
          mergeConfig(defaultAxiosRequestConfig, axiosRequestConfig),
        );

        return instance.get<T>(finalUrl, finalConfig);
      };
    },
    wrapPost: <T = unknown>(url: string, defaultAxiosRequestConfig: AxiosRequestConfig = {}) => {
      set(defaultAxiosRequestConfig, `headers.${CACHE_HEADER}`, 'false');
      return (data?: unknown, options?: WrapOptions, axiosRequestConfig?: AxiosRequestConfig) => {
        const { finalUrl, finalConfig } = getWrapContext(
          url,
          options,
          mergeConfig(defaultAxiosRequestConfig, axiosRequestConfig),
        );

        return instance.post<T>(finalUrl, data, finalConfig);
      };
    },
    wrapPut: <T = unknown>(url: string, defaultAxiosRequestConfig: AxiosRequestConfig = {}) => {
      set(defaultAxiosRequestConfig, `headers.${CACHE_HEADER}`, 'false');
      return (data?: unknown, options?: WrapOptions, axiosRequestConfig?: AxiosRequestConfig) => {
        const { finalUrl, finalConfig } = getWrapContext(
          url,
          options,
          mergeConfig(defaultAxiosRequestConfig, axiosRequestConfig),
        );

        return instance.put<T>(finalUrl, data, finalConfig);
      };
    },
    wrapPatch: <T = unknown>(url: string, defaultAxiosRequestConfig: AxiosRequestConfig = {}) => {
      set(defaultAxiosRequestConfig, `headers.${CACHE_HEADER}`, 'false');
      return (data?: unknown, options?: WrapOptions, axiosRequestConfig?: AxiosRequestConfig) => {
        const { finalUrl, finalConfig } = getWrapContext(
          url,
          options,
          mergeConfig(defaultAxiosRequestConfig, axiosRequestConfig),
        );

        return instance.patch<T>(finalUrl, data, finalConfig);
      };
    },
    wrapDelete: <T = unknown>(url: string, defaultAxiosRequestConfig: AxiosRequestConfig = {}) => {
      set(defaultAxiosRequestConfig, `headers.${CACHE_HEADER}`, 'false');
      return (options?: WrapOptions, axiosRequestConfig?: AxiosRequestConfig) => {
        const { finalUrl, finalConfig } = getWrapContext(
          url,
          options,
          mergeConfig(defaultAxiosRequestConfig, axiosRequestConfig),
        );

        return instance.delete<T>(finalUrl, finalConfig);
      };
    },
    group: async <T extends ((ModelPromiseMeta | DataPromiseMeta) & LazyRequest<unknown>)[]>(
      ...proms: T
    ): Promise<{ [K in keyof T]: T[K] extends Promise<infer U> ? U : never }> => {
      let sharedConfig: AxiosRequestConfig | undefined;
      let sharedConfigKey: string | undefined;
      const defs = proms.map((prom) => {
        if (!isEmpty(prom.__requestConfig)) {
          const configKey = serializeRequestConfig(prom.__requestConfig);

          if (sharedConfigKey && sharedConfigKey !== configKey) {
            throw new Error('Grouped requests must share the same axios request config');
          }

          sharedConfig = prom.__requestConfig;
          sharedConfigKey = configKey;
        }

        return prom.__query;
      });

      const result = await instance.post(rootRouterPath, defs, sharedConfig ?? {}).then((res) => {
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
            headers: {},
          };
        }) as {
          [K in keyof T]: T[K] extends Promise<infer U> ? U : never;
        };
      });

      return result;
    },
  });
}
