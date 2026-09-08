import { compareAscending, getIteratee } from './_internal';

/**
 * Sort a collection copy by iteratees with a stable tie-break.
 *
 * Ties keep their original relative order, and the input is never mutated
 * (a copy is sorted). An unrecognized `orders` entry sorts ascending; a
 * non-array collection yields `[]`.
 */
export default function orderBy<T>(
  collection: T[] | null | undefined,
  iteratees: Array<string | number | ((value: T) => unknown)> = [],
  orders: string[] = [],
): T[] {
  if (!Array.isArray(collection)) {
    return [];
  }

  // UTILS-09 strict gate: `(value: T) => unknown` is not assignable to
  // `(...args: unknown[]) => unknown` under strict function-type variance,
  // although the call below only ever passes `T` values. Widen the parameter
  // to `unknown` at the boundary, mirroring the `map`/`sumBy` precedent.
  // Behavior unchanged.
  const callbacks = (iteratees.length > 0 ? iteratees : [undefined]).map((iteratee) =>
    getIteratee(iteratee as string | number | ((value: unknown) => unknown) | undefined),
  );

  return [...collection]
    .map((value, index) => ({ value, index }))
    .sort((left, right) => {
      for (let index = 0; index < callbacks.length; index++) {
        const callback = callbacks[index];
        const comparison = compareAscending(callback(left.value), callback(right.value));
        if (comparison !== 0) {
          return orders[index] === 'desc' ? comparison * -1 : comparison;
        }
      }

      return left.index - right.index;
    })
    .map((entry) => entry.value);
}
