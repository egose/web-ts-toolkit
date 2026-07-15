// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateSiteName,
  SITE_NAME_RE,
  defaultApiBaseUrl,
  fetchSiteById,
  fetchSiteByName,
  resolveSiteId,
  createSite,
  resolveSiteTarget,
  setSiteEnvVar,
  verifySiteEnvVar,
  type NetlifyApiClient,
} from '../scripts/netlify-api';

// ---------------------------------------------------------------------------
// Mock client helper
// ---------------------------------------------------------------------------

const AUTH_TOKEN = 'test-token-abc';

function makeMockClient(overrides: Partial<NetlifyApiClient> = {}): NetlifyApiClient {
  return {
    getSite: vi.fn(overrides.getSite ?? (async () => ({ id: 'mock-site-id', name: 'mock' }))),
    listSites: vi.fn(overrides.listSites ?? (async () => [])),
    createSite: vi.fn(overrides.createSite ?? (async () => ({ id: 'new-site-id', name: 'mock' }))),
    createSiteInTeam: vi.fn(overrides.createSiteInTeam ?? (async () => ({ id: 'new-site-id', name: 'mock' }))),
    getSiteEnvVars: vi.fn(overrides.getSiteEnvVars ?? (async () => [])),
    createEnvVars: vi.fn(overrides.createEnvVars ?? (async () => ({}))),
    updateEnvVar: vi.fn(overrides.updateEnvVar ?? (async () => ({}))),
    setEnvVarValue: vi.fn(overrides.setEnvVarValue ?? (async () => ({}))),
  };
}

function httpError(status: number, message: string = ''): Error {
  const e = new Error(message) as Error & { status: number; json: { message: string } };
  e.status = status;
  e.json = { message };
  return e;
}

// ---------------------------------------------------------------------------
// Pure functions (no network)
// ---------------------------------------------------------------------------

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
// Mocked client tests
// ---------------------------------------------------------------------------

describe('fetchSiteById', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the site on success', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', name: 'my-site' }),
    });
    const result = await fetchSiteById(AUTH_TOKEN, 'site-1', client);
    expect(result).toEqual({ id: 'site-1', name: 'my-site' });
  });

  it('returns null on 404', async () => {
    const client = makeMockClient({
      getSite: async () => {
        throw httpError(404);
      },
    });
    const result = await fetchSiteById(AUTH_TOKEN, 'nonexistent', client);
    expect(result).toBeNull();
  });
});

describe('fetchSiteByName', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds the site on the first page', async () => {
    const client = makeMockClient({
      listSites: async () => [
        { id: 's1', name: 'other-site' },
        { id: 's2', name: 'my-site' },
      ],
    });
    const result = await fetchSiteByName(AUTH_TOKEN, 'my-site', client);
    expect(result?.id).toBe('s2');
  });

  it('paginates through multiple pages to find the match', async () => {
    const callCount = { value: 0 };
    const client = makeMockClient({
      listSites: async () => {
        callCount.value++;
        if (callCount.value === 1) {
          // Full page of 100 → there are more pages
          return Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, name: `other-${i}` }));
        }
        return [{ id: 's2', name: 'my-site' }];
      },
    });
    const result = await fetchSiteByName(AUTH_TOKEN, 'my-site', client);
    expect(result?.id).toBe('s2');
    expect(callCount.value).toBe(2);
  });

  it('returns null when no match across all pages', async () => {
    const client = makeMockClient({
      listSites: async () => [{ id: 's1', name: 'not-it' }],
    });
    const result = await fetchSiteByName(AUTH_TOKEN, 'my-site', client);
    expect(result).toBeNull();
  });
});

describe('resolveSiteId', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves by ID first', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-id', name: 'my-site' }),
    });
    const result = await resolveSiteId(AUTH_TOKEN, 'site-id', client);
    expect(result).toBe('site-id');
  });

  it('falls back to name lookup when getSite throws 404', async () => {
    const client = makeMockClient({
      getSite: async () => {
        throw httpError(404);
      },
      listSites: async () => [{ id: 'resolved-id', name: 'my-site' }],
    });
    const result = await resolveSiteId(AUTH_TOKEN, 'my-site', client);
    expect(result).toBe('resolved-id');
  });
});

