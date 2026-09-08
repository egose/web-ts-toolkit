/**
 * Ensure `value` starts with a `/`. Values that already start with `/` are
 * returned unchanged; the empty string becomes `'/'`.
 */
export default function addLeadingSlash(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}
