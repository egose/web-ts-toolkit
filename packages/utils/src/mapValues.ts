import { defineOwnDataProperty } from './dictionary';

/**
 * Maps object values through an iteratee.
 *
 * UTILS-01 contract: keys are preserved as own data properties (including
 * `__proto__` with object values). The result keeps the default
 * `Object.prototype` prototype; callback order follows `Object.keys` order.
 */
export default function mapValues<TValue, TResult>(
  object: Record<string, TValue> | null | undefined,
  iteratee: (value: TValue, key: string, object: Record<string, TValue>) => TResult,
): Record<string, TResult> {
  if (!object) {
    return {};
  }

  const result: Record<string, TResult> = {};
  const keys = Object.keys(object);

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    defineOwnDataProperty(result as Record<string, unknown>, key, iteratee(object[key], key, object));
  }

  return result;
}
