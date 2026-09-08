import { getIteratee } from './_internal';

/**
 * Map an array by a known element key: the result element type follows the
 * property type (e.g. `map(users, 'name')` yields `string[]`).
 *
 * UTILS-09: deeper property paths (`'a.b'`) are not key types and fall
 * through to the generic overload below, yielding an honest `unknown[]`
 * instead of a fabricated inference. No speculative path-type machinery.
 */
export default function map<T, K extends keyof T>(
  collection: readonly T[] | null | undefined,
  iteratee: K,
): Array<T[K]>;
export default function map<T, TResult>(
  collection: T[] | Record<string, T> | null | undefined,
  iteratee: string | number | ((value: T, key: number | string, collection: T[] | Record<string, T>) => TResult),
): TResult[];
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
