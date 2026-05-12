import { Collection, getIteratee } from './_internal';

export default function map<T, TResult>(
  collection: any,
  iteratee: string | number | ((value: T, key: any, collection: any) => TResult),
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
