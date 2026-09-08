import { partialMatch } from './_internal';

/**
 * Partial matching within the UTILS-05 bounded domain.
 *
 * Every own enumerable string/symbol key of a plain `source` must exist
 * as an own key on `object` and match recursively; extra keys on
 * `object` are ignored. Absence is distinguished from `undefined`
 * (`isMatch({}, { a: undefined })` is false). Arrays use prefix
 * semantics. `Date`/`RegExp`/primitive/function/exotic sources fall back
 * to `deepEqual` (identity for opaque types). See `partialMatch` in
 * `_internal.ts` for the full contract.
 */
export default function isMatch(object: unknown, source: unknown) {
  return partialMatch(object, source);
}
