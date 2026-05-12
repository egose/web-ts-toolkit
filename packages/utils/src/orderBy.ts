import { compareAscending, getIteratee } from './_internal';

export default function orderBy<T>(
  collection: T[] | null | undefined,
  iteratees: Array<string | number | ((value: T) => unknown)> = [],
  orders: string[] = [],
): T[] {
  if (!Array.isArray(collection)) {
    return [];
  }

  const callbacks = (iteratees.length > 0 ? iteratees : [undefined]).map((iteratee) => getIteratee(iteratee));

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
