import { getIteratee } from './_internal';

export default function map<T, TResult>(
  collection: T[] | Record<string, T> | null | undefined,
  iteratee: string | number | ((value: T, key: number | string, collection: T[] | Record<string, T>) => TResult),
): TResult[] {
  if (!collection) {
    return [];
  }

  const callback = getIteratee(iteratee as string | number | ((value: unknown) => unknown));
  const result: TResult[] = [];

  if (Array.isArray(collection)) {
    for (let index = 0; index < collection.length; index++) {
      result.push(callback(collection[index], index, collection) as TResult);
    }

    return result;
  }

  const keys = Object.keys(collection);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    result.push(callback(collection[key], key, collection) as TResult);
  }

  return result;
}
