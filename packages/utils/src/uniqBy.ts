import { getIteratee } from './_internal';

/**
 * Dedup by iteratee.
 *
 * UTILS-08: `seen` membership uses a `Set` (SameValueZero: NaN equals NaN,
 * +0/-0 equal; objects by reference), matching the previous linear
 * `sameValueZero` scan. First-occurrence order, item references, and input
 * non-mutation are preserved. The iteratee is still invoked exactly once
 * per element.
 */

export default function uniqBy<T>(
  array: T[] | null | undefined,
  iteratee?: string | number | ((value: T, key: number, collection: T[]) => unknown),
): T[] {
  if (!Array.isArray(array)) {
    return [];
  }

  const callback = getIteratee(iteratee as string | number | ((value: unknown) => unknown) | undefined);
  const result: T[] = [];
  const seen = new Set<unknown>();

  for (let index = 0; index < array.length; index++) {
    const value = array[index];
    const computed = callback(value, index, array);
    if (seen.has(computed)) {
      continue;
    }

    seen.add(computed);
    result.push(value);
  }

  return result;
}
