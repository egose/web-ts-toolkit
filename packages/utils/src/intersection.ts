import { arrayIncludes, baseUniq } from './_internal';

export default function intersection<T>(...arrays: Array<T[] | null | undefined>): T[] {
  const [first = [], ...rest] = arrays;
  if (!Array.isArray(first)) {
    return [];
  }

  const uniqueValues = baseUniq(first);
  return uniqueValues.filter((value) => rest.every((array) => Array.isArray(array) && arrayIncludes(array, value)));
}
