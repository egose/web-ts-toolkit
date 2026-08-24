const DEFAULT_API_BASE_URL = '/api';

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
