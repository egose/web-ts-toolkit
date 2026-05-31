import { AxiosRequestConfig, AxiosInstance, mergeConfig } from 'axios';
import { set } from '@web-ts-toolkit/utils';
import { CACHE_HEADER } from '../constants';
import { getWrapContext } from '../helpers';
import { WrapOptions } from '../types';

const removeTrailingSlash = (s: string) => s.replace(/\/$/, '');
const removeLeadingSlash = (s: string) => s.replace(/^\/+/g, '');

function resolveUrl(basePath: string | undefined, url: string) {
  return basePath ? `${removeTrailingSlash(basePath)}/${removeLeadingSlash(url)}` : url;
}

function prepareConfig(defaultConfig: AxiosRequestConfig, cacheValue: string, requestConfig?: AxiosRequestConfig) {
  set(defaultConfig, `headers.${CACHE_HEADER}`, cacheValue);
  return mergeConfig(defaultConfig, requestConfig);
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
          prepareConfig(defaultConfig, 'false', requestConfig),
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
          prepareConfig(defaultConfig, 'false', requestConfig),
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
          prepareConfig(defaultConfig, 'false', requestConfig),
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
          prepareConfig(defaultConfig, 'false', requestConfig),
        );
        return axios.delete<T>(finalUrl, finalConfig);
      };
    },
  };
}
