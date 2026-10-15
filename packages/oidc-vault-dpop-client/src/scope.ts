import { OidcVaultDpopClientError } from './errors';

const invalidTarget = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError('INVALID_DPOP_TARGET', 'A pinned absolute HTTP(S) target is required.');

const hasControl = (value: string): boolean => [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

const normalizePath = (origin: string, path: string): string => {
  if (!path.startsWith('/') || /[\s\\]/.test(path) || hasControl(path) || /%(?![0-9a-f]{2})/i.test(path))
    throw invalidTarget();
  const decoded = path.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => {
    const character = String.fromCharCode(Number.parseInt(hex, 16));
    return /^[A-Za-z0-9._~-]$/.test(character) ? character : `%${hex.toUpperCase()}`;
  });
  // Concatenation keeps //host-looking paths on the pinned origin. Never use
  // relative URL resolution or decode reserved escapes into path separators.
  return new URL(`${origin}${decoded}`).pathname;
};

/** Deliberately matches the backend's D1 normalization, including reserved escapes. */
export const normalizeDpopTarget = (value: string | URL): string => {
  const input = typeof value === 'string' ? value : value.href;
  if (/[\s\\]/.test(input) || hasControl(input) || !/^https?:\/\/[^/\\?#]+/i.test(input)) throw invalidTarget();
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw invalidTarget();
  }
  const queryFree = input.split(/[?#]/, 1)[0];
  const authority = queryFree.slice(queryFree.indexOf('://') + 3).split('/', 1)[0];
  if (url.username || url.password || url.origin === 'null' || authority.includes('@')) throw invalidTarget();
  const authorityEnd = queryFree.indexOf('/', queryFree.indexOf('://') + 3);
  const path = authorityEnd === -1 ? '/' : queryFree.slice(authorityEnd);
  return `${url.origin}${normalizePath(url.origin, path)}`;
};

export const normalizeStaticOrigin = (value: string): string => {
  const target = normalizeDpopTarget(value);
  const url = new URL(value);
  // Check the supplied syntax too: parsing erases /x/.. and empty ?/# markers,
  // none of which belong in an origin-only credential configuration.
  if (
    !/^https?:\/\/[^/\\?#]+\/?$/i.test(value) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    target !== `${url.origin}/`
  ) {
    throw invalidTarget();
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new OidcVaultDpopClientError('INSECURE_DPOP_ORIGIN', 'DPoP requires HTTPS or loopback development.');
  }
  return url.origin;
};

/** API path scopes use exactly the proof path's escape/dot normalization. */
export const normalizeDpopPathPrefix = (origin: string, value?: string): string => {
  if (value === undefined) return '/';
  if (typeof value !== 'string' || value.startsWith('//') || /[?#]/.test(value)) throw invalidTarget();
  const path = normalizePath(origin, value);
  // A configured scope is an absolute path, not an authority-like reference,
  // including one exposed by removing dot segments. Encoded slashes stay data.
  if (path.startsWith('//')) throw invalidTarget();
  return path.replace(/\/+$/g, '') || '/';
};

/** Persistent key identity; use the same public origins/mount as the session and backend. */
export interface DpopKeyScope {
  /** Browser location.origin, HTTPS or loopback HTTP. */
  frontendOrigin: string;
  /** Public vault origin, HTTPS or loopback HTTP, with no path/query/fragment. */
  backendOrigin: string;
  /** Absolute public mount; unreserved escapes, dot segments and trailing slashes normalize. */
  basePath: string;
}

export const resolveDpopScope = (scope: DpopKeyScope): Readonly<DpopKeyScope & { id: string }> => {
  const frontendOrigin = normalizeStaticOrigin(scope.frontendOrigin);
  const backendOrigin = normalizeStaticOrigin(scope.backendOrigin);
  if (!scope.basePath.startsWith('/') || /[?#]/.test(scope.basePath)) throw invalidTarget();
  const basePath = normalizePath(backendOrigin, scope.basePath).replace(/\/+$/g, '') || '/';
  return Object.freeze({
    frontendOrigin,
    backendOrigin,
    basePath,
    id: JSON.stringify(['oidc-vault-dpop-v1', frontendOrigin, backendOrigin, basePath]),
  });
};

/** No capability fallback: an ephemeral/extractable key would break persistent binding. */
export const assertDpopBrowserFeatures = (cookieTransport = false): void => {
  if (
    globalThis.isSecureContext !== true ||
    !globalThis.crypto?.subtle ||
    typeof globalThis.crypto.randomUUID !== 'function' ||
    typeof globalThis.CryptoKey !== 'function' ||
    !globalThis.indexedDB
  ) {
    throw new OidcVaultDpopClientError(
      'DPOP_BROWSER_UNSUPPORTED',
      'A secure context, Web Crypto and IndexedDB are required.',
    );
  }
  if (cookieTransport && (!globalThis.navigator?.locks?.request || typeof globalThis.BroadcastChannel !== 'function')) {
    throw new OidcVaultDpopClientError(
      'DPOP_TAB_COORDINATION_UNSUPPORTED',
      'Cookie sessions require Web Locks and BroadcastChannel.',
    );
  }
};
