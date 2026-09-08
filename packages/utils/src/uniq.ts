import { baseUniq } from './_internal';

/**
 * Deduplicate an array keeping the first occurrence of each value.
 *
 * Membership is SameValueZero (`NaN` equals `NaN`, `+0`/`-0` equal; objects
 * by reference). Never mutates the input; a non-array input yields `[]`.
 */
export default function uniq<T>(array: T[] | null | undefined): T[] {
  if (!Array.isArray(array)) {
    return [];
  }

  return baseUniq(array);
}
