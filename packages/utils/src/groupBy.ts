import { getIteratee } from './_internal';

export default function groupBy<T>(
  collection: T[] | Record<string, T> | null | undefined,
  iteratee: string | number | ((value: T, key: number | string, collection: T[] | Record<string, T>) => unknown),
): Record<string, T[]> {
  if (!collection) {
    return {};
  }

  const callback = getIteratee(iteratee as string | number | ((value: unknown) => unknown));
  const result: Record<string, T[]> = {};

  if (Array.isArray(collection)) {
    for (let index = 0; index < collection.length; index++) {
      const value = collection[index];
      const key = String(callback(value, index, collection));
      (result[key] ??= []).push(value);
    }

    return result;
  }

  const keys = Object.keys(collection);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const value = collection[key];
    const group = String(callback(value, key, collection));
    (result[group] ??= []).push(value);
  }

  return result;
}
