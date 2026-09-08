/**
 * Whether a value is a primitive boolean.
 *
 * UTILS-09 contract change: boxed `Boolean` objects are no longer accepted.
 * A boxed instance (e.g. `new Boolean(false)`) is a truthy object, not the
 * primitive `false`, so narrowing it to `boolean` was unsound. Use
 * `value instanceof Boolean` explicitly when boxed instances are intended.
 */
export default function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
