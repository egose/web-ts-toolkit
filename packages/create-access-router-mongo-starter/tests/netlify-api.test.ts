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
  getClient,
  _resetClient,
  MAX_SITE_LIST_PAGES,
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
    getEnvVars: vi.fn(overrides.getEnvVars ?? (async () => [])),
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

  it('bails with a clear message on 401', async () => {
    const client = makeMockClient({
      getSite: async () => {
        throw httpError(401, 'Access Denied');
      },
    });
    await expect(fetchSiteById(AUTH_TOKEN, 'site-1', client)).rejects.toThrow(
      'Netlify auth token is invalid or expired. The API responded with 401 Access Denied.',
    );
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

  it('stops at the bounded pagination limit', async () => {
    const listSites = vi.fn(async () =>
      Array.from({ length: 100 }, (_, index) => ({ id: `s${index}`, name: `other-${index}` })),
    );
    await expect(fetchSiteByName(AUTH_TOKEN, 'my-site', makeMockClient({ listSites }))).rejects.toThrow(
      `exceeded ${MAX_SITE_LIST_PAGES} pages`,
    );
    expect(listSites).toHaveBeenCalledTimes(MAX_SITE_LIST_PAGES);
  });
});

describe('getClient', () => {
  beforeEach(_resetClient);
  afterEach(_resetClient);

  it('reuses a client only for the same auth token', async () => {
    const factory = vi.fn(async (token: string) => makeMockClient({ getSite: async () => ({ id: token }) }));
    const first = await getClient('token-one', factory);
    expect(await getClient('token-one', factory)).toBe(first);
    const second = await getClient('token-two', factory);
    expect(second).not.toBe(first);
    expect(factory.mock.calls.map(([token]) => token)).toEqual(['token-one', 'token-two']);
  });

  it('does not retain a rejected client construction', async () => {
    const factory = vi
      .fn<(token: string) => Promise<NetlifyApiClient>>()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(makeMockClient());
    await expect(getClient('retry-token', factory)).rejects.toThrow('load failed');
    await expect(getClient('retry-token', factory)).resolves.toBeDefined();
    expect(factory).toHaveBeenCalledTimes(2);
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
      getEnvVars: async () => [],
      createEnvVars: async () => ({}),
    });
    await setSiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', 'mongodb://localhost', { sensitive: true }, client);
    expect(client.createEnvVars).toHaveBeenCalledTimes(1);
    expect(client.setEnvVarValue).not.toHaveBeenCalled();
    expect(client.createEnvVars).toHaveBeenCalledWith({
      account_id: 'acc-1',
      site_id: 'site-1',
      body: [
        {
          key: 'MONGODB_URI',
          is_secret: true,
          values: [{ context: 'all', value: 'mongodb://localhost' }],
        },
      ],
    });
  });

  it('creates public API configuration as non-secret', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [],
    });
    await setSiteEnvVar(AUTH_TOKEN, 'site-1', 'API_BASE_URL', '/.netlify/functions/main', { sensitive: false }, client);
    expect(client.createEnvVars).toHaveBeenCalledWith({
      account_id: 'acc-1',
      site_id: 'site-1',
      body: [
        {
          key: 'API_BASE_URL',
          is_secret: false,
          values: [{ context: 'all', value: '/.netlify/functions/main' }],
        },
      ],
    });
  });

  it('updates an existing env var via setEnvVarValue', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [{ key: 'MONGODB_URI', is_secret: true, scopes: ['functions'] }],
      setEnvVarValue: async () => ({}),
    });
    await setSiteEnvVar(
      AUTH_TOKEN,
      'site-1',
      'MONGODB_URI',
      'mongodb://localhost',
      { paidTier: true, sensitive: true },
      client,
    );
    expect(client.setEnvVarValue).toHaveBeenCalledTimes(1);
    expect(client.createEnvVars).not.toHaveBeenCalled();
  });

  it('passes context through to the value body', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [],
      createEnvVars: async () => ({}),
    });
    await setSiteEnvVar(
      AUTH_TOKEN,
      'site-1',
      'MONGODB_URI',
      'mongodb://localhost',
      { context: 'branch:staging', sensitive: true },
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
      getEnvVars: async () => [],
      createEnvVars: async () => ({}),
    });
    await setSiteEnvVar(
      AUTH_TOKEN,
      'site-1',
      'MONGODB_URI',
      'mongodb://localhost',
      { paidTier: true, sensitive: true },
      client,
    );
    const call = (client.createEnvVars as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.body[0].scopes).toEqual(['functions']);
    expect(call.body[0].is_secret).toBe(true);
  });

  it('omits scopes on free tier to avoid 403 from granular-scope gating', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [],
      createEnvVars: async () => ({}),
    });
    await setSiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', 'mongodb://localhost', { sensitive: true }, client);
    const call = (client.createEnvVars as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.body[0].scopes).toBeUndefined();
    expect(call.body[0].key).toBe('MONGODB_URI');
    expect(call.body[0].is_secret).toBe(true);
    expect(call.body[0].values[0]).toEqual({ context: 'all', value: 'mongodb://localhost' });
  });

  it('bails with a clear message on 403 from createEnvVars', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [],
      createEnvVars: async () => {
        throw httpError(403, 'Forbidden');
      },
    });
    await expect(
      setSiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', 'mongodb://localhost', { sensitive: true }, client),
    ).rejects.toThrow(/HTTP 403 Forbidden/);
  });

  it('bails with a clear message on 401 while listing env vars', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => {
        throw httpError(401, 'Access Denied');
      },
    });
    await expect(
      setSiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', 'mongodb://localhost', { sensitive: true }, client),
    ).rejects.toThrow('Netlify auth token is invalid or expired. The API responded with 401 Access Denied.');
  });

  it('reconciles existing paid-tier scope and sensitivity with an exact replace-all payload', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [
        {
          key: 'MONGODB_URI',
          is_secret: false,
          scopes: ['builds', 'functions'],
          values: [
            { id: 'value-1', context: 'production', value: 'old-production' },
            { id: 'value-2', context: 'deploy-preview', value: 'keep-preview' },
          ],
        },
      ],
    });

    await setSiteEnvVar(
      AUTH_TOKEN,
      'site-1',
      'MONGODB_URI',
      'new-production',
      { paidTier: true, context: 'production', sensitive: true },
      client,
    );

    expect(client.setEnvVarValue).not.toHaveBeenCalled();
    expect(client.updateEnvVar).toHaveBeenCalledWith({
      account_id: 'acc-1',
      key: 'MONGODB_URI',
      site_id: 'site-1',
      body: {
        key: 'MONGODB_URI',
        scopes: ['functions'],
        is_secret: true,
        values: [
          { context: 'deploy-preview', value: 'keep-preview' },
          { context: 'production', value: 'new-production' },
        ],
      },
    });
  });

  it('fails with precise migration guidance when hidden values prevent safe metadata reconciliation', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [
        {
          key: 'MONGODB_URI',
          is_secret: true,
          scopes: ['builds', 'functions'],
          values: [{ context: 'production' }],
        },
      ],
    });

    await expect(
      setSiteEnvVar(
        AUTH_TOKEN,
        'site-1',
        'MONGODB_URI',
        'new-production',
        { paidTier: true, context: 'production', sensitive: true },
        client,
      ),
    ).rejects.toThrow(
      'preserve every context value, set MONGODB_URI to secret with Functions scope only, then rerun this deploy',
    );
    expect(client.updateEnvVar).not.toHaveBeenCalled();
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

  it('verifies context, scope, and sensitivity from API metadata', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [
        {
          key: 'MONGODB_URI',
          is_secret: true,
          scopes: ['functions'],
          values: [{ context: 'branch', context_parameter: 'staging' }],
        },
      ],
    });
    const result = await verifySiteEnvVar(
      AUTH_TOKEN,
      'site-1',
      'MONGODB_URI',
      { context: 'branch:staging', paidTier: true, sensitive: true },
      client,
    );
    expect(result).toEqual({ status: 'verified' });
  });

  it('returns missing when the key is not found', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [{ key: 'OTHER' }],
    });
    const result = await verifySiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', { sensitive: true }, client);
    expect(result).toEqual({ status: 'missing' });
  });

  it('does not infer configuration from key presence when metadata is unavailable', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [{ key: 'MONGODB_URI' }],
    });
    const result = await verifySiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', { sensitive: true }, client);
    expect(result).toEqual({ status: 'unknown', unavailable: ['context', 'sensitivity', 'scope'] });
  });

  it('reports metadata mismatches instead of key-only success', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => [
        {
          key: 'MONGODB_URI',
          is_secret: false,
          scopes: ['builds', 'functions'],
          values: [{ context: 'deploy-preview' }],
        },
      ],
    });
    const result = await verifySiteEnvVar(
      AUTH_TOKEN,
      'site-1',
      'MONGODB_URI',
      { context: 'production', paidTier: true, sensitive: true },
      client,
    );
    expect(result).toEqual({ status: 'mismatch', mismatches: ['context', 'sensitivity', 'scope'] });
  });

  it('returns unknown on error', async () => {
    const client = makeMockClient({
      getSite: async () => ({ id: 'site-1', account_id: 'acc-1' }),
      getEnvVars: async () => {
        throw new Error('network');
      },
    });
    const result = await verifySiteEnvVar(AUTH_TOKEN, 'site-1', 'MONGODB_URI', { sensitive: true }, client);
    expect(result).toEqual({ status: 'unknown', unavailable: ['context', 'scope', 'sensitivity'] });
  });
});
