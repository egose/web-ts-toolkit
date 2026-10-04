import { describe, expect, it } from 'vitest';

import { OidcVaultDpopClientError } from '../src/errors';
import { normalizeDpopTarget, normalizeStaticOrigin, resolveDpopScope } from '../src/scope';

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(OidcVaultDpopClientError);
    return (error as OidcVaultDpopClientError).code;
  }
  throw new Error('expected OidcVaultDpopClientError');
};

describe('CLIENT-05 normalizeDpopTarget', () => {
  it('preserves reserved %2F escapes (uppercased) instead of decoding them', () => {
    expect(normalizeDpopTarget('https://api.example.com/a%2Fb')).toBe('https://api.example.com/a%2Fb');
    expect(normalizeDpopTarget('https://api.example.com/a%2fb')).toBe('https://api.example.com/a%2Fb');
  });

  it('strips query and fragment from the proof target', () => {
    expect(normalizeDpopTarget('https://api.example.com/api/profile?q=visible#ignored')).toBe(
      'https://api.example.com/api/profile',
    );
  });

  it('rejects userinfo in the authority', () => {
    expect(codeOf(() => normalizeDpopTarget('https://user:secret@api.example.com/a'))).toBe('INVALID_DPOP_TARGET'); // pragma: allowlist secret
    expect(codeOf(() => normalizeDpopTarget('https://user@api.example.com/a'))).toBe('INVALID_DPOP_TARGET');
  });

  it('rejects scheme-relative //host/path targets without a scheme', () => {
    expect(codeOf(() => normalizeDpopTarget('//attacker.test/a'))).toBe('INVALID_DPOP_TARGET');
    expect(codeOf(() => normalizeDpopTarget('/relative'))).toBe('INVALID_DPOP_TARGET');
  });

  it('keeps an empty-path target canonical with a trailing slash', () => {
    expect(normalizeDpopTarget('https://api.example.com')).toBe('https://api.example.com/');
  });
});

describe('CLIENT-05 normalizeStaticOrigin', () => {
  it('allows HTTPS origins', () => {
    expect(normalizeStaticOrigin('https://api.example.com')).toBe('https://api.example.com');
  });

  it('allows loopback http origins for development', () => {
    expect(normalizeStaticOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeStaticOrigin('http://127.0.0.1:4318')).toBe('http://127.0.0.1:4318');
    expect(normalizeStaticOrigin('http://[::1]:8080')).toBe('http://[::1]:8080');
  });

  it('rejects insecure non-loopback http origins with INSECURE_DPOP_ORIGIN', () => {
    expect(codeOf(() => normalizeStaticOrigin('http://insecure.example.com'))).toBe('INSECURE_DPOP_ORIGIN');
  });

  it('rejects origins carrying path, query, or fragment', () => {
    expect(codeOf(() => normalizeStaticOrigin('https://api.example.com/path'))).toBe('INVALID_DPOP_TARGET');
    expect(codeOf(() => normalizeStaticOrigin('https://api.example.com/?q=1'))).toBe('INVALID_DPOP_TARGET');
    expect(codeOf(() => normalizeStaticOrigin('https://api.example.com#frag'))).toBe('INVALID_DPOP_TARGET');
  });
});

describe('CLIENT-05 resolveDpopScope', () => {
  it('rejects insecure backend origins', () => {
    expect(
      codeOf(() =>
        resolveDpopScope({
          frontendOrigin: 'https://spa.example.com',
          backendOrigin: 'http://insecure.example.com',
          basePath: '/auth/oidc',
        }),
      ),
    ).toBe('INSECURE_DPOP_ORIGIN');
  });
});
