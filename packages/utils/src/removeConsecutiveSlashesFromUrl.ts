/**
 * Collapse every run of two or more `/` characters to a single `/`.
 *
 * Pathname-only helper (see `normalizeUrlPath`): runs are collapsed
 * everywhere in the string, including a URL scheme (`'https://…'` becomes
 * `'https:/…'`) and query/fragment values. Do not apply to full URLs.
 */
export default function removeConsecutiveSlashesFromUrl(url: string): string {
  return url.replace(/\/{2,}/g, '/');
}