describe('createSite', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the new site on success', async () => {
    const client = makeMockClient({
      createSite: async () => ({ id: 'new-site-id', name: 'my-new-site' }),
    });
    const result = await createSite(AUTH_TOKEN, 'my-new-site', undefined, client);
    expect(result).toEqual({ id: 'new-site-id', name: 'my-new-site' });
  });

  it('returns null on 422 (name taken)', async () => {
    const client = makeMockClient({
      createSite: async () => {
        throw httpError(422);
      },
    });
    const result = await createSite(AUTH_TOKEN, 'taken-name', undefined, client);
    expect(result).toBeNull();
  });
});

describe('resolveSiteTarget', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns created=true when the name is available', async () => {
    const client = makeMockClient({
      createSite: async () => ({ id: 'new-id', name: 'fresh-name' }),
    });
    const result = await resolveSiteTarget(AUTH_TOKEN, 'fresh-name', undefined, client);
    expect(result).toEqual({ siteId: 'new-id', created: true });
  });

  it('returns created=false when the name is owned by the caller', async () => {
    const client = makeMockClient({
      createSite: async () => {
        throw httpError(422);
      },
      listSites: async () => [{ id: 'existing-id', name: 'my-site' }],
    });
    const result = await resolveSiteTarget(AUTH_TOKEN, 'my-site', undefined, client);
    expect(result).toEqual({ siteId: 'existing-id', created: false });
  });

  it('returns null when the name is taken by another user', async () => {
    const client = makeMockClient({
      createSite: async () => {
        throw httpError(422);
      },
      listSites: async () => [{ id: 'other-user', name: 'not-yours' }],
    });
    const result = await resolveSiteTarget(AUTH_TOKEN, 'taken-by-other', undefined, client);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Env var management tests
// ---------------------------------------------------------------------------

describe('setSiteEnvVar', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new env var when it does not exist', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getSiteEnvVars: async () => [],
      createEnvVars: async () => ({}),
    });
    await setSiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', 'mongodb://localhost', {}, client);
    expect(client.createEnvVars).toHaveBeenCalledTimes(1);
    expect(client.setEnvVarValue).not.toHaveBeenCalled();
  });

  it('updates an existing env var via setEnvVarValue', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getSiteEnvVars: async () => [{ key: 'MONGODB_URI' }],
      setEnvVarValue: async () => ({}),
    });
    await setSiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', 'mongodb://localhost', {}, client);
    expect(client.setEnvVarValue).toHaveBeenCalledTimes(1);
    expect(client.createEnvVars).not.toHaveBeenCalled();
  });

  it('passes context through to the value body', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getSiteEnvVars: async () => [],
      createEnvVars: async () => ({}),
    });
    await setSiteEnvVar(
      AUTH_TOKEN,
      'site-1',
      'MONGODB_URI',
      'mongodb://localhost',
      { context: 'branch:staging' },
      client,
    );
    const call = (client.createEnvVars as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.body[0].values[0]).toEqual({
      context: 'branch',
      context_parameter: 'staging',
      value: 'mongodb://localhost',
    });
  });

  it('uses functions scope for paid tier', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getSiteEnvVars: async () => [],
      createEnvVars: async () => ({}),
    });
    await setSiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', 'mongodb://localhost', { paidTier: true }, client);
    const call = (client.createEnvVars as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.body[0].scopes).toEqual(['functions']);
  });
});

describe('verifySiteEnvVar', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns present when the key is found', async () => {
    const client = makeMockClient({
      getSiteEnvVars: async () => [{ key: 'MONGODB_URI' }, { key: 'OTHER' }],
    });
    const result = await verifySiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', {}, client);
    expect(result).toBe('present');
  });

  it('returns missing when the key is not found', async () => {
    const client = makeMockClient({
      getSiteEnvVars: async () => [{ key: 'OTHER' }],
    });
    const result = await verifySiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', {}, client);
    expect(result).toBe('missing');
  });

  it('returns unknown on error', async () => {
    const client = makeMockClient({
      getSiteEnvVars: async () => {
        throw new Error('network');
      },
    });
    const result = await verifySiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', {}, client);
    expect(result).toBe('unknown');
  });
});
