export default function reduce<T, TResult>(
  collection: T[] | null | undefined,
  iteratee: (accumulator: TResult, value: T, key: number, collection: T[]) => TResult,
  accumulator?: TResult,
): TResult;
export default function reduce<T extends object, TResult>(
  collection: T | null | undefined,
  iteratee: (accumulator: TResult, value: T[keyof T], key: string, collection: T) => TResult,
  accumulator?: TResult,
): TResult;
export default function reduce(
  collection: any,
  iteratee: (accumulator: any, value: any, key: any, collection: any) => any,
  accumulator?: any,
) {
  const hasAccumulator = arguments.length >= 3;
  const entries: Array<[string | number, any]> = [];

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

    accumulator = entries[0][1];
    entries.shift();
  }

  let result = accumulator;
  for (let index = 0; index < entries.length; index++) {
    const [key, value] = entries[index];
    result = iteratee(result, value, key, collection);
  }

  return result;
}
