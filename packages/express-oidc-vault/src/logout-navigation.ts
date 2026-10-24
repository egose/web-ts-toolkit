import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

import type { OidcVaultResolvedConfig } from './config';
import { OIDC_VAULT_ROUTE_PATHS } from './constants';
import { computeExpiresAt, isUsableEpochMs } from './lifetime-policy';
import { OidcVaultStoreConflictError } from './types';
import type { OidcVaultLogoutNavigationOptions, OidcVaultStoreProvider } from './types';

export interface ResolvedLogoutNavigationOptions {
  readonly fallbackRedirectUri: string;
  readonly ticketTtlMs: number;
  readonly namespace: string;
  readonly navigationUrl: string;
  readonly postLogoutRedirectUri?: string;
}

// eslint-disable-next-line no-control-regex -- Reject raw URL controls before WHATWG normalization can erase them.
const UNSAFE_URL = /[\s\\\u0000-\u001f\u007f-\u009f]/u;
const TICKET = /^lnt_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const hash = (value: string): string => createHash('sha256').update(value, 'utf8').digest('base64url');
const plainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** Validate raw syntax too: URL parsing alone silently repairs unsafe input. */
const destination = (value: unknown, name: string, maxBytes: number, secure: boolean): URL => {
  const invalid = () =>
    new TypeError(`${name} must be a bounded absolute HTTP(S) URL without unsafe characters, userinfo or fragment.`);
  if (
    typeof value !== 'string' ||
    !/^https?:\/\//i.test(value) ||
    /^https?:\/\/[^/?#]*@/i.test(value) ||
    UNSAFE_URL.test(value) ||
    value.includes('#') ||
    Buffer.byteLength(value, 'utf8') > maxBytes
  )
    throw invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '[::1]' ||
    (isIP(url.hostname) === 4 && url.hostname.startsWith('127.'));
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    (secure && url.protocol === 'http:' && !loopback) ||
    url.username ||
    url.password ||
    url.hash ||
    Buffer.byteLength(url.href, 'utf8') > maxBytes
  )
    throw invalid();
  return url;
};

export const resolveLogoutNavigationOptions = (
  value: OidcVaultLogoutNavigationOptions | undefined,
  input: {
    backendOrigin: string;
    basePath: string;
    config: OidcVaultResolvedConfig;
    frontendRedirectUri?: string;
    postLogoutRedirectUri?: string;
    deviceBindingConfigured: boolean;
    store: OidcVaultStoreProvider;
    now: number;
  },
): ResolvedLogoutNavigationOptions | undefined => {
  if (value === undefined) return undefined;
  if (!plainRecord(value)) throw new TypeError('logoutNavigation must be a plain options object.');
  if (!input.deviceBindingConfigured) throw new TypeError('logoutNavigation requires deviceBinding.');
  for (const name of ['createLogoutNavigationTicket', 'consumeLogoutNavigationTicket'] as const) {
    if (typeof input.store[name] !== 'function')
      throw new TypeError(`logoutNavigation requires storeProvider.${name}.`);
  }
  const { fallbackRedirectUri, ticketTtlMs = 60_000, namespace = 'default' } = value;
  if (!Number.isInteger(ticketTtlMs) || ticketTtlMs < 1000 || ticketTtlMs > 120_000)
    throw new TypeError('logoutNavigation.ticketTtlMs must be an integer from 1000 through 120000.');
  computeExpiresAt(input.now, ticketTtlMs, 'logoutNavigation.ticketTtlMs');
  if (typeof namespace !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(namespace))
    throw new TypeError('logoutNavigation.namespace must be a static printable ASCII label of 1 through 128 bytes.');
  const path = `${input.basePath}${OIDC_VAULT_ROUTE_PATHS['logout-navigation']}`;
  const fallback = destination(fallbackRedirectUri, 'logoutNavigation.fallbackRedirectUri', 2048, true);
  if (
    (fallback.origin !== input.backendOrigin &&
      (input.frontendRedirectUri === undefined || fallback.origin !== new URL(input.frontendRedirectUri).origin)) ||
    // Express's default mount/route matching is case-insensitive and accepts
    // a trailing slash. Those aliases are continuation loops as well.
    (fallback.origin === input.backendOrigin &&
      fallback.pathname.replace(/\/$/, '').toLowerCase() === path.toLowerCase())
  )
    throw new TypeError(
      'logoutNavigation.fallbackRedirectUri must stay on the backend/frontend origin and cannot loop to logout navigation.',
    );
  const postLogout =
    input.postLogoutRedirectUri === undefined
      ? undefined
      : destination(input.postLogoutRedirectUri, 'logoutNavigation.postLogoutRedirectUri', 2048, true).href;
  return Object.freeze({
    fallbackRedirectUri: fallback.href,
    ticketTtlMs,
    namespace:
      'logout-navigation:v1:' +
      hash(
        JSON.stringify([
          'oidc-vault-logout-navigation',
          1,
          input.backendOrigin,
          input.basePath,
          input.config.issuer,
          input.config.clientId,
          namespace,
          fallback.href,
          postLogout ?? null,
        ]),
      ),
    navigationUrl: `${input.backendOrigin}${path}`,
    ...(postLogout === undefined ? {} : { postLogoutRedirectUri: postLogout }),
  });
};

