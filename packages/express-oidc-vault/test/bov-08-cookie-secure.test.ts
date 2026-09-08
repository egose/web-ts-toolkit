import { describe, expect, it } from 'vitest';
import type { Response } from 'express';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import {
  isEffectivelySecureCookie,
  resolveCookieOptions,
  serializeCookie,
  clearSessionCookie,
  setSessionCookie,
  validateCookieOptions,
} from '../src/cookies';
import { createOidcVaultMiddleware } from '../src/index';
import type { OidcVaultOptions } from '../src/types';

const createOptions = (overrides: Partial<OidcVaultOptions> = {}): OidcVaultOptions =>
  ({
    backendOrigin: 'https://api.example.com',
    sessionTransport: 'cookie',
    storeProvider: {} as OidcVaultOptions['storeProvider'],
    config: {
      issuer: 'https://issuer.example.com',
      clientId: 'client_1',
    },
    ...overrides,
  }) as OidcVaultOptions;

const createMiddlewareOptions = (overrides: Partial<OidcVaultOptions> = {}): OidcVaultOptions => ({
  basePath: '/auth/oidc',
  backendOrigin: 'https://api.example.com',
  sessionTransport: 'cookie' as const,
  config: {
    issuer: 'https://issuer.example.com',
    clientId: 'client_1',
  },
  frontendRedirectUri: 'https://frontend.example.com/callback',
  storeProvider: createMemoryOidcVaultStore(),
  ...overrides,
});

