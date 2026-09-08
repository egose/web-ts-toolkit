import { PropertyPath, setPath } from './_internal';

/**
 * Sets `value` at `path` of `object` and returns `object`.
 *
 * UTILS-02 contract: forbidden segments (`__proto__`, `constructor`,
 * `prototype`) are rejected before any mutation. Intermediate segments reuse
 * only own object containers; inherited containers are shadowed with a new
 * own container (array when the next segment is numeric, plain object
 * otherwise) so ancestors are never mutated. The final write creates an own
 * data property, bypassing inherited setters when shadowing.
 *
 * UTILS-03 key identity: string segments keep their literal identity (`'01'`
 * stays `'01'`, never index 1; digit keys beyond `MAX_SAFE_INTEGER` never
 * round). Arrays are created only for canonical indices (see `toPath`).
 */
export default function set<T>(object: T, path: PropertyPath, value: unknown): T {
  return setPath(object, path, value);
}
