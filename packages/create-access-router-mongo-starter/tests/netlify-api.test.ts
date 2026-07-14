// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseLinkHeader,
  validateSiteName,
  SITE_NAME_RE,
  defaultApiBaseUrl,
  fetchSiteById,
  fetchSiteByName,
  resolveSiteId,
  createSite,
  resolveSiteTarget,
} from '../scripts/netlify-api';

// ---------------------------------------------------------------------------
// Pure functions (no network)
// ---------------------------------------------------------------------------

describe('parseLinkHeader', () => {
  it('extracts the URL for a given rel', () => {
    const header =
      '<https://api.netlify.com/api/v1/sites?page=2&per_page=100>; rel="next", <https://api.netlify.com/api/v1/sites?page=5&per_page=100>; rel="last"';
    expect(parseLinkHeader(header, 'next')).toBe('https://api.netlify.com/api/v1/sites?page=2&per_page=100');
    expect(parseLinkHeader(header, 'last')).toBe('https://api.netlify.com/api/v1/sites?page=5&per_page=100');
  });

  it('returns null when rel is not found', () => {
    const header = '<https://api.netlify.com/api/v1/sites?page=2>; rel="next"';
    expect(parseLinkHeader(header, 'prev')).toBeNull();
  });

  it('returns null for missing or empty header', () => {
    expect(parseLinkHeader(null, 'next')).toBeNull();
    expect(parseLinkHeader('', 'next')).toBeNull();
  });

  it('handles single entry without comma', () => {
    const header = '<https://example.com/page2>; rel="next"';
    expect(parseLinkHeader(header, 'next')).toBe('https://example.com/page2');
  });
});

describe('validateSiteName', () => {
  it('rejects empty or whitespace', () => {
    expect(validateSiteName('')).toBe('Required');
    expect(validateSiteName('   ')).toBe('Required');
    expect(validateSiteName(undefined)).toBe('Required');
  });

  it('accepts valid site names', () => {
    expect(validateSiteName('my-site')).toBeUndefined();
    expect(validateSiteName('abc123')).toBeUndefined();
    expect(validateSiteName('a')).toBeUndefined();
  });

  it('rejects uppercase and special chars', () => {
    expect(validateSiteName('MySite')).toBe('Lowercase letters, digits, and hyphens only');
    expect(validateSiteName('my_site')).toBe('Lowercase letters, digits, and hyphens only');
    expect(validateSiteName('-leading-hyphen')).toBe('Lowercase letters, digits, and hyphens only');
  });
});

describe('SITE_NAME_RE', () => {
  it('matches valid names', () => {
    expect(SITE_NAME_RE.test('my-site')).toBe(true);
    expect(SITE_NAME_RE.test('a1b2')).toBe(true);
  });

  it('rejects names starting with a hyphen', () => {
    expect(SITE_NAME_RE.test('-bad')).toBe(false);
  });

  it('rejects names with underscores', () => {
    expect(SITE_NAME_RE.test('under_score')).toBe(false);
  });
});

describe('defaultApiBaseUrl', () => {
  it('produces the expected Netlify functions path', () => {
    expect(defaultApiBaseUrl('main')).toBe('/.netlify/functions/main');
    expect(defaultApiBaseUrl('my-fn')).toBe('/.netlify/functions/my-fn');
  });
});

// ---------------------------------------------------------------------------
// Mocked fetch tests
// ---------------------------------------------------------------------------

const AUTH_TOKEN = 'test-token-abc';

