export default function filter<T>(
  collection: T[] | Record<string, T> | null | undefined,
  predicate: (value: T, key: number | string) => boolean,
): T[] {
  if (!collection) {
    return [];
  }

  const result: T[] = [];
  if (Array.isArray(collection)) {
    for (let index = 0; index < collection.length; index++) {
      const value = collection[index];
      if (predicate(value, index)) {
        result.push(value);
      }
    }

    return result;
  }

  const keys = Object.keys(collection);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const value = collection[key];
    if (predicate(value, key)) {
      result.push(value);
    }
  }

  return result;
}
