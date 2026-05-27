import { AxiosHeaders, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { CACHE_HEADER } from '../constants';

class SimpleCache<T> {
  private cache = new Map<string, T>();

  set(key: string, value: T): void {
    this.cache.set(key, value);
  }

  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }
}

const normalizeCacheValue = (value: unknown): unknown => {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map((item) => normalizeCacheValue(item));
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, [key, item]) => {
        acc[key] = normalizeCacheValue(item);
        return acc;
      }, {});
  }

  return value;
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
        normalizedKey !== CACHE_HEADER.toLowerCase() && !IGNORED_CACHE_HEADERS.has(normalizedKey) && value !== undefined
      );
    })
    .reduce<Record<string, unknown>>((acc, [key, value]) => {
      acc[key.toLowerCase()] = value;
      return acc;
    }, {});

  return JSON.stringify(normalizeCacheValue(normalizedHeaders));
};

function generateCacheKey(config: InternalAxiosRequestConfig) {
  const key = `${config.baseURL}/${config.url}_${config.method}_${generateParamKey(config.params)}_${generateDataKey(
    config.data,
  )}_${serializeHeaders(config.headers)}`;

  return encodeURI(key);
}

function generateParamKey(params?: Record<string, unknown>) {
  if (!params) return '';
  return JSON.stringify(normalizeCacheValue(params));
}

function generateDataKey(data: unknown) {
  if (!data) return '';
  return typeof data === 'string' ? data : JSON.stringify(normalizeCacheValue(data));
}

export function useCacheInterceptors(instance: AxiosInstance, cacheTTL: number) {
  const store = new SimpleCache<AxiosResponse>();

  instance.interceptors.request.use(
    async (config) => {
      if (config.headers[CACHE_HEADER] === 'false') return config;

      const key = generateCacheKey(config);
      const cachedResponse = store.get(key);

      if (!cachedResponse) {
        return config;
      }

      config.adapter = async (_config) => {
        return {
          ...cachedResponse,
          config: _config,
          headers: { ...cachedResponse.headers, [CACHE_HEADER]: 'true' },
        };
      };

      return config;
    },
    (error) => Promise.reject(error),
  );

  instance.interceptors.response.use(
    (response) => {
      if (response.config.headers[CACHE_HEADER] === 'false') return response;

      const key = generateCacheKey(response.config);
      store.set(key, response);
      setTimeout(() => store.delete(key), cacheTTL);
      return response;
    },
    (error) => Promise.reject(error),
  );
}
