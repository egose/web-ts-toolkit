/**
 * Set difference.
 *
 * UTILS-08: exclusion membership is precomputed once into a `Set`
 * (SameValueZero: NaN equals NaN, +0/-0 equal; objects by reference),
 * matching the previous linear `arrayIncludes` scan. First-occurrence
 * order, item references, and input non-mutation are preserved. Non-array
 * `values` entries are ignored (preserved ignore-policy, consistent with
 * `intersectionBy`; differs from `intersection`'s empty-on-non-array rule).
 */
export default function difference<T>(array: T[] | null | undefined, ...values: Array<T[] | null | undefined>): T[] {
  if (!Array.isArray(array)) {
    return [];
  }

  const excluded = values.flatMap((value) => (Array.isArray(value) ? value : []));
  const excludedSet = new Set<unknown>(excluded);
  return array.filter((item) => !excludedSet.has(item));
}
