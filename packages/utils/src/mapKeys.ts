import { defineOwnDataProperty } from './dictionary';

/**
 * Maps object keys through an iteratee.
 *
 * UTILS-01 contract: mapped keys are stored as own data properties, so a
 * mapped `__proto__` with an object value does not replace the result
 * prototype. The result keeps the default `Object.prototype` prototype.
 * Last-write-wins on duplicate mapped keys; callback order follows
 * `Object.keys` order.
 */
export default function mapKeys<TValue>(
  object: Record<string, TValue> | null | undefined,
  iteratee: (value: TValue, key: string, object: Record<string, TValue>) => string,
): Record<string, TValue> {
  if (!object) {
    return {};
  }

  const result: Record<string, TValue> = {};
  const keys = Object.keys(object);

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const mappedKey = String(iteratee(object[key], key, object));
    defineOwnDataProperty(result as Record<string, unknown>, mappedKey, object[key]);
  }

  return result;
}
