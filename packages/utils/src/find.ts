export default function find<T>(
  collection: T[] | Record<string, T> | null | undefined,
  predicate: (value: T, key: number | string) => boolean,
): T | undefined {
  if (!collection) {
    return undefined;
  }

  if (Array.isArray(collection)) {
    for (let index = 0; index < collection.length; index++) {
      const value = collection[index];
      if (predicate(value, index)) {
        return value;
      }
    }

    return undefined;
  }

  const keys = Object.keys(collection);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const value = collection[key];
    if (predicate(value, key)) {
      return value;
    }
  }

  return undefined;
}
