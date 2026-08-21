import { AxiosHeaders } from 'axios';
import { omitBy } from '@web-ts-toolkit/utils';

const unsupportedGroupConfigKeys = new Set([
  'adapter',
  'cancelToken',
  'onDownloadProgress',
  'onUploadProgress',
  'paramsSerializer',
  'signal',
  'transformRequest',
  'transformResponse',
  'validateStatus',
]);

export class UnsupportedGroupedRequestConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedGroupedRequestConfigError';
  }
}

export const normalizeConfigValue = (value: unknown): unknown => {
  if (value == null) return value;

  if (value instanceof AxiosHeaders) {
    return normalizeConfigValue(value.toJSON());
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeConfigValue(item));
  }

  if (typeof value === 'object') {
    return Object.entries(omitBy(value as Record<string, unknown>, (item) => item === undefined))
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, [key, item]) => {
        acc[key] = normalizeConfigValue(item);
        return acc;
      }, {});
  }

  return value;
};

export const normalizeGroupedRequestConfig = (config: unknown): unknown => {
  const seen = new WeakSet<object>();

  const normalize = (value: unknown, path: string): unknown => {
    if (value == null) return value;

    if (typeof value === 'function') {
      throw new UnsupportedGroupedRequestConfigError(
        `Grouped requests do not support function-valued axios config at ${path}`,
      );
    }

    if (typeof value === 'symbol') {
      throw new UnsupportedGroupedRequestConfigError(
        `Grouped requests do not support symbol-valued axios config at ${path}`,
      );
    }

    if (value instanceof AxiosHeaders) {
      return normalize(value.toJSON(), path);
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => normalize(item, `${path}[${index}]`));
    }

    if (typeof value === 'object') {
      if (seen.has(value)) {
        throw new UnsupportedGroupedRequestConfigError(
          `Grouped requests do not support circular axios config at ${path}`,
        );
      }

      seen.add(value);
      const normalized = Object.entries(omitBy(value as Record<string, unknown>, (item) => item === undefined))
        .sort(([left], [right]) => left.localeCompare(right))
        .reduce<Record<string, unknown>>((acc, [key, item]) => {
          const itemPath = path === 'config' ? key : `${path}.${key}`;
          if (unsupportedGroupConfigKeys.has(key)) {
            throw new UnsupportedGroupedRequestConfigError(
              `Grouped requests do not support axios config key ${itemPath}`,
            );
          }
          acc[key] = normalize(item, itemPath);
          return acc;
        }, {});
      seen.delete(value);
      return normalized;
    }

    return value;
  };

  return normalize(config, 'config');
};
