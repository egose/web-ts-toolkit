import { getIteratee } from './_internal';

export default function sumBy<T>(
  collection: T[] | null | undefined,
  iteratee: string | number | ((value: T, key: number, collection: T[]) => number | undefined),
): number {
  if (!Array.isArray(collection)) {
    return 0;
  }

  const callback = getIteratee(iteratee as string | number | ((value: unknown) => unknown));
  let result = 0;

  for (let index = 0; index < collection.length; index++) {
    const current = callback(collection[index], index, collection);
    if (current !== undefined) {
      result += current as number;
    }
  }

  return result;
}
