/**
 * Whether a value is a primitive number.
 *
 * UTILS-09 contract change: boxed `Number` objects are no longer accepted.
 * A boxed instance (e.g. `new Number(0)`) is an object, not the primitive
 * `0`, so narrowing it to `number` was unsound. Use
 * `value instanceof Number` explicitly when boxed instances are intended.
 */
export default function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}
