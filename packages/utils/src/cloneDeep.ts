import { cloneValue } from './_internal';

/**
 * Deep-clones a value within the UTILS-04 bounded domain.
 *
 * Supported: primitives, plain objects (`null`/`Object.prototype`),
 * `Object.create` graphs over plain-object ancestors (prototype preserved
 * by reference, own keys deep-cloned), arrays, `Date`, `RegExp`. Functions
 * and exotic values nested inside a supported container (class instances
 * such as BSON `ObjectId`, `Map`/`Set`) are preserved by reference as
 * opaque leaves. A top-level exotic root throws `TypeError` instead of
 * returning an alias.
 * Cycles and repeated references are preserved (shared stays shared,
 * detached from the original). Class instances, `Map`/`Set`, and other
 * non-plain objects throw `TypeError` instead of returning an alias.
 */
export default function cloneDeep<T>(value: T): T {
  return cloneValue(value);
}
