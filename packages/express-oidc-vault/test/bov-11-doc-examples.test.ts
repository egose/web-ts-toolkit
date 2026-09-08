import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';

import { createOidcVaultJwtAccessTokenValidator } from '../src/index';

// ---------------------------------------------------------------------------
// Mirrors the hardened Local Access Token / validator examples in README.md
// and website/docs/packages/express-oidc-vault.md (BOV-11).
// ---------------------------------------------------------------------------

export const DOC_LOCAL_TOKEN_ISSUER = 'https://api.example.com';
export const DOC_LOCAL_TOKEN_AUDIENCE = 'api-audience';

/** Fail startup when no suitably strong signing key is configured. No public fallback. */
export const requireDocSigningKey = (raw: string | undefined): Uint8Array => {
  if (!raw || raw.length === 0) {
    throw new Error('APP_JWT_SECRET must be set to a strong random value at least 32 bytes long.');
  }

  const key = new TextEncoder().encode(raw);

  if (key.length < 32) {
    throw new Error('APP_JWT_SECRET must decode to at least 32 bytes for HS256 local access tokens.');
  }

  return key;
};

export const issueDocAccessToken = async (
  key: Uint8Array,
  input: { subject: string; sessionId: string; scope?: string },
): Promise<string> =>
  new SignJWT({ sub: input.subject, sid: input.sessionId, ...(input.scope ? { scope: input.scope } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(DOC_LOCAL_TOKEN_ISSUER)
    .setAudience(DOC_LOCAL_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);

export const createDocValidator = (key: Uint8Array) =>
  createOidcVaultJwtAccessTokenValidator({
    key,
    issuer: DOC_LOCAL_TOKEN_ISSUER,
    audience: DOC_LOCAL_TOKEN_AUDIENCE,
    algorithms: ['HS256'],
  });

// ---------------------------------------------------------------------------
// Mirrors the hardened hook-logging example (BOV-11).
// ---------------------------------------------------------------------------

const AUDIT_KEY = new TextEncoder().encode('bov-11-test-audit-key-32-bytes-min!!');

/** Purpose-specific keyed fingerprint; never emits the raw session ID. */
export const fingerprintSessionId = (sessionId: string | undefined): string | undefined => {
  if (!sessionId) {
    return undefined;
  }

  return createHmac('sha256', AUDIT_KEY).update(sessionId, 'utf8').digest('hex').slice(0, 16);
};

/** Query-free route label; never logs `originalUrl` (query credentials). */
export const queryFreeRoute = (req: { method?: string; path?: string }): string =>
  `${req.method ?? 'UNKNOWN'} ${req.path ?? 'unknown'}`;

/** Selected sanitized error fields; never the arbitrary error object or its message. */
export const sanitizeErrorForLog = (error: unknown): { code: string; status?: number } => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code, status } = error as { code?: unknown; status?: unknown };
    return {
      code: typeof code === 'string' ? code : 'UNKNOWN',
      ...(typeof status === 'number' ? { status } : {}),
    };
  }

  return { code: 'UNKNOWN' };
};

describe('BOV-11 doc signer/validator example', () => {
  const signingKey = requireDocSigningKey('bov-11-test-signing-key-32-bytes-min!!');

  it('accepts the intended token', async () => {
    const token = await issueDocAccessToken(signingKey, {
      subject: 'user_1',
      sessionId: 'sess-intended',
      scope: 'openid',
    });

    const result = await createDocValidator(signingKey).validate(token);
    expect(result.subject).toBe('user_1');
    expect(result.sessionId).toBe('sess-intended');
  });

  it('rejects a wrong issuer', async () => {
    const token = await new SignJWT({ sub: 'user_1', sid: 'sess-intended' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://wrong-issuer.example.com')
      .setAudience(DOC_LOCAL_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(signingKey);

    await expect(createDocValidator(signingKey).validate(token)).rejects.toThrow();
  });

  it('rejects a wrong audience', async () => {
    const token = await new SignJWT({ sub: 'user_1', sid: 'sess-intended' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(DOC_LOCAL_TOKEN_ISSUER)
      .setAudience('wrong-audience')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(signingKey);

    await expect(createDocValidator(signingKey).validate(token)).rejects.toThrow();
  });

  it('fails missing-key setup without a public fallback', () => {
    expect(() => requireDocSigningKey(undefined)).toThrow(/APP_JWT_SECRET/);
    expect(() => requireDocSigningKey('')).toThrow(/APP_JWT_SECRET/);
    expect(() => requireDocSigningKey('short')).toThrow(/32 bytes/);
  });
});

describe('BOV-11 doc log-redaction example', () => {
  it('excludes sentinel session IDs, query credentials, and secret-bearing error messages', () => {
    const sentinelPrevious = 'sess-sentinel-prev-001';
    const sentinelNext = 'sess-sentinel-next-002';
    const sentinelQueryCredential = 'code=sentinel-query-cred-003';
    const sentinelSecret = 'refresh_token=sentinel-secret-004'; // pragma: allowlist secret

    const rotatedLog = {
      previousSession: fingerprintSessionId(sentinelPrevious),
      nextSession: fingerprintSessionId(sentinelNext),
    };
    const errorLog = {
      route: queryFreeRoute({ method: 'GET', path: '/auth/oidc/callback' }),
      ...sanitizeErrorForLog({
        code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
        status: 502,
        message: `upstream failed with ${sentinelSecret}`,
      }),
    };

    const captured = JSON.stringify([rotatedLog, errorLog]);

    expect(captured).not.toContain(sentinelPrevious);
    expect(captured).not.toContain(sentinelNext);
    expect(captured).not.toContain(sentinelQueryCredential);
    expect(captured).not.toContain(sentinelSecret);
    expect(captured).toContain('/auth/oidc/callback');
    expect(captured).toContain('OIDC_VAULT_TOKEN_REQUEST_FAILED');
    // Fingerprints are present and stable without revealing the raw IDs.
    expect(rotatedLog.previousSession).toHaveLength(16);
    expect(fingerprintSessionId(sentinelPrevious)).toBe(rotatedLog.previousSession);
  });

  it('never emits the request query string through the query-free route label', () => {
    const label = queryFreeRoute({ method: 'GET', path: '/auth/oidc/callback' });
    expect(label).toBe('GET /auth/oidc/callback');
    expect(label).not.toContain('?');
    expect(label).not.toContain('code=');
  });

  it('README and website examples agree: no public fallback, no raw URL, host-only cookie example', () => {
    const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');
    const website = readFileSync(
      join(__dirname, '..', '..', '..', 'website', 'docs', 'packages', 'express-oidc-vault.md'),
      'utf8',
    );

    for (const doc of [readme, website]) {
      expect(doc).not.toContain('dev-secret-change-me');
      expect(doc).not.toContain('APP_JWT_SECRET ??');
      // Hazardous executable use of `req.originalUrl` (prose warnings that
      // name it inside backticks are allowed); code must use query-free routes.
      expect(doc.match(/req\.originalUrl[^`]/)).toBeNull();
    }

    // Normal frontend-to-API cookie example stays host-only (no Domain sharing).
    const readmeCookie = readme.slice(readme.indexOf('### Cookie transport'));
    expect(readmeCookie.slice(0, readmeCookie.indexOf('## Main Exports'))).not.toContain("domain: '.example.com'");
    const websiteCookie = website.slice(website.indexOf('### Cookie Transport'));
    expect(websiteCookie.slice(0, websiteCookie.indexOf('## Config Modes'))).not.toContain("domain: '.example.com'");
  });
});
