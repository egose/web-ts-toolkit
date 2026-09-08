import { getIteratee } from './_internal';

/**
 * Intersection by iteratee with precomputed secondary membership.
 *
 * UTILS-08 performance contract:
 * - Each element's iteratee is evaluated exactly once per input array
 *   (work proportional to total input length), not once per candidate per
 *   secondary. A 100-by-100 workload therefore invokes the callback ~200
 *   times, not 10,100 times as before. Callback invocation count is
 *   intentionally changed; side effects from redundant evaluation are not
 *   preserved.
 * - Secondary projections are stored in `Set`s, which use SameValueZero
 *   membership (NaN equals NaN, +0/-0 equal; objects by reference),
 *   matching the previous `sameValueZero` scans (UTILS-05).
 * - First-occurrence ordering and original item references are preserved;
 *   inputs are never mutated.
 *
 * Nullish contract (parity decision, preserved as-is): non-array arguments
 * are dropped via `Array.isArray` filtering (same ignore-policy as
 * `difference`), so a nullish secondary is ignored rather than emptying
 * the result. This differs from `intersection`, which treats a non-array
 * secondary as empty (result `[]`). The divergence is documented here
 * rather than silently unified; unification is deferred to UTILS-11.
 */
export type IntersectionByIteratee<T> = ((value: T) => unknown) | string | number;

/**
 * Intersection by iteratee with precomputed secondary membership.
 *
 * UTILS-09: the result element type is inferred from the first array; the
 * iteratee parameter is excluded from inference (`NoInfer`) so a callback
 * never distorts the element type. Non-array secondary arguments are ignored
 * at runtime (see below) and are accepted in the type for that reason.
 */
export default function intersectionBy<T>(
  array: readonly T[],
  ...args: Array<readonly unknown[] | IntersectionByIteratee<NoInfer<T>> | null | undefined>
): T[];
export default function intersectionBy<T = unknown>(
  ...args: Array<readonly T[] | IntersectionByIteratee<T> | null | undefined>
): T[];
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
  const seen = new Set<unknown>();
  // Precompute each secondary's projected membership once per invocation.
  const restSets = rest.map((array) => new Set(array.map((value) => callback(value))));

  for (let index = 0; index < first.length; index++) {
    const item = first[index];
    const computed = callback(item);
    if (seen.has(computed)) {
      continue;
    }

    if (restSets.every((set) => set.has(computed))) {
      seen.add(computed);
      result.push(item);
    }
  }

  return result;
}
