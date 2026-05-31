import { AxiosHeaders, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { CACHE_HEADER } from '../constants';
import { normalizeConfigValue } from './cache-utils';

class SimpleCache<T> {
  private cache = new Map<string, T>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  set(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value);

    if (ttl && ttl > 0) {
      const existing = this.timers.get(key);
      if (existing) clearTimeout(existing);

      this.timers.set(
        key,
        setTimeout(() => {
          this.cache.delete(key);
          this.timers.delete(key);
        }, ttl),
      );
    }
  }

  get(key: string): T | undefined {
    return this.cache.get(key);
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
}

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

  return JSON.stringify(normalizeConfigValue(normalizedHeaders));
};

function generateCacheKey(config: InternalAxiosRequestConfig) {
  const key = `${config.baseURL}/${config.url}_${config.method}_${generateParamKey(config.params)}_${generateDataKey(
    config.data,
  )}_${serializeHeaders(config.headers)}`;

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
      store.set(key, response, cacheTTL);
      return response;
    },
    (error) => Promise.reject(error),
  );
}
