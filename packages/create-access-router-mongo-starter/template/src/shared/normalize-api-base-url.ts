const DEFAULT_API_BASE_URL = '/api';

// Literal-safe route-prefix grammar: every segment may only contain
// unreserved/sub-delim characters that Express (path-to-regexp) and Netlify
// redirect parsing treat literally. In particular `: * ? + ( ) [ ] { } ^ $ |`
// and `%` (percent-encoded variants such as `%3A` or `%2F`) are rejected, so a
// configured prefix can never register as a parameterized/wildcard route while
// `enforceBasicRouteContract` compares it literally.
const LITERAL_SEGMENT_PATTERN = /^[A-Za-z0-9._~-]+$/u;

export function normalizeApiBaseURL(value: string | undefined, label = 'API_BASE_URL'): string {
  const normalized = value?.trim();
  if (!normalized) return DEFAULT_API_BASE_URL;

  if (
    !normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    normalized.includes('\\') ||
    /[\s?#]/u.test(normalized)
  ) {
    throw new Error(
      `${label} must be a path-only prefix beginning with "/" and must not contain a scheme, authority, whitespace, backslash, query, or fragment.`,
    );
  }

  const withoutTrailingSlashes = normalized.replace(/\/+$/u, '');
  if (!withoutTrailingSlashes) throw new Error(`${label} must not be the root path.`);

  for (const segment of withoutTrailingSlashes.slice(1).split('/')) {
    if (!LITERAL_SEGMENT_PATTERN.test(segment)) {
      throw new Error(
        `${label} must use literal path segments of letters, digits, ".", "_", "~", or "-"; route parameters, wildcards, and percent-encoded characters are not allowed.`,
      );
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error(`${label} contains invalid percent encoding.`);
    }
    if (!segment || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
      throw new Error(`${label} must not contain empty, dot, or encoded path-separator segments.`);
    }
  }

  return withoutTrailingSlashes;
}
