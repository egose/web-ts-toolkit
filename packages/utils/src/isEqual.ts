import { deepEqual } from './_internal';

/**
 * Deep equality within the UTILS-05 bounded domain (aligned with UTILS-04).
 *
 * Supported: primitives (`NaN` equals itself), plain objects (own
 * enumerable string/symbol keys only; inherited state ignored, prototypes
 * not compared), arrays (length + holes + extra own keys), `Date` (by
 * time), `RegExp` (by source + flags). Functions and exotic objects
 * (`Map`/`Set`, class instances, etc.) compare by identity only, so
 * distinct instances are never equal. Cyclic graphs terminate via
 * pair-aware bookkeeping. See `deepEqual` in `_internal.ts` for the full
 * contract.
 */
export default function isEqual(left: unknown, right: unknown) {
  return deepEqual(left, right);
}
