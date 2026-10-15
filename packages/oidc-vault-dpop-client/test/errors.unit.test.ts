import { describe, expect, it, vi } from 'vitest';

import { OidcVaultDpopClientError, serverError } from '../src/errors';

describe('DPH-04 server error classification', () => {
  it.each([
    [401, 'OIDC_VAULT_INVALID_SESSION', 'Session is missing or expired.'],
    [400, 'OIDC_VAULT_MISSING_SESSION_ID', 'Session handle is missing.'],
    [400, 'OIDC_VAULT_MALFORMED_SESSION_COOKIE', 'Session cookie is malformed.'],
    [400, 'OIDC_VAULT_INVALID_EXCHANGE_CODE', 'Exchange code is invalid or expired.'],
    [400, 'OIDC_VAULT_INVALID_BROWSER_BINDING', 'Login browser binding validation failed.'],
    [401, 'OIDC_VAULT_DEVICE_BINDING_REQUIRED', 'A device-bound login is required.'],
    [403, 'OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED', 'Browser recognition changed; sign in again.'],
  ] as const)('recognizes terminal HTTP %s %s independently of HTTP 401', (status, code, message) => {
    const error = serverError(status, { code, message: 'private server content' });
    expect(error).toBeInstanceOf(OidcVaultDpopClientError);
    expect(error).toMatchObject({ code, message, requiresLogin: true, status });
  });

  it.each([
    [400, 'OIDC_VAULT_USE_DPOP_NONCE', 'A fresh DPoP nonce is required.'],
    [401, 'OIDC_VAULT_USE_DPOP_NONCE', 'A fresh DPoP nonce is required.'],
    [401, 'OIDC_VAULT_INVALID_DPOP_PROOF', 'DPoP proof validation failed.'],
    [401, 'OIDC_VAULT_DPOP_REQUIRED', 'DPoP authentication is required.'],
    [503, 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE', 'DPoP replay protection is unavailable.'],
    [400, 'OIDC_VAULT_INVALID_FINGERPRINT', 'Fingerprint signal is invalid.'],
    [502, 'OIDC_VAULT_TOKEN_REQUEST_FAILED', 'OIDC token request failed.'],
    [502, 'OIDC_VAULT_INVALID_TOKEN_RESPONSE', 'OIDC token response is invalid.'],
    [502, 'OIDC_VAULT_INVALID_ID_TOKEN', 'OIDC ID token validation failed.'],
    [502, 'OIDC_VAULT_DISCOVERY_FAILED', 'OIDC discovery failed.'],
    [502, 'OIDC_VAULT_JWKS_FAILED', 'OIDC signing keys are unavailable.'],
    [500, 'OIDC_VAULT_INTERNAL_ERROR', 'The OIDC request failed.'],
    [403, 'OIDC_VAULT_UNTRUSTED_ORIGIN', 'The request origin is not trusted.'],
  ] as const)('keeps auth on HTTP %s %s and replaces server text', (status, code, message) => {
    expect(serverError(status, { code, message: 'private server content' })).toMatchObject({
      code,
      message,
      requiresLogin: false,
      status,
    });
  });

  it.each(
    [
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'valueOf',
      '__defineGetter__',
      'OIDC_VAULT_FUTURE_ERROR',
      'secret=https://private.example/token',
      '',
      undefined,
      null,
      123,
      ['OIDC_VAULT_INVALID_SESSION'],
    ].map((code) => ({ code })),
  )('sanitizes unknown/prototype-key code $code, including on HTTP 401', ({ code }) => {
    for (const status of [400, 401, 403, 503]) {
      expect(serverError(status, { code, message: 'private server content' })).toMatchObject({
        code: 'OIDC_REQUEST_FAILED',
        message: 'The OIDC request failed.',
        requiresLogin: false,
        status,
      });
    }
  });

  it('requires an own data code and never evaluates server message/code accessors', () => {
    const getter = vi.fn(() => 'OIDC_VAULT_INVALID_SESSION');
    const inherited: unknown = Object.create({ code: 'OIDC_VAULT_INVALID_SESSION' });
    const accessor = Object.defineProperty({}, 'code', { get: getter });
    for (const value of [inherited, accessor, null, undefined, 'OIDC_VAULT_INVALID_SESSION', []]) {
      expect(serverError(401, value)).toMatchObject({ code: 'OIDC_REQUEST_FAILED', requiresLogin: false });
    }
    const known = Object.defineProperty({ code: 'OIDC_VAULT_INVALID_SESSION' }, 'message', { get: getter });
    expect(serverError(401, known)).toMatchObject({
      code: 'OIDC_VAULT_INVALID_SESSION',
      message: 'Session is missing or expired.',
      requiresLogin: true,
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it('accepts an own allowlisted code on a null-prototype JSON-shaped record', () => {
    const value: unknown = Object.assign(Object.create(null), { code: 'OIDC_VAULT_USE_DPOP_NONCE' });
    expect(serverError(401, value)).toMatchObject({ code: 'OIDC_VAULT_USE_DPOP_NONCE', requiresLogin: false });
  });
});
