/**
 * Netlify REST API client — pure functions for site lookup, creation, and
 * deploy-result parsing. Extracted from deploy-netlify.ts so it can be tested
 * in isolation without a running CLI or network.
 *
 * Every function takes an authToken explicitly rather than reaching for
 * process.env, which keeps them pure and testable.
 */
import { bail } from './deploy-shared';

export const NETLIFY_API = 'https://api.netlify.com/api/v1';
export const SITE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const defaultApiBaseUrl = (functionsName: string) => `/.netlify/functions/${functionsName}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetlifySite {
  id?: string;
  site_id?: string;
  name?: string;
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

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function bailOnAuth(status: number, body: string, action: string): never {
  const msg =
    status === 401
      ? 'Netlify auth token is invalid or expired. The API responded with 401 Access Denied.'
      : `Netlify API error (${status}) during ${action}: ${body}`;
  bail(msg);
}

// ---------------------------------------------------------------------------
// Site lookup
// ---------------------------------------------------------------------------

export async function fetchSiteById(authToken: string, id: string): Promise<NetlifySite | null> {
  const res = await fetch(`${NETLIFY_API}/sites/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (res.ok) return (await res.json()) as NetlifySite;
  if (res.status === 404) return null;
  const body = await res.text();
  if (res.status === 401) bailOnAuth(res.status, body, `looking up site "${id}"`);
  return null;
}

// ---------------------------------------------------------------------------
// Site listing by name (with pagination via Link header)
// ---------------------------------------------------------------------------

/**
 * Parse the RFC 5988 `Link` header and return the URL tagged with the
 * given `rel`, if present.
 */
export function parseLinkHeader(linkHeader: string | null, rel: string): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(/,\s*</);
  for (const part of parts) {
    const match = part.match(/^<?([^>]+)>;\s*rel="([^"]+)"/);
    if (match && match[2] === rel) return match[1];
  }
  return null;
}

/**
 * Find a site by exact name. Paginates through the `?filter=` results
 * (following the `Link: rel="next"` header) instead of assuming the match
 * is in the first 100 results.
 */
export async function fetchSiteByName(authToken: string, name: string): Promise<NetlifySite | null> {
  let url: string | null = `${NETLIFY_API}/sites?filter=${encodeURIComponent(name)}&per_page=100`;

  do {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
    if (!res.ok) {
      const body = await res.text();
      bailOnAuth(res.status, body, 'listing sites');
    }
    const arr = (await res.json()) as NetlifySite[];
    const found = arr.find((s) => s.name === name);
    if (found) return found;
    url = parseLinkHeader(res.headers.get('link'), 'next');
  } while (url);

  return null;
}

export async function resolveSiteId(authToken: string, siteRef: string): Promise<string | null> {
  const byId = await fetchSiteById(authToken, siteRef);
  if (byId?.id) return byId.id;

  const byName = await fetchSiteByName(authToken, siteRef);
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
export async function createSite(authToken: string, name: string, teamSlug?: string): Promise<NetlifySite | null> {
  const url = teamSlug ? `${NETLIFY_API}/sites?account_slug=${encodeURIComponent(teamSlug)}` : `${NETLIFY_API}/sites`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (res.ok) return (await res.json()) as NetlifySite;
  if (res.status === 422) return null; // name globally taken
  const body = await res.text();
  if (res.status === 401) bailOnAuth(res.status, body, `creating site "${name}"`);
  bail(`Netlify API error (${res.status}) creating site "${name}": ${body}`);
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
): Promise<{ siteId: string; created: boolean } | null> {
  const created = await createSite(authToken, name, teamSlug);
  if (created) {
    if (!created.id) bail(`Unexpected: site created with no id for "${name}".`);
    return { siteId: created.id, created: true };
  }

  // 422 — name is globally taken. Check if it's in the caller's account.
  const existing = await fetchSiteByName(authToken, name);
  if (existing?.id) return { siteId: existing.id, created: false };

  // Taken by another user.
  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateSiteName(name: string | undefined): string | undefined {
  if (!name || !name.trim()) return 'Required';
  if (!SITE_NAME_RE.test(name.trim())) return 'Lowercase letters, digits, and hyphens only';
  return undefined;
}
