/**
 * Netlify API client — site lookup, creation, env management, and validation.
 *
 * Uses the official `@netlify/api` SDK (loaded via dynamic import since it is
 * ESM-only while this package builds as CJS). Extracted from deploy-netlify.ts
 * so it can be tested in isolation without a running CLI or network.
 *
 * Every public function takes an authToken explicitly rather than reaching for
 * process.env. An optional pre-built client can be injected for testing.
 */
import { bail } from './deploy-shared';

export const SITE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const defaultApiBaseUrl = (functionsName: string) => `/.netlify/functions/${functionsName}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetlifySite {
  id?: string;
  site_id?: string;
  name?: string;
  account_id?: string;
  account_slug?: string;
}

export interface NetlifyDeployResultLinks {
  deploy_url?: string;
  logs?: string;
}

export interface NetlifyDeployResult {
  deploy_url?: string;
  url?: string;
  ssl_url?: string;
  logs?: string;
  links?: NetlifyDeployResultLinks;
}

/** Minimal shape of the @netlify/api client we depend on. */
export interface NetlifyApiClient {
  getSite(params: { site_id: string }): Promise<NetlifySite>;
  listSites(params: { name?: string; filter?: string; per_page?: number; page?: number }): Promise<NetlifySite[]>;
  createSite(params: { body: { name: string } }): Promise<NetlifySite>;
  createSiteInTeam(params: { account_slug: string; body: { name: string } }): Promise<NetlifySite>;
  getEnvVars(params: {
    account_id: string;
    site_id?: string;
    context_name?: string;
    scope?: string;
  }): Promise<unknown[]>;
  getSiteEnvVars(params: { site_id: string; context_name?: string; scope?: string }): Promise<unknown[]>;
  createEnvVars(params: { account_id: string; site_id?: string; body: unknown[] }): Promise<unknown>;
  updateEnvVar(params: { account_id: string; key: string; site_id?: string; body: unknown }): Promise<unknown>;
  setEnvVarValue(params: { account_id: string; key: string; site_id?: string; body: unknown }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Client construction (dynamic import for ESM-only SDK)
// ---------------------------------------------------------------------------

let clientPromise: Promise<NetlifyApiClient> | null = null;

/**
 * Lazily import `@netlify/api` and construct a client. The SDK is ESM-only so
 * we use dynamic `import()` rather than a static `require()`.
 */
export async function getClient(authToken: string): Promise<NetlifyApiClient> {
  if (!clientPromise) {
    clientPromise = import('@netlify/api').then((mod) => {
      const Client = mod.NetlifyAPI as unknown as new (
        token: string | undefined,
        opts?: Record<string, unknown>,
      ) => NetlifyApiClient;
      return new Client(authToken);
    });
  }
  return clientPromise;
}

/** Reset the cached client (used by tests to inject a mock client). */
export function _resetClient(): void {
  clientPromise = null;
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

interface SdkHttpError {
  status?: number;
  json?: { message?: string };
  message?: string;
}

function isAuthError(err: unknown): boolean {
  return (err as SdkHttpError)?.status === 401;
}

function authErrorMessage(err: unknown): string {
  const e = err as SdkHttpError;
  const body = e?.json?.message ?? e?.message ?? '';
  return body || 'Access Denied';
}

// ---------------------------------------------------------------------------
// Site lookup
// ---------------------------------------------------------------------------

export async function fetchSiteById(
  authToken: string,
  id: string,
  client?: NetlifyApiClient,
): Promise<NetlifySite | null> {
  const cli = client ?? (await getClient(authToken));
  try {
    return (await cli.getSite({ site_id: id })) as NetlifySite;
  } catch (err) {
    if ((err as SdkHttpError)?.status === 404) return null;
    if (isAuthError(err)) bail(`Netlify auth token is invalid or expired. The API responded with 401 Access Denied.`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Site listing by name
// ---------------------------------------------------------------------------

/**
 * Find a site by exact name. Paginates through results using `per_page` /
 * `page` query params (the SDK handles these natively, no Link header
 * parsing needed).
 */
export async function fetchSiteByName(
  authToken: string,
  name: string,
  client?: NetlifyApiClient,
): Promise<NetlifySite | null> {
  const cli = client ?? (await getClient(authToken));
  let page = 1;
  const perPage = 100;
  while (true) {
    let sites: NetlifySite[];
    try {
      sites = (await cli.listSites({ name, filter: 'all', per_page: perPage, page })) as NetlifySite[];
    } catch (err) {
      if (isAuthError(err)) bail(`Netlify auth token is invalid or expired. The API responded with 401 Access Denied.`);
      throw err;
    }
    const found = sites.find((s) => s.name === name);
    if (found) return found;
    if (sites.length < perPage) return null; // no more pages
    page++;
  }
}

export async function resolveSiteId(
  authToken: string,
  siteRef: string,
  client?: NetlifyApiClient,
): Promise<string | null> {
  const byId = await fetchSiteById(authToken, siteRef, client);
  if (byId?.id) return byId.id;

  const byName = await fetchSiteByName(authToken, siteRef, client);
  if (byName?.id) return byName.id;

  return null;
}

// ---------------------------------------------------------------------------
// Site creation
// ---------------------------------------------------------------------------

/**
 * Create a new site on Netlify.
 *   - Returns the new site on success (name was available).
 *   - Returns `null` on HTTP 422 (name is globally taken — possibly by the
 *     caller's own account, possibly by another user). The caller should
 *     then check `fetchSiteByName` to distinguish the two cases.
 *   - Bails with a clear message on any other error.
 */
export async function createSite(
  authToken: string,
  name: string,
  teamSlug?: string,
  client?: NetlifyApiClient,
): Promise<NetlifySite | null> {
  const cli = client ?? (await getClient(authToken));
  try {
    if (teamSlug) {
      return (await cli.createSiteInTeam({ account_slug: teamSlug, body: { name } })) as NetlifySite;
    }
    return (await cli.createSite({ body: { name } })) as NetlifySite;
  } catch (err) {
    if ((err as SdkHttpError)?.status === 422) return null; // name globally taken
    if (isAuthError(err)) bail(`Netlify auth token is invalid or expired. The API responded with 401 Access Denied.`);
    const e = err as SdkHttpError;
    bail(`Netlify API error (${e?.status ?? 'unknown'}) creating site "${name}": ${authErrorMessage(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Site target resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a site name into a deployable target with the following rule:
 *   1. Attempt to create a new site with the name.
 *      - Success → new site, deploy to it.
 *      - 422 → name is globally taken. Fall through to step 2.
 *   2. Check if the name belongs to the caller's account.
 *      - Found → deploy to the existing site.
 *      - Not found → name is taken by another user — return null so the
 *        caller can re-prompt.
 *
 * Returns `{ siteId, created }` on success, or `null` when the name is
 * taken by another user and cannot be (re)used.
 */
export async function resolveSiteTarget(
  authToken: string,
  name: string,
  teamSlug?: string,
  client?: NetlifyApiClient,
): Promise<{ siteId: string; created: boolean } | null> {
  const cli = client ?? (await getClient(authToken));
  const created = await createSite(authToken, name, teamSlug, cli);
  if (created) {
    if (!created.id) bail(`Unexpected: site created with no id for "${name}".`);
    return { siteId: created.id, created: true };
  }

  // 422 — name is globally taken. Check if it's in the caller's account.
  const existing = await fetchSiteByName(authToken, name, cli);
  if (existing?.id) return { siteId: existing.id, created: false };

  // Taken by another user.
  return null;
}

// ---------------------------------------------------------------------------
// Environment variable management (replaces `netlify env:set` / `env:list`)
// ---------------------------------------------------------------------------

const ALL_ENVELOPE_SCOPES = ['builds', 'functions', 'runtime', 'post-processing'];

async function getAccountSiteEnvVars(
  cli: NetlifyApiClient,
  accountId: string,
  siteId: string,
  options?: { context?: string; paidTier?: boolean },
): Promise<{ key?: string }[]> {
  const params: { account_id: string; site_id: string; context_name?: string; scope?: string } = {
    account_id: accountId,
    site_id: siteId,
  };

  if (options?.context) params.context_name = options.context;
  if (options?.paidTier) params.scope = 'functions';

  return (await cli.getEnvVars(params)) as { key?: string }[];
}

/**
 * Translate a user-supplied `--context` flag into the API's env value shape.
 *
 * - Supported contexts (`all`, `production`, etc.) are passed through.
 * - `branch:staging` is split into `{ context: 'branch', context_parameter: 'staging' }`.
 * - `undefined` defaults to `all`.
 */
function contextToValue(
  context: string | undefined,
  value: string,
): { context: string; value: string; context_parameter?: string } {
  if (!context || context === 'all') {
    return { context: 'all', value };
  }
  if (context.startsWith('branch:')) {
    return { context: 'branch', context_parameter: context.slice('branch:'.length), value };
  }
  const aliases: Record<string, string> = { dp: 'deploy-preview', prod: 'production' };
  return { context: aliases[context] ?? context, value };
}

/**
 * Set (create or update) an environment variable on a Netlify site via the
 * SDK, replicating the behavior of `netlify env:set`.
 *
 * - Resolves `account_id` from the site via `getSite`.
 * - If the env var already exists: updates the value for the given context.
 * - If it doesn't exist yet: creates it with the appropriate scopes.
 * - Free tier (paidTier=false): scopes = all four scopes (no `--scope` flag).
 * - Paid tier (paidTier=true): scopes = `['functions']`.
 */
export async function setSiteEnvVar(
  authToken: string,
  siteId: string,
  key: string,
  value: string,
  options: { paidTier?: boolean; context?: string },
  client?: NetlifyApiClient,
): Promise<void> {
  const cli = client ?? (await getClient(authToken));
  const site = (await cli.getSite({ site_id: siteId })) as NetlifySite & { account_id?: string; account_slug?: string };
  const accountId = site.account_id ?? site.account_slug;
  if (!accountId) bail(`Could not determine account_id for site "${siteId}".`);

  const scopes = options.paidTier ? ['functions'] : ALL_ENVELOPE_SCOPES;
  const val = contextToValue(options.context, value);

  // Check if the env var already exists
  let existing: { key?: string } | undefined;
  try {
    const envVars = await getAccountSiteEnvVars(cli, accountId, siteId);
    existing = envVars.find((v) => v.key === key);
  } catch (err) {
    if (isAuthError(err)) bail(`Netlify auth token is invalid or expired. The API responded with 401 Access Denied.`);
    throw err;
  }

  const params = { account_id: accountId, key, site_id: siteId };

  if (existing) {
    // Update existing env var value for the given context
    await cli.setEnvVarValue({ ...params, body: val });
  } else {
    // Create new env var
    const body = [{ key, is_secret: false, scopes, values: [val] }];
    await cli.createEnvVars({ ...params, body });
  }
}

/**
 * Verify that an environment variable key is present on a site via the SDK,
 * replicating the behavior of `netlify env:list --json`.
 *
 * Returns 'present', 'missing', or 'unknown'.
 */
export async function verifySiteEnvVar(
  authToken: string,
  siteId: string,
  envKey: string,
  options: { context?: string; paidTier?: boolean },
  client?: NetlifyApiClient,
): Promise<'present' | 'missing' | 'unknown'> {
  const cli = client ?? (await getClient(authToken));
  try {
    const site = (await cli.getSite({ site_id: siteId })) as NetlifySite & {
      account_id?: string;
      account_slug?: string;
    };
    const accountId = site.account_id ?? site.account_slug;
    if (!accountId) return 'unknown';
    const envVars = await getAccountSiteEnvVars(cli, accountId, siteId, options);
    if (!Array.isArray(envVars)) return 'unknown';
    return envVars.some((v) => v.key === envKey) ? 'present' : 'missing';
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateSiteName(name: string | undefined): string | undefined {
  if (!name || !name.trim()) return 'Required';
  if (!SITE_NAME_RE.test(name.trim())) return 'Lowercase letters, digits, and hyphens only';
  return undefined;
}
