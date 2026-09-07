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

const isPlainObjectRecord = (value: object): value is Record<string, unknown> => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

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

/**
 * Supported grouped-request config value grammar (lossless, bounded).
 *
 * Supported: `null`, finite `number`, `string`, `boolean`, plain objects
 * (prototype `Object.prototype` or `null`), arrays thereof, and `undefined`
 * (omitted for object properties via the existing `omitBy` rule).
 *
 * Meaningful serialization (never silently collapsed):
 * - `Date` (valid only) → `{ __type: 'Date', iso }` with `iso` from
 *   `toISOString()`, so distinct instants compare distinct and equal
 *   instants compare equal without colliding with plain strings.
 * - `URLSearchParams` → `{ __type: 'URLSearchParams', entries }` with
 *   entries sorted by key then value, so equal entry sets compare equal
 *   regardless of insertion order and distinct sets compare distinct.
 * - `AxiosHeaders` → normalized via `toJSON()` as before.
 *
 * Explicitly rejected with `UnsupportedGroupedRequestConfigError`:
 * functions, symbols, bigints, non-finite numbers, invalid Dates, and any
 * other non-plain object instance (`Map`, `Set`, `ArrayBuffer`, `Blob`,
 * `AbortSignal`, custom classes, …). Circular array/object references are
 * rejected before recursion.
 *
 * The axios-option denylist (`adapter`, `signal`, …) applies only to direct
 * properties of the top-level request config (`path === 'config'`), so
 * ordinary nested query data such as `params.adapter = 'mobile'` is
 * accepted.
 */
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

    if (typeof value === 'bigint') {
      throw new UnsupportedGroupedRequestConfigError(
        `Grouped requests do not support bigint-valued axios config at ${path}`,
      );
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new UnsupportedGroupedRequestConfigError(
          `Grouped requests do not support non-finite numeric axios config at ${path}`,
        );
      }
      return value;
    }

    if (typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }

    if (value instanceof AxiosHeaders) {
      return normalize(value.toJSON(), path);
    }

    if (value instanceof Date) {
      const time = value.getTime();
      if (Number.isNaN(time)) {
        throw new UnsupportedGroupedRequestConfigError(
          `Grouped requests do not support invalid Date axios config at ${path}`,
        );
      }
      return { __type: 'Date', iso: value.toISOString() };
    }

    if (value instanceof URLSearchParams) {
      const entries = Array.from(value.entries()).sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey === rightKey
          ? leftValue < rightValue
            ? -1
            : leftValue > rightValue
              ? 1
              : 0
          : leftKey < rightKey
            ? -1
            : 1,
      );
      return { __type: 'URLSearchParams', entries };
    }

    if (Array.isArray(value)) {
      if (seen.has(value)) {
        throw new UnsupportedGroupedRequestConfigError(
          `Grouped requests do not support circular axios config at ${path}`,
        );
      }
      seen.add(value);
      try {
        return value.map((item, index) => normalize(item, `${path}[${index}]`));
      } finally {
        seen.delete(value);
      }
    }

    if (typeof value === 'object') {
      if (seen.has(value)) {
        throw new UnsupportedGroupedRequestConfigError(
          `Grouped requests do not support circular axios config at ${path}`,
        );
      }
      if (!isPlainObjectRecord(value)) {
        throw new UnsupportedGroupedRequestConfigError(
          `Grouped requests do not support non-plain object axios config at ${path}`,
        );
      }

      seen.add(value);
      try {
        const normalized = Object.entries(omitBy(value as Record<string, unknown>, (item) => item === undefined))
          .sort(([left], [right]) => left.localeCompare(right))
          .reduce<Record<string, unknown>>((acc, [key, item]) => {
            const itemPath = path === 'config' ? key : `${path}.${key}`;
            if (path === 'config' && unsupportedGroupConfigKeys.has(key)) {
              throw new UnsupportedGroupedRequestConfigError(
                `Grouped requests do not support axios config key ${itemPath}`,
              );
            }
            acc[key] = normalize(item, itemPath);
            return acc;
          }, {});
        return normalized;
      } finally {
        seen.delete(value);
      }
    }

    return value;
  };

  return normalize(config, 'config');
};