const parseSetCookie = (header: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  const [nameValue, ...rest] = header.split(';').map((part) => part.trim());
  const eq = nameValue.indexOf('=');
  attributes.__name = nameValue.slice(0, eq);
  attributes.__value = nameValue.slice(eq + 1);
  for (const part of rest) {
    const idx = part.indexOf('=');
    if (idx === -1) {
      attributes[part.toLowerCase()] = 'true';
    } else {
      attributes[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
    }
  }
  return attributes;
};

const captureSetCookieHeaders = (run: (res: Response) => void): string[] => {
  const headers: string[] = [];
  const res = {
    append: (_name: string, value: string | string[]) => {
      if (Array.isArray(value)) {
        headers.push(...value);
      } else {
        headers.push(value);
      }
    },
  } as unknown as Response;
  run(res);
  return headers;
};

/** Spec-based browser storage check for cookie prefixes (RFC 6265bis §4.1.3). */
const wouldBrowserStorePrefixedCookie = (header: string): boolean => {
  const attrs = parseSetCookie(header);
  const name = attrs.__name;
  if (name.startsWith('__Host-')) {
    return attrs.secure === 'true' && attrs.domain === undefined && attrs.path === '/';
  }
  if (name.startsWith('__Secure-')) {
    return attrs.secure === 'true';
  }
  return true;
};

describe('BOV-08 secure defaults', () => {
  const defaultCases: Array<{
    backendOrigin: string;
    deploymentMode?: 'same-origin' | 'same-site' | 'cross-site';
    sameSite?: 'lax' | 'strict' | 'none';
    expectedSecure: boolean;
  }> = [
    { backendOrigin: 'https://api.example.com', deploymentMode: 'same-origin', expectedSecure: true },
    { backendOrigin: 'https://api.example.com', deploymentMode: 'same-site', expectedSecure: true },
    { backendOrigin: 'https://api.example.com', deploymentMode: 'cross-site', expectedSecure: true },
    { backendOrigin: 'https://api.example.com', sameSite: 'strict', expectedSecure: true },
    { backendOrigin: 'https://api.example.com', sameSite: 'none', expectedSecure: true },
    { backendOrigin: 'http://api.example.com', deploymentMode: 'same-origin', expectedSecure: false },
    { backendOrigin: 'http://api.example.com', deploymentMode: 'same-site', expectedSecure: false },
    { backendOrigin: 'http://api.example.com', deploymentMode: 'cross-site', expectedSecure: true },
    { backendOrigin: 'http://api.example.com', sameSite: 'lax', expectedSecure: false },
    { backendOrigin: 'http://api.example.com', sameSite: 'strict', expectedSecure: false },
    { backendOrigin: 'http://api.example.com', sameSite: 'none', expectedSecure: true },
    { backendOrigin: 'http://127.0.0.1:3000', deploymentMode: 'same-origin', expectedSecure: false },
  ];

  it.each(defaultCases)(
    'defaults secure=$expectedSecure for $backendOrigin $deploymentMode $sameSite',
    ({ backendOrigin, deploymentMode, sameSite, expectedSecure }) => {
      const resolved = resolveCookieOptions(
        createOptions({
          backendOrigin,
          cookie: { ...(deploymentMode ? { deploymentMode } : {}), ...(sameSite ? { sameSite } : {}) },
        }),
      );
      expect(resolved.secure).toBe(expectedSecure);
      const header = serializeCookie(resolved.name, 'sess_1', resolved);
      expect(header.includes('Secure')).toBe(expectedSecure || resolved.sameSite === 'none');
    },
  );

  it('honors explicit secure overrides in both directions', () => {
    expect(
      resolveCookieOptions(createOptions({ backendOrigin: 'https://api.example.com', cookie: { secure: false } }))
        .secure,
    ).toBe(false);
    expect(
      resolveCookieOptions(createOptions({ backendOrigin: 'http://api.example.com', cookie: { secure: true } })).secure,
    ).toBe(true);
    expect(
      resolveCookieOptions(
        createOptions({
          backendOrigin: 'http://api.example.com',
          cookie: { deploymentMode: 'cross-site', secure: false },
        }),
      ).secure,
    ).toBe(false);
  });

  it('keeps SameSite=None effectively Secure even with explicit secure:false', () => {
    const resolved = resolveCookieOptions(
      createOptions({
        backendOrigin: 'http://api.example.com',
        cookie: { sameSite: 'none', secure: false },
      }),
    );
    expect(resolved.secure).toBe(false);
    expect(isEffectivelySecureCookie(resolved)).toBe(true);
    const header = serializeCookie(resolved.name, 'sess_1', resolved);
    expect(header).toContain('SameSite=None');
    expect(header).toContain('Secure');
  });
});

describe('BOV-08 header-safe and prefix validation', () => {
  it('rejects httpOnly:false at creation without an unsafe compat switch', () => {
    expect(() => validateCookieOptions(createOptions({ cookie: { httpOnly: false } }))).toThrow(
      'cookie.httpOnly must be true',
    );
    expect(() => createOidcVaultMiddleware(createMiddlewareOptions({ cookie: { httpOnly: false } }))).toThrow(
      'cookie.httpOnly must be true',
    );
  });

  it.each(['/; SameSite=None', '/foo\x01bar', '/foo\x7fbar', '/caf\u00e9', '/\u{1F600}', 'no-leading-slash'])(
    'rejects unsafe path %j at creation',
    (path) => {
      expect(() => validateCookieOptions(createOptions({ cookie: { path } }))).toThrow(
        'cookie.path must start with / and cannot contain control characters or semicolons',
      );
      expect(() => createOidcVaultMiddleware(createMiddlewareOptions({ cookie: { path } }))).toThrow(
        'cookie.path must start with / and cannot contain control characters or semicolons',
      );
    },
  );

  it.each([
    {
      name: '__Secure-sess',
      cookie: { name: '__Secure-sess' },
      backendOrigin: 'http://api.example.com',
      message: 'cookie.name with the __Secure- prefix must be Secure.',
    },
    {
      name: '__Host-sess',
      cookie: { name: '__Host-sess' },
      backendOrigin: 'http://api.example.com',
      message: 'cookie.name with the __Host- prefix must be Secure.',
    },
    {
      name: '__Host-sess with domain',
      cookie: { name: '__Host-sess', domain: 'api.example.com' },
      backendOrigin: 'https://api.example.com',
      message: 'cookie.name with the __Host- prefix must not set cookie.domain.',
    },
    {
      name: '__Host-sess with path',
      cookie: { name: '__Host-sess', path: '/sub' },
      backendOrigin: 'https://api.example.com',
      message: 'cookie.name with the __Host- prefix must use cookie.path "/".',
    },
  ])('rejects invalid prefixed cookie $name at creation', ({ cookie, backendOrigin, message }) => {
    expect(() => validateCookieOptions(createOptions({ backendOrigin, cookie }))).toThrow(message);
    expect(() => createOidcVaultMiddleware(createMiddlewareOptions({ backendOrigin, cookie }))).toThrow(message);
  });

  it('accepts __Secure- via effective SameSite=None Secure against serialized values', () => {
    const options = createOptions({
      backendOrigin: 'http://api.example.com',
      cookie: { name: '__Secure-sess', sameSite: 'none', secure: false },
    });
    expect(() => validateCookieOptions(options)).not.toThrow();
    const resolved = resolveCookieOptions(options);
    expect(isEffectivelySecureCookie(resolved)).toBe(true);
    const header = serializeCookie(resolved.name, 'sess_1', resolved);
    expect(header).toContain('Secure');
    expect(wouldBrowserStorePrefixedCookie(header)).toBe(true);
  });

  it('accepts valid prefixed cookies and serializes/clears them correctly', () => {
    const validCases: Array<{ backendOrigin: string; cookie: Record<string, unknown> }> = [
      { backendOrigin: 'https://api.example.com', cookie: { name: '__Secure-sess' } },
      { backendOrigin: 'https://api.example.com', cookie: { name: '__Host-sess' } },
      {
        backendOrigin: 'http://api.example.com',
        cookie: { name: '__Secure-sess', sameSite: 'none', secure: false },
      },
    ];

    for (const { backendOrigin, cookie } of validCases) {
      const options = createOptions({
        backendOrigin,
        cookie: cookie as OidcVaultOptions['cookie'],
      });
      expect(() => validateCookieOptions(options)).not.toThrow();
      const needsTrustedOrigins =
        (cookie as { deploymentMode?: string; sameSite?: string }).deploymentMode === 'cross-site' ||
        (cookie as { sameSite?: string }).sameSite === 'none';
      expect(() =>
        createOidcVaultMiddleware(
          createMiddlewareOptions({
            backendOrigin,
            cookie: cookie as OidcVaultOptions['cookie'],
            ...(needsTrustedOrigins ? { trustedOrigins: ['https://frontend.example.com'] } : {}),
          }),
        ),
      ).not.toThrow();

      const resolved = resolveCookieOptions(options);
      const setHeader = serializeCookie(resolved.name, 'sess_1', resolved);
      const clearHeader = serializeCookie(resolved.name, '', resolved, {
        maxAge: 0,
        expires: new Date(0),
      });
      expect(wouldBrowserStorePrefixedCookie(setHeader)).toBe(true);
      expect(wouldBrowserStorePrefixedCookie(clearHeader)).toBe(true);

      if (resolved.name.startsWith('__Host-')) {
        expect(setHeader).toContain('Secure');
        expect(setHeader).toContain('Path=/');
        expect(setHeader).not.toContain('Domain=');
      }
      if (resolved.name.startsWith('__Secure-')) {
        expect(setHeader).toContain('Secure');
      }
    }
  });
});

describe('BOV-08 set/clear attribute parity', () => {
  const parityCases: Array<{ label: string; backendOrigin: string; cookie?: Record<string, unknown> }> = [
    { label: 'https default', backendOrigin: 'https://api.example.com' },
    { label: 'http dev default', backendOrigin: 'http://api.example.com' },
    {
      label: 'https __Host-',
      backendOrigin: 'https://api.example.com',
      cookie: { name: '__Host-sess' },
    },
    {
      label: 'https __Secure- cross-site',
      backendOrigin: 'https://api.example.com',
      cookie: { name: '__Secure-sess', deploymentMode: 'cross-site', domain: '.example.com' },
    },
  ];

  it.each(parityCases)('keeps set and clear attributes identical for $label', ({ backendOrigin, cookie }) => {
    const options = createOptions({
      backendOrigin,
      cookie: cookie as OidcVaultOptions['cookie'],
    });
    const setHeaders = captureSetCookieHeaders((res) => setSessionCookie(res, options, 'sess_1'));
    const clearHeaders = captureSetCookieHeaders((res) => clearSessionCookie(res, options));

    expect(setHeaders).toHaveLength(1);
    expect(clearHeaders).toHaveLength(1);

    const setAttrs = parseSetCookie(setHeaders[0]);
    const clearAttrs = parseSetCookie(clearHeaders[0]);

    for (const key of ['path', 'samesite', 'secure', 'httponly', 'domain'] as const) {
      expect(clearAttrs[key]).toBe(setAttrs[key]);
    }
    expect(setAttrs.__name).toBe(clearAttrs.__name);
    expect(clearAttrs['max-age']).toBe('0');
    expect(clearAttrs.expires).toBe(new Date(0).toUTCString());
  });
});
