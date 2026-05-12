import { baseUniq, getIteratee, sameValueZero } from './_internal';

export default function intersectionBy<T>(...args: unknown[]): T[] {
  const arrays = [...args];
  const last = arrays[arrays.length - 1];
  const iteratee =
    typeof last === 'function' || typeof last === 'string' || typeof last === 'number' ? arrays.pop() : undefined;
  const callback = getIteratee(iteratee as ((value: unknown) => unknown) | string | number | undefined);
  const sources = arrays.filter(Array.isArray) as T[][];
  if (sources.length === 0) {
    return [];
  }

  const [first, ...rest] = sources;
  const result: T[] = [];
  const seen: unknown[] = [];

  for (let index = 0; index < first.length; index++) {
    const item = first[index];
    const computed = callback(item);
    if (seen.some((entry) => sameValueZero(entry, computed))) {
      continue;
    }

    if (
      rest.every((array) =>
        baseUniq(array.map((value) => callback(value))).some((entry) => sameValueZero(entry, computed)),
      )
    ) {
      seen.push(computed);
      result.push(item);
    }
  }

  return result;
}
