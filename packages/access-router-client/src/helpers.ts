import { AxiosRequestConfig } from 'axios';
import { isPlainObject, mapValues } from '@web-ts-toolkit/utils';
import { FilterQuery, WrapOptions } from './types';

export function replaceSubQuery<T>(filter: FilterQuery<T>) {
  if (!isPlainObject(filter)) return filter;

  const ret = mapValues(filter, (val) => {
    if (isPlainObject(val) && '__op' in val && val.__op && '__query' in val && val.__query) {
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

/**
 * Encodes a single dynamic URL path segment exactly once with
 * `encodeURIComponent`. Callers must apply this to each *segment* they
 * interpolate into a path, never to a complete path or URL.
 *
 * Behavior:
 *
 * - `undefined`/`null`/empty string return `''` so missing wrapper
 *   placeholder values produce an empty segment rather than the literal
 *   `"undefined"`/`"null"` string.
 * - Non-string values are coerced to `String(...)` first.
 * - `encodeURIComponent` is applied exactly once. Values that already
 *   contain percent-escape sequences are re-encoded (`%` becomes `%25`),
 *   so an already-encoded input such as `%2F` is sent as `%252F`; the
 *   server decodes exactly once and the route sees the literal `%2F`
 *   string rather than treating it as a `/` and splitting into a
 *   different route. This satisfies the "encoded input is not
 *   double-decoded into another route" requirement.
 * - The static `/` separators between route segments are inserted by
 *   the caller and are never passed through this helper.
 */
export function encodePathSegment(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  return encodeURIComponent(String(value));
}

export function template(templateString: string, data: Record<string, string | number>) {
  return templateString.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? encodePathSegment(data[key]) : match;
  });
}

export function getWrapContext(
  url: string,
  options?: WrapOptions,
  config?: AxiosRequestConfig,
): { finalUrl: string; finalConfig: AxiosRequestConfig | undefined } {
  const { queryParams, pathParams } = options ?? {};
  const finalUrl = pathParams ? template(url, pathParams) : url;

  // Do not mutate the caller-supplied config. Caller queryParams are merged
  // into a shallow clone so the caller's `params` object is preserved
  // across repeated invocations of the same wrapper.
  const finalConfig =
    queryParams && config
      ? { ...config, params: queryParams }
      : queryParams && !config
        ? { params: queryParams }
        : config;

  return { finalUrl, finalConfig };
}
