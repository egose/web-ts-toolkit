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
  const secure = cookieOptions.secure ?? (sameSite === 'none' || deploymentMode === 'cross-site');

  return {
    name: cookieOptions.name ?? DEFAULT_SESSION_COOKIE_NAME,
    sameSite,
    secure,
    domain: cookieOptions.domain,
    path: cookieOptions.path ?? '/',
    httpOnly: cookieOptions.httpOnly ?? true,
  };
};

const COOKIE_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const COOKIE_DOMAIN_PATTERN =
  /^\.?[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

const hasUnsafeCookieValueCharacters = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 31 || code === 127 || value[index] === ';') {
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
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[resolveCookieOptions(options).name];
};
