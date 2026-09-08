/**
 * Own-property check (`Object.hasOwn`): inherited properties do not count,
 * and `null`/`undefined` values safely return `false`.
 */
export default function hasOwn<TKey extends PropertyKey>(value: unknown, key: TKey): value is Record<TKey, unknown> {
  if (value === null || value === undefined) {
    return false;
  }

  return Object.hasOwn(Object(value), key);
}
