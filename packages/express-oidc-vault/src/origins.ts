import type { Request } from 'express';

import { usesCookieTransport } from './cookies';
import { OidcVaultHttpError } from './errors';
import type { OidcVaultOptions } from './types';
import { isString } from './utils';

export type TrustedOrigins = ReadonlySet<string>;

const parseHttpUrl = (value: string, optionName: string, example: string): URL => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${optionName} must be an absolute HTTP(S) URL, for example ${example}.`);
  }

  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin === 'null') {
    throw new Error(`${optionName} must use http or https, for example ${example}.`);
  }

  return url;
};

export const resolveTrustedOrigins = (options: OidcVaultOptions): TrustedOrigins => {
  const origins = new Set<string>();

  for (const value of options.trustedOrigins ?? []) {
    if (!isString(value)) {
      throw new Error(
        'trustedOrigins entries must be absolute HTTP(S) URLs, for example https://frontend.example.com.',
      );
    }

    const url = parseHttpUrl(value, 'trustedOrigins entries', 'https://frontend.example.com');

    origins.add(url.origin);
  }

  return origins;
};

export const resolveBackendOrigin = (options: OidcVaultOptions): string => {
  if (!isString(options.backendOrigin)) {
    throw new Error(
      'backendOrigin is required and must be the public backend origin, for example https://api.example.com.',
    );
  }

  const url = parseHttpUrl(options.backendOrigin, 'backendOrigin', 'https://api.example.com');

  return url.origin;
};

export const resolveFrontendRedirectUri = (options: OidcVaultOptions): string | undefined => {
  if (options.frontendRedirectUri === undefined) {
    return undefined;
  }

  if (!isString(options.frontendRedirectUri)) {
    throw new Error(
      'frontendRedirectUri must be an absolute HTTP(S) URL, for example https://frontend.example.com/callback.',
    );
  }

  return parseHttpUrl(
    options.frontendRedirectUri,
    'frontendRedirectUri',
    'https://frontend.example.com/callback',
  ).toString();
};

export const validatePostLogoutRedirectUri = (options: OidcVaultOptions): void => {
  if (options.postLogoutRedirectUri === undefined) {
    return;
  }

  if (!isString(options.postLogoutRedirectUri)) {
    throw new Error(
      'postLogoutRedirectUri must be an absolute HTTP(S) URL registered with the OIDC provider, for example https://frontend.example.com/logged-out.',
    );
  }

  parseHttpUrl(options.postLogoutRedirectUri, 'postLogoutRedirectUri', 'https://frontend.example.com/logged-out');
};

export const getRequestSourceOrigin = (req: Request): string | undefined => {
  const origin = req.get('origin');

  if (isString(origin)) {
    return origin;
  }

  const referer = req.get('referer');

  if (!isString(referer)) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
};

export const assertTrustedOrigin = (
  req: Request,
  options: OidcVaultOptions,
  trustedOrigins: TrustedOrigins,
  action: 'refresh' | 'logout',
): void => {
  if (!usesCookieTransport(options)) {
    return;
  }

  const origin = getRequestSourceOrigin(req);

  if (!origin || !trustedOrigins.has(origin)) {
    throw new OidcVaultHttpError(
      403,
      'OIDC_VAULT_UNTRUSTED_ORIGIN',
      `${action === 'refresh' ? 'Refresh' : 'Logout'} request origin is not trusted.`,
    );
  }
};
