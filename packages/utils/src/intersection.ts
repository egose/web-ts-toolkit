import { baseUniq } from './_internal';

/**
 * Set intersection.
 *
 * UTILS-08: each secondary array's membership is precomputed once into a
 * `Set` (SameValueZero: NaN equals NaN, +0/-0 equal; objects by reference),
 * matching the previous linear `arrayIncludes` scans. First-occurrence
 * order (via `baseUniq`), item references, and input non-mutation are
 * preserved.
 *
 * Nullish contract (parity decision, preserved as-is): a non-array first
 * argument yields `[]`, and any non-array secondary empties the result
 * (`every` requires `Array.isArray`). This strict rule differs from
 * `intersectionBy`/`difference`, which ignore non-array values arguments.
 * The divergence is documented here rather than silently unified;
 * unification is deferred to UTILS-11.
 */
export default function intersection<T>(...arrays: Array<T[] | null | undefined>): T[] {
  const [first = [], ...rest] = arrays;
  if (!Array.isArray(first)) {
    return [];
  }

  const uniqueValues = baseUniq(first);
  const restSets = rest.map((array) => (Array.isArray(array) ? new Set<unknown>(array) : null));
  return uniqueValues.filter((value) => restSets.every((set) => set !== null && set.has(value)));
}
