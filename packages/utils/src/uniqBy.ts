import { getIteratee, sameValueZero } from './_internal';

export default function uniqBy<T>(
  array: T[] | null | undefined,
  iteratee?: string | number | ((value: T, key: number, collection: T[]) => unknown),
): T[] {
  if (!Array.isArray(array)) {
    return [];
  }

  const callback = getIteratee(iteratee as string | number | ((value: unknown) => unknown) | undefined);
  const result: T[] = [];
  const seen: unknown[] = [];

  for (let index = 0; index < array.length; index++) {
    const value = array[index];
    const computed = callback(value, index, array);
    if (seen.some((entry) => sameValueZero(entry, computed))) {
      continue;
    }

    seen.push(computed);
    result.push(value);
  }

  return result;
}
