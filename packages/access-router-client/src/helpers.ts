import { AxiosRequestConfig } from 'axios';
import { isPlainObject, mapValues } from '@web-ts-toolkit/utils';
import { FilterQuery, WrapOptions } from './types';

export function replaceSubQuery<T>(filter: FilterQuery<T>) {
  if (!isPlainObject(filter)) return filter;

  const ret = mapValues(filter, (val) => {
    if (val && val.__op && val.__query) {
      return {
        $$sq: val.__query,
      };
    }

    if (isPlainObject(val)) {
      return replaceSubQuery(val);
    }

    if (Array.isArray(val)) {
      return val.map((v) => replaceSubQuery(v));
    }

    return val;
  });

  return ret;
}

export function template(templateString: string, data: Record<string, string | number>) {
  return templateString.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

export function getWrapContext(url: string, options?: WrapOptions, config?: AxiosRequestConfig) {
  const { queryParams, pathParams } = options ?? {};
  const finalUrl = pathParams ? template(url, pathParams) : url;

  if (queryParams && config) config.params = queryParams;
  return { finalUrl, finalConfig: config };
}
