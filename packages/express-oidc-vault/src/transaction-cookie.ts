import { createHash, randomBytes } from 'node:crypto';

import type { Response } from 'express';

import { isValidCookieName, resolveCookieOptions, serializeCookie } from './cookies';
import { isCanonicalDpopJkt, snapshotDpopBinding } from './device-binding-policy';
import { OidcVaultHttpError } from './errors';
import { isUsableEpochMs } from './lifetime-policy';
import type { OidcVaultOptions, OidcVaultRecordBindingMatch } from './types';

export interface ResolvedOidcVaultTransactionCookieOptions {
  readonly name: string;
  readonly sameSite: 'lax' | 'none';
  readonly secure: boolean;
  readonly path: '/';
  readonly httpOnly: true;
}

const invalidBrowserBinding = (): OidcVaultHttpError =>
  new OidcVaultHttpError(400, 'OIDC_VAULT_INVALID_BROWSER_BINDING', 'Login browser binding validation failed.');

/** Resolve an allowlisted, frozen cookie configuration; never retain caller data or session-cookie overrides. */
export const resolveTransactionCookieOptions = (
  options: OidcVaultOptions,
  backendOrigin: string,
): ResolvedOidcVaultTransactionCookieOptions => {
  const value = options.transactionCookie;
  if (
    value !== undefined &&
    (typeof value !== 'object' || value === null || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
  ) {
    throw new Error('transactionCookie must be a plain options object.');
  }
  if (value !== undefined && Object.keys(value).some((key) => key !== 'name' && key !== 'sameSite')) {
    throw new Error(
      'transactionCookie supports only name and sameSite; browser-binding cookie security cannot be overridden.',
    );
  }
  const { name, sameSite } = value ?? {};
  const secure = new URL(backendOrigin).protocol === 'https:';
  const resolvedName =
    name === undefined ? (secure ? '__Host-oidc_vault_transaction' : 'oidc_vault_transaction') : name;
  if (!isValidCookieName(resolvedName)) throw new Error('transactionCookie.name must be a valid HTTP cookie name.');
  if (sameSite !== undefined && sameSite !== 'lax' && sameSite !== 'none') {
    throw new Error('transactionCookie.sameSite must be lax or none.');
  }
  if (!secure && sameSite === 'none') throw new Error('transactionCookie.sameSite none requires HTTPS.');
  if (!secure && (resolvedName.startsWith('__Host-') || resolvedName.startsWith('__Secure-'))) {
    throw new Error('transactionCookie.name with the __Host- or __Secure- prefix requires HTTPS.');
  }
  // No transaction transport is active in the legacy disabled configuration;
  // its session name remains compatible when no transaction option is supplied.
  if (
    (options.deviceBinding !== undefined || options.fingerprintRecognition !== undefined || value !== undefined) &&
    resolvedName === resolveCookieOptions(options).name
  ) {
    throw new Error('transactionCookie.name must be distinct from cookie.name.');
  }
  return Object.freeze({ name: resolvedName, sameSite: sameSite ?? 'lax', secure, path: '/', httpOnly: true });
};

const hashSecret = (secret: string): string => createHash('sha256').update(secret, 'ascii').digest('base64url');

/** One fresh 256-bit secret per initiation. Only its hash belongs in portable records. */
export const createTransactionBrowserBinding = (): Readonly<{ secret: string; browserBindingHash: string }> => {
  const secret = randomBytes(32).toString('base64url');
  return Object.freeze({ secret, browserBindingHash: hashSecret(secret) });
};

/**
 * Selected-name-only, constant-extra-space scan. Node joins multiple Cookie
 * fields with semicolons; exact selected duplicates (including valueless ones)
 * fail. Never decode other cookies or accept percent/quoted/noncanonical secret
 * encodings. Capture the joined header before asynchronous preflight work.
 */
export const parseTransactionCookie = (header: string | undefined, selectedName: string): string | undefined => {
  if (header === undefined) return undefined;
  if (typeof header !== 'string') throw invalidBrowserBinding();
  let selected: string | undefined;
  for (let start = 0; start < header.length; ) {
    const delimiter = header.indexOf(';', start);
    const end = delimiter === -1 ? header.length : delimiter;
    let separator = start;
    while (separator < end && header[separator] !== '=') separator += 1;
    const hasValue = separator < end;
    let nameStart = start;
    let nameEnd = hasValue ? separator : end;
    while (nameStart < nameEnd && (header[nameStart] === ' ' || header[nameStart] === '\t')) nameStart += 1;
    while (nameEnd > nameStart && (header[nameEnd - 1] === ' ' || header[nameEnd - 1] === '\t')) nameEnd -= 1;
    if (nameEnd - nameStart === selectedName.length && header.startsWith(selectedName, nameStart)) {
      if (selected !== undefined || !hasValue) throw invalidBrowserBinding();
      if (end - separator - 1 !== 43) throw invalidBrowserBinding();
      const value = header.slice(separator + 1, end);
      // Reuse the shared canonical SHA-256/32-byte base64url shape predicate.
      if (!isCanonicalDpopJkt(value)) throw invalidBrowserBinding();
      selected = value;
    }
    start = end + 1;
  }
  return selected;
};

/** Mandatory exact/null portable match, detached before any mutable/asynchronous work. */
export const snapshotRecordBindingMatch = (record: {
  deviceBinding?: unknown;
  browserBindingHash?: unknown;
}): Readonly<OidcVaultRecordBindingMatch> => {
  const { deviceBinding, browserBindingHash } = record;
  const binding = snapshotDpopBinding(deviceBinding);
  if (binding !== undefined && Object.keys(deviceBinding as object).length !== 2) {
    throw new OidcVaultHttpError(
      401,
      'OIDC_VAULT_INVALID_DPOP_PROOF',
      'Stored device binding contains unsupported fields.',
      'DPoP proof validation failed.',
    );
  }
  if (
    (browserBindingHash !== undefined && !isCanonicalDpopJkt(browserBindingHash)) ||
    (binding !== undefined && browserBindingHash === undefined)
  )
    throw invalidBrowserBinding();
  return Object.freeze({ deviceBinding: binding ?? null, browserBindingHash: browserBindingHash ?? null });
};

export const recordBindingMatches = (
  actual: Readonly<OidcVaultRecordBindingMatch>,
  expected: Readonly<OidcVaultRecordBindingMatch>,
): boolean =>
  actual.deviceBinding?.jkt === expected.deviceBinding?.jkt &&
  actual.browserBindingHash === expected.browserBindingHash;

/** Legacy null/null ignores this temporary cookie; guarded records require the original browser's secret. */
export const authenticateTransactionCookie = (
  header: string | undefined,
  cookie: ResolvedOidcVaultTransactionCookieOptions,
  match: Readonly<OidcVaultRecordBindingMatch>,
): string | undefined => {
  if (match.browserBindingHash === null) return undefined;
  const secret = parseTransactionCookie(header, cookie.name);
  if (secret === undefined || hashSecret(secret) !== match.browserBindingHash) throw invalidBrowserBinding();
  return secret;
};

/** Round both wire deadlines down; output never grants time beyond the associated record's deadline. */
export const setTransactionCookie = (
  res: Response,
  cookie: ResolvedOidcVaultTransactionCookieOptions,
  secret: string,
  expiresAt: number,
  now: number,
): void => {
  if (!isCanonicalDpopJkt(secret) || !isUsableEpochMs(expiresAt) || !isUsableEpochMs(now)) {
    throw new TypeError('OIDC vault transaction cookie requires a canonical secret and usable deadline/clock.');
  }
  res.append(
    'Set-Cookie',
    serializeCookie(cookie.name, secret, cookie, {
      maxAge: Math.max(0, Math.floor((expiresAt - now) / 1000)),
      expires: new Date(Math.floor(expiresAt / 1000) * 1000),
    }),
  );
};

/** Call only after authenticated terminal consumption, or DBJWT-05's successful guarded exchange. */
export const clearTransactionCookie = (res: Response, cookie: ResolvedOidcVaultTransactionCookieOptions): void => {
  res.append('Set-Cookie', serializeCookie(cookie.name, '', cookie, { maxAge: 0, expires: new Date(0) }));
};
