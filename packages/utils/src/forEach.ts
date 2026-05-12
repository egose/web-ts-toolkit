export default function forEach<T>(
  collection: T[] | null | undefined,
  iteratee: (value: T, key: number, collection: T[]) => unknown,
): T[] | null | undefined;
export default function forEach<T extends object>(
  collection: T | null | undefined,
  iteratee: (value: T[keyof T], key: string, collection: T) => unknown,
): T | null | undefined;
export default function forEach(collection: any, iteratee: (value: any, key: any, collection: any) => unknown) {
  if (!collection) {
    return collection;
  }

  if (Array.isArray(collection)) {
    for (let index = 0; index < collection.length; index++) {
      if (iteratee(collection[index], index, collection) === false) {
        break;
      }
    }

    return collection;
  }

  const keys = Object.keys(collection);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (iteratee(collection[key], key, collection) === false) {
      break;
    }
  }

  return collection;
}
