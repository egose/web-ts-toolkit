import { resolveDeviceBindingOrigin } from './device-binding-policy';
import { OidcVaultHttpError } from './errors';

const invalidTarget = (): OidcVaultHttpError =>
  new OidcVaultHttpError(
    401,
    'OIDC_VAULT_INVALID_DPOP_PROOF',
    'DPoP target must be a valid pinned HTTP(S) URL/path.',
    'DPoP proof validation failed.',
  );

const hasControl = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
};

const normalizePath = (origin: string, path: string): string => {
  if (!path.startsWith('/') || /[\s\\]/.test(path) || hasControl(path) || /%(?![0-9a-f]{2})/i.test(path))
    throw invalidTarget();
  const decoded = path.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => {
    const character = String.fromCharCode(Number.parseInt(hex, 16));
    return /^[A-Za-z0-9._~-]$/.test(character) ? character : `%${hex.toUpperCase()}`;
  });
  // Decode unreserved escapes before removing dot segments. Concatenation
  // keeps even //host on the pinned origin as a path, never an authority.
  return new URL(`${origin}${decoded}`).pathname;
};

/** Static snapshot for API prefixes; vault callers leave the prefix empty. */
export const createDpopRequestTargetResolver = (options: {
  readonly publicOrigin: string;
  readonly publicPathPrefix?: string;
}): ((originalUrl: unknown) => string) => {
  const { publicOrigin, publicPathPrefix } = options;
  const origin = resolveDeviceBindingOrigin(publicOrigin, 'publicOrigin');
  let prefix = '';
  if (publicPathPrefix !== undefined && publicPathPrefix !== '') {
    if (typeof publicPathPrefix !== 'string' || /[?#]/.test(publicPathPrefix)) {
      throw new TypeError('deviceBinding.publicPathPrefix must be an absolute path prefix without query or fragment.');
    }
    try {
      prefix = normalizePath(origin, publicPathPrefix).replace(/\/+$/g, '');
    } catch {
      throw new TypeError('deviceBinding.publicPathPrefix must be a valid absolute path prefix.');
    }
  }
  return (originalUrl: unknown): string => {
    if (typeof originalUrl !== 'string') throw invalidTarget();
    const path = originalUrl.split(/[?#]/, 1)[0];
    // Check origin-form before prefix concatenation, so a prefix cannot hide
    // an absolute URL, relative target or asterisk-form request.
    if (!path.startsWith('/')) throw invalidTarget();
    return `${origin}${normalizePath(origin, `${prefix}${path}`)}`;
  };
};

/** RFC 9449 absolute htu comparison ignores query/fragment. No Host/proxy input. */
export const normalizeDpopProofTarget = (value: unknown): string => {
  if (typeof value !== 'string' || /[\s\\]/.test(value) || hasControl(value) || !/^https?:\/\/[^/\\?#]+/i.test(value))
    throw invalidTarget();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidTarget();
  }
  const queryFree = value.split(/[?#]/, 1)[0];
  const authority = queryFree.slice(queryFree.indexOf('://') + 3).split('/', 1)[0];
  if (url.username || url.password || url.origin === 'null' || authority.includes('@')) throw invalidTarget();
  // Keep the original path until unreserved escapes have been normalized;
  // URL's parsing normalizes scheme/host/default port and dot segments.
  const authorityEnd = queryFree.indexOf('/', queryFree.indexOf('://') + 3);
  const path = authorityEnd === -1 ? '/' : queryFree.slice(authorityEnd);
  return `${url.origin}${normalizePath(url.origin, path)}`;
};
