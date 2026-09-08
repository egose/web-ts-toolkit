/**
 * Parse a string-encoded boolean with an explicit fallback.
 *
 * Returns `true` only for the exact string `'true'`. Any other non-empty
 * string (`'false'`, `'TRUE'`, `'1'`, …) returns `false` — matching is
 * case-sensitive and no trimming is applied. The empty string `''` is
 * treated like missing input and yields `defaultValue` (which is
 * `undefined` when omitted); it does NOT return `false`.
 *
 * Query-string note: an Express-style `?flag=` parses to `''` and therefore
 * falls back to `defaultValue`, not `false`. Pass an explicit default when
 * that distinction matters.
 */
export default function parseBooleanString(str: string | undefined, defaultValue?: boolean): boolean | undefined {
  return str ? str === 'true' : defaultValue;
}
