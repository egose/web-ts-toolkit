/**
 * Whether a value is a primitive string.
 *
 * UTILS-09 contract change: boxed `String` objects are no longer accepted.
 * A boxed instance (e.g. `new String('')`) is an object, not the primitive
 * `''`, so narrowing it to `string` was unsound. Use
 * `value instanceof String` explicitly when boxed instances are intended.
 */
export default function isString(value: unknown): value is string {
  return typeof value === 'string';
}
