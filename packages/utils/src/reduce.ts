/**
 * Reduce an array to a single value with an explicit initial accumulator.
 *
 * UTILS-09: the with-initial and without-initial contracts are separate
 * overloads (previously one ambiguous optional-accumulator signature). An
 * empty collection with an initial value returns that value.
 */
export default function reduce<T, TResult>(
  collection: T[] | null | undefined,
  iteratee: (accumulator: TResult, value: T, key: number, collection: T[]) => TResult,
  accumulator: TResult,
): TResult;
/**
 * Reduce a record to a single value with an explicit initial accumulator.
 */
export default function reduce<T, TResult>(
  collection: Record<string, T> | null | undefined,
  iteratee: (accumulator: TResult, value: T, key: string, collection: Record<string, T>) => TResult,
  accumulator: TResult,
): TResult;
/**
 * Reduce an array without an initial value: the first element seeds the
 * accumulator, so the accumulator and result share the element type. Throws
 * `TypeError` on an empty collection (never silently yields `undefined`).
 */
export default function reduce<T>(
  collection: T[] | null | undefined,
  iteratee: (accumulator: T, value: T, key: number, collection: T[]) => T,
): T;
/**
 * Reduce a record without an initial value: the first value seeds the
 * accumulator. Throws `TypeError` on an empty collection.
 */
export default function reduce<T>(
  collection: Record<string, T> | null | undefined,
  iteratee: (accumulator: T, value: T, key: string, collection: Record<string, T>) => T,
): T;
export default function reduce<T, TResult>(
  collection: T[] | Record<string, T> | null | undefined,
  iteratee: (...args: never[]) => TResult,
  accumulator?: TResult,
): TResult {
  const hasAccumulator = arguments.length >= 3;
  const entries: Array<[string | number, T]> = [];
  const callback = iteratee as (
    accumulator: TResult,
    value: T,
    key: number | string,
    collection: T[] | Record<string, T> | null | undefined,
  ) => TResult;

  if (Array.isArray(collection)) {
    for (let index = 0; index < collection.length; index++) {
      entries.push([index, collection[index]]);
    }
  } else if (collection) {
    const keys = Object.keys(collection);
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      entries.push([key, collection[key]]);
    }
  }

  if (!hasAccumulator) {
    if (entries.length === 0) {
      throw new TypeError('Reduce of empty collection with no initial value');
    }

    accumulator = entries[0][1] as unknown as TResult;
    entries.shift();
  }

  // UTILS-09 strict gate: past this point `accumulator` is definitely
  // assigned — either the caller supplied it (`hasAccumulator`) or the
  // non-empty-entries branch above seeded it (empty input without an initial
  // value throws instead of falling through). The local assertion records
  // that control-flow fact for the checker; behavior unchanged.
  let result = accumulator as TResult;
  for (let index = 0; index < entries.length; index++) {
    const [key, value] = entries[index];
    result = callback(result, value, key, collection);
  }

  return result;
}