export const validateUpstreamLogoutUrl = (value: unknown): string =>
  destination(value, 'Logout navigation upstream destination', 16_384, false).href;

/** Discovery has finished; all definite collision attempts share this deadline. */
export const persistLogoutNavigation = async (
  policy: ResolvedLogoutNavigationOptions,
  store: OidcVaultStoreProvider,
  upstreamLogoutUrl: string,
  now: number,
): Promise<string> => {
  const expiresAt = computeExpiresAt(now, policy.ticketTtlMs, 'logoutNavigation.ticketTtlMs');
  for (let attempt = 0; attempt < 3; attempt++) {
    const ticket = `lnt_${randomBytes(32).toString('base64url')}`;
    try {
      await store.createLogoutNavigationTicket!({
        namespace: policy.namespace,
        ticketHash: hash(ticket),
        upstreamLogoutUrl,
        createdAt: now,
        expiresAt,
      });
      return `${policy.navigationUrl}?ticket=${ticket}`;
    } catch (error) {
      const conflict =
        error instanceof OidcVaultStoreConflictError ||
        (typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          error.name === 'OidcVaultStoreConflictError');
      if (!conflict || attempt === 2) throw error;
    }
  }
  throw new Error('Logout navigation ticket attempts exhausted.');
};

/** Exact raw query, with no decoding/normalization aliases or extra authority. */
export const navigationTicketHash = (originalUrl: string): string | undefined => {
  const index = originalUrl.indexOf('?');
  if (index < 0) return undefined;
  const query = originalUrl.slice(index + 1);
  if (!query.startsWith('ticket=')) return undefined;
  const ticket = query.slice('ticket='.length);
  return TICKET.test(ticket) ? hash(ticket) : undefined;
};

/** Custom adapters are a trust boundary; consume acknowledgement alone is not a grant. */
export const consumedLogoutDestination = (
  value: unknown,
  namespace: string,
  ticketHash: string,
  now: number,
): string => {
  if (!plainRecord(value) || Object.keys(value).length !== 5)
    throw new TypeError('Logout navigation consume returned an invalid record.');
  const { namespace: returnedNamespace, ticketHash: returnedHash, upstreamLogoutUrl, createdAt, expiresAt } = value;
  if (
    returnedNamespace !== namespace ||
    returnedHash !== ticketHash ||
    !isUsableEpochMs(now) ||
    !isUsableEpochMs(createdAt) ||
    !isUsableEpochMs(expiresAt) ||
    expiresAt - createdAt < 1000 ||
    expiresAt - createdAt > 120_000 ||
    expiresAt <= now ||
    expiresAt - now > 120_000
  )
    throw new TypeError('Logout navigation consume returned invalid identity or lifetime.');
  return validateUpstreamLogoutUrl(upstreamLogoutUrl);
};
