import type { Request, Response } from 'express';

import { DEFAULT_SESSION_COOKIE_NAME } from './constants';
import { OidcVaultHttpError } from './errors';
import type { OidcVaultOptions } from './types';

export type ResolvedCookieOptions = {
  name: string;
  sameSite: 'lax' | 'strict' | 'none';
  secure: boolean;
  domain?: string;
  path: string;
  httpOnly: boolean;
};

export const getSessionTransport = (options: OidcVaultOptions): 'body' | 'cookie' => options.sessionTransport ?? 'body';

export const usesCookieTransport = (options: OidcVaultOptions): boolean => getSessionTransport(options) === 'cookie';

/**
 * Generic `Cookie` header parser. Decodes every value with
 * `decodeURIComponent` and throws a sanitized `400
 * OIDC_VAULT_MALFORMED_SESSION_COOKIE` when any value is malformed.
 *
 * Session routes do NOT use this generic path; they use
 * {@link parseSelectedCookieValue} via {@link getSessionIdFromCookie} so a
 * malformed unrelated application cookie cannot block refresh/logout of a
 * valid vault session (BOV-09).
 */
export const parseCookieHeader = (headerValue: string | undefined): Record<string, string> => {
  if (!headerValue) {
    return {};
  }

  return headerValue.split(';').reduce<Record<string, string>>((cookies, part) => {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex === -1) {
      return cookies;
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (!name) {
      return cookies;
    }

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      throw new OidcVaultHttpError(
        400,
        'OIDC_VAULT_MALFORMED_SESSION_COOKIE',
        'OIDC vault session cookie is malformed.',
      );
    }

    return cookies;
  }, {});
};

export const resolveCookieOptions = (options: OidcVaultOptions): ResolvedCookieOptions => {
  const cookieOptions = options.cookie ?? {};
  const deploymentMode = cookieOptions.deploymentMode ?? 'same-origin';
  const sameSite = cookieOptions.sameSite ?? (deploymentMode === 'cross-site' ? 'none' : 'lax');
  const secure =
    cookieOptions.secure ?? (sameSite === 'none' || deploymentMode === 'cross-site' || isHttpsBackendOrigin(options));

  return {
    name: cookieOptions.name ?? DEFAULT_SESSION_COOKIE_NAME,
    sameSite,
    secure,
    domain: cookieOptions.domain,
    path: cookieOptions.path ?? '/',
    httpOnly: cookieOptions.httpOnly ?? true,
  };
};

/**
 * Effective `Secure` as serialized on the wire. `SameSite=None` is always
 * serialized with `Secure` because browsers reject `SameSite=None` without
 * it, even when `secure` resolves to `false` (intentional HTTP dev policy).
 */
export const isEffectivelySecureCookie = (cookieOptions: ResolvedCookieOptions): boolean =>
  cookieOptions.secure || cookieOptions.sameSite === 'none';

const isHttpsBackendOrigin = (options: OidcVaultOptions): boolean => {
  try {
    const raw = options.backendOrigin;

    if (typeof raw !== 'string') {
      return false;
    }

    return new URL(raw.trim()).protocol === 'https:';
  } catch {
    return false;
  }
};

const COOKIE_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const COOKIE_DOMAIN_PATTERN =
  /^\.?[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

const hasUnsafeCookieValueCharacters = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    // Header-safe printable ASCII only (0x20-0x7E), excluding `;` which
    // delimits Set-Cookie attributes. This rejects CTLs, DEL, non-ASCII
    // (including Unicode paths), and semicolons.
    if (code < 0x20 || code > 0x7e || value[index] === ';') {
      return true;
    }
  }

  return false;
};

