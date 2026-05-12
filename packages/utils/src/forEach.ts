export default function forEach<T>(
  collection: T[] | null | undefined,
  iteratee: (value: T, key: number, collection: T[]) => unknown,
): T[] | null | undefined;
export default function forEach<T extends object>(
  collection: T | null | undefined,
  iteratee: (value: T[keyof T], key: string, collection: T) => unknown,
): T | null | undefined;
export default function forEach<T>(
  collection: T[] | T | null | undefined,
  iteratee: (...args: never[]) => unknown,
): T[] | T | null | undefined {
  if (!collection) {
    return collection;
  }

  const callback = iteratee as (value: unknown, key: number | string, collection: T[] | T) => unknown;

  if (Array.isArray(collection)) {
    for (let index = 0; index < collection.length; index++) {
      if (callback(collection[index], index, collection) === false) {
        break;
      }
    }

    return collection;
  }

  const keys = Object.keys(collection);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (callback(collection[key], key, collection) === false) {
      break;
    }
  }

  return collection;
}
