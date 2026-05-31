import { AxiosHeaders } from 'axios';

export const normalizeConfigValue = (value: unknown): unknown => {
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