export const validateCookieOptions = (options: OidcVaultOptions): void => {
  if (!usesCookieTransport(options)) {
    return;
  }

  const cookieOptions = resolveCookieOptions(options);

  if (!COOKIE_NAME_PATTERN.test(cookieOptions.name)) {
    throw new Error('cookie.name must be a valid HTTP cookie name.');
  }

  if (hasUnsafeCookieValueCharacters(cookieOptions.path) || !cookieOptions.path.startsWith('/')) {
    throw new Error('cookie.path must start with / and cannot contain control characters or semicolons.');
  }

  if (cookieOptions.domain !== undefined && !COOKIE_DOMAIN_PATTERN.test(cookieOptions.domain)) {
    throw new Error('cookie.domain must be a valid cookie domain.');
  }

  if (!cookieOptions.httpOnly) {
    throw new Error('cookie.httpOnly must be true for cookie session transport.');
  }

  const effectiveSecure = isEffectivelySecureCookie(cookieOptions);

  if (cookieOptions.name.startsWith('__Host-')) {
    if (!effectiveSecure) {
      throw new Error('cookie.name with the __Host- prefix must be Secure.');
    }

    if (cookieOptions.domain !== undefined) {
      throw new Error('cookie.name with the __Host- prefix must not set cookie.domain.');
    }

    if (cookieOptions.path !== '/') {
      throw new Error('cookie.name with the __Host- prefix must use cookie.path "/".');
    }
  } else if (cookieOptions.name.startsWith('__Secure-')) {
    if (!effectiveSecure) {
      throw new Error('cookie.name with the __Secure- prefix must be Secure.');
    }
  }
};

export const usesCrossSiteCookieTransport = (options: OidcVaultOptions): boolean =>
  usesCookieTransport(options) && resolveCookieOptions(options).sameSite === 'none';

export const serializeCookie = (
  name: string,
  value: string,
  options: ResolvedCookieOptions,
  overrides?: { expires?: Date; maxAge?: number },
): string => {
  const sameSite = options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1);
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path}`, `SameSite=${sameSite}`];

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure || options.sameSite === 'none') {
    parts.push('Secure');
  }

  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  if (typeof overrides?.maxAge === 'number') {
    parts.push(`Max-Age=${overrides.maxAge}`);
  }

  if (overrides?.expires) {
    parts.push(`Expires=${overrides.expires.toUTCString()}`);
  }

  return parts.join('; ');
};

export const setSessionCookie = (res: Response, options: OidcVaultOptions, sessionId: string): void => {
  const cookieOptions = resolveCookieOptions(options);
  res.append('Set-Cookie', serializeCookie(cookieOptions.name, sessionId, cookieOptions));
};

export const clearSessionCookie = (res: Response, options: OidcVaultOptions): void => {
  const cookieOptions = resolveCookieOptions(options);
  res.append(
    'Set-Cookie',
    serializeCookie(cookieOptions.name, '', cookieOptions, {
      maxAge: 0,
      expires: new Date(0),
    }),
  );
};

export const getSessionIdFromCookie = (req: Request, options: OidcVaultOptions): string | undefined => {
  const raw = parseSelectedCookieValue(req.headers.cookie, resolveCookieOptions(options).name);

  if (raw === undefined) {
    return undefined;
  }

  try {
    return decodeURIComponent(raw);
  } catch {
    throw new OidcVaultHttpError(400, 'OIDC_VAULT_MALFORMED_SESSION_COOKIE', 'OIDC vault session cookie is malformed.');
  }
};

/**
 * Extract the raw (still percent-encoded) value of the selected cookie
 * without decoding any other cookie in the header.
 *
 * Duplicate-name policy (BOV-09): the first exact-name occurrence wins;
 * later duplicates are ignored, even when malformed. First-wins prevents a
 * trailing injected duplicate from overriding the browser's primary value.
 * Name matching is exact and case-sensitive; segments without `=` and empty
 * names are skipped, and surrounding whitespace around names/values is
 * trimmed. No percent-decoding happens here, so malformed unrelated values
 * can never throw; decoding (and its controlled failure) applies only to
 * the selected value in {@link getSessionIdFromCookie}.
 */
export const parseSelectedCookieValue = (headerValue: string | undefined, selectedName: string): string | undefined => {
  if (!headerValue) {
    return undefined;
  }

  const segments = headerValue.split(';');

  for (const segment of segments) {
    const separatorIndex = segment.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const name = segment.slice(0, separatorIndex).trim();

    if (!name || name !== selectedName) {
      continue;
    }

    return segment.slice(separatorIndex + 1).trim();
  }

  return undefined;
};
