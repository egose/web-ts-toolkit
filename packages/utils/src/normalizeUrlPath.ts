import addLeadingSlash from './addLeadingSlash';
import removeConsecutiveSlashesFromUrl from './removeConsecutiveSlashesFromUrl';

/**
 * Normalize a route-path fragment: collapse consecutive slashes and ensure
 * a leading slash (`'api//users'` → `'/api/users'`).
 *
 * Pathname-only contract: the input must be a path fragment without a
 * scheme/host, query string, or fragment. Full URLs are out of domain —
 * slash runs are collapsed everywhere, including `https://` (which becomes
 * `https:/`) and inside query/fragment values, and a leading slash is
 * always prepended. This composes workspace router paths; it is not WHATWG
 * URL normalization and not a security sanitizer.
 */
export default function normalizeUrlPath(url: string): string {
  return addLeadingSlash(removeConsecutiveSlashesFromUrl(url));
}
