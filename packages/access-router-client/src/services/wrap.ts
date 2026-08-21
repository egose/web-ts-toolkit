import { AxiosHeaders, AxiosRequestConfig, AxiosInstance, mergeConfig } from 'axios';
import { CACHE_HEADER } from '../constants';
import { getWrapContext } from '../helpers';
import { WrapOptions } from '../types';
import { cloneConfigWithCacheBypass } from './interceptors';

const removeTrailingSlash = (s: string) => s.replace(/\/$/, '');
const removeLeadingSlash = (s: string) => s.replace(/^\/+/g, '');

function resolveUrl(basePath: string | undefined, url: string): string {
  return basePath ? `${removeTrailingSlash(basePath)}/${removeLeadingSlash(url)}` : url;
}

/**
 * Returns a fresh Axios request config that combines the wrapper default
 * config with the per-call request config, with the package-owned
 * `CACHE_HEADER` set to `cacheValue`. Neither `defaultConfig` nor
 * `requestConfig` is mutated: the cache header is stamped onto a fresh
 * headers object derived from `defaultConfig.headers`, and `mergeConfig`
 * produces a fresh top-level config object each call.
 */
function prepareConfig(
  defaultConfig: AxiosRequestConfig,
  cacheValue: string,
  requestConfig?: AxiosRequestConfig,
  invalidateOnSuccess = false,
): AxiosRequestConfig {
  const headerClone = new AxiosHeaders(defaultConfig.headers);
  headerClone.set(CACHE_HEADER, cacheValue);

  const defaulted: AxiosRequestConfig = { ...defaultConfig, headers: headerClone };
  const merged = mergeConfig(defaulted, requestConfig);
  return invalidateOnSuccess ? cloneConfigWithCacheBypass(merged) : merged;
}

export function createWrapHelper(axios: AxiosInstance, basePath?: string) {
  return {
    wrapGet: <T = unknown>(url: string, defaultConfig: AxiosRequestConfig = {}) => {
      const _url = resolveUrl(basePath, url);
      return (options?: WrapOptions, requestConfig?: AxiosRequestConfig) => {
        const { finalUrl, finalConfig } = getWrapContext(
          _url,
          options,
          prepareConfig(defaultConfig, 'true', requestConfig),
        );
        return axios.get<T>(finalUrl, finalConfig);
      };
    },

    wrapPost: <T = unknown>(url: string, defaultConfig: AxiosRequestConfig = {}) => {
      const _url = resolveUrl(basePath, url);
      return (data?: unknown, options?: WrapOptions, requestConfig?: AxiosRequestConfig) => {
        const { finalUrl, finalConfig } = getWrapContext(
          _url,
          options,
          prepareConfig(defaultConfig, 'false', requestConfig, true),
        );
        return axios.post<T>(finalUrl, data, finalConfig);
      };
    },

    wrapPut: <T = unknown>(url: string, defaultConfig: AxiosRequestConfig = {}) => {
      const _url = resolveUrl(basePath, url);
      return (data?: unknown, options?: WrapOptions, requestConfig?: AxiosRequestConfig) => {
        const { finalUrl, finalConfig } = getWrapContext(
          _url,
          options,
          prepareConfig(defaultConfig, 'false', requestConfig, true),
        );
        return axios.put<T>(finalUrl, data, finalConfig);
      };
    },

    wrapPatch: <T = unknown>(url: string, defaultConfig: AxiosRequestConfig = {}) => {
      const _url = resolveUrl(basePath, url);
      return (data?: unknown, options?: WrapOptions, requestConfig?: AxiosRequestConfig) => {
        const { finalUrl, finalConfig } = getWrapContext(
          _url,
          options,
          prepareConfig(defaultConfig, 'false', requestConfig, true),
        );
        return axios.patch<T>(finalUrl, data, finalConfig);
      };
    },

    wrapDelete: <T = unknown>(url: string, defaultConfig: AxiosRequestConfig = {}) => {
      const _url = resolveUrl(basePath, url);
      return (options?: WrapOptions, requestConfig?: AxiosRequestConfig) => {
        const { finalUrl, finalConfig } = getWrapContext(
          _url,
          options,
          prepareConfig(defaultConfig, 'false', requestConfig, true),
        );
        return axios.delete<T>(finalUrl, finalConfig);
      };
    },
  };
}
