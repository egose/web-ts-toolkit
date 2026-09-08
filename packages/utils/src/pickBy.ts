import { defineOwnDataProperty } from './dictionary';

/**
 * Picks entries whose predicate returns true.
 *
 * UTILS-01 contract: kept keys are stored as own data properties (including
 * `__proto__`). The result keeps the default `Object.prototype` prototype;
 * the input is never mutated.
 */
export default function pickBy<TValue>(
  object: Record<string, TValue> | null | undefined,
  predicate: (value: TValue, key: string, object: Record<string, TValue>) => boolean,
): Record<string, TValue> {
  if (!object) {
    return {};
  }

  const result: Record<string, TValue> = {};
  const keys = Object.keys(object);

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const value = object[key];
    if (predicate(value, key, object)) {
      defineOwnDataProperty(result as Record<string, unknown>, key, value);
    }
  }

  return result;
}