function mockResponse(body: unknown, status: number = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('fetchSiteById', () => {
  it('returns the site on 200', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ id: 'site-1', name: 'my-site' })) as unknown as typeof fetch;

    const result = await fetchSiteById(AUTH_TOKEN, 'site-1');
    expect(result).toEqual({ id: 'site-1', name: 'my-site' });
  });

  it('returns null on 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Not found', { status: 404 })) as unknown as typeof fetch;

    const result = await fetchSiteById(AUTH_TOKEN, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('fetchSiteByName with pagination', () => {
  it('finds the site on the first page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse(
        [
          { id: 's1', name: 'other-site' },
          { id: 's2', name: 'my-site' },
        ],
        200,
        {},
      ),
    ) as unknown as typeof fetch;

    const result = await fetchSiteByName(AUTH_TOKEN, 'my-site');
    expect(result?.id).toBe('s2');
  });

  it('paginates through multiple pages to find the match', async () => {
    const callCount = { value: 0 };
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount.value++;
      if (callCount.value === 1) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 's1', name: 'other' }]), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              link: '<https://api.netlify.com/api/v1/sites?page=2&per_page=100&filter=name>; rel="next"',
            },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify([{ id: 's2', name: 'my-site' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;

    const result = await fetchSiteByName(AUTH_TOKEN, 'my-site');
    expect(result?.id).toBe('s2');
    expect(callCount.value).toBe(2);
  });

  it('returns null when no match across all pages', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse([{ id: 's1', name: 'not-it' }])) as unknown as typeof fetch;

    const result = await fetchSiteByName(AUTH_TOKEN, 'my-site');
    expect(result).toBeNull();
  });
});

describe('resolveSiteId', () => {
  it('resolves by ID first', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ id: 'site-id', name: 'my-site' })) as unknown as typeof fetch;

    const result = await resolveSiteId(AUTH_TOKEN, 'site-id');
    expect(result).toBe('site-id');
  });

  it('falls back to name lookup', async () => {
    const callCount = { value: 0 };
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount.value++;
      if (callCount.value === 1) {
        return Promise.resolve(new Response('Not found', { status: 404 }));
      }
      return Promise.resolve(mockResponse([{ id: 'resolved-id', name: 'my-site' }]));
    }) as unknown as typeof fetch;

    const result = await resolveSiteId(AUTH_TOKEN, 'my-site');
    expect(result).toBe('resolved-id');
  });
});

describe('createSite', () => {
  it('returns the new site on 200', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ id: 'new-site-id', name: 'my-new-site' })) as unknown as typeof fetch;

    const result = await createSite(AUTH_TOKEN, 'my-new-site');
    expect(result).toEqual({ id: 'new-site-id', name: 'my-new-site' });
  });

  it('returns null on 422 (name taken)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('Unprocessable', { status: 422 })) as unknown as typeof fetch;

    const result = await createSite(AUTH_TOKEN, 'taken-name');
    expect(result).toBeNull();
  });
});

describe('resolveSiteTarget', () => {
  it('returns created=true when the name is available', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ id: 'new-id', name: 'fresh-name' })) as unknown as typeof fetch;

    const result = await resolveSiteTarget(AUTH_TOKEN, 'fresh-name');
    expect(result).toEqual({ siteId: 'new-id', created: true });
  });

  it('returns created=false when the name is owned by the caller', async () => {
    const callCount = { value: 0 };
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount.value++;
      if (callCount.value === 1) {
        return Promise.resolve(new Response('Taken', { status: 422 }));
      }
      return Promise.resolve(mockResponse([{ id: 'existing-id', name: 'my-site' }]));
    }) as unknown as typeof fetch;

    const result = await resolveSiteTarget(AUTH_TOKEN, 'my-site');
    expect(result).toEqual({ siteId: 'existing-id', created: false });
  });

  it('returns null when the name is taken by another user', async () => {
    const callCount = { value: 0 };
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount.value++;
      if (callCount.value === 1) {
        return Promise.resolve(new Response('Taken', { status: 422 }));
      }
      return Promise.resolve(mockResponse([{ id: 'other-user', name: 'not-yours' }]));
    }) as unknown as typeof fetch;

    const result = await resolveSiteTarget(AUTH_TOKEN, 'taken-by-other');
    expect(result).toBeNull();
  });
});
