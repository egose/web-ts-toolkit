export default function reduce<T, TResult>(
  collection: T[] | null | undefined,
  iteratee: (accumulator: TResult, value: T, key: number, collection: T[]) => TResult,
  accumulator?: TResult,
): TResult;
export default function reduce<T, TResult>(
  collection: Record<string, T> | null | undefined,
  iteratee: (accumulator: TResult, value: T, key: string, collection: Record<string, T>) => TResult,
  accumulator?: TResult,
): TResult;
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

  let result = accumulator;
  for (let index = 0; index < entries.length; index++) {
    const [key, value] = entries[index];
    result = callback(result, value, key, collection);
  }

  return result;
}
